#!/usr/bin/env node
/**
 * Lane m10-boot-glow-local (K1 Befund/Repro + K4 After-Belege, Versuch 2).
 *
 * Probe: Nach Run-Start wird der Quell-Canvas beider Texturen ausgelesen und
 * mit zwei Referenz-Renderings verglichen:
 *   stepped = harte Alpha-Stufen (LIGHT_EDGE_STEPS-Band-Loop / vignetteSteps,
 *             Port von eaf2ab6 in die Boot-Local-Kopien, K2 rev.)
 *   soft    = weiche destination-in-/Radialgradient-Kante (Stand vor K2 rev.)
 * Gewinner = Variante mit Diff 0 gegen den Runtime-Canvas. Nach dem Fix muss
 * "stepped" mit maxDiff ~0 gewinnen (0 weiche Gradient-Reste zur Laufzeit).
 *
 * Danach Vorher-Shots wie im Glowpath-Audit (m10-chaos-legibility): 640x360@1 und
 * 780x360@3, Minute-25-Chaos (seed=1, god, autoPlay, 6 Waffen Lv8 + 6 Evos Lv8 +
 * 6 Passives St5, skipTo(1490), Bestand 300), je 1 Frame + bildzentrierter
 * 4x-nearest-Crop + Near-White-A7-Metrik (Baseline fuer den spaeteren Vergleich).
 *
 * Kein flock: keine FPS-/Echtzeit-Messung (nur Probe + Screenshots).
 *
 * Output: shots/m10-boot-glow-<tag>.json,
 *         shots/m10-boot-glow-<tag>-<profil>-m25-1.png (+ -4x.png)
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = argOf("tag", "before");
const PREFIX = argOf("prefix", `shots/m10-boot-glow-${TAG}`);
const TARGET = Number(argOf("target", "300"));
const TMP = `${process.env.HOME}/tmp/m10-boot-glow-local`;

const PROFILES = [
  { label: "640-360-1", width: 640, height: 360, dpr: 1 },
  { label: "780-360-3", width: 780, height: 360, dpr: 3 },
];
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];

// In-Browser-Referenz-Renderings (1:1 aus Boot.ts bzw. src/gfx/textures.ts main).
// Als String injiziert, damit beide Varianten im Seitenkontext erzeugt werden.
const VARIANTS_SOURCE = `
function hexColor(i) { return "#" + i.toString(16).padStart(6, "0"); }
const PAL13 = 0xfff8e6, PAL19 = 0xef9130, PAL20 = 0xffb84d, PAL21 = 0xffd77a, PAL22 = 0xffeeb0;
// Hart quantisierte Aussenkante (eaf2ab6, seit K2 rev. in Boot.ts portiert).
const LIGHT_EDGE_STEPS = [[0, 70, 1], [70, 76, 0.66], [76, 82, 0.38], [82, 88, 0.18], [88, 96, 0.08]];
function vignetteSteps() {
  const steps = [], r0 = 70, r1 = 290, bands = 11;
  const alphaAt = (t) => t < 0.7 ? 0.18 * (t / 0.7) : 0.18 + 0.54 * ((t - 0.7) / 0.3);
  for (let i = 0; i < bands; i++) {
    steps.push([r0 + ((r1 - r0) * i) / bands, r0 + ((r1 - r0) * (i + 1)) / bands,
      Math.round(alphaAt((i + 1) / bands) * 100) / 100]);
  }
  steps.push([r1, r1 + 120, 0.72]);
  return steps;
}
function drawRings(ctx, c, rings) {
  for (const [r, color, alpha] of rings) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hexColor(color);
    ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function renderLightSoft(rings) { // Vorher-Referenz: destination-in-Radialgradient
  const size = 192, c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  drawRings(ctx, c, rings);
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(c, c, 10, c, c, 96);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.75, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return ctx.getImageData(0, 0, size, size).data;
}
function renderLightStepped(rings) { // Nachher-Referenz: LIGHT_EDGE_STEPS-Band-Loop
  const size = 192, c = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  drawRings(ctx, c, rings);
  ctx.globalCompositeOperation = "destination-in";
  for (const [r0, r1, a] of LIGHT_EDGE_STEPS) {
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(c, c, r1, 0, Math.PI * 2);
    if (r0 > 0) ctx.arc(c, c, r0, 0, Math.PI * 2, true);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
  return ctx.getImageData(0, 0, size, size).data;
}
const RINGS_BOOT = globalThis.RINGS_BOOT = [ // createLightTextureLocal, Boot.ts (B2-Tuning)
  [96, PAL19, 0.05], [88, PAL19, 0.05], [80, PAL20, 0.05], [72, PAL20, 0.05],
  [64, PAL21, 0.06], [56, PAL21, 0.06], [48, PAL21, 0.07], [40, PAL21, 0.07],
  [32, PAL21, 0.08], [24, PAL20, 0.08], [16, PAL20, 0.09], [8, PAL20, 0.09],
];
function renderVignetteSoft(gameW, gameH) { // Vorher-Referenz: Radialgradient
  const canvas = document.createElement("canvas");
  canvas.width = gameW; canvas.height = gameH;
  const ctx = canvas.getContext("2d");
  const c = ctx.createRadialGradient(gameW / 2, gameH / 2, 70, gameW / 2, gameH / 2, 290);
  c.addColorStop(0, "rgba(6,7,12,0)");
  c.addColorStop(0.7, "rgba(6,7,12,0.18)");
  c.addColorStop(1, "rgba(6,7,12,0.72)");
  ctx.fillStyle = c; ctx.fillRect(0, 0, gameW, gameH);
  return ctx.getImageData(0, 0, gameW, gameH).data;
}
function renderVignetteStepped(gameW, gameH) { // Nachher-Referenz: Stufen-Bänder
  const canvas = document.createElement("canvas");
  canvas.width = gameW; canvas.height = gameH;
  const ctx = canvas.getContext("2d");
  const cx = gameW / 2, cy = gameH / 2;
  for (const [r0, r1, a] of vignetteSteps()) {
    ctx.fillStyle = "rgba(6,7,12," + a + ")";
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, gameW, gameH).data;
}
function diff(a, b) {
  if (a.length !== b.length) return { maxDiff: 255, meanDiff: 255 };
  let max = 0, sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > max) max = d;
    sum += d;
  }
  return { maxDiff: max, meanDiff: Math.round((sum / a.length) * 1000) / 1000 };
}
function readTexture(game, key) {
  const tex = game.textures.get(key);
  if (!tex || tex.key === "__MISSING") return null;
  const src = tex.source && tex.source[0] ? tex.source[0].image : null;
  if (!src || typeof src.getContext !== "function") {
    return { key, kind: src ? src.constructor.name : "none", canvas: false };
  }
  const ctx = src.getContext("2d");
  return { key, kind: "canvas", w: src.width, h: src.height, data: ctx.getImageData(0, 0, src.width, src.height).data };
}
`;

ensureBuild();
mkdirSync("shots", { recursive: true });
mkdirSync(TMP, { recursive: true });

// ---------- Pixel-Analyse (PNG -> ffmpeg rawvideo rgb24), wie m10-chaos-fix-glowpath.mjs ----------

function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
function isNearWhiteA7(r, g, b) {
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}
function analyzeShot(file) {
  const { width, height } = pngSize(file);
  const raw = `${TMP}/${file.split("/").pop()}.rgb24`;
  execFileSync("ffmpeg", ["-y", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { stdio: "ignore" });
  const buf = readFileSync(raw);
  let a7 = 0;
  for (let i = 0; i < buf.length; i += 3) {
    if (isNearWhiteA7(buf[i], buf[i + 1], buf[i + 2])) a7++;
  }
  unlinkSync(raw);
  return {
    pngWidth: width, pngHeight: height,
    nearWhiteA7Pct: Math.round((a7 / (width * height)) * 10000) / 100,
  };
}
/** Bildzentrierter 4x-nearest-Crop (Viertel-Frame Mitte). */
function zoomCrop4x(file, out) {
  const { width, height } = pngSize(file);
  const cw = Math.floor(width / 4), ch = Math.floor(height / 4);
  const x = Math.floor((width - cw) / 2), y = Math.floor((height - ch) / 2);
  execFileSync("ffmpeg", ["-y", "-i", file, "-vf",
    `crop=${cw}:${ch}:${x}:${y},scale=${cw * 4}:${ch * 4}:flags=neighbor`, out],
    { stdio: "ignore" });
}

