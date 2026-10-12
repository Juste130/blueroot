import "server-only";

import { type Hex, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ApiError } from "../api";
import { verificationAbi } from "../chain/abi";
import { chain } from "../chain/config";
import { getDeployment } from "../chain/deployment";
import { getJson } from "../content/store";
import { publicClient } from "../registry/indexer";
import { getZoneSeries } from "../satellite";
import { THRESHOLD, combinedScore } from "../score";
import { ReportSchema } from "./schema";

/**
 * Anchors a report hash on-chain with the ANCHOR_ROLE wallet (F6). Server only: the key lives in the
 * server environment, the role can do nothing but anchor, and two human validators still have to
 * approve. Only reports produced and stored by this server can be anchored, and every number is
 * re-checked from the stored document before signing.
 */
export async function anchorReport(reportHash: Hex): Promise<{ txHash: Hex }> {
  const key = process.env.ANCHOR_PRIVATE_KEY as Hex | undefined;
  const d = getDeployment();
  if (!key || !d) throw new ApiError(503, "anchoring_unavailable");

  const doc = await getJson(reportHash, (v) => ReportSchema.parse(v));
  if (!doc) throw new ApiError(404, "unknown_report");
  const r = doc.data;
  if (combinedScore(r.scores) !== r.scores.combined) throw new ApiError(422, "score_mismatch");
  if (r.scores.combined < THRESHOLD) throw new ApiError(422, "below_threshold");
  // The satellite hash must be a series this server can serve and that anyone can re-hash.
  if (getZoneSeries(r.satellite.hash)?.hash !== r.satellite.hash) throw new ApiError(422, "unknown_satellite_series");

  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const args = [BigInt(r.projectId), reportHash, r.satellite.hash as Hex, BigInt(r.scores.combined), BigInt(r.period.start), BigInt(r.period.end)] as const;
  // Simulate first: a contract revert (open claim, invalid period...) is reported without spending gas.
  const { request } = await publicClient.simulateContract({ account, address: d.verification, abi: verificationAbi, functionName: "anchorReport", args });
  const txHash = await wallet.writeContract(request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
  if (receipt.status !== "success") throw new ApiError(502, "anchor_reverted");
  return { txHash };
}
