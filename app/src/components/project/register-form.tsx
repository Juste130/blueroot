"use client";

import { cellArea, polygonToCells, UNITS } from "h3-js";
import { useLocale, useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { decodeEventLog, getAddress, isAddress } from "viem";
import { useWrite } from "@/components/tx/use-write";
import { useRouter } from "@/i18n/navigation";
import { projectRegistryAbi } from "@/lib/chain/abi";
import { formatNumber } from "@/lib/format";
import { DrawMap } from "../map/draw-map";
import { useDeployment } from "../providers";
import { TxStatus } from "../tx/tx-status";
import { useTx } from "../tx/use-tx";
import { AccessGate } from "../wallet/access-gate";

export interface CandidateZone {
  id: string;
  name: string;
  cells: string[];
}

const MAX_CELLS_PER_CALL = 100; // ProjectRegistry.MAX_CELLS_PER_CALL
const MAX_CELLS = 2000;
type Mode = "demo" | "draw" | "import";

function cellsOfPolygons(polygons: number[][][][]): string[] {
  const set = new Set<string>();
  for (const polygon of polygons) for (const c of polygonToCells(polygon, 10, true)) set.add(c);
  return [...set].sort();
}

/** Accepts a GeoJSON Feature, FeatureCollection, Polygon or MultiPolygon. */
function polygonsOfGeoJson(value: unknown): number[][][][] {
  const v = value as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown };
  if (v?.type === "FeatureCollection") return (v.features ?? []).flatMap(polygonsOfGeoJson);
  if (v?.type === "Feature") return polygonsOfGeoJson(v.geometry);
  if (v?.type === "Polygon") return [v.coordinates as number[][][]];
  if (v?.type === "MultiPolygon") return v.coordinates as number[][][][];
  return [];
}

const input = "mt-1 w-full rounded-control border border-line bg-surface px-3 py-2 aria-invalid:border-bad";

