#!/usr/bin/env node
// Lane m10-loadscreen-pretext: Boot-Frames Desktop aufnehmen (Vorher/Nachher-Beleg).
//
//   node scripts/m10-loadscreen-pretext.mjs --tag before \
//     --out-dir /home/ai/games/.evidence/m10-loadscreen-pretext/desktop-before
//
// Nimmt ab Navigation alle --interval-ms einen Screenshot, bis die Titel-Szene
// aktiv ist (oder --max-ms). Frames + Timeline-JSON landen im Out-Dir (Belege
// nach ~/games/.evidence/, nicht ins Repo). Kein flock: kurze Boot-Aufnahme,
// kein FPS-/Echtzeit-Langlauf.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const outDir = opt("out-dir", "/home/ai/games/.evidence/m10-loadscreen-pretext/desktop");
const tag = opt("tag", "before");
const interval = Number(opt("interval-ms", "120"));
const maxMs = Number(opt("max-ms", "6000"));
const viewport = (opt("viewport", "960x540")).split("x").map(Number);
// --stall-sfx: WAV-Laderequests auf ewig pending halten -> Boot-preload (und
// damit der Vor-Text) bleibt sichtbar; fuer den Vorher/Nachher-Frame-Beleg,
// weil die Phase auf Desktop < 40 ms ist (Geraet: ~1,6 s).
const stallSfx = argv.includes("--stall-sfx");

ensureBuild();
mkdirSync(outDir, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const timeline = [];
const jsErrors = [];
try {
  const context = await browser.newContext({ viewport: { width: viewport[0], height: viewport[1] } });
  const page = await context.newPage();
  page.on("pageerror", (err) => jsErrors.push(String(err)));
  page.on("console", (msg) => { if (msg.type() === "error") jsErrors.push(msg.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: "commit" });
  if (stallSfx) {
    await page.route("**/*.wav", () => new Promise(() => { /* pending forever */ }));
  }
  const t0 = Date.now();
  let idx = 0;
  while (Date.now() - t0 < maxMs) {
    const file = join(outDir, `${tag}-${String(idx).padStart(2, "0")}.png`);
    await page.screenshot({ path: file });
    const state = await page.evaluate(() => ({
      scene: window.__lf ? window.__lf.state().scene : null,
      ms: Math.round(performance.now()),
      textures: window.__game ? window.__game.textures.getTextureKeys().length : -1,
    })).catch(() => ({ scene: null, ms: -1, textures: -1 }));
    timeline.push({ idx, file, ...state });
    if (state.scene === "title") break;
    idx++;
    await new Promise((r) => setTimeout(r, interval));
  }
  await context.close();
} finally {
  await browser.close();
  server.stop();
}

const json = {
  tag, date: new Date().toISOString(), viewport, interval,
  frames: timeline.length, timeline, jsErrors,
};
const jsonPath = join(outDir, `${tag}-timeline.json`);
writeFileSync(jsonPath, JSON.stringify(json, null, 2) + "\n");
console.log(`[m10-loadscreen-pretext] ${tag}: ${timeline.length} Frames, JS-Fehler: ${jsErrors.length} -> ${jsonPath}`);
if (jsErrors.length > 0) process.exitCode = 1;
