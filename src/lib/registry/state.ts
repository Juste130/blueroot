/**
 * Pure reconstruction of the registry from on-chain events (F11, F12).
 * Every value shown by the app is derived here from logs, so the whole lifecycle of a project can be
 * replayed from the chain alone. No I/O in this file: it is unit-tested with synthetic logs.
 */
import { decodeTokenId } from "../chain/config";

export type Hex = `0x${string}`;

interface EventBase {
  blockNumber: number;
  logIndex: number;
  txHash: Hex;
  timestamp: number; // unix seconds
}

export type RegistryEvent = EventBase &
  (
    | { kind: "ProjectRegistered"; projectId: number; owner: Hex; community: Hex; metadataHash: Hex }
    | { kind: "CellsAdded"; projectId: number; cells: string[]; totalCells: number }
    | { kind: "ProjectClosed"; projectId: number; by: Hex }
    | {
        kind: "ReportAnchored";
        claimId: number;
        projectId: number;
        reportHash: Hex;
        satelliteHash: Hex;
        score: number;
        periodStart: number;
        periodEnd: number;
        quantity: number;
        deadline: number;
      }
    | { kind: "Attested"; claimId: number; validator: Hex; approve: boolean; reportHash: Hex }
    | { kind: "ClaimApproved"; claimId: number }
    | { kind: "ClaimRejected"; claimId: number }
    | { kind: "ClaimFinalized"; claimId: number; projectId: number; tokenId: string; net: number; buffer: number }
    | {
        kind: "CreditsRetired";
        retirementId: number;
        account: Hex;
        tokenId: string;
        amount: number;
        beneficiary: Hex;
        reasonHash: Hex;
      }
    | { kind: "Listed"; listingId: number; seller: Hex; tokenId: string; amount: number; unitPrice: string }
    | {
        kind: "Purchased";
        listingId: number;
        buyer: Hex;
        tokenId: string;
        amount: number;
        totalPrice: string;
        communityAmount: string;
        feeAmount: string;
        sellerAmount: string;
      }
    | { kind: "Cancelled"; listingId: number; returnedAmount: number }
  );

export type ClaimStatus = "pending" | "approved" | "rejected" | "finalized" | "expired";

export interface Vote {
  validator: Hex;
  approve: boolean;
  txHash: Hex;
  timestamp: number;
}

export interface Claim {
  id: number;
  projectId: number;
  reportHash: Hex;
  satelliteHash: Hex;
  score: number;
  periodStart: number;
  periodEnd: number;
  quantity: number; // 0.01 ha-year units, net + buffer
  deadline: number;
  status: ClaimStatus;
  votes: Vote[];
  anchoredAt: number;
  anchorTx: Hex;
  tokenId?: string;
  net?: number;
  buffer?: number;
  finalizedTx?: Hex;
}

export interface Project {
  id: number;
  owner: Hex;
  community: Hex;
  metadataHash: Hex;
  cells: string[]; // H3 indexes, lowercase hex
  status: "active" | "closed";
  registeredAt: number;
  registerTx: Hex;
  claimIds: number[];
  issued: number;
  buffer: number;
  retired: number;
  sold: number;
}

export interface Listing {
  id: number;
  seller: Hex;
  tokenId: string;
  projectId: number;
  vintage: number;
  initialAmount: number;
  amount: number; // remaining in escrow
  unitPrice: string; // payment token base units per 0.01 ha-year
  status: "open" | "sold" | "cancelled";
  listedAt: number;
}

export interface Retirement {
  id: number;
  account: Hex;
  beneficiary: Hex;
  tokenId: string;
  projectId: number;
  vintage: number;
  amount: number;
  reasonHash: Hex;
  txHash: Hex;
  timestamp: number;
}

export interface Totals {
  projects: number;
  cells: number;
  issued: number; // net + buffer
  buffer: number;
  retired: number;
  sold: number;
  volume: string; // payment token base units
  communityPaid: string;
}

export interface RegistryState {
  projects: Project[];
  claims: Claim[];
  listings: Listing[];
  retirements: Retirement[];
  events: RegistryEvent[];
  totals: Totals;
}

/** Events carry their claim's project only on some kinds; this resolves it for the audit trail. */
export function projectIdOf(event: RegistryEvent, claims: Map<number, Claim>): number | undefined {
  switch (event.kind) {
    case "Attested":
    case "ClaimApproved":
    case "ClaimRejected":
      return claims.get(event.claimId)?.projectId;
    case "CreditsRetired":
    case "Listed":
    case "Purchased":
      return Number(decodeTokenId(BigInt(event.tokenId)).projectId);
    case "Cancelled":
      return undefined;
    default:
      return event.projectId;
  }
}

