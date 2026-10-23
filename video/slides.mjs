// Renders every slide (and a placeholder card for each capture scene) to build/slides/<id>.png.
// REPO_URL and DEMO_URL fill the closing slide.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { H, ROOT, W, dir, launch } from "./lib.mjs";
import { scenes } from "./scenes.mjs";

const out = dir("slides");
const repo = process.env.REPO_URL ?? "github.com/Juste130/blueroot";
const demo = process.env.DEMO_URL ?? "blueroot0.netlify.app";

const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(ROOT, "slides.html")).href, { waitUntil: "networkidle" });
  await page.evaluate(([r, d]) => {
    document.querySelector("[data-repo]").textContent = r;
    document.querySelector("[data-demo]").textContent = d;
  }, [repo, demo]);
  await page.evaluate(() => document.fonts.ready);

  for (const scene of scenes) {
    let id = scene.id;
    if (scene.kind === "capture") {
      await page.evaluate((t) => (document.querySelector("#pending [data-title]").textContent = t), scene.title);
      id = "pending";
    }
    const el = page.locator(`#${id}`);
    if (!(await el.count())) throw new Error(`slides.html has no section #${id}`);
    await el.screenshot({ path: join(out, `${scene.id}.png`) });
    console.log(`slide ${scene.id}${scene.kind === "capture" ? " (placeholder)" : ""}`);
  }
} finally {
  await browser.close();
}
