#!/usr/bin/env node
// Lane m10-hazard-disc-raster: Standbilder late-game mit Boss-Hazard-Disc + Standard-Hazard-Disc.
// Ein Skript fuer Vorher- und Nachher-Beleg (Argumente), keine FPS-Messung -> ohne flock.
//
//   node scripts/m10-hazard-raster.mjs --tag=before --viewport=960x540 \
//     --png-out=.../before-960.png --json-out=.../before.json
//
// Ablauf: debug-Run, skipTo(1750) (~29:10, late-game), Spieler-Teleport, dann je ein
// Warn-Disc ueber den echten Draw-Pfad (run.hazards.spawnCircle):
//   - "Boss-Disc":  stomp-Parameter  (radius 92, warn 1.05, color 25)
//   - "Standard":   poison-Parameter (radius 26, warn 0.8,  color 18)
// Danach timeScale 0.02, damit die Warnphase fuer das Standbild einfriert.
// Zusatz-JSON: WebGL-Renderer-String (Pflicht, AGENTS.md "Analyse-Schleifen und Drift").
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};

const TAG = String(argOf("tag", "before"));
const VIEWPORT = String(argOf("viewport", "960x540"));
const PNG_OUT = String(argOf("png-out", `shots/m10-hazard-raster-${TAG}.png`));
const JSON_OUT = String(argOf("json-out", `shots/m10-hazard-raster-${TAG}.json`));
const [vw, vh] = VIEWPORT.split("x").map(Number);

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

await page.evaluate(async () => {
  window.__lf.god(true);
  window.__lf.autoPlay(false);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.setSuppressFx(false);
  window.__lf.skipTo(1750);
  window.__lf.setTimeScale(1);
  await new Promise((r) => setTimeout(r, 250));
  window.__lf.teleport(2048, 2048);
});

// Warn-Discs ueber den echten Spiel-Pfad spawnen (Boss- + Standard-Klasse),
// dann Spielzeit fast einfrieren, damit die Warnphase im Standbild haelt.
const spawned = await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const px = run.posX, py = run.posY;
  const boss = run.hazards.spawnCircle(px + 70, py + 34, {
    kind: "circle", warn: 1.05, radius: 92, linger: 0.12, damage: 10, color: 25, hit: true,
  });
  const std = run.hazards.spawnCircle(px - 70, py + 84, {
    kind: "circle", warn: 0.8, radius: 26, tick: 0.6, damage: 10, color: 18, hit: true,
  });
  window.__lf.setTimeScale(0.02);
  return { boss: boss.kind, std: std.kind, px, py };
});
await new Promise((r) => setTimeout(r, 500));

mkdirSync(dirname(PNG_OUT), { recursive: true });
await page.screenshot({ path: PNG_OUT });

// WebGL-Renderer-String ueber frisches Offscreen-GL (gleiche GPU wie das Spiel-Canvas).
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "no-webgl";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

const json = {
  lane: "m10-hazard-disc-raster",
  tag: TAG,
  viewport: `${vw}x${vh}`,
  renderer,
  webglRendererRequired: true,
  hazards: { bossDisc: "stomp r=92 color=25", standardDisc: "poison r=26 color=18" },
  skipToSeconds: 1750,
  shot: PNG_OUT,
  jsErrors: errors,
};
mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(JSON_OUT, `${JSON.stringify(json, null, 2)}\n`);

await browser.close();
server.stop();
console.log(`[${TAG}] ${vw}x${vh} -> ${PNG_OUT} | renderer: ${renderer} | jsErrors: ${errors.length}`);
if (errors.length) process.exitCode = 1;