export function buildState(input: readonly RegistryEvent[], now: number): RegistryState {
  const events = [...input].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const projects = new Map<number, Project>();
  const claims = new Map<number, Claim>();
  const listings = new Map<number, Listing>();
  const retirements: Retirement[] = [];
  let volume = 0n;
  let communityPaid = 0n;

  for (const e of events) {
    switch (e.kind) {
      case "ProjectRegistered":
        projects.set(e.projectId, {
          id: e.projectId,
          owner: e.owner,
          community: e.community,
          metadataHash: e.metadataHash,
          cells: [],
          status: "active",
          registeredAt: e.timestamp,
          registerTx: e.txHash,
          claimIds: [],
          issued: 0,
          buffer: 0,
          retired: 0,
          sold: 0,
        });
        break;
      case "CellsAdded": {
        const p = projects.get(e.projectId);
        if (p) p.cells.push(...e.cells);
        break;
      }
      case "ProjectClosed": {
        const p = projects.get(e.projectId);
        if (p) p.status = "closed";
        break;
      }
      case "ReportAnchored":
        claims.set(e.claimId, {
          id: e.claimId,
          projectId: e.projectId,
          reportHash: e.reportHash,
          satelliteHash: e.satelliteHash,
          score: e.score,
          periodStart: e.periodStart,
          periodEnd: e.periodEnd,
          quantity: e.quantity,
          deadline: e.deadline,
          status: "pending",
          votes: [],
          anchoredAt: e.timestamp,
          anchorTx: e.txHash,
        });
        projects.get(e.projectId)?.claimIds.push(e.claimId);
        break;
      case "Attested":
        claims.get(e.claimId)?.votes.push({
          validator: e.validator,
          approve: e.approve,
          txHash: e.txHash,
          timestamp: e.timestamp,
        });
        break;
      case "ClaimApproved": {
        const c = claims.get(e.claimId);
        if (c) c.status = "approved";
        break;
      }
      case "ClaimRejected": {
        const c = claims.get(e.claimId);
        if (c) c.status = "rejected";
        break;
      }
      case "ClaimFinalized": {
        const c = claims.get(e.claimId);
        if (c) Object.assign(c, { status: "finalized", tokenId: e.tokenId, net: e.net, buffer: e.buffer, finalizedTx: e.txHash });
        const p = projects.get(e.projectId);
        if (p) {
          p.issued += e.net + e.buffer;
          p.buffer += e.buffer;
        }
        break;
      }
      case "CreditsRetired": {
        const { projectId, vintage } = decodeTokenId(BigInt(e.tokenId));
        retirements.push({
          id: e.retirementId,
          account: e.account,
          beneficiary: e.beneficiary,
          tokenId: e.tokenId,
          projectId: Number(projectId),
          vintage,
          amount: e.amount,
          reasonHash: e.reasonHash,
          txHash: e.txHash,
          timestamp: e.timestamp,
        });
        const p = projects.get(Number(projectId));
        if (p) p.retired += e.amount;
        break;
      }
      case "Listed": {
        const { projectId, vintage } = decodeTokenId(BigInt(e.tokenId));
        listings.set(e.listingId, {
          id: e.listingId,
          seller: e.seller,
          tokenId: e.tokenId,
          projectId: Number(projectId),
          vintage,
          initialAmount: e.amount,
          amount: e.amount,
          unitPrice: e.unitPrice,
          status: "open",
          listedAt: e.timestamp,
        });
        break;
      }
      case "Purchased": {
        const l = listings.get(e.listingId);
        if (l) {
          l.amount -= e.amount;
          if (l.amount === 0) l.status = "sold";
          const p = projects.get(l.projectId);
          if (p) p.sold += e.amount;
        }
        volume += BigInt(e.totalPrice);
        communityPaid += BigInt(e.communityAmount);
        break;
      }
      case "Cancelled": {
        const l = listings.get(e.listingId);
        if (l) {
          l.amount = 0;
          l.status = "cancelled";
        }
        break;
      }
    }
  }

  // Expiry is derived from the deadline (the contract needs no keeper): a pending claim past its
  // deadline can no longer receive votes.
  for (const c of claims.values()) if (c.status === "pending" && now > c.deadline) c.status = "expired";

  const projectList = [...projects.values()];
  return {
    projects: projectList,
    claims: [...claims.values()],
    listings: [...listings.values()],
    retirements,
    events,
    totals: {
      projects: projectList.length,
      cells: projectList.reduce((n, p) => n + (p.status === "active" ? p.cells.length : 0), 0),
      issued: projectList.reduce((n, p) => n + p.issued, 0),
      buffer: projectList.reduce((n, p) => n + p.buffer, 0),
      retired: projectList.reduce((n, p) => n + p.retired, 0),
      sold: projectList.reduce((n, p) => n + p.sold, 0),
      volume: volume.toString(),
      communityPaid: communityPaid.toString(),
    },
  };
}
