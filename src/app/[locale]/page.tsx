import { getTranslations, setRequestLocale } from "next-intl/server";
import { AnchorNode } from "@/components/hash";
import { CellMap } from "@/components/map/cell-map";
import { ProjectList } from "@/components/project-list";
import { Link } from "@/i18n/navigation";
import { formatNumber, formatToken, unitsToHaYears } from "@/lib/format";
import { getRegistryView } from "@/lib/registry/projects";

export const dynamic = "force-dynamic";

const FLOW = [
  { key: "register", anchored: true },
  { key: "evidence", anchored: false },
  { key: "satellite", anchored: false },
  { key: "report", anchored: false },
  { key: "anchor", anchored: true },
  { key: "validate", anchored: true },
  { key: "issue", anchored: true },
  { key: "retire", anchored: true },
] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const common = await getTranslations("common");
  const { snapshot, state, projects } = await getRegistryView();
  const { totals } = state;
  const live = snapshot.status === "live";
  const hasCredits = totals.issued > 0;
  const mappedHa = projects.reduce((s, p) => s + p.areaHa, 0);

  const heroFigures = hasCredits
    ? [
        { value: formatNumber(locale, unitsToHaYears(totals.issued), 2), label: t("figureVerified"), anchored: true },
        { value: formatNumber(locale, totals.retired), label: t("figureRetired"), anchored: true },
      ]
    : [
        { value: formatNumber(locale, projects.length), label: t("figureZones"), anchored: false },
        { value: formatNumber(locale, mappedHa, 1), label: t("figureArea"), anchored: false },
      ];

  const ledger = [
    { key: "issued", value: formatNumber(locale, totals.issued) },
    { key: "buffer", value: formatNumber(locale, totals.buffer) },
    { key: "sold", value: formatNumber(locale, totals.sold) },
    { key: "retired", value: formatNumber(locale, totals.retired) },
    { key: "community", value: formatToken(locale, totals.communityPaid) },
    { key: "projects", value: formatNumber(locale, totals.projects) },
  ] as const;

  return (
    <>
      <section aria-labelledby="hero-title" className="relative">
        <CellMap
          zones={projects.map((p) => ({ slug: p.slug, name: p.name, cells: p.cells, anchored: p.status !== "candidate" }))}
          label={t("mapLabel")}
          linkToProjects
          insetLeft={620}
          className="h-[52svh] min-h-80 lg:h-[calc(100svh-7rem)] lg:max-h-[52rem]"
        />
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:pointer-events-none lg:absolute lg:inset-x-0 lg:bottom-10">
          <div className="-mt-10 rounded-panel border border-line bg-surface p-6 shadow-[0_12px_40px_-20px_rgb(11_60_93/0.45)] sm:p-8 lg:pointer-events-auto lg:mt-0 lg:max-w-[34rem]">
            <h1 id="hero-title" className="text-3xl leading-[1.05] sm:text-4xl">
              {t("tagline")}
            </h1>
            <p className="measure mt-4 text-muted">{t("intro")}</p>
            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5">
              {heroFigures.map((f) => (
                <div key={f.label} className="flex flex-col-reverse">
                  <dt className="text-sm text-muted">{f.label}</dt>
                  <dd className="figures flex items-center gap-2 text-2xl font-bold">
                    {f.value}
                    {f.anchored ? <AnchorNode label={common("anchored")} /> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/projects" className="rounded-control bg-tide px-4 py-2.5 text-sm font-semibold text-paper hover:bg-tide-soft dark:bg-roots dark:text-tide">
                {t("ctaProjects")}
              </Link>
              <Link href="/certificates" className="rounded-control border border-line px-4 py-2.5 text-sm font-semibold hover:bg-roots/40">
                {t("ctaVerify")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-24 px-4 pt-20 sm:px-6">
        <section aria-labelledby="ledger-title" className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <div>
            <h2 id="ledger-title" className="text-xl">
              {t("ledgerTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted">{t("ledgerIntro")}</p>
          </div>
          {live && hasCredits ? (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
              {ledger.map((f) => (
                <div key={f.key} className="flex flex-col-reverse bg-surface p-5">
                  <dt className="mt-1 text-sm text-muted">{t(`ledger.${f.key}`)}</dt>
                  <dd className="figures flex items-center gap-2 text-xl font-bold">
                    {f.value}
                    <AnchorNode label={common("anchored")} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="self-start rounded-panel border border-dashed border-line p-6 text-muted">{t("ledgerEmpty")}</p>
          )}
        </section>

        <section aria-labelledby="projects-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="projects-title" className="text-xl">
              {t("projectsTitle")}
            </h2>
            <Link href="/projects" className="text-sm font-semibold underline decoration-line underline-offset-4 hover:decoration-current">
              {t("allProjects")}
            </Link>
          </div>
          <ProjectList projects={projects.slice(0, 5)} />
        </section>

        <section aria-labelledby="flow-title" className="grid gap-10 lg:grid-cols-[18rem_1fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="flow-title" className="text-xl">
              {t("flowTitle")}
            </h2>
            <p className="mt-3 text-sm text-muted">{t("flowIntro")}</p>
          </div>
          <ol className="relative ml-1.5 border-l-2 border-roots dark:border-tide-soft">
            {FLOW.map((step, i) => (
              <li key={step.key} className="relative pb-9 pl-8 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[9px] top-1 size-4 rounded-full ring-4 ring-paper ${
                    step.anchored ? "bg-gold" : "border-2 border-roots bg-paper dark:border-tide-soft"
                  }`}
                />
                <h3 className="text-base font-semibold tracking-normal">
                  <span className="figures mr-2 text-muted">{i + 1}.</span>
                  {t(`flow.${step.key}.title`)}
                  {step.anchored ? <span className="sr-only"> ({common("anchored")})</span> : null}
                </h3>
                <p className="measure mt-1 text-muted">{t(`flow.${step.key}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="limits-title" className="grid gap-8 lg:grid-cols-[18rem_1fr]">
          <h2 id="limits-title" className="text-xl">
            {t("limitsTitle")}
          </h2>
          <ul className="measure space-y-4">
            {(["carbon", "weights", "field"] as const).map((k) => (
              <li key={k} className="border-l-2 border-lagoon pl-4">
                {t(`limits.${k}`)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
