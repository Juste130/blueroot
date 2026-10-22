/**
 * Plays the whole BlueRoot lifecycle on a LOCAL Anvil chain, to test the app end to end:
 *   3 projects registered from the real demo zones, a double-counting attempt rejected,
 *   one file anchored, approved by two validators and finalized, credits listed, bought and retired,
 *   a second file waiting for its second vote.
 *
 * Usage (Node 24 runs TypeScript directly):
 *   anvil                                   # terminal 1
 *   cd contracts && forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
 *     --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
 *     (env: PROPONENTS, VALIDATORS, ANCHOR_ADDRESS: see printRoles below)
 *   node scripts/demo.ts
 *
 * Reports written here are FIXTURES (provider "fixture"): no AI call, no real photo. The app labels
 * them as such, the server refuses to anchor them, and the script refuses to run on any other chain.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, createPublicClient, createTestClient, createWalletClient, decodeEventLog, http } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { canonicalJson, sha256Hex } from "./satellite/src/canonical.ts";
import { carbonCreditAbi, marketplaceAbi, paymentTokenAbi, projectRegistryAbi, verificationAbi } from "../src/lib/chain/abi.ts";
import { REPORT_SCHEMA, ReportSchema } from "../src/lib/report/schema.ts";
import { PROJECT_SCHEMA, ProjectMetadataSchema, RETIREMENT_SCHEMA, RetirementReasonSchema } from "../src/lib/schemas.ts";
import { THRESHOLD, WEIGHTS, combinedScore } from "../src/lib/score.ts";

const RPC = process.env.RPC_URL ?? "http://127.0.0.1:8545";
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const MNEMONIC = "test test test test test test test test test test test junk"; // Anvil's public test mnemonic

const account = (addressIndex: number) => mnemonicToAccount(MNEMONIC, { addressIndex });
const deployer = account(0);
const proponent = account(1);
const community = account(2);
const validatorA = account(3);
const validatorB = account(4);
const anchor = account(5);
const buyer = account(6);

const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(RPC) });
const wallet = (account: typeof deployer) => createWalletClient({ account, chain: foundry, transport: http(RPC) });

function log(step: string, detail = "") {
  console.log(`\n▸ ${step}${detail ? `\n  ${detail}` : ""}`);
}

async function send(account: typeof deployer, request: Parameters<ReturnType<typeof wallet>["writeContract"]>[0]) {
  const { request: simulated } = await publicClient.simulateContract({ ...(request as object), account } as never);
  const hash = await wallet(account).writeContract(simulated as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

/** Writes a canonical JSON document where the app looks for it; returns its sha256 (the on-chain hash). */
function store(doc: unknown, committed: boolean): Hex {
  const text = canonicalJson(doc);
  const hash = sha256Hex(text);
  const dir = root(committed ? "content" : ".data/content");
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${hash.slice(2)}.json`, text);
  return hash;
}

const ZONES = [
  { id: "sodome-grand-popo", name: "Mangroves de Sodomè", place: "Sodomè, Hakouè", commune: "Grand-Popo", department: "Mono" },
  { id: "gnigbohoue-grand-popo", name: "Mangroves de Gnigbohoué", place: "Gnigbohoué, Kpêko", commune: "Grand-Popo", department: "Mono" },
  { id: "djegbame-ouidah", name: "Mangroves de Djègbamè", place: "Djègbamè", commune: "Ouidah", department: "Atlantique" },
] as const;

function zoneData(id: string) {
  const file = root(`scripts/satellite/data/${id}/ndvi-v1.json`);
  const bytes = readFileSync(file);
  const series = JSON.parse(bytes.toString("utf8"));
  return { hash: sha256Hex(bytes), series } as { hash: Hex; series: { zone: { cells: string[]; areaHa: number }; summary: Record<string, number | null>; parameters: Record<string, { from: string; to: string }> } };
}

async function main() {
  const chainId = await publicClient.getChainId();
  if (chainId !== foundry.id) throw new Error(`Refusing to run on chain ${chainId}: this script writes test fixtures and only targets Anvil (31337).`);
  const deploymentFile = root("contracts/deployments/31337.json");
  if (!existsSync(deploymentFile)) throw new Error("contracts/deployments/31337.json not found: deploy the contracts on Anvil first.");
  const d = JSON.parse(readFileSync(deploymentFile, "utf8")) as Record<"projectRegistry" | "verification" | "carbonCredit" | "marketplace" | "paymentToken", Address>;
  log("Deployment", `registry ${d.projectRegistry}`);

  // 1. Registration (F2) from the real demo zones.
  const projects: { id: bigint; zone: (typeof ZONES)[number]; cells: string[] }[] = [];
  for (const zone of ZONES) {
    const { series } = zoneData(zone.id);
    const cells = series.zone.cells;
    const metadata = ProjectMetadataSchema.parse({
      schemaVersion: PROJECT_SCHEMA,
      name: zone.name,
      description: `Zone de démonstration : mangrove cartographiée dans OpenStreetMap (wetland=mangrove). Son statut de projet de restauration doit être validé sur le terrain avec la communauté de ${zone.place}.`,
      language: "fr",
      location: { place: zone.place, commune: zone.commune, department: zone.department, country: "BJ" },
      community: { name: `Organisation communautaire de ${zone.place.split(",")[0]} (démonstration)` },
      satelliteZone: zone.id,
      source: { description: "OpenStreetMap wetland=mangrove", license: "ODbL 1.0" },
      cells,
      createdAt: "2026-10-19T00:00:00.000Z",
    });
    const metadataHash = store(metadata, true);
    const receipt = await send(proponent, { address: d.projectRegistry, abi: projectRegistryAbi, functionName: "registerProject", args: [metadataHash, community.address] } as never);
    const event = receipt.logs
      .map((l) => { try { return decodeEventLog({ abi: projectRegistryAbi, data: l.data, topics: l.topics }); } catch { return null; } })
      .find((e) => e?.eventName === "ProjectRegistered");
    const id = (event!.args as { projectId: bigint }).projectId;
    for (let i = 0; i < cells.length; i += 100) {
      await send(proponent, { address: d.projectRegistry, abi: projectRegistryAbi, functionName: "addCells", args: [id, cells.slice(i, i + 100).map((c) => BigInt(`0x${c}`))] } as never);
    }
    projects.push({ id, zone, cells });
    log(`Project #${id} registered`, `${zone.name}: ${cells.length} cells, metadata ${metadataHash}`);
  }

  // 2. Double counting attempt (F3): project #3 trying to add a cell of project #1 must be rejected.
  try {
    await publicClient.simulateContract({ account: proponent, address: d.projectRegistry, abi: projectRegistryAbi, functionName: "addCells", args: [projects[2]!.id, [BigInt(`0x${projects[0]!.cells[0]}`)]] });
    throw new Error("Double counting was NOT rejected");
  } catch (error) {
    if ((error as Error).message.includes("NOT rejected")) throw error;
    log("Double counting rejected", `addCells on a cell of project #${projects[0]!.id}: ${(error as { shortMessage?: string }).shortMessage ?? "reverted"}`);
  }

  // 3. Let a year of monitoring pass (local chain only): credits are only earned after registration.
  await testClient.increaseTime({ seconds: 365 * 24 * 3600 });
  await testClient.mine({ blocks: 1 });
  log("One year later (Anvil time travel)");

  // 4. Verification files (F6-F8) with FIXTURE reports.
  async function anchorFixture(p: (typeof projects)[number], field: number, ai: number) {
    const { hash: satelliteHash, series } = zoneData(p.zone.id);
    const [, , , , registeredAt] = (await publicClient.readContract({ address: d.projectRegistry, abi: projectRegistryAbi, functionName: "projectCore", args: [p.id] })) as unknown as [Address, Address, number, number, number];
    const periodEnd = Number((await publicClient.getBlock()).timestamp) - 1;
    const scores = { satellite: Number(series.summary.satelliteScore), field, ai };
    const combined = combinedScore(scores);
    if (combined < THRESHOLD) throw new Error(`Fixture below threshold: ${combined}`);
    const items = Array.from({ length: 8 }, (_, i) => ({
      sha256: sha256Hex(`fixture-photo-${p.zone.id}-${i}`),
      cell: p.cells[(i * 3) % p.cells.length]!,
      capturedAt: new Date((periodEnd - (i + 1) * 86400 * 20) * 1000).toISOString(),
      flags: i === 7 ? ["out_of_zone"] : [],
    }));
    const report = ReportSchema.parse({
      schemaVersion: REPORT_SCHEMA,
      projectId: Number(p.id),
      projectMetadataHash: (await publicClient.readContract({ address: d.projectRegistry, abi: projectRegistryAbi, functionName: "getProject", args: [p.id] }) as { metadataHash: Hex }).metadataHash,
      period: { start: Number(registeredAt), end: periodEnd },
      satellite: {
        hash: satelliteHash,
        zoneId: p.zone.id,
        score: scores.satellite,
        baselineNdvi: series.summary.baselineNdvi,
        latestNdvi: series.summary.latestNdvi,
        baselineWindow: series.parameters.baselineWindow,
        latestWindow: series.parameters.latestWindow,
      },
      evidence: { submitted: 8, accepted: 7, coveredCells: 7, totalCells: p.cells.length, items, score: field },
      ai: {
        provider: "fixture",
        model: "none (demo script fixture)",
        promptVersion: "fixture",
        generatedAt: new Date(periodEnd * 1000).toISOString(),
        assessment: {
          consistencyScore: ai,
          summary: {
            fr: "Rapport de test local écrit par le script de démonstration. Aucune IA n'a été appelée et aucune photo réelle n'existe.",
            en: "Local test report written by the demo script. No AI was called and no real photo exists.",
          },
          strengths: [],
          inconsistencies: [{ severity: "low", description: { fr: "Une photo fictive hors zone, pour tester l'affichage.", en: "One fictitious out-of-zone photo, to test the display." } }],
          recommendation: "review",
        },
      },
      scores: { ...scores, combined, weights: { ...WEIGHTS }, threshold: THRESHOLD, note: "Demonstration weights and threshold, to be calibrated with experts." },
      createdAt: new Date(periodEnd * 1000).toISOString(),
    });
    const reportHash = store(report, false);
    const receipt = await send(anchor, { address: d.verification, abi: verificationAbi, functionName: "anchorReport", args: [p.id, reportHash, satelliteHash, BigInt(combined), BigInt(registeredAt), BigInt(periodEnd)] } as never);
    const ev = receipt.logs.map((l) => { try { return decodeEventLog({ abi: verificationAbi, data: l.data, topics: l.topics }); } catch { return null; } }).find((e) => e?.eventName === "ReportAnchored")!;
    const { claimId, quantity } = ev.args as { claimId: bigint; quantity: bigint };
    log(`File #${claimId} anchored for project #${p.id}`, `score ${combined}, ${quantity} units (${Number(quantity) / 100} ha-years), report ${reportHash}`);
    return { claimId, reportHash };
  }

  const first = await anchorFixture(projects[0]!, 85, 80);
  for (const v of [validatorA, validatorB]) {
    await send(v, { address: d.verification, abi: verificationAbi, functionName: "attest", args: [first.claimId, first.reportHash, true] } as never);
  }
  log("Two validators approved file #" + first.claimId);
  const finalized = await send(buyer, { address: d.verification, abi: verificationAbi, functionName: "finalize", args: [first.claimId] } as never);
  const fin = finalized.logs.map((l) => { try { return decodeEventLog({ abi: verificationAbi, data: l.data, topics: l.topics }); } catch { return null; } }).find((e) => e?.eventName === "ClaimFinalized")!.args as { tokenId: bigint; net: bigint; buffer: bigint };
  log("Credits issued (finalize called by anyone)", `token ${fin.tokenId}: ${fin.net} to the proponent, ${fin.buffer} locked in the buffer pool`);

  // A second file waiting for its second vote, to show the validator board.
  const second = await anchorFixture(projects[1]!, 82, 78);
  await send(validatorA, { address: d.verification, abi: verificationAbi, functionName: "attest", args: [second.claimId, second.reportHash, true] } as never);
  log(`File #${second.claimId} has 1 approval out of 2 (pending)`);

  // 5. Market (F9): list, buy with the enforced split.
  await send(proponent, { address: d.carbonCredit, abi: carbonCreditAbi, functionName: "setApprovalForAll", args: [d.marketplace, true] } as never);
  const listed = await send(proponent, { address: d.marketplace, abi: marketplaceAbi, functionName: "list", args: [fin.tokenId, 1000n, 500_000n] } as never);
  const listingId = (listed.logs.map((l) => { try { return decodeEventLog({ abi: marketplaceAbi, data: l.data, topics: l.topics }); } catch { return null; } }).find((e) => e?.eventName === "Listed")!.args as { listingId: bigint }).listingId;
  await send(buyer, { address: d.paymentToken, abi: paymentTokenAbi, functionName: "faucet" } as never);
  const [total, toCommunity, fee, toSeller] = (await publicClient.readContract({ address: d.marketplace, abi: marketplaceAbi, functionName: "quote", args: [500_000n, 600n] })) as readonly bigint[];
  await send(buyer, { address: d.paymentToken, abi: paymentTokenAbi, functionName: "approve", args: [d.marketplace, total!] } as never);
  await send(buyer, { address: d.marketplace, abi: marketplaceAbi, functionName: "buy", args: [listingId, 600n, 500_000n] } as never);
  const usd = (v: bigint) => (Number(v) / 1e6).toFixed(2);
  log("600 credits bought at 0.50 tUSDC", `total ${usd(total!)}: community ${usd(toCommunity!)}, fee ${usd(fee!)}, seller ${usd(toSeller!)}`);

  // 6. Retirement and certificate (F10).
  const reasonHash = store(
    RetirementReasonSchema.parse({
      schemaVersion: RETIREMENT_SCHEMA,
      beneficiaryName: "Acheteur de démonstration",
      reason: "Test local du cycle complet : retrait de crédits de démonstration.",
      language: "fr",
      createdAt: "2026-10-19T00:00:00.000Z",
    }),
    false,
  );
  const retired = await send(buyer, { address: d.carbonCredit, abi: carbonCreditAbi, functionName: "retire", args: [fin.tokenId, 250n, buyer.address, reasonHash] } as never);
  log("250 credits retired", `certificate: http://localhost:3000/en/certificates/${retired.transactionHash}`);

  console.log("\nDone. Start the app with NEXT_PUBLIC_CHAIN_ID=31337 and open http://localhost:3000/en");
  console.log(`Wallets (Anvil test mnemonic): proponent ${proponent.address}, validators ${validatorA.address} / ${validatorB.address}, buyer ${buyer.address}`);
}

/** Addresses to pass to the deploy script for local roles. */
export function printRoles() {
  console.log(`PROPONENTS=${proponent.address} VALIDATORS=${validatorA.address},${validatorB.address} ANCHOR_ADDRESS=${anchor.address}`);
}

if (process.argv[2] === "roles") printRoles();
else main().catch((error) => {
  console.error(`\n✗ ${(error as Error).message}`);
  process.exitCode = 1;
});
