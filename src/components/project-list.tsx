import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatMonth, formatNumber, unitsToHaYears } from "@/lib/format";
import type { ProjectView } from "@/lib/registry/projects";
import { AnchorNode } from "./hash";
import { CellFootprint } from "./map/cell-footprint";
import { Sparkline } from "./sparkline";
import { StatusChip } from "./status-chip";

export async function ProjectList({ projects }: { projects: ProjectView[] }) {
  const t = await getTranslations("projects");
  const common = await getTranslations("common");
  const locale = await getLocale();

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
      {projects.map((p) => {
        const s = p.satellite;
        const anchored = p.status !== "candidate";
        return (
          <li key={p.slug} className="relative grid grid-cols-[3.5rem_1fr] gap-x-4 gap-y-3 p-4 hover:bg-roots/20 sm:grid-cols-[4rem_1fr_auto] sm:items-center sm:p-5">
            <CellFootprint cells={p.cells} anchored={anchored} className="size-14 sm:size-16" />
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-normal">
                <Link href={`/projects/${p.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-3 focus-visible:after:outline-[var(--focus)]">
                  {p.name}
                </Link>
              </h3>
              <p className="mt-0.5 text-sm text-muted">
                {[p.place, common("hectares", { value: formatNumber(locale, p.areaHa, 1) }), common("cells", { count: p.cells.length })]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusChip status={p.status} />
                {p.chain && p.chain.issued > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                    <AnchorNode label={common("anchored")} />
                    {common("haYears", { value: formatNumber(locale, unitsToHaYears(p.chain.issued), 2) })}
                  </span>
                ) : null}
              </div>
            </div>
            {s ? (
              <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:justify-end">
                <Sparkline values={s.monthly.map((m) => m.ndvi)} className="h-7 w-24 text-ok" />
                <dl className="text-right">
                  <dt className="text-xs text-muted">{t("satelliteScore")}</dt>
                  <dd className="figures text-xl font-bold leading-tight">{s.score}</dd>
                  <dd className="figures text-xs text-muted">
                    {t("ndviTrend", {
                      from: formatNumber(locale, s.baseline ?? 0, 2),
                      to: formatNumber(locale, s.latest ?? 0, 2),
                    })}
                    <span className="sr-only">
                      {" "}
                      ({formatMonth(locale, s.baselineWindow.from)} – {formatMonth(locale, s.latestWindow.to)})
                    </span>
                  </dd>
                </dl>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
