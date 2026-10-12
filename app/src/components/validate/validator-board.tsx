"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { type Address, isAddressEqual } from "viem";
import { useReadContract, useWriteContract } from "wagmi";
import { Link, useRouter } from "@/i18n/navigation";
import { verificationAbi } from "@/lib/chain/abi";
import type { EvidenceFlag } from "@/lib/evidence/checks";
import { formatDate, formatNumber, unitsToHaYears } from "@/lib/format";
import type { Claim } from "@/lib/registry/state";
import { Hash } from "../hash";
import { useDeployment } from "../providers";
import { TxStatus } from "../tx/tx-status";
import { useTx } from "../tx/use-tx";
import { AccessGate } from "../wallet/access-gate";

export interface BoardClaim extends Claim {
  projectName: string;
  owner: Address;
  community: Address;
}

export function ValidatorBoard({ claims }: { claims: BoardClaim[] }) {
  const t = useTranslations("validate");
  const pending = claims.filter((c) => c.status === "pending");
  const approved = claims.filter((c) => c.status === "approved");

  return (
    <div className="space-y-14">
      <section aria-labelledby="finalize-title">
        <h2 id="finalize-title" className="text-xl">
          {t("toFinalize")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("finalizeIntro")}</p>
        {approved.length === 0 ? (
          <p className="mt-4 text-muted">{t("nothingToFinalize")}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {approved.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-line bg-surface p-5">
                <ClaimHeading claim={c} />
                <FinalizeButton claimId={c.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-title">
        <h2 id="review-title" className="text-xl">
          {t("toReview")}
        </h2>
        <AccessGate role="validator">
          {(address) =>
            pending.length === 0 ? (
              <p className="mt-4 text-muted">{t("nothingToReview")}</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {pending.map((c) => (
                  <ReviewCard key={c.id} claim={c} validator={address} />
                ))}
              </ul>
            )
          }
        </AccessGate>
      </section>
    </div>
  );
}

function ClaimHeading({ claim: c }: { claim: BoardClaim }) {
  const t = useTranslations("validate");
  const common = useTranslations("common");
  const locale = useLocale();
  return (
    <div>
      <p className="font-semibold">
        <Link href={`/projects/${c.projectId}`} className="underline decoration-line underline-offset-4 hover:decoration-current">
          {c.projectName}
        </Link>
        <span className="figures ml-2 text-sm font-normal text-muted">{t("claimNumber", { id: c.id })}</span>
      </p>
      <p className="figures text-sm text-muted">
        {t("claimFacts", { score: c.score, quantity: common("haYears", { value: formatNumber(locale, unitsToHaYears(c.quantity), 2) }) })}
      </p>
    </div>
  );
}

function ReviewCard({ claim: c, validator }: { claim: BoardClaim; validator: Address }) {
  const t = useTranslations("validate");
  const locale = useLocale();
  const router = useRouter();
  const d = useDeployment()!;
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  const own = isAddressEqual(c.owner, validator) || isAddressEqual(c.community, validator);
  const { data: voted, refetch } = useReadContract({ address: d.verification, abi: verificationAbi, functionName: "hasVoted", args: [BigInt(c.id), validator] });

  async function vote(approve: boolean) {
    // The vote is bound to the exact report hash reviewed here: a modified report is refused on-chain.
    const receipt = await tx.run(() => writeContractAsync({ address: d.verification, abi: verificationAbi, functionName: "attest", args: [BigInt(c.id), c.reportHash, approve] }));
    if (receipt) {
      await refetch();
      router.refresh();
    }
  }

  return (
    <li className="rounded-panel border border-line bg-surface p-5">
      <ClaimHeading claim={c} />
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{t("reportHash")}</dt>
          <dd>
            <Hash value={c.reportHash} label={t("reportHash")} anchored />
          </dd>
        </div>
        <div>
          <dt className="text-muted">{t("deadline")}</dt>
          <dd className="font-medium">{formatDate(locale, c.deadline)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("votes")}</dt>
          <dd className="figures font-medium">{t("voteCount", { approve: c.votes.filter((v) => v.approve).length, reject: c.votes.filter((v) => !v.approve).length })}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
        <Link href={`/reports/${c.reportHash}`} className="underline decoration-line underline-offset-4 hover:decoration-current">
          {t("readReport")}
        </Link>
        <Link href={`/projects/${c.projectId}`} className="underline decoration-line underline-offset-4 hover:decoration-current">
          {t("seeSatellite")}
        </Link>
      </div>
      <EvidencePanel projectId={c.projectId} />
      <div className="mt-5 border-t border-line pt-5">
        {own ? (
          <p className="text-sm text-muted">{t("ownProject")}</p>
        ) : voted ? (
          <p className="text-sm text-muted">{t("alreadyVoted")}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={tx.busy} onClick={() => void vote(true)} className="rounded-control bg-mangrove-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-tide disabled:opacity-60">
              {t("approve")}
            </button>
            <button type="button" disabled={tx.busy} onClick={() => void vote(false)} className="rounded-control border border-bad/50 px-4 py-2.5 text-sm font-semibold text-bad hover:bg-bad/10 disabled:opacity-60">
              {t("reject")}
            </button>
          </div>
        )}
        <TxStatus state={tx} success={t("voted")} />
      </div>
    </li>
  );
}

interface EvidenceItem {
  id: string;
  url: string;
  cell: string | null;
  capturedAt: string | null;
  flags: EvidenceFlag[];
}

/** Raw photos through temporary links (private evidence, F7). Loaded only when asked for. */
function EvidencePanel({ projectId }: { projectId: number }) {
  const t = useTranslations("validate");
  const field = useTranslations("field");
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "loading" | "error" | EvidenceItem[]>("idle");

  async function load() {
    setState("loading");
    const res = await fetch(`/api/evidence/list?project=${projectId}`).catch(() => null);
    setState(res?.ok ? ((await res.json()) as { evidence: EvidenceItem[] }).evidence : "error");
  }

  if (state === "idle" || state === "loading") {
    return (
      <button type="button" onClick={() => void load()} disabled={state === "loading"} className="mt-4 text-sm font-medium underline decoration-line underline-offset-4">
        {state === "loading" ? t("loadingEvidence") : t("showEvidence")}
      </button>
    );
  }
  if (state === "error") return <p className="mt-4 text-sm text-bad">{t("evidenceError")}</p>;
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {state.map((e) => (
        <li key={e.id} className="text-xs">
          <a href={e.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-control border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- temporary signed URL */}
            <img src={e.url} alt={t("photoAlt", { cell: e.cell ?? "?" })} loading="lazy" className="aspect-square w-full object-cover" />
          </a>
          <p className="mt-1 text-muted">{e.capturedAt ? formatDate(locale, Date.parse(e.capturedAt) / 1000) : "–"}</p>
          <p className={e.flags.length ? "text-bad" : "text-ok"}>{e.flags.length ? e.flags.map((f) => field(`flag.${f}`)).join(", ") : field("accepted")}</p>
        </li>
      ))}
    </ul>
  );
}

function FinalizeButton({ claimId }: { claimId: number }) {
  const t = useTranslations("validate");
  const router = useRouter();
  const d = useDeployment();
  const { mutateAsync: writeContractAsync } = useWriteContract();
  const tx = useTx();
  if (!d) return null;
  return (
    <div>
      <button
        type="button"
        disabled={tx.busy}
        onClick={async () => {
          if (await tx.run(() => writeContractAsync({ address: d.verification, abi: verificationAbi, functionName: "finalize", args: [BigInt(claimId)] }))) router.refresh();
        }}
        className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:opacity-60 dark:bg-roots dark:text-tide"
      >
        {t("finalize")}
      </button>
      <TxStatus state={tx} success={t("finalized")} />
    </div>
  );
}
