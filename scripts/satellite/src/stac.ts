/**
 * Minimal STAC client for Element84 Earth Search (public, no API key).
 * Collection: sentinel-2-c1-l2a (Copernicus Sentinel-2 Collection 1, Level-2A, Cloud-Optimized GeoTIFFs).
 */

export const STAC_API = "https://earth-search.aws.element84.com/v1";
export const COLLECTION = "sentinel-2-c1-l2a";
export const BANDS = { red: "red", nir: "nir", mask: "scl" } as const;

export interface StacAsset {
  href: string;
  "raster:bands"?: Array<{ scale?: number; offset?: number; nodata?: number }>;
}

export interface StacItem {
  id: string;
  properties: {
    datetime: string;
    "eo:cloud_cover"?: number;
    "proj:epsg"?: number;
    "proj:code"?: string;
    "s2:mgrs_tile"?: string;
  };
  assets: Record<string, StacAsset>;
}

interface SearchResponse {
  features: StacItem[];
  links?: Array<{ rel: string; href: string; method?: string; body?: unknown }>;
}

const USER_AGENT = "BlueRoot-satellite/1.0";

export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json, application/json", ...init.headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.ok) return (await res.json()) as T;
      if (res.status < 500 && res.status !== 429) throw new Error(`HTTP ${res.status} for ${url}`);
      lastError = new Error(`HTTP ${res.status} for ${url}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 1_000 * 2 ** attempt));
  }
  throw lastError;
}

/** All scenes intersecting `bbox` between `from` and `to`, below `maxCloudCover`, oldest first. */
export async function searchScenes(params: {
  bbox: [number, number, number, number];
  from: string;
  to: string;
  maxCloudCover: number;
}): Promise<StacItem[]> {
  const items: StacItem[] = [];
  let body: Record<string, unknown> = {
    collections: [COLLECTION],
    bbox: params.bbox,
    datetime: `${params.from}T00:00:00Z/${params.to}T23:59:59Z`,
    query: { "eo:cloud_cover": { lt: params.maxCloudCover } },
    sortby: [{ field: "properties.datetime", direction: "asc" }],
    limit: 100,
  };
  for (let page = 0; page < 20; page++) {
    const res = await fetchJson<SearchResponse>(`${STAC_API}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    items.push(...res.features);
    const next = res.links?.find((l) => l.rel === "next");
    if (!next?.body || res.features.length === 0) break;
    body = { ...body, ...(next.body as Record<string, unknown>) };
  }
  return dedupeByDate(items);
}

/** Several tiles or processing baselines can cover the same day: keep the least cloudy per date. */
export function dedupeByDate(items: readonly StacItem[]): StacItem[] {
  const best = new Map<string, StacItem>();
  for (const item of items) {
    const date = item.properties.datetime.slice(0, 10);
    const current = best.get(date);
    const cc = item.properties["eo:cloud_cover"] ?? 100;
    if (!current || cc < (current.properties["eo:cloud_cover"] ?? 100)) best.set(date, item);
  }
  return [...best.values()].sort((a, b) => a.properties.datetime.localeCompare(b.properties.datetime));
}

export function epsgOf(item: StacItem): number {
  const code = item.properties["proj:epsg"] ?? Number(item.properties["proj:code"]?.split(":")[1]);
  if (!Number.isInteger(code)) throw new Error(`No projection for ${item.id}`);
  return code;
}
