"use client";

import exifr from "exifr";
import { latLngToCell } from "h3-js";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { type QueuedPhoto, compressPhoto, queue } from "@/lib/evidence/client";
import type { EvidenceFlag } from "@/lib/evidence/checks";
import { AccessGate } from "../wallet/access-gate";

export interface FieldProject {
  id: number;
  name: string;
  place: string;
  cells: string[];
}

type ItemStatus = "checking" | "compressing" | "uploading" | "queued" | "done" | "refused";

interface Item {
  id: string;
  name: string;
  preview: string;
  status: ItemStatus;
  /** Instant check in the phone, before any upload. */
  local?: "in_zone" | "out_of_zone" | "no_gps";
  flags?: EvidenceFlag[];
  error?: string;
}

async function upload(projectId: number, blob: Blob, name: string): Promise<{ ok: true; flags: EvidenceFlag[] } | { ok: false; error: string; network: boolean }> {
  const form = new FormData();
  form.append("projectId", String(projectId));
  form.append("file", blob, name);
  try {
    const res = await fetch("/api/evidence/upload", { method: "POST", body: form });
    const body = (await res.json().catch(() => ({}))) as { evidence?: { flags: EvidenceFlag[] }; error?: string };
    return res.ok && body.evidence ? { ok: true, flags: body.evidence.flags } : { ok: false, error: body.error ?? "unknown", network: false };
  } catch {
    return { ok: false, error: "network", network: true };
  }
}

export function FieldForm({ projects }: { projects: FieldProject[] }) {
  const t = useTranslations("field");
  const inputId = useId();
  const [projectId, setProjectId] = useState<number | null>(projects.length === 1 ? projects[0]!.id : null);
  const [items, setItems] = useState<Item[]>([]);
  const [queued, setQueued] = useState(0);
  const project = projects.find((p) => p.id === projectId);
  const cells = useMemo(() => new Set(project?.cells ?? []), [project]);

  const patch = (id: string, change: Partial<Item>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const flushQueue = useCallback(async () => {
    const pending = await queue.all().catch(() => [] as QueuedPhoto[]);
    for (const q of pending) {
      const result = await upload(q.projectId, q.blob, q.name);
      if (!result.ok && result.network) break;
      await queue.remove(q.id);
      patch(q.id, result.ok ? { status: "done", flags: result.flags } : { status: "refused", error: result.error });
    }
    setQueued((await queue.all().catch(() => [])).length);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set after awaiting the IndexedDB queue, not synchronously
    void flushQueue();
    window.addEventListener("online", flushQueue);
    return () => window.removeEventListener("online", flushQueue);
  }, [flushQueue]);

  async function onFiles(files: FileList | null) {
    if (!files || !project) return;
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID();
      setItems((list) => [{ id, name: file.name, preview: URL.createObjectURL(file), status: "checking" }, ...list]);

      const gps = (await exifr.gps(file).catch(() => null)) as { latitude: number; longitude: number } | null;
      const local = !gps ? "no_gps" : cells.has(latLngToCell(gps.latitude, gps.longitude, 10)) ? "in_zone" : "out_of_zone";
      patch(id, { local, status: "compressing" });

      const blob = await compressPhoto(file);
      patch(id, { status: "uploading" });
      const result = await upload(project.id, blob, file.name);
      if (result.ok) patch(id, { status: "done", flags: result.flags });
      else if (result.network) {
        await queue.add({ id, projectId: project.id, name: file.name, blob, queuedAt: Date.now() });
        setQueued((n) => n + 1);
        patch(id, { status: "queued" });
      } else patch(id, { status: "refused", error: result.error });
    }
  }

  return (
    <AccessGate>
      {() => (
        <div className="space-y-8">
          <fieldset>
            <legend className="font-semibold">{t("chooseProject")}</legend>
            {projects.length === 0 ? (
              <p className="mt-2 text-muted">{t("noProject")}</p>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {projects.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-surface p-4 has-[:checked]:border-tide has-[:checked]:ring-2 has-[:checked]:ring-tide/20 dark:has-[:checked]:border-roots"
                  >
                    <input type="radio" name="project" value={p.id} checked={projectId === p.id} onChange={() => setProjectId(p.id)} className="mt-1 accent-[var(--color-tide)]" />
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm text-muted">{p.place}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div>
            <label
              htmlFor={inputId}
              aria-disabled={!project}
              className={`flex min-h-32 flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed p-6 text-center ${
                project ? "cursor-pointer border-tide/40 hover:bg-roots/30 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]" : "cursor-not-allowed border-line text-muted"
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-8" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="font-semibold">{t("takePhotos")}</span>
              <span className="text-sm text-muted">{t("photoHint")}</span>
              <input
                id={inputId}
                type="file"
                accept="image/jpeg"
                capture="environment"
                multiple
                disabled={!project}
                onChange={(e) => {
                  void onFiles(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>
            {queued > 0 ? (
              <p role="status" className="mt-3 text-sm text-data">
                {t("queued", { count: queued })}
              </p>
            ) : null}
          </div>

          {items.length ? (
            <section aria-labelledby="sent-title">
              <h2 id="sent-title" className="text-lg">
                {t("sentTitle")}
              </h2>
              <ul className="mt-3 space-y-3" aria-live="polite">
                {items.map((i) => (
                  <li key={i.id} className="flex gap-4 rounded-panel border border-line bg-surface p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                    <img src={i.preview} alt="" className="size-20 shrink-0 rounded-control object-cover" />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium">{i.name}</p>
                      {i.local ? <p className={i.local === "in_zone" ? "text-ok" : "text-bad"}>{t(`local.${i.local}`)}</p> : null}
                      <p className="text-muted">{t(`status.${i.status}`)}</p>
                      {i.status === "done" ? (
                        i.flags?.length ? (
                          <p className="text-bad">{t("flagged", { flags: i.flags.map((f) => t(`flag.${f}`)).join(", ") })}</p>
                        ) : (
                          <p className="text-ok">{t("accepted")}</p>
                        )
                      ) : null}
                      {i.status === "refused" ? <p className="text-bad">{t.has(`errors.${i.error}`) ? t(`errors.${i.error}`) : t("errors.unknown")}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </AccessGate>
  );
}
