import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnchorNode, Hash } from "@/components/hash";
import { CellMap } from "@/components/map/cell-map";
import { NdviChart } from "@/components/ndvi-chart";
import { OwnerPanel } from "@/components/project/owner-panel";
import { ProjectHistory } from "@/components/project-history";
import { ClaimChip, StatusChip } from "@/components/status-chip";
import { Link } from "@/i18n/navigation";
import { addressUrl, txUrl } from "@/lib/chain/config";
import { formatDate, formatMonth, formatNumber, unitsToHaYears } from "@/lib/format";
import { getProjectView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const view = await getProjectView(slug);
  return { title: view ? `${view.project.name} · BlueRoot` : "BlueRoot" };
}

export default async function ProjectPage({ params }: Params) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const view = await getProjectView(slug);
  if (!view) notFound();
  const { project: p, state } = view;
  const t = await getTranslations("project");
  const common = await getTranslations("common");
  const s = p.satellite;
  const anchored = p.status !== "candidate";

  const facts: { key: string; value: React.ReactNode }[] = [
    { key: "area", value: common("hectares", { value: formatNumber(locale, p.areaHa, 1) }) },
    { key: "cells", value: formatNumber(locale, p.cells.length) },
  ];
  if (p.chain) {
    facts.push(
      { key: "community", value: p.metadata ? p.metadata.community.name : <Hash value={p.chain.community} label={t("facts.community")} href={addressUrl(p.chain.community)} /> },
      { key: "owner", value: <Hash value={p.chain.owner} label={t("facts.owner")} href={addressUrl(p.chain.owner)} /> },
      { key: "registered", value: formatDate(locale, p.chain.registeredAt) },
      { key: "issued", value: common("haYears", { value: formatNumber(locale, unitsToHaYears(p.chain.issued), 2) }) },
      { key: "retired", value: common("haYears", { value: formatNumber(locale, unitsToHaYears(p.chain.retired), 2) }) },
    );
  }

  return (
    <article className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <nav aria-label={common("back")} className="text-sm">
        <Link href="/projects" className="text-muted underline decoration-line underline-offset-4 hover:text-ink">
          {t("backToProjects")}
        </Link>
      </nav>

      <header className="mt-4 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={p.status} />
          {p.id !== null ? <span className="figures text-sm text-muted">#{p.id}</span> : null}
        </div>
        <h1 className="mt-3 text-3xl sm:text-4xl">{p.name}</h1>
        {p.place ? <p className="mt-2 text-lg text-muted">{p.place}</p> : null}
        {p.metadata ? <p className="measure mt-4">{p.metadata.description}</p> : null}
      </header>

      {p.status === "candidate" ? (
        <p role="note" className="mt-6 max-w-3xl rounded-panel border border-dashed border-muted/50 p-4 text-sm">
          {t("candidateNotice")}
        </p>
      ) : !p.metadataVerified ? (
        <p role="alert" className="mt-6 max-w-3xl rounded-panel border border-bad/30 bg-bad/10 p-4 text-sm">
          {t("metadataUnverified")}
        </p>
      ) : null}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 sm:grid-cols-3 lg:grid-cols-4">
        {facts.map((f) => (
          <div key={f.key} className="min-w-0">
            <dt className="text-sm text-muted">{t(`facts.${f.key}`)}</dt>
            <dd className="figures mt-0.5 truncate font-semibold">{f.value}</dd>
          </div>
        ))}
        {p.metadataHash ? (
          <div className="col-span-2 min-w-0">
            <dt className="text-sm text-muted">{t("facts.metadata")}</dt>
            <dd className="mt-0.5 font-semibold">
              <Hash value={p.metadataHash} label={t("facts.metadata")} anchored />
            </dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="map-title" className="mt-10">
        <h2 id="map-title" className="sr-only">
          {t("mapLabel", { count: p.cells.length, name: p.name })}
        </h2>
        <CellMap
          zones={[{ slug: p.slug, name: p.name, cells: p.cells, anchored }]}
          label={t("mapLabel", { count: p.cells.length, name: p.name })}
          className="h-[48svh] min-h-72 rounded-panel"
        />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium">{t("cellListSummary")}</summary>
          <ul className="figures mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-muted sm:grid-cols-4">
            {p.cells.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      </section>

      {s ? (
        <section aria-labelledby="satellite-title" className="mt-16 grid gap-8 lg:grid-cols-[18rem_1fr]">
          <div>
            <h2 id="satellite-title" className="text-xl">
              {t("satelliteTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted">{t("satelliteIntro")}</p>
            <dl className="mt-6 space-y-4">
              <div className="flex flex-col-reverse">
                <dt className="text-sm text-muted">
                  {t("score")}
                  <span className="block text-xs">{common("demoAssumption")}</span>
                </dt>
                <dd className="figures text-3xl font-bold">{s.score}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-sm text-muted">{t("delta")}</dt>
                <dd className="figures text-lg font-semibold">
                  {formatNumber(locale, s.baseline ?? 0, 3)} → {formatNumber(locale, s.latest ?? 0, 3)}
                  {s.delta !== null ? (
                    <span className={s.delta >= 0 ? "ml-2 text-ok" : "ml-2 text-bad"}>
                      ({s.delta >= 0 ? "+" : ""}
                      {formatNumber(locale, s.delta, 3)})
                    </span>
                  ) : null}
                </dd>
              </div>
              <p className="text-sm text-muted">{t("scenes", { accepted: s.scenesAccepted, considered: s.scenesConsidered })}</p>
            </dl>
          </div>
          <div className="min-w-0">
            <NdviChart satellite={s} />
            <div className="mt-6 rounded-panel border border-line bg-surface p-4 text-sm">
              <p className="text-muted">{t("verifyHow")}</p>
              <p className="mt-2 font-semibold">
                <Hash value={s.hash} label={common("fileHash")} anchored={p.claims.some((c) => c.satelliteHash === s.hash)} full />
              </p>
              <p className="figures mt-2 text-xs text-muted">scripts/satellite/data/{s.zoneId}/ndvi-v1.json</p>
            </div>
          </div>
        </section>
      ) : null}

      {anchored ? (
        <section aria-labelledby="claims-title" className="mt-16 grid gap-8 lg:grid-cols-[18rem_1fr]">
          <h2 id="claims-title" className="text-xl">
            {t("claimsTitle")}
          </h2>
          {p.claims.length === 0 ? (
            <p className="text-muted">{t("noClaims")}</p>
          ) : (
            <ul className="space-y-4">
              {p.claims.map((c) => (
                <li key={c.id} className="rounded-panel border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-semibold tracking-normal">{t("claim.title", { id: c.id })}</h3>
                    <ClaimChip status={c.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">{t("claim.period")}</dt>
                      <dd className="figures font-medium">
                        {formatMonth(locale, new Date(c.periodStart * 1000).toISOString().slice(0, 7))} –{" "}
                        {formatMonth(locale, new Date(c.periodEnd * 1000).toISOString().slice(0, 7))}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("claim.score")}</dt>
                      <dd className="figures font-medium">{c.score} / 100</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("claim.quantity")}</dt>
                      <dd className="figures font-medium">{common("haYears", { value: formatNumber(locale, unitsToHaYears(c.quantity), 2) })}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("claim.votes")}</dt>
                      <dd className="figures font-medium">
                        {t("claim.voteCount", { approve: c.votes.filter((v) => v.approve).length, reject: c.votes.filter((v) => !v.approve).length })}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span className="text-muted">{t("claim.report")}</span>
                    <Hash value={c.reportHash} label={t("claim.report")} anchored />
                    <Link href={`/reports/${c.reportHash}`} className="font-medium underline decoration-line underline-offset-4 hover:decoration-current">
                      {t("claim.readReport")}
                    </Link>
                  </p>
                  {c.status === "pending" ? (
                    <p className="mt-2 text-sm text-muted">
                      {t("claim.deadlineAt", { date: formatDate(locale, c.deadline) })}
                    </p>
                  ) : null}
                  {c.finalizedTx ? (
                    <p className="mt-2 inline-flex items-center gap-2 text-sm">
                      <AnchorNode label={common("anchored")} />
                      <a href={txUrl(c.finalizedTx)} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-4">
                        {common("viewTx")}
                      </a>
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {p.chain && p.status === "active" ? (
        <OwnerPanel
          projectId={p.chain.id}
          owner={p.chain.owner}
          registeredAt={p.chain.registeredAt}
          hasOpenClaim={p.claims.some((c) => c.status === "pending" || c.status === "approved")}
        />
      ) : null}

      <section aria-labelledby="history-title" className="mt-16 grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div>
          <h2 id="history-title" className="text-xl">
            {t("historyTitle")}
          </h2>
          <p className="mt-3 text-sm text-muted">{t("historyIntro")}</p>
        </div>
        {p.id !== null ? <ProjectHistory projectId={p.id} state={state} /> : <p className="text-muted">{t("noHistory")}</p>}
      </section>
    </article>
  );
}
