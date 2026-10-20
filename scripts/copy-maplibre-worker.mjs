// MapLibre 6 loads its web worker from a file next to its own bundle, which Next.js does not copy.
// The worker is served from public/ instead and registered with maplibre.setWorkerUrl (src/lib/maplibre.ts).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const source = require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs");
mkdirSync(new URL("../public/vendor/", import.meta.url), { recursive: true });
copyFileSync(source, new URL("../public/vendor/maplibre-gl-worker.mjs", import.meta.url));