// ---------- Browser ----------

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const report = { tag: TAG, probe: null, profiles: [], jsErrors: [] };

try {
  // ---------- Teil 1: Runtime-Probe (Shadowing) ----------
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    page.on("pageerror", (e) => report.jsErrors.push(`probe: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") report.jsErrors.push(`probe: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.waitForTimeout(1200); // Warmup abwarten (laeuft hinter dem ersten Titel-Frame)
    report.probe = await page.evaluate((src) => {
      // eslint-disable-next-line no-eval
      (0, eval)(src);
      const game = window.__game;
      const gameW = game.config.width, gameH = game.config.height;
      const out = { gameW, gameH, keys: {} };
      for (const key of ["light_radius", "vignette"]) {
        const tex = readTexture(game, key);
        if (!tex || tex.kind !== "canvas" || !tex.data) { out.keys[key] = { missing: true, info: tex }; continue; }
        const expected = {
          stepped: key === "light_radius" ? renderLightStepped(RINGS_BOOT) : renderVignetteStepped(gameW, gameH),
          soft: key === "light_radius" ? renderLightSoft(RINGS_BOOT) : renderVignetteSoft(gameW, gameH),
        };
        out.keys[key] = {
          kind: tex.kind, w: tex.w, h: tex.h,
          vsStepped: diff(tex.data, expected.stepped),
          vsSoft: diff(tex.data, expected.soft),
        };
      }
      return out;
    }, VARIANTS_SOURCE);
    await page.close();
  }

  // ---------- Teil 2: Vorher-Shots (Minute-25-Chaos, wie Glowpath-Audit) ----------
  for (const prof of PROFILES) {
    const page = await browser.newPage({
      viewport: { width: prof.width, height: prof.height },
      deviceScaleFactor: prof.dpr,
    });
    page.on("pageerror", (e) => report.jsErrors.push(`${prof.label}: ${e}`));
    page.on("console", (m) => { if (m.type() === "error") report.jsErrors.push(`${prof.label}: ${m.text()}`); });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(1);
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    });
    await page.waitForTimeout(500);
    await page.evaluate(({ evolutions, passives }) => {
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1490);
      window.__lf.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    // Gegnerbestand auf TARGET halten (wie Audit: alle ~120 ms nachfuellen).
    for (let k = 0; k < 3; k++) {
      await page.evaluate((target) => {
        const active = window.__lf.stats().enemies;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
      }, TARGET);
      await page.waitForTimeout(120);
    }
    const stats = await page.evaluate(() => {
      const s = window.__lf.stats();
      return { enemies: s.enemies, time: s.time, kills: s.kills, level: s.level };
    });
    const png = `${PREFIX}-${prof.label}-m25-1.png`;
    await page.screenshot({ path: png });
    const zoom = `${PREFIX}-${prof.label}-m25-1-4x.png`;
    zoomCrop4x(png, zoom);
    report.profiles.push({ profile: prof, png, zoom, stats, pixels: analyzeShot(png) });
    await page.close();
  }
} finally {
  await browser.close();
  await server.stop();
}

