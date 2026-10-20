import { getLocale, getTranslations } from "next-intl/server";
import { formatMonth, formatNumber } from "@/lib/format";
import type { SatelliteSummary } from "@/lib/registry/projects";

const W = 720;
const H = 280;
const M = { top: 16, right: 16, bottom: 34, left: 44 };

function monthIndex(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return y * 12 + (m - 1);
}

/**
 * Monthly NDVI as an SVG line chart, rendered on the server. Comparison windows are shaded, Harmattan
 * months (Dec-Feb) are marked, and every value is repeated in a data table for screen readers.
 */
export async function NdviChart({ satellite }: { satellite: SatelliteSummary }) {
  const t = await getTranslations("project");
  const locale = await getLocale();
  const { monthly } = satellite;
  if (monthly.length < 2) return null;

  const first = monthIndex(monthly[0]!.month);
  const last = monthIndex(monthly.at(-1)!.month);
  const values = monthly.map((m) => m.ndvi);
  const yMin = Math.floor((Math.min(...values) - 0.03) * 20) / 20;
  const yMax = Math.ceil((Math.max(...values) + 0.03) * 20) / 20;
  const x = (month: string | number) => M.left + (((typeof month === "string" ? monthIndex(month) : month) - first) / (last - first)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  const band = (from: string, to: string) => ({ x: x(monthIndex(from) - 0.5), w: x(monthIndex(to) + 0.5) - x(monthIndex(from) - 0.5) });

  const yTicks: number[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += 0.05) yTicks.push(Math.round(v * 100) / 100);
  const harmattan: number[] = [];
  for (let i = first; i <= last; i++) if ([11, 0, 1].includes(i % 12)) harmattan.push(i);
  const xTicks = monthly.filter((m) => m.month.endsWith("-01") || m.month.endsWith("-07"));

  // Gaps (months without a clear scene) break the line instead of being interpolated.
  const segments: string[][] = [];
  monthly.forEach((m, i) => {
    const prev = monthly[i - 1];
    if (!prev || monthIndex(m.month) - monthIndex(prev.month) > 1) segments.push([]);
    segments.at(-1)!.push(`${x(m.month).toFixed(1)},${y(m.ndvi).toFixed(1)}`);
  });

  const b = band(satellite.baselineWindow.from, satellite.baselineWindow.to);
  const l = band(satellite.latestWindow.from, satellite.latestWindow.to);
  const fromLabel = formatMonth(locale, monthly[0]!.month, "long");
  const toLabel = formatMonth(locale, monthly.at(-1)!.month, "long");

  return (
    <figure>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[36rem] text-muted" role="img" aria-label={t("chartLabel", { from: fromLabel, to: toLabel })}>
          {harmattan.map((i) => (
            <rect key={i} x={x(i - 0.5)} y={M.top} width={x(i + 0.5) - x(i - 0.5)} height={H - M.top - M.bottom} className="fill-[var(--line)]" opacity={0.45} />
          ))}
          <rect x={b.x} y={M.top} width={b.w} height={H - M.top - M.bottom} className="fill-lagoon" opacity={0.22} />
          <rect x={l.x} y={M.top} width={l.w} height={H - M.top - M.bottom} className="fill-lagoon" opacity={0.22} />
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} className="stroke-[var(--line)]" />
              <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize="12" className="figures fill-current">
                {formatNumber(locale, v, 2)}
              </text>
            </g>
          ))}
          {xTicks.map((m) => (
            <text key={m.month} x={x(m.month)} y={H - 10} textAnchor="middle" fontSize="12" className="fill-current">
              {formatMonth(locale, m.month)}
            </text>
          ))}
          {satellite.baseline !== null ? (
            <line x1={b.x} x2={b.x + b.w} y1={y(satellite.baseline)} y2={y(satellite.baseline)} className="stroke-lagoon-ink dark:stroke-lagoon" strokeWidth="2.5" />
          ) : null}
          {satellite.latest !== null ? (
            <line x1={l.x} x2={l.x + l.w} y1={y(satellite.latest)} y2={y(satellite.latest)} className="stroke-lagoon-ink dark:stroke-lagoon" strokeWidth="2.5" />
          ) : null}
          {segments.map((pts, i) => (
            <polyline key={i} points={pts.join(" ")} fill="none" className="stroke-mangrove-ink dark:stroke-mangrove" strokeWidth="2" strokeLinejoin="round" />
          ))}
          {monthly.map((m) => (
            <circle key={m.month} cx={x(m.month)} cy={y(m.ndvi)} r="2.6" className="fill-mangrove-ink dark:fill-mangrove" />
          ))}
        </svg>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 bg-mangrove-ink dark:bg-mangrove" />
          {t("ndvi")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-4 bg-lagoon/40" />
          {t("baseline", { from: formatMonth(locale, satellite.baselineWindow.from), to: formatMonth(locale, satellite.baselineWindow.to) })},{" "}
          {t("latest", { from: formatMonth(locale, satellite.latestWindow.from), to: formatMonth(locale, satellite.latestWindow.to) })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-4 bg-[var(--line)]" />
          {t("harmattan")}
        </span>
      </figcaption>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">{t("tableSummary")}</summary>
        <div className="mt-3 max-h-72 overflow-auto rounded-control border border-line">
          <table className="figures w-full text-left">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line">
                <th scope="col" className="px-3 py-2 font-semibold">{t("month")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t("ndvi")}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t("sceneCount")}</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-1.5 font-normal">{formatMonth(locale, m.month, "long")}</th>
                  <td className="px-3 py-1.5 text-right">{formatNumber(locale, m.ndvi, 3)}</td>
                  <td className="px-3 py-1.5 text-right">{m.scenes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
