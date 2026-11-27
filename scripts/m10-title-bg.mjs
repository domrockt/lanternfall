#!/usr/bin/env node
// m10-title-bg-crisp: Misst die Skalierung von title_background (480x270) in der
// Title-Szene bei 640x360 (dpr 1) und 780x360 (dpr 3).
//   Vorher-Erwartung: setDisplaySize(W,H) -> scaleX = W/480 fraktional
//   (1.333... @640, 1.625 @780) => Sub-Pixel-Kanten / ungleichmaessige Texel.
//   Nachher-Erwartung: ganzzahliger Scale + Fuellung schliesst die View.
// Kein FPS-Messlauf: laeuft OHNE flock. Aufruf: node scripts/m10-title-bg.mjs before|after
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const phase = process.argv[2] ?? "before";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

const results = [];
for (const vp of [
  { name: "640", width: 640, height: 360, dpr: 1 },
  { name: "780", width: 780, height: 360, dpr: 3 },
]) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await waitForScene(page, "title");

  const state = await page.evaluate(() => {
    const scene = window.__game.scene.getScene("title");
    const bg = scene.children.list.find(
      (c) => c.texture && c.texture.key === "title_background",
    );
    if (!bg) return { found: false };
    const canvas = document.querySelector("canvas");
    return {
      found: true,
      texW: bg.texture.source[0].width,
      texH: bg.texture.source[0].height,
      scaleX: bg.scaleX,
      scaleY: bg.scaleY,
      displayW: bg.displayWidth,
      displayH: bg.displayHeight,
      x: bg.x, y: bg.y,
      gameW: scene.game.config.width,
      gameH: scene.game.config.height,
      bufW: canvas.width, bufH: canvas.height,
      rbScale: window.__rbDbg?.scale ?? null,
    };
  });

  await page.screenshot({ path: `shots/m10-title-bg-${phase}-${vp.name}.png` });
  results.push({ viewport: vp, state, jsErrors: errors });
  await page.close();
}
await browser.close();
server.stop();

// Zoom-Crops (4x nearest) einer Detailkante je Viewport zur Sichtpruefung.
mkdirSync("/home/ai/tmp/m10-title-bg-crisp", { recursive: true });
for (const vp of results) {
  const w = vp.state.bufW, h = vp.state.bufH;
  const cropW = Math.round(w * 0.3), cropH = Math.round(h * 0.3);
  const ox = Math.round(w * 0.62), oy = Math.round(h * 0.1); // Mond/Ecke rechts oben
  execFileSync("convert", [
    `shots/m10-title-bg-${phase}-${vp.viewport.name}.png`,
    "-crop", `${cropW}x${cropH}+${ox}+${oy}`,
    "-filter", "point", "-resize", "400%",
    `shots/m10-title-bg-${phase}-${vp.viewport.name}-zoom.png`,
  ], { stdio: "ignore" });
}

// Auswertung: fraktionaler Scale => Texel landen auf Sub-Pixel-Positionen.
for (const r of results) {
  const s = r.state;
  if (!s.found) { r.verdict = "FAIL: bg nicht gefunden"; continue; }
  s.texelScaleX = s.displayW / s.texW;
  s.texelScaleY = s.displayH / s.texH;
  s.fractal = !Number.isInteger(s.texelScaleX) || !Number.isInteger(s.texelScaleY);
  r.verdict = s.fractal
    ? `FAIL: fraktional (${s.texelScaleX.toFixed(4)}x${s.texelScaleY.toFixed(4)})`
    : "PASS: ganzzahlig";
}

const out = { phase, results };
writeFileSync(`shots/m10-title-bg-${phase}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
process.exit(results.every((r) => r.verdict.startsWith("PASS")) ? 0 : 1);
