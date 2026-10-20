import { getTranslations } from "next-intl/server";
import type { ClaimStatus } from "@/lib/registry/state";

const PROJECT_STYLE = {
  active: "bg-mangrove/15 text-ok",
  closed: "bg-line text-muted",
  candidate: "border border-dashed border-muted/60 text-muted",
} as const;

const CLAIM_STYLE: Record<ClaimStatus, string> = {
  pending: "bg-lagoon/20 text-data",
  approved: "bg-mangrove/15 text-ok",
  finalized: "bg-mangrove/15 text-ok",
  rejected: "bg-bad/10 text-bad",
  expired: "bg-line text-muted",
};

export async function StatusChip({ status }: { status: keyof typeof PROJECT_STYLE }) {
  const t = await getTranslations("common.status");
  return <span className={`inline-flex items-center rounded-chip px-2 py-0.5 text-xs font-semibold ${PROJECT_STYLE[status]}`}>{t(status)}</span>;
}

export async function ClaimChip({ status }: { status: ClaimStatus }) {
  const t = await getTranslations("common.claimStatus");
  return <span className={`inline-flex items-center rounded-chip px-2 py-0.5 text-xs font-semibold ${CLAIM_STYLE[status]}`}>{t(status)}</span>;
}
