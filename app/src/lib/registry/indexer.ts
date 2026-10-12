import "server-only";

import { type Abi, type Log, createPublicClient, decodeEventLog, http } from "viem";
import { carbonCreditAbi, marketplaceAbi, projectRegistryAbi, verificationAbi } from "../chain/abi";
import { chain, type Deployment } from "../chain/config";
import { getDeployment } from "../chain/deployment";
import { type Hex, type RegistryEvent, type RegistryState, buildState } from "./state";

export const publicClient = createPublicClient({ chain, transport: http(undefined, { batch: true, retryCount: 3 }) });

/** Public RPCs cap eth_getLogs ranges; 9,000 blocks is accepted by the Base public endpoints. */
const CHUNK = BigInt(process.env.LOG_CHUNK_BLOCKS ?? 9_000);
const CACHE_MS = 15_000;

interface Cache {
  deployment: string;
  scannedTo: bigint;
  events: RegistryEvent[];
  at: number;
}
let cache: Cache | undefined;
let inflight: Promise<RegistryEvent[]> | undefined;
const timestamps = new Map<bigint, number>();

/**
 * Incremental indexer (F12): scans the four contracts' logs from the deployment block, keeps them in
 * memory and only fetches new blocks afterwards. An optional Postgres index (spec 7.1) can replace
 * this cache without changing `buildState`.
 */
async function fetchEvents(d: Deployment): Promise<RegistryEvent[]> {
  const key = `${d.chainId}:${d.projectRegistry}`;
  if (cache?.deployment !== key) cache = { deployment: key, scannedTo: BigInt(d.startBlock) - 1n, events: [], at: 0 };
  if (Date.now() - cache.at < CACHE_MS) return cache.events;

  const sources: [Hex, Abi][] = [
    [d.projectRegistry, projectRegistryAbi],
    [d.verification, verificationAbi],
    [d.carbonCredit, carbonCreditAbi],
    [d.marketplace, marketplaceAbi],
  ];
  const latest = await publicClient.getBlockNumber();
  const fresh: RegistryEvent[] = [];
  for (let from = cache.scannedTo + 1n; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    const logs = await publicClient.getLogs({ address: sources.map(([a]) => a), fromBlock: from, toBlock: to });
    for (const log of logs) {
      const abi = sources.find(([a]) => a.toLowerCase() === log.address.toLowerCase())?.[1];
      const event = abi && (await toEvent(log, abi));
      if (event) fresh.push(event);
    }
  }
  cache.events = [...cache.events, ...fresh];
  cache.scannedTo = latest;
  cache.at = Date.now();
  return cache.events;
}

async function blockTime(blockNumber: bigint): Promise<number> {
  let t = timestamps.get(blockNumber);
  if (t === undefined) {
    t = Number((await publicClient.getBlock({ blockNumber })).timestamp);
    timestamps.set(blockNumber, t);
  }
  return t;
}

const n = (v: unknown) => Number(v as bigint);
const s = (v: unknown) => (v as bigint).toString();

async function toEvent(log: Log, abi: Abi): Promise<RegistryEvent | undefined> {
  let decoded;
  try {
    decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
  } catch {
    return undefined; // events we do not index (roles, transfers, pauses)
  }
  const a = decoded.args as unknown as Record<string, unknown>;
  const base = {
    blockNumber: Number(log.blockNumber),
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash as Hex,
    timestamp: await blockTime(log.blockNumber!),
  };
  switch (decoded.eventName as unknown as string) {
    case "ProjectRegistered":
      return { ...base, kind: "ProjectRegistered", projectId: n(a.projectId), owner: a.owner as Hex, community: a.community as Hex, metadataHash: a.metadataHash as Hex };
    case "CellsAdded":
      return { ...base, kind: "CellsAdded", projectId: n(a.projectId), cells: (a.cells as bigint[]).map((c) => c.toString(16)), totalCells: Number(a.totalCells) };
    case "ProjectClosed":
      return { ...base, kind: "ProjectClosed", projectId: n(a.projectId), by: a.by as Hex };
    case "ReportAnchored":
      return {
        ...base,
        kind: "ReportAnchored",
        claimId: n(a.claimId),
        projectId: n(a.projectId),
        reportHash: a.reportHash as Hex,
        satelliteHash: a.satelliteHash as Hex,
        score: n(a.score),
        periodStart: n(a.periodStart),
        periodEnd: n(a.periodEnd),
        quantity: n(a.quantity),
        deadline: n(a.deadline),
      };
    case "Attested":
      return { ...base, kind: "Attested", claimId: n(a.claimId), validator: a.validator as Hex, approve: a.approve as boolean, reportHash: a.reportHash as Hex };
    case "ClaimApproved":
      return { ...base, kind: "ClaimApproved", claimId: n(a.claimId) };
    case "ClaimRejected":
      return { ...base, kind: "ClaimRejected", claimId: n(a.claimId) };
    case "ClaimFinalized":
      return { ...base, kind: "ClaimFinalized", claimId: n(a.claimId), projectId: n(a.projectId), tokenId: s(a.tokenId), net: n(a.net), buffer: n(a.buffer) };
    case "CreditsRetired":
      return {
        ...base,
        kind: "CreditsRetired",
        retirementId: n(a.retirementId),
        account: a.account as Hex,
        tokenId: s(a.tokenId),
        amount: n(a.amount),
        beneficiary: a.beneficiary as Hex,
        reasonHash: a.reasonHash as Hex,
      };
    case "Listed":
      return { ...base, kind: "Listed", listingId: n(a.listingId), seller: a.seller as Hex, tokenId: s(a.tokenId), amount: n(a.amount), unitPrice: s(a.unitPrice) };
    case "Purchased":
      return {
        ...base,
        kind: "Purchased",
        listingId: n(a.listingId),
        buyer: a.buyer as Hex,
        tokenId: s(a.tokenId),
        amount: n(a.amount),
        totalPrice: s(a.totalPrice),
        communityAmount: s(a.communityAmount),
        feeAmount: s(a.feeAmount),
        sellerAmount: s(a.sellerAmount),
      };
    case "Cancelled":
      return { ...base, kind: "Cancelled", listingId: n(a.listingId), returnedAmount: n(a.returnedAmount) };
    default:
      return undefined;
  }
}

export type RegistrySnapshot =
  | { status: "live"; deployment: Deployment; state: RegistryState }
  | { status: "not-deployed" }
  | { status: "unreachable"; deployment: Deployment; error: string };

const EMPTY = buildState([], 0);

/** Registry state, or why it is unavailable. Pages render either way (spec 11: demo availability). */
export async function getRegistry(): Promise<RegistrySnapshot> {
  const deployment = getDeployment();
  if (!deployment) return { status: "not-deployed" };
  try {
    inflight ??= fetchEvents(deployment).finally(() => (inflight = undefined));
    const events = await inflight;
    return { status: "live", deployment, state: buildState(events, Math.floor(Date.now() / 1000)) };
  } catch (error) {
    console.error("[registry] indexing failed:", (error as Error).message);
    return { status: "unreachable", deployment, error: (error as Error).message };
  }
}

export function stateOf(snapshot: RegistrySnapshot): RegistryState {
  return snapshot.status === "live" ? snapshot.state : EMPTY;
}
