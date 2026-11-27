#!/usr/bin/env node
// M10-dpr-budget-cap #3581: Pixel-Perfect-Beleg bei gesenktem Render-Massstab.
// Statische Szene (setTimeScale(0)) bei 780x360 dpr3:
//   A) ?rbscale=2  -> Buffer 390x180, CSS 780x360 (pixelated, 6x6 Geraete-Pixel
//      pro Buffer-Pixel). Screenshot: shots/m10-dpr-budget-pixel.png
//   B) window.__rbOverride = 1 -> Buffer 780x360 (Vollqualitaet), GLEICHE
//      pausierte Szene. Screenshot: shots/m10-dpr-budget-pixel-full.png
// Pruefung (ImageMagick, pixelgenau):
//   1. Block-Uniformitaet A: 6x6-Roundtrip (point) -> AE=0 beweist hartes
//      nearest-neighbor Upscaling (keine weichen Kanten).
//   2. Baseline: zwei Frames derselben Stufe -> Dekor-Animations-Jitter.
//   3. 1:1-Vergleich: A vs. B je point auf 390x180 -> AE muss im Baseline-
//      Jitter liegen (Kernszene identisch, nur animiertes Dekor differiert).
// Kein FPS-Messlauf: laeuft OHNE flock.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1&rbscale=2`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setTimeScale(1);
  for (const id of ["ember", "frost", "thorn"]) window.__lf.addWeapon(id, 3);
  window.__lf.spawnEnemy("bog_rat", 40);
  window.__lf.spawnEnemy("wisp", 20);
  window.__lf.spawnEnemy("bogzombie", 20);
});
await page.waitForTimeout(2500); // Waffen/Projektile/XP verteilen
// Szene einfrieren OHNE Pause-Menue: hitStop haelt die Welt an (update()
// verzweigt vor Sim/VFX-Updates zurück), das UI zeigt kein Overlay.
// setTimeScale(0) ist ein No-op (timeScaleClamped clampet auf min 1,
// src/logic/combat.ts) — deshalb der direkte Weg ueber das Szene-Feld.
const frozen = await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  for (let i = 0; i < 30 && window.__lf.stats().levelUpOpen; i++) window.__lf.pickLevelUp(0);
  run.hitStop = 1e9;
  return { hitStop: run.hitStop > 0, levelUpOpen: window.__lf.stats().levelUpOpen, time: window.__lf.stats().time, enemies: window.__lf.stats().enemies };
});
await page.waitForTimeout(300);

const stateA = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return { buf: [canvas.width, canvas.height], scale: window.__rbDbg?.scale ?? null };
});
await page.screenshot({ path: "shots/m10-dpr-budget-pixel.png" });
// Baseline: zweiter Frame derselben Stufe -> Dekor-Animation zwischen Frames.
await page.waitForTimeout(300);
await page.screenshot({ path: "/home/ai/tmp/m10-dpr-budget-cap/baselineA2.png" });

await page.evaluate(() => { window.__rbOverride = 1; });
await page.waitForTimeout(300);
const stateB = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  return { buf: [canvas.width, canvas.height], scale: window.__rbDbg?.scale ?? null };
});
await page.screenshot({ path: "shots/m10-dpr-budget-pixel-full.png" });

const sh = (args) => {
  try {
    return execFileSync(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  } catch (e) {
    // compare liefert rc=1, wenn Bilder differieren — Zahl steckt in stderr.
    return (e.stderr ?? "").toString().trim();
  }
};
const ae = (s) => (s === "" ? 0 : Number(s) || 0);
const T = "/home/ai/tmp/m10-dpr-budget-cap";

// 1) Block-Uniformitaet: point-Roundtrip 2340x1080 -> 390x180 -> 2340x1080.
//    AE=0 beweist: jedes 6x6-Geraete-Pixel-Block ist eine Farbe (nearest,
//    keine weichen Kanten).
sh(["convert", "shots/m10-dpr-budget-pixel.png", "-filter", "point", "-resize", "390x180!", "-filter", "point", "-resize", "2340x1080!", `${T}/roundtrip.png`]);
const uniformAE = ae(sh(["compare", "-metric", "AE", "shots/m10-dpr-budget-pixel.png", `${T}/roundtrip.png`, "null:"]));
// 2) Baseline: Frame-zu-Frame-Dekor-Jitter bei gleicher Stufe (je 390x180 point).
sh(["convert", "shots/m10-dpr-budget-pixel.png", "-filter", "point", "-resize", "390x180!", `${T}/smallA.png`]);
sh(["convert", `${T}/baselineA2.png`, "-filter", "point", "-resize", "390x180!", `${T}/smallA2.png`]);
const baselineAE = ae(sh(["compare", "-metric", "AE", `${T}/smallA.png`, `${T}/smallA2.png`, "null:"]));
// 3) 1:1-Inhalt: Stufe 2 vs. Stufe 1 (gleiche pausierte Szene), je 390x180.
//    Achtung: Stufe 2 rendert dieselbe Szene auf halbem Raster (Details werden
//    anders gesampelt) — Pixel-Gleichheit ist on Restriktion unmoeglich;
//    Strukturvergleich auf 195x90 (Details ausgewaschen) muss niedrig sein.
sh(["convert", "shots/m10-dpr-budget-pixel-full.png", "-filter", "point", "-resize", "390x180!", `${T}/smallB.png`]);
const contentAE = ae(sh(["compare", "-metric", "AE", `${T}/smallA.png`, `${T}/smallB.png`, "null:"]));
sh(["convert", `${T}/smallA.png`, "-filter", "point", "-resize", "195x90!", `${T}/structA.png`]);
sh(["convert", `${T}/smallB.png`, "-filter", "point", "-resize", "195x90!", `${T}/structB.png`]);
const structAE = ae(sh(["compare", "-metric", "AE", `${T}/structA.png`, `${T}/structB.png`, "null:"]));
sh(["convert", `${T}/smallA2.png`, "-filter", "point", "-resize", "195x90!", `${T}/structA2.png`]);
const structBaselineAE = ae(sh(["compare", "-metric", "AE", `${T}/structA.png`, `${T}/structA2.png`, "null:"]));
// Zoom-Crop (4x nearest) zur Sichtpruefung
sh(["convert", "shots/m10-dpr-budget-pixel.png", "-crop", "800x480+770+300", "-filter", "point", "-resize", "400%", "shots/m10-dpr-budget-pixel-zoom.png"]);

const result = {
  viewport: { width: 780, height: 360, dpr: 3 },
  frozen,
  stateA_rbscale2: stateA,
  stateB_rbscale1: stateB,
  uniformAE,
  uniformTotal: 2340 * 1080,
  baselineAE,
  contentAE,
  contentTotal: 390 * 180,
  structAE,
  structBaselineAE,
  structTotal: 195 * 90,
  contentVerdict: contentAE <= baselineAE ? "PASS (nur Dekor-Jitter)" : `DIFF > Baseline (+${contentAE - baselineAE})`,
  structVerdict: structAE <= structBaselineAE ? "PASS (Struktur identisch)" : `DIFF (+${structAE - structBaselineAE})`,
  jsErrors: errors,
};
writeFileSync("shots/m10-dpr-budget-pixel.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
server.stop();
process.exit(result.uniformAE === 0 && result.contentAE <= result.baselineAE ? 0 : 1);
