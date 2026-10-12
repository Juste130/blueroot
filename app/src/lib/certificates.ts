import "server-only";

import { type Hex, decodeEventLog, isAddressEqual } from "viem";
import { carbonCreditAbi } from "./chain/abi";
import { decodeTokenId } from "./chain/config";
import { getDeployment } from "./chain/deployment";
import { getJson } from "./content/store";
import { getRegistryView } from "./registry/projects";
import { publicClient } from "./registry/indexer";
import { type RetirementReason, RetirementReasonSchema } from "./schemas";

export interface Certificate {
  txHash: Hex;
  retirementId: number;
  account: Hex;
  beneficiary: Hex;
  tokenId: string;
  projectId: number;
  projectName?: string;
  vintage: number;
  amount: number;
  reasonHash: Hex;
  reason?: RetirementReason;
  timestamp: number;
  blockNumber: number;
  reportHashes: Hex[];
}

export type CertificateResult =
  | { status: "ok"; certificates: Certificate[] }
  | { status: "not-deployed" | "not-found" | "invalid" };

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * Rebuilds retirement certificates from a transaction hash alone (F10): the receipt's CreditsRetired
 * events emitted by the BlueRoot CarbonCredit contract. Nothing is taken from a database.
 */
export async function getCertificates(txHash: string): Promise<CertificateResult> {
  if (!TX_HASH.test(txHash)) return { status: "invalid" };
  const d = getDeployment();
  if (!d) return { status: "not-deployed" };

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
  } catch {
    return { status: "not-found" };
  }
  if (receipt.status !== "success") return { status: "not-found" };

  const retired = receipt.logs.flatMap((log) => {
    if (!isAddressEqual(log.address, d.carbonCredit)) return [];
    try {
      const e = decodeEventLog({ abi: carbonCreditAbi, data: log.data, topics: log.topics });
      return e.eventName === "CreditsRetired" ? [e.args] : [];
    } catch {
      return [];
    }
  });
  if (retired.length === 0) return { status: "not-found" };

  const [block, view] = await Promise.all([publicClient.getBlock({ blockNumber: receipt.blockNumber }), getRegistryView()]);
  const certificates = await Promise.all(
    retired.map(async (r) => {
      const { projectId, vintage } = decodeTokenId(r.tokenId);
      const project = view.projects.find((p) => p.id === Number(projectId));
      const reason = await getJson(r.reasonHash, (v) => RetirementReasonSchema.parse(v));
      return {
        txHash: txHash as Hex,
        retirementId: Number(r.retirementId),
        account: r.account,
        beneficiary: r.beneficiary,
        tokenId: r.tokenId.toString(),
        projectId: Number(projectId),
        projectName: project?.name,
        vintage,
        amount: Number(r.amount),
        reasonHash: r.reasonHash,
        reason: reason?.data,
        timestamp: Number(block.timestamp),
        blockNumber: Number(receipt.blockNumber),
        reportHashes: view.state.claims.filter((c) => c.tokenId === r.tokenId.toString()).map((c) => c.reportHash),
      } satisfies Certificate;
    }),
  );
  return { status: "ok", certificates };
}
