#!/usr/bin/env node
/**
 * M10-android-scale-floor-r2 (K1): Repro fuer "Text zerfaellt auf Android".
 *
 * Galaxy-Tab-S4-Emulation (Playwright devices["Galaxy Tab S4 landscape"]):
 * Run starten, Level-Up per giveXp oeffnen, Screenshot bei
 *   - ?rbscale=2  -> Renderpuffer halbiert (Repro des Dom-Fotos: Text als
 *                    Strichreste, ganzes Bild grob)
 *   - ?rbscale=1  -> voller Renderpuffer (Referenz: Text sauber)
 *
 * Vorher-Beleg: ~/games/.evidence/m10-android-scale-floor-r2/
 *   m10-android-scale-before.json + android-tabS4-levelup-{rb1,rb2}-before.png
 * Nachher-Beleg (nach K2/K3, `--tag=after`): rbscale=2 wird auf 1 geklemmt —
 *   Text bleibt lesbar, Canvas bleibt 640x360, quality-Tier im State.
 *
 *   node scripts/m10-android-scale.mjs [--tag=before|after] [--no-build]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const TAG = (process.argv.find((a) => a.startsWith("--tag=")) ?? "--tag=before")
  .split("=")[1] || "before";
const EVIDENCE_DIR = `${homedir()}/games/.evidence/m10-android-scale-floor-r2`;
const STABLE_MS = 2000;

/** Laedt den Run bis Level-Up-Panel offen. */
async function openLevelUp(page, rbscale) {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&rbscale=${rbscale}`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 15000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.evaluate(() => window.__lf.god(true));
  await new Promise((r) => setTimeout(r, STABLE_MS));
  await page.evaluate(() => window.__lf.giveXp(40));
  await page.waitForFunction(
    () => Boolean(window.__lf?.stats().levelUpOpen),
    null,
    { timeout: 8000 },
  );
  await new Promise((r) => setTimeout(r, 300));
}

const doBuild = !process.argv.includes("--no-build");
if (doBuild) ensureBuild();
else mkdirSync("shots", { recursive: true });
mkdirSync(EVIDENCE_DIR, { recursive: true });

const pw = await loadPlaywright();
const { chromium } = pw; // devices-Registry: pw.devices
const server = await startServer();
const browser = await chromium.launch();
const out = { tag: TAG, runs: {} };

for (const [name, rbscale] of [["rb1", 1], ["rb2", 2]]) {
  const ctx = await browser.newContext(pw.devices["Galaxy Tab S4 landscape"]);
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await openLevelUp(page, rbscale);
  await page.screenshot({
    path: `${EVIDENCE_DIR}/android-tabS4-levelup-${name}-${TAG}.png`,
  });
  out.runs[name] = await page.evaluate(() => {
    const r = window.__lf.rendererInfo();
    const dbg = window.__rbDbg ?? {};
    return {
      renderer: r.renderer,
      ctx: r.context,
      maxTex: r.maxTextureSize,
      dpr: devicePixelRatio,
      canvas: { w: r.canvas.width, h: r.canvas.height },
      rbDbg: { scale: dbg.scale ?? null, size: dbg.size ?? null },
      quality: window.__lf.state().quality ?? null,
      levelUpOpen: Boolean(window.__lf.stats().levelUpOpen),
      ua: navigator.userAgent.slice(0, 80),
    };
  });
  out.runs[name].errs = errs;
  await ctx.close();
}

await browser.close();
server.stop();
const json = `${EVIDENCE_DIR}/m10-android-scale-${TAG}.json`;
writeFileSync(json, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
console.log(`\nBeleg: ${json}`);
