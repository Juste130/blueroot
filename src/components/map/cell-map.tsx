"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { type CellZone, boundsOf, cellsToGeoJson, zoneMarkers } from "@/lib/cells";
import { loadMaplibre } from "@/lib/maplibre";

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
  insetLeft,
}: {
  zones: CellZone[];
  label: string;
  className?: string;
  linkToProjects?: boolean;
  initialBasemap?: Basemap;
  /** Left padding (px) when fitting the zones on wide screens, to clear an overlaid panel. */
  insetLeft?: number;
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
  const markers = useMemo(() => zoneMarkers(zones), [zones]);
  const dataRef = useRef(data);
  dataRef.current = data;
  const markersRef = useRef(markers);
  markersRef.current = markers;

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | undefined;
    (async () => {
      const maplibre = await loadMaplibre();
      if (cancelled || !container.current) return;
      try {
        instance = new maplibre.Map({
          container: container.current,
          style: basemap === "satellite" ? SATELLITE_STYLE : PLAN_STYLE,
          bounds: bounds ?? [[1.6, 6.2], [2.2, 6.45]],
          // On wide screens the hero text panel covers the left side: keep the zones to its right.
          fitBoundsOptions: { padding: insetLeft && container.current.clientWidth >= 1024 ? { top: 64, bottom: 64, right: 64, left: insetLeft } : 48, maxZoom: 15 },
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
        m.addSource("zones", { type: "geojson", data: markersRef.current });
        // Zoomed out: one marker per zone. Zoomed in: the cells themselves.
        m.addLayer({
          id: "zones-marker",
          type: "circle",
          source: "zones",
          maxzoom: 13.5,
          paint: {
            "circle-radius": 9,
            "circle-color": COLORS.mangrove,
            "circle-stroke-width": 3,
            "circle-stroke-color": ["case", ["==", ["get", "anchored"], true], COLORS.gold, COLORS.roots],
          },
        });
        m.addLayer({
          id: "cells-fill",
          type: "fill",
          source: "cells",
          minzoom: 12.5,
          paint: { "fill-color": COLORS.mangrove, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.6, 0.38] },
        });
        m.addLayer({
          id: "cells-line",
          type: "line",
          source: "cells",
          minzoom: 12.5,
          filter: ["==", ["get", "anchored"], true],
          paint: { "line-color": COLORS.gold, "line-width": 1.4 },
        });
        m.addLayer({
          id: "cells-line-candidate",
          type: "line",
          source: "cells",
          minzoom: 12.5,
          filter: ["==", ["get", "anchored"], false],
          paint: { "line-color": basemap === "satellite" ? COLORS.roots : COLORS.tide, "line-width": 1, "line-dasharray": [2, 1.5] },
        });
        setState("ready");
      });
      if (linkToProjects) {
        for (const layer of ["cells-fill", "zones-marker"]) {
          instance.on("mouseenter", layer, () => (instance!.getCanvas().style.cursor = "pointer"));
          instance.on("mouseleave", layer, () => (instance!.getCanvas().style.cursor = ""));
          instance.on("click", layer, (e) => {
            const slug = e.features?.[0]?.properties?.slug as string | undefined;
            if (slug) router.push(`/projects/${slug}`);
          });
        }
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
    (map.current?.getSource("zones") as GeoJSONSource | undefined)?.setData(markers);
  }, [data, markers]);

  return (
    <div className={`relative overflow-hidden bg-tide ${className ?? ""}`}>
      {/* Sized with h-full, not absolute inset-0: MapLibre's stylesheet forces position: relative on the map container. */}
      <div ref={container} role="region" aria-label={label} className="h-full w-full" />
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