export function RegisterForm({ zones, taken }: { zones: CandidateZone[]; taken: Record<string, number> }) {
  const t = useTranslations("register");
  const locale = useLocale();
  const router = useRouter();
  const d = useDeployment();
  const ids = { name: useId(), description: useId(), place: useId(), commune: useId(), department: useId(), community: useId(), wallet: useId(), file: useId() };
  const [mode, setMode] = useState<Mode>("demo");
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [drawn, setDrawn] = useState<string[]>([]);
  const [imported, setImported] = useState<string[]>([]);
  const [importError, setImportError] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", place: "", commune: "", department: "", community: "", wallet: "" });
  const [step, setStep] = useState<{ kind: "idle" | "publishing" | "registering" | "cells" | "done" | "error"; batch?: number; batches?: number; error?: string }>({ kind: "idle" });
  const writeContractAsync = useWrite();
  const tx = useTx();

  const cells = mode === "demo" ? (zones.find((z) => z.id === zoneId)?.cells ?? []) : mode === "draw" ? drawn : imported;
  const conflicts = useMemo(() => cells.filter((c) => taken[c] !== undefined), [cells, taken]);
  const areaHa = useMemo(() => cells.reduce((s, c) => s + cellArea(c, UNITS.m2), 0) / 10_000, [cells]);
  const walletValid = isAddress(form.wallet);
  const complete = Object.entries(form).every(([k, v]) => k === "wallet" || v.trim().length > 0);
  const ready = complete && walletValid && cells.length > 0 && cells.length <= MAX_CELLS && conflicts.length === 0 && step.kind !== "publishing";
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    if (!d) return;
    setStep({ kind: "publishing" });
    const res = await fetch("/api/documents/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        description: form.description.trim(),
        language: locale === "en" ? "en" : "fr",
        location: { place: form.place.trim(), commune: form.commune.trim(), department: form.department.trim(), country: "BJ" },
        community: { name: form.community.trim() },
        ...(mode === "demo" ? { satelliteZone: zoneId, source: { description: "OpenStreetMap wetland=mangrove", license: "ODbL 1.0" } } : {}),
        cells,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { hash?: `0x${string}`; error?: string };
    if (!res.ok || !body.hash) return setStep({ kind: "error", error: body.error ?? "unknown" });

    setStep({ kind: "registering" });
    const receipt = await tx.run(() =>
      writeContractAsync({ address: d.projectRegistry, abi: projectRegistryAbi, functionName: "registerProject", args: [body.hash!, getAddress(form.wallet)] }),
    );
    if (!receipt) return setStep({ kind: "idle" });
    let projectId: bigint | undefined;
    for (const log of receipt.logs) {
      try {
        const e = decodeEventLog({ abi: projectRegistryAbi, data: log.data, topics: log.topics });
        if (e.eventName === "ProjectRegistered") projectId = e.args.projectId;
      } catch {
        // other contracts' logs
      }
    }
    if (projectId === undefined) return setStep({ kind: "error", error: "unknown" });

    // At most 100 cells per transaction (bounded loop in the contract): several transactions if needed.
    const batches = Math.ceil(cells.length / MAX_CELLS_PER_CALL);
    for (let b = 0; b < batches; b++) {
      setStep({ kind: "cells", batch: b + 1, batches });
      const chunk = cells.slice(b * MAX_CELLS_PER_CALL, (b + 1) * MAX_CELLS_PER_CALL).map((c) => BigInt(`0x${c}`));
      const ok = await tx.run(() => writeContractAsync({ address: d.projectRegistry, abi: projectRegistryAbi, functionName: "addCells", args: [projectId!, chunk] }));
      if (!ok) return setStep({ kind: "error", error: "cells_incomplete", batch: b + 1, batches });
    }
    setStep({ kind: "done" });
    router.push(`/projects/${projectId}`);
  }

  return (
    <AccessGate role="proponent">
      {() => (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) void submit();
          }}
          className="space-y-12"
        >
          <fieldset>
            <legend className="text-xl font-bold tracking-[-0.02em]">{t("zoneTitle")}</legend>
            <p className="mt-1 text-sm text-muted">{t("zoneIntro")}</p>
            <div role="radiogroup" aria-label={t("zoneMode")} className="mt-4 inline-flex rounded-control border border-line p-0.5 text-sm font-semibold">
              {(["demo", "draw", "import"] as const).map((m) => (
                <label key={m} className={`cursor-pointer rounded-[6px] px-3 py-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] ${mode === m ? "bg-tide text-paper dark:bg-roots dark:text-tide" : "text-muted hover:text-ink"}`}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
                  {t(`mode.${m}`)}
                </label>
              ))}
            </div>

            <div className="mt-5">
              {mode === "demo" ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {zones.map((z) => (
                    <label key={z.id} className="cursor-pointer rounded-panel border border-line bg-surface p-4 has-[:checked]:border-tide has-[:checked]:ring-2 has-[:checked]:ring-tide/20">
                      <input type="radio" name="zone" value={z.id} checked={zoneId === z.id} onChange={() => setZoneId(z.id)} className="sr-only" />
                      <span className="block font-semibold">{z.name}</span>
                      <span className="text-sm text-muted">{t("cellCount", { count: z.cells.length })}</span>
                    </label>
                  ))}
                </div>
              ) : mode === "draw" ? (
                <DrawMap label={t("draw.label")} cells={drawn} onPolygon={(ring) => setDrawn(ring ? cellsOfPolygons([[[...ring, ring[0]!]]]) : [])} />
              ) : (
                <div>
                  <label htmlFor={ids.file} className="block font-semibold">{t("importLabel")}</label>
                  <p className="text-sm text-muted">{t("importHint")}</p>
                  <input
                    id={ids.file}
                    type="file"
                    accept=".geojson,.json,application/geo+json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      setImportError(false);
                      if (!file) return;
                      try {
                        const polygons = polygonsOfGeoJson(JSON.parse(await file.text()));
                        const found = polygons.length ? cellsOfPolygons(polygons) : [];
                        setImported(found);
                        setImportError(found.length === 0);
                      } catch {
                        setImported([]);
                        setImportError(true);
                      }
                    }}
                    className="mt-2 block text-sm file:mr-3 file:rounded-control file:border file:border-line file:bg-surface file:px-3 file:py-2 file:font-semibold"
                  />
                  {importError ? <p role="alert" className="mt-2 text-sm text-bad">{t("importError")}</p> : null}
                </div>
              )}
            </div>

            <p className="figures mt-4 text-sm" aria-live="polite">
              {cells.length > 0 ? t("zoneSummary", { count: cells.length, area: formatNumber(locale, areaHa, 1) }) : t("zoneEmpty")}
            </p>
            {cells.length > MAX_CELLS ? <p role="alert" className="mt-2 text-sm text-bad">{t("tooManyCells", { max: MAX_CELLS })}</p> : null}
            {conflicts.length > 0 ? (
              <div role="alert" className="mt-3 rounded-control border border-bad/30 bg-bad/10 p-3 text-sm">
                <p className="font-semibold">{t("conflicts", { count: conflicts.length })}</p>
                <p className="mt-1">{t("conflictsHelp", { projects: [...new Set(conflicts.map((c) => `#${taken[c]}`))].join(", ") })}</p>
              </div>
            ) : null}
          </fieldset>

          <fieldset className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-4 text-xl font-bold tracking-[-0.02em]">{t("infoTitle")}</legend>
            <div className="sm:col-span-2">
              <label htmlFor={ids.name} className="font-semibold">{t("fields.name")}</label>
              <input id={ids.name} value={form.name} onChange={set("name")} maxLength={80} required className={input} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={ids.description} className="font-semibold">{t("fields.description")}</label>
              <textarea id={ids.description} value={form.description} onChange={set("description")} maxLength={1200} rows={4} required className={input} />
            </div>
            <div>
              <label htmlFor={ids.place} className="font-semibold">{t("fields.place")}</label>
              <input id={ids.place} value={form.place} onChange={set("place")} maxLength={80} required className={input} />
            </div>
            <div>
              <label htmlFor={ids.commune} className="font-semibold">{t("fields.commune")}</label>
              <input id={ids.commune} value={form.commune} onChange={set("commune")} maxLength={80} required className={input} />
            </div>
            <div>
              <label htmlFor={ids.department} className="font-semibold">{t("fields.department")}</label>
              <input id={ids.department} value={form.department} onChange={set("department")} maxLength={80} required className={input} />
            </div>
            <div>
              <label htmlFor={ids.community} className="font-semibold">{t("fields.community")}</label>
              <input id={ids.community} value={form.community} onChange={set("community")} maxLength={120} required aria-describedby={`${ids.community}-hint`} className={input} />
              <p id={`${ids.community}-hint`} className="mt-1 text-xs text-muted">{t("fields.communityHint")}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={ids.wallet} className="font-semibold">{t("fields.wallet")}</label>
              <input
                id={ids.wallet}
                value={form.wallet}
                onChange={set("wallet")}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={(form.wallet.length > 0 && !walletValid) || undefined}
                aria-describedby={`${ids.wallet}-hint`}
                className={`figures ${input}`}
              />
              <p id={`${ids.wallet}-hint`} className="mt-1 text-xs text-muted">{t("fields.walletHint")}</p>
            </div>
          </fieldset>

          <div>
            <p className="measure text-sm text-muted">{t("publicNotice")}</p>
            <button
              type="submit"
              disabled={!ready || tx.busy}
              className="mt-4 rounded-control bg-tide px-5 py-3 text-sm font-semibold text-paper hover:bg-tide-soft disabled:cursor-not-allowed disabled:opacity-60 dark:bg-roots dark:text-tide"
            >
              {t("submit")}
            </button>
            <div aria-live="polite" className="mt-3 text-sm">
              {step.kind === "publishing" ? <p>{t("steps.publishing")}</p> : null}
              {step.kind === "registering" ? <p>{t("steps.registering")}</p> : null}
              {step.kind === "cells" ? <p>{t("steps.cells", { batch: step.batch!, batches: step.batches! })}</p> : null}
              {step.kind === "error" ? (
                <p role="alert" className="text-bad">
                  {t.has(`errors.${step.error}`) ? t(`errors.${step.error}`) : t("errors.unknown")}
                </p>
              ) : null}
            </div>
            <TxStatus state={tx} />
          </div>
        </form>
      )}
    </AccessGate>
  );
}
