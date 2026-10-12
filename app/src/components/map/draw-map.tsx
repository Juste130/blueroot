"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { cellsToGeoJson } from "@/lib/cells";

const STYLE: StyleSpecification = {
  version: 8,
  sources: {
    s2: {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 15,
      attribution: '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH',
    },
  },
  layers: [{ id: "s2", type: "raster", source: "s2" }],
};

/**
 * Click to add the corners of the zone on the satellite image; the polygon is converted to H3 cells
 * by the form. Demo zones and GeoJSON import are offered next to it for keyboard users.
 */
export function DrawMap({ onPolygon, cells, label }: { onPolygon: (ring: [number, number][] | null) => void; cells: string[]; label: string }) {
  const t = useTranslations("register.draw");
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [points, setPoints] = useState<[number, number][]>([]);
  const [closed, setClosed] = useState(false);
  const closedRef = useRef(closed);
  closedRef.current = closed;

  useEffect(() => {
    let instance: MapLibreMap | undefined;
    let cancelled = false;
    (async () => {
      const maplibre = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      instance = new maplibre.Map({ container: container.current, style: STYLE, center: [1.85, 6.3], zoom: 11, dragRotate: false, doubleClickZoom: false });
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
      instance.on("load", () => {
        const m = instance!;
        m.addSource("draft", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addSource("cells", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "cells", type: "fill", source: "cells", paint: { "fill-color": "#3FB37F", "fill-opacity": 0.45 } });
        m.addLayer({ id: "cells-line", type: "line", source: "cells", paint: { "line-color": "#C9E4DE", "line-width": 0.8 } });
        m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#F5F9F8", "line-width": 2, "line-dasharray": [2, 1] } });
        m.addLayer({ id: "draft-points", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#0B3C5D", "circle-stroke-color": "#F5F9F8", "circle-stroke-width": 2 } });
      });
      instance.on("click", (e) => {
        if (closedRef.current) return;
        setPoints((p) => [...p, [Math.round(e.lngLat.lng * 1e6) / 1e6, Math.round(e.lngLat.lat * 1e6) / 1e6]]);
      });
      map.current = instance;
    })();
    return () => {
      cancelled = true;
      instance?.remove();
    };
  }, []);

  useEffect(() => {
    const ring = closed && points.length >= 3 ? [...points, points[0]!] : points;
    (map.current?.getSource("draft") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [
        ...(ring.length >= 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: ring } }] : []),
        ...points.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: p } })),
      ],
    });
  }, [points, closed]);

  useEffect(() => {
    (map.current?.getSource("cells") as GeoJSONSource | undefined)?.setData(cellsToGeoJson([{ slug: "draft", name: "", cells, anchored: false }]));
  }, [cells]);

  const button = "rounded-control border border-line bg-surface px-3 py-2 text-sm font-semibold hover:bg-roots/40 disabled:opacity-50";
  return (
    <div>
      <div ref={container} role="application" aria-label={label} className="h-[26rem] overflow-hidden rounded-panel bg-tide" />
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {closed ? t("closed", { count: points.length }) : t("hint", { count: points.length })}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={button} disabled={closed || points.length < 3} onClick={() => { setClosed(true); onPolygon(points); }}>
          {t("close")}
        </button>
        <button type="button" className={button} disabled={closed || points.length === 0} onClick={() => setPoints((p) => p.slice(0, -1))}>
          {t("undo")}
        </button>
        <button type="button" className={button} disabled={points.length === 0} onClick={() => { setPoints([]); setClosed(false); onPolygon(null); }}>
          {t("clear")}
        </button>
      </div>
    </div>
  );
}
