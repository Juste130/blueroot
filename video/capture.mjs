// Films each capture scene from the running app -> build/captures/<id>.webm (+ meta.json trim offsets).
// APP_URL (default http://localhost:3000) is the app to film; scenes marked `live` are filmed on LIVE_URL
// (the public Amoy deployment) instead. CERT_TX a retirement tx hash for scene s11. ONLY=s04,s05 films a subset.
// Run after voice.mjs: each shot lasts as long as its narration. Scenes with a clip in clips/ are skipped.
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BUILD, H, ROOT, W, dir, findFile, launch, readJson } from "./lib.mjs";
import { scenes } from "./scenes.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const liveUrl = (process.env.LIVE_URL ?? "https://blueroot0.netlify.app").replace(/\/$/, "");
const only = process.env.ONLY?.split(",").map((s) => s.trim());
const selected = scenes.filter((s) => s.kind === "capture" && (!only || only.includes(s.id)));
const out = dir("captures");
const raw = dir("tmp", "video");
const timeline = readJson(join(BUILD, "timeline.json"), null);
if (!timeline) throw new Error("Run `npm run voice` first: shots are timed on the narration.");

for (const base of new Set(selected.map((s) => (s.live ? liveUrl : appUrl)))) {
  try {
    await fetch(base, { signal: AbortSignal.timeout(20_000) });
  } catch {
    console.error(`The app is not reachable at ${base}. Start it (npm run dev at the repo root) or set APP_URL / LIVE_URL.`);
    process.exit(1);
  }
}

const sleep = (s) => new Promise((r) => setTimeout(r, Math.max(0, s) * 1000));
const meta = readJson(join(out, "meta.json"), {});
const browser = await launch();
try {
  for (const scene of selected) {
    const base = scene.live ? liveUrl : appUrl;
    if (findFile(join(ROOT, "clips", scene.id), ["mp4", "mov", "webm", "mkv"])) {
      console.log(`capture ${scene.id} skipped (clips/${scene.id} provided)`);
      continue;
    }
    const seconds = timeline.find((t) => t.id === scene.id).seconds;
    const context = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      colorScheme: "light",
      locale: "en-US",
      recordVideo: { dir: raw, size: { width: W, height: H } },
    });
    const started = Date.now();
    let ready;
    const page = await context.newPage();
    // Everything before the first visible action (loading, redirects) is trimmed at render time.
    const markReady = () => (ready ??= (Date.now() - started) / 1000);
    const animateScroll = (target, s) =>
      page.evaluate(
        ([y, ms]) =>
          new Promise((done) => {
            const from = scrollY, to = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight)), t0 = performance.now();
            const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
            const step = (now) => {
              const t = Math.min(1, (now - t0) / ms);
              scrollTo(0, from + (to - from) * ease(t));
              t < 1 ? requestAnimationFrame(step) : done();
            };
            requestAnimationFrame(step);
          }),
        [target, s * 1000],
      );

    const act = {
      async goto(path) {
        await page.goto(base + path, { waitUntil: "load", timeout: 60_000 });
        await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
        await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 8_000 }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await sleep(4); // satellite tiles finish loading after network idle
      },
      async hold(s) {
        markReady();
        await sleep(s);
      },
      async scrollTo(fraction, s) {
        markReady();
        const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        await animateScroll(max * fraction, s);
      },
      async scrollToText(text, s) {
        markReady();
        const el = page.getByText(text, { exact: false }).first();
        const box = (await el.count()) ? await el.evaluate((n) => n.getBoundingClientRect().top + scrollY - 140) : null;
        if (box === null) return sleep(s);
        await animateScroll(box, s);
      },
      async hover(selector, s) {
        markReady();
        const items = page.locator(selector);
        const n = Math.min(await items.count(), 3);
        if (!n) return sleep(s);
        for (let i = 0; i < n; i++) {
          const b = await items.nth(i).boundingBox();
          if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
          await sleep(s / n - 0.4);
        }
      },
      async href(pattern) {
        const links = await page.$$eval("a[href]", (as) => as.map((a) => new URL(a.href).pathname));
        return links.find((l) => pattern.test(l));
      },
    };

    await scene.capture(act, seconds);
    markReady();
    await sleep(0.5);
    const video = page.video();
    const url = page.url();
    await context.close();
    renameSync(await video.path(), join(out, `${scene.id}.webm`));
    meta[scene.id] = { trim: +ready.toFixed(3), seconds, url };
    console.log(`capture ${scene.id} ${seconds.toFixed(1)}s from ${url}`);
  }
} finally {
  await browser.close();
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2));
}
