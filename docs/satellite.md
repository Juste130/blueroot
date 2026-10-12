# Satellite evidence (F5): NDVI pipeline

`scripts/satellite` computes a versioned NDVI series for each zone. Its sha256 is anchored on-chain as `satelliteHash` (`Verification.anchorReport`). Anyone can recompute the series from public data and check the hash.

> NDVI measures vegetation vigour, **not carbon**. BlueRoot therefore issues verified hectare-years of mangrove, never tonnes of CO2 (spec section 15).

## Data

| Item | Value |
|---|---|
| Imagery | Copernicus Sentinel-2 Collection 1, Level-2A (surface reflectance), 10 m |
| Access | Element84 Earth Search STAC API (AWS Open Data), no key, Cloud-Optimized GeoTIFFs |
| Bands | B04 red, B08 near infrared, SCL scene classification (20 m) |
| Licence | Copernicus data: free, full and open. Attribution: "Contains modified Copernicus Sentinel data" |
| Zones | Mapped mangrove polygons from OpenStreetMap (`wetland=mangrove`), ODbL, © OpenStreetMap contributors |

### Demonstration zones (southern Benin)

| Id | Location | OSM | H3 cells (res 10) | Area |
|---|---|---|---|---|
| `sodome-grand-popo` | Sodomè, Hakouè, Grand-Popo · Bouche du Roy estuary | relation/11704789 | 24 | 28.6 ha |
| `gnigbohoue-grand-popo` | Gnigbohoué, Kpêko, Grand-Popo · Bouche du Roy, west bank | relation/11795342 | 16 | 19.1 ha |
| `djegbame-ouidah` | Djègbamè, Ouidah · lagoon channel towards Lake Ahémé | relation/11663964 | 9 | 10.7 ha |

These are mapped mangrove extents used for the demo. Their use as restoration projects must be validated in the field with local communities and partners.

## Method

1. **Cells.** The polygon is converted to H3 resolution-10 cells (cell centre inside the polygon).
2. **Scenes.** STAC search over the cells' bounding box, cloud cover < 60 %, one scene per day (least cloudy tile).
3. **Pixels.** Only the window covering the zone is read (HTTP range requests). Each 10 m pixel is kept if its centre falls in one of the project cells, so the satellite evidence covers exactly the area claimed on-chain.
4. **Masking.** SCL classes kept: 4 vegetation, 5 not vegetated, 7 unclassified. Removed: no data, saturated, shadows, clouds, cirrus, snow, and **water (6)**, whose extent varies with the tide on mudflats.
5. **NDVI.** Reflectance = DN × 0.0001 − 0.1 (Collection 1 offset), NDVI = (NIR − Red) / (NIR + Red).
6. **Scene quality.** A scene is accepted if valid pixels ≥ 50 % of the pixels expected for the zone area (1 ha = 100 pixels). Measuring against the expected count stays honest when a scene only partly covers the zone (tile edges).
7. **Aggregation.** Monthly median of scene means: robust to residual clouds and haze.
8. **Baseline vs latest.** Median of the monthly values over two windows **of the same season, two years apart: March–May 2024 vs March–May 2026**. Comparing different seasons would mistake seasonal greening for restoration.

### Finding: avoid the Harmattan

A first run used the dry season (December–February) as the comparison window. The real series showed NDVI dropping to ~0.47–0.56 **every February on all three zones**, and January 2026 missing everywhere. This is the Harmattan: Saharan dust haze from December to February scatters light and depresses NDVI whatever the vegetation. The windows were moved to March–May: same season each year, outside the Harmattan, more clear scenes. The full monthly series is still published, so the Harmattan dip remains visible and auditable.

## Satellite score (demonstration assumptions)

```
level = clamp((latest − 0.2) / (0.6 − 0.2))        dense mangrove canopy ≈ NDVI 0.6+
trend = clamp(0.5 + (latest − baseline) / 0.2)     no change → 0.5, +0.1 → 1, −0.1 → 0
satelliteScore = round(100 × (0.6 × level + 0.4 × trend))
```

Weights and thresholds are stored in every output file (`parameters.scoring`) and must be calibrated with experts. The satellite score is one of three inputs of the combined score (spec section 6: satellite 40 %, field evidence 40 %, AI consistency 20 %).

## Output and integrity

`data/<zone>/ndvi-v1.json` follows the strict schema `blueroot.ndvi/1` (`src/schema.ts`): zone and cells, source, all parameters, every accepted observation with its scene id, monthly series, summary and scores.

The file is written in canonical form (keys sorted, 2-space indent, final newline), so the anchored hash is simply the sha256 of the file bytes:

```bash
sha256sum scripts/satellite/data/sodome-grand-popo/ndvi-v1.json
npm run satellite verify -- data/sodome-grand-popo/ndvi-v1.json   # schema + canonical form + hash
```

## Finding: real H3 cell area on the Benin coast

H3 resolution-10 cells are 1.5 ha **on global average** only. On the Benin coast they measure **1.190 to 1.204 ha** (h3-js `cellArea`). The contract parameter `cellAreaCentiHa` was therefore set to **119** (rounded down so it never over-issues); with 150, issuance would have been about 26 % too high. A test in `scripts/satellite` keeps the two consistent.

## Commands

```bash
npm install                       # at the repository root
npm run satellite test            # unit tests (no network)
npm run satellite compute -- --zone all
npm run satellite compute -- --zone djegbame-ouidah --from 2026-03-01 --to 2026-05-31 \
  --baseline 2026-03:2026-03 --latest 2026-05:2026-05   # quick live recompute (demo, ~1 min)
```

## Limits

- Mixed pixels at mangrove edges; 10 m resolution cannot see individual young seedlings.
- Rainy-season clouds (May–October) and Harmattan haze (December–February) leave gaps or bias; the monthly median and the March–May windows limit their effect.
- NDVI saturates over dense canopy and cannot distinguish mangrove from other vegetation (for example coconut palms): this is why OSM/GMW mangrove extents, field photos and human validators are also required.
