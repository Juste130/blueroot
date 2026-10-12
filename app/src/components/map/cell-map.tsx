"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { type CellZone, boundsOf, cellsToGeoJson } from "@/lib/cells";

type Basemap = "satellite" | "plan";

/** Sentinel-2 cloudless mosaic by EOX: the same satellite family as the NDVI evidence. */
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    s2: {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 15,
      attribution:
        '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024)',
    },
  },
  layers: [{ id: "s2", type: "raster", source: "s2" }],
};
const PLAN_STYLE = "https://tiles.openfreemap.org/styles/positron";

const COLORS = { mangrove: "#3FB37F", gold: "#F2C14E", roots: "#C9E4DE", tide: "#0B3C5D" };

/**
 * Interactive map of H3 cells. Loaded only in the browser, after the page content; the same
 * information is always available as text next to it (list of zones or cells).
 */
export function CellMap({
  zones,
  label,
  className,
  linkToProjects = false,
  initialBasemap = "satellite",
}: {
  zones: CellZone[];
  label: string;
  className?: string;
  linkToProjects?: boolean;
  initialBasemap?: Basemap;
}) {
  const t = useTranslations("map");
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [basemap, setBasemap] = useState<Basemap>(initialBasemap);
  const group = useId();
  const [state, setState] = useState<"loading" | "ready" | "unsupported">("loading");
  const data = useMemo(() => cellsToGeoJson(zones), [zones]);
  const bounds = useMemo(() => boundsOf(zones.flatMap((z) => z.cells)), [zones]);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      try {
        instance = new maplibre.Map({
          container: container.current,
          style: basemap === "satellite" ? SATELLITE_STYLE : PLAN_STYLE,
          bounds: bounds ?? [[1.6, 6.2], [2.2, 6.45]],
          fitBoundsOptions: { padding: 48, maxZoom: 15 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setState("unsupported"); // no WebGL: the static footprint and the text list remain
        return;
      }
      instance.touchZoomRotate.disableRotation();
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      instance.on("style.load", () => {
        const m = instance!;
        if (m.getSource("cells")) return;
        m.addSource("cells", { type: "geojson", data: dataRef.current });
        m.addLayer({
          id: "cells-fill",
          type: "fill",
          source: "cells",
          paint: { "fill-color": COLORS.mangrove, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.6, 0.38] },
        });
        m.addLayer({
          id: "cells-line",
          type: "line",
          source: "cells",
          filter: ["==", ["get", "anchored"], true],
          paint: { "line-color": COLORS.gold, "line-width": 1.4 },
        });
        m.addLayer({
          id: "cells-line-candidate",
          type: "line",
          source: "cells",
          filter: ["==", ["get", "anchored"], false],
          paint: { "line-color": basemap === "satellite" ? COLORS.roots : COLORS.tide, "line-width": 1, "line-dasharray": [2, 1.5] },
        });
        setState("ready");
      });
      if (linkToProjects) {
        instance.on("mouseenter", "cells-fill", () => (instance!.getCanvas().style.cursor = "pointer"));
        instance.on("mouseleave", "cells-fill", () => (instance!.getCanvas().style.cursor = ""));
        instance.on("click", "cells-fill", (e) => {
          const slug = e.features?.[0]?.properties?.slug as string | undefined;
          if (slug) router.push(`/projects/${slug}`);
        });
      }
      map.current = instance;
    })();
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
    // The map is rebuilt when the basemap changes; data updates go through setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  useEffect(() => {
    (map.current?.getSource("cells") as GeoJSONSource | undefined)?.setData(data);
  }, [data]);

  return (
    <div className={`relative overflow-hidden bg-tide ${className ?? ""}`}>
      <div ref={container} role="region" aria-label={label} className="absolute inset-0" />
      {state === "unsupported" ? (
        <p className="absolute inset-x-4 bottom-4 rounded-control bg-surface/95 p-3 text-sm">{t("unsupported")}</p>
      ) : null}
      <fieldset className="absolute left-3 top-3 flex rounded-control bg-surface/95 p-0.5 text-xs font-semibold shadow-sm">
        <legend className="sr-only">{t("basemap")}</legend>
        {(["satellite", "plan"] as const).map((b) => (
          <label
            key={b}
            className={`cursor-pointer rounded-[6px] px-2.5 py-1.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)] ${
              basemap === b ? "bg-tide text-paper dark:bg-roots dark:text-tide" : "text-muted hover:text-ink"
            }`}
          >
            <input type="radio" name={group} value={b} checked={basemap === b} onChange={() => setBasemap(b)} className="sr-only" />
            {t(b)}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