// ---------- Urteil ----------
for (const [key, r] of Object.entries(report.probe?.keys ?? {})) {
  if (!r.vsStepped) continue;
  const winner = r.vsStepped.maxDiff <= r.vsSoft.maxDiff ? "gestuft (hart)" : "weich (Gradient)";
  r.winner = winner;
  console.log(`[probe] ${key}: ${texInfo(r)} vsStepped(max=${r.vsStepped.maxDiff}, mean=${r.vsStepped.meanDiff}) vsSoft(max=${r.vsSoft.maxDiff}, mean=${r.vsSoft.meanDiff}) -> GEWINNT: ${winner}`);
}
const steppedWin = Object.values(report.probe?.keys ?? {}).every((r) => r.vsStepped && r.vsStepped.maxDiff <= r.vsSoft.maxDiff);
report.steppedWins = steppedWin;
console.log(`[boot-glow] ${TAG}: steppedWins=${steppedWin}`);
function texInfo(r) {
  return `${r.kind} ${r.w}x${r.h}`;
}
writeFileSync(`${PREFIX}.json`, JSON.stringify(report, null, 2));
console.log(`[boot-glow] ${TAG}: steppedWins=${steppedWin}`);
for (const p of report.profiles) {
  console.log(`  ${p.profile.label}: ${p.png} a7=${p.pixels.nearWhiteA7Pct}% enemies=${p.stats.enemies}`);
}
if (report.jsErrors.length > 0) {
  console.error("[boot-glow] JS-Fehler im Lauf — Belege ungueltig");
  process.exit(1);
}
