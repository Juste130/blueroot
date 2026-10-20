"use client";

/** Loads MapLibre once and points it at the worker served from public/vendor (see scripts/copy-maplibre-worker.mjs). */
export async function loadMaplibre() {
  const maplibre = await import("maplibre-gl");
  maplibre.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
  return maplibre;
}
