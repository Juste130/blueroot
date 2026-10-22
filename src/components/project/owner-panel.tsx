"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { type Address, isAddressEqual } from "viem";
import { useReadContract } from "wagmi";
import { Link, useRouter } from "@/i18n/navigation";
import { verificationAbi } from "@/lib/chain/abi";
import { formatDate } from "@/lib/format";
import { THRESHOLD } from "@/lib/score";
import { useDeployment } from "../providers";
import { useSession } from "../wallet/session";

interface Analysis {
  hash: `0x${string}`;
  submitToken: string | null;
  report: { scores: { satellite: number; field: number; ai: number; combined: number }; ai: { assessment: { recommendation: string } } };
}

/**
 * Shown to the project's proponent only: build the verification file for the period since the last
 * one (AI report), read it, then submit it for anchoring and validation.
 */
export function OwnerPanel({ projectId, owner, registeredAt, hasOpenClaim }: { projectId: number; owner: Address; registeredAt: number; hasOpenClaim: boolean }) {
  const t = useTranslations("owner");
  const locale = useLocale();
  const router = useRouter();
  const d = useDeployment();
  const { address } = useSession();
  const { data: claimedUntil } = useReadContract({
    address: d?.verification,
    abi: verificationAbi,
    functionName: "claimedUntil",
    args: [BigInt(projectId)],
    query: { enabled: Boolean(d) },
  });
  const [phase, setPhase] = useState<"idle" | "analyzing" | "ready" | "submitting" | "submitted" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [shownAt] = useState(() => Date.now());

  if (!address || !isAddressEqual(address, owner) || !d) return null;

  const periodStart = Math.max(registeredAt, Number(claimedUntil ?? 0));
  // A minute of margin: the contract refuses a period ending after the current block.
  const endOf = (ms: number) => Math.floor(ms / 1000) - 60;

  async function call(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(String(data.error ?? "unknown"));
    return data;
  }

  async function analyze() {
    setPhase("analyzing");
    setError(null);
    try {
      setAnalysis((await call("/api/reports/analyze", { projectId, periodStart, periodEnd: endOf(Date.now()) })) as unknown as Analysis);
      setPhase("ready");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  async function submit() {
    if (!analysis?.submitToken) return;
    setPhase("submitting");
    try {
      await call("/api/reports/submit", { token: analysis.submitToken });
      setPhase("submitted");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const errorText = error && t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.unknown");

  return (
    <section aria-labelledby="owner-title" className="mt-16 rounded-panel border border-tide/30 bg-surface p-6">
      <h2 id="owner-title" className="text-xl">
        {t("title")}
      </h2>
      <p className="measure mt-2 text-sm text-muted">{t("intro", { from: formatDate(locale, periodStart), to: formatDate(locale, endOf(shownAt)) })}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/field" className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold hover:bg-roots/40">
          {t("addEvidence")}
        </Link>
        <button
          type="button"
          disabled={hasOpenClaim || phase === "analyzing" || phase === "submitting"}
          onClick={() => void analyze()}
          className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:cursor-not-allowed disabled:opacity-60 dark:bg-roots dark:text-tide"
        >
          {phase === "analyzing" ? t("analyzing") : t("analyze")}
        </button>
      </div>
      {hasOpenClaim ? <p className="mt-3 text-sm text-muted">{t("openClaim")}</p> : null}

      <div aria-live="polite" className="mt-5">
        {phase === "error" ? (
          <p role="alert" className="rounded-control border border-bad/30 bg-bad/10 p-3 text-sm">
            {errorText}
          </p>
        ) : null}
        {analysis && (phase === "ready" || phase === "submitting" || phase === "submitted") ? (
          <div className="rounded-control border border-line p-4">
            <dl className="figures grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {(["satellite", "field", "ai", "combined"] as const).map((k) => (
                <div key={k} className="flex flex-col-reverse">
                  <dt className="text-muted">{t(`scores.${k}`)}</dt>
                  <dd className={`text-xl font-bold ${k === "combined" ? (analysis.report.scores.combined >= THRESHOLD ? "text-ok" : "text-bad") : ""}`}>{analysis.report.scores[k]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm">
              <Link href={`/reports/${analysis.hash}`} className="font-medium underline decoration-line underline-offset-4">
                {t("readReport")}
              </Link>
            </p>
            {analysis.submitToken ? (
              phase === "submitted" ? (
                <p className="mt-3 text-sm font-medium text-ok">{t("submitted")}</p>
              ) : (
                <button
                  type="button"
                  disabled={phase === "submitting"}
                  onClick={() => void submit()}
                  className="mt-4 rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft disabled:opacity-60 dark:bg-roots dark:text-tide"
                >
                  {phase === "submitting" ? t("submitting") : t("submit")}
                </button>
              )
            ) : (
              <p className="mt-3 text-sm text-bad">{t("belowThreshold", { threshold: THRESHOLD })}</p>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
