import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Hash } from "@/components/hash";
import { Link } from "@/i18n/navigation";
import { getJson } from "@/lib/content/store";
import { formatDate, formatMonth, formatNumber } from "@/lib/format";
import { ReportSchema } from "@/lib/report/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; hash: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("report");
  return { title: `${t("title")} · BlueRoot` };
}

const SEVERITY = { high: "border-bad text-bad", medium: "border-lagoon-ink text-data", low: "border-line text-muted" } as const;

/** Public verification report (F6): readable by anyone, served only if its bytes match the hash. */
export default async function ReportPage({ params }: Params) {
  const { locale, hash } = await params;
  setRequestLocale(locale);
  if (!/^0x[0-9a-f]{64}$/.test(hash)) notFound();
  const doc = await getJson(hash as `0x${string}`, (v) => ReportSchema.parse(v));
  const t = await getTranslations("report");
  const common = await getTranslations("common");
  if (!doc) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-12 sm:px-6">
        <h1 className="text-3xl">{t("title")}</h1>
        <p role="alert" className="mt-6 rounded-panel border border-bad/30 bg-bad/10 p-4">
          {t("notFound")}
        </p>
      </div>
    );
  }
  const r = doc.data;
  const a = r.ai.assessment;
  const lang = locale === "en" ? "en" : "fr";
  const month = (unix: number) => formatMonth(locale, new Date(unix * 1000).toISOString().slice(0, 7), "long");

  return (
    <article className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
      <Link href={`/projects/${r.projectId}`} className="text-sm text-muted underline decoration-line underline-offset-4 hover:text-ink">
        {t("backToProject")}
      </Link>
      <h1 className="mt-4 text-3xl sm:text-4xl">{t("title")}</h1>
      <p className="mt-2 text-muted">
        {t("subtitle", { project: r.projectId, from: month(r.period.start), to: month(r.period.end) })}
      </p>
      <p className="mt-4 text-sm">
        <Hash value={doc.hash} label={t("hash")} full />
      </p>

      <section aria-labelledby="scores-title" className="mt-10">
        <h2 id="scores-title" className="text-xl">
          {t("scoresTitle")}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
          {(
            [
              ["satellite", r.scores.satellite, r.scores.weights.satellite],
              ["field", r.scores.field, r.scores.weights.field],
              ["ai", r.scores.ai, r.scores.weights.ai],
            ] as const
          ).map(([key, value, weight]) => (
            <div key={key} className="flex flex-col-reverse bg-surface p-4">
              <dt className="text-sm text-muted">{t(`score.${key}`, { weight: Math.round(weight * 100) })}</dt>
              <dd className="figures text-2xl font-bold">{value}</dd>
            </div>
          ))}
          <div className="flex flex-col-reverse bg-surface p-4">
            <dt className="text-sm text-muted">{t("score.combined", { threshold: r.scores.threshold })}</dt>
            <dd className={`figures text-2xl font-bold ${r.scores.combined >= r.scores.threshold ? "text-ok" : "text-bad"}`}>{r.scores.combined}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">{common("demoAssumption")}</p>
      </section>

      <section aria-labelledby="ai-title" className="mt-12">
        <h2 id="ai-title" className="text-xl">
          {t("aiTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("aiNotice", { model: r.ai.model, date: formatDate(locale, Date.parse(r.ai.generatedAt) / 1000) })}</p>
        <p className="measure mt-4">{a.summary[lang]}</p>
        <p className="mt-3 text-sm">
          {t("recommendation")} <strong>{t(`recommendations.${a.recommendation}`)}</strong>
        </p>
        {a.inconsistencies.length ? (
          <>
            <h3 className="mt-8 text-base font-semibold tracking-normal">{t("inconsistencies")}</h3>
            <ul className="mt-3 space-y-3">
              {a.inconsistencies.map((i, n) => (
                <li key={n} className={`measure border-l-2 pl-4 ${SEVERITY[i.severity]}`}>
                  <span className="text-xs font-semibold">{t(`severity.${i.severity}`)}</span>
                  <p className="text-ink">{i.description[lang]}</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {a.strengths.length ? (
          <>
            <h3 className="mt-8 text-base font-semibold tracking-normal">{t("strengths")}</h3>
            <ul className="measure mt-3 list-disc space-y-2 pl-5">
              {a.strengths.map((s, n) => (
                <li key={n}>{s[lang]}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section aria-labelledby="evidence-title" className="mt-12">
        <h2 id="evidence-title" className="text-xl">
          {t("evidenceTitle")}
        </h2>
        <p className="mt-2 text-muted">
          {t("evidenceSummary", { accepted: r.evidence.accepted, submitted: r.evidence.submitted, covered: r.evidence.coveredCells, cells: r.evidence.totalCells })}
        </p>
        <div className="mt-4 overflow-x-auto rounded-panel border border-line">
          <table className="figures w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-surface">
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-semibold">{t("photo")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("cell")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("captured")}</th>
                <th scope="col" className="px-3 py-2 font-semibold">{t("checks")}</th>
              </tr>
            </thead>
            <tbody>
              {r.evidence.items.map((e) => (
                <tr key={e.sha256} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">
                    <Hash value={e.sha256} label={t("photo")} />
                  </td>
                  <td className="px-3 py-2">{e.cell ?? "–"}</td>
                  <td className="px-3 py-2">{e.capturedAt ? formatDate(locale, Date.parse(e.capturedAt) / 1000) : "–"}</td>
                  <td className="px-3 py-2">
                    {e.flags.length === 0 ? (
                      <span className="text-ok">{t("allChecksPassed")}</span>
                    ) : (
                      <span className="text-bad">{e.flags.map((f) => t(`flag.${f}`)).join(", ")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">{t("privateNotice")}</p>
      </section>

      <section aria-labelledby="sat-title" className="mt-12">
        <h2 id="sat-title" className="text-xl">
          {t("satelliteTitle")}
        </h2>
        <p className="mt-2 text-muted">
          {t("satelliteSummary", {
            baseline: formatNumber(locale, r.satellite.baselineNdvi ?? 0, 3),
            latest: formatNumber(locale, r.satellite.latestNdvi ?? 0, 3),
            score: r.satellite.score,
          })}
        </p>
        <p className="mt-3 text-sm">
          <Hash value={r.satellite.hash} label={common("fileHash")} full />
        </p>
      </section>
    </article>
  );
}
