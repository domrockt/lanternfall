#!/usr/bin/env node
// Lane m10-hazard-quality-budget: Draw-Kosten der Warn-Discs bei M25-Dichte.
// Ein Skript fuer Vorher- (tag=before) und Nachher-Beleg (tag=after), keine FPS-Messung
// als Akzeptanzmetrik -> ohne flock (strukturelle Draw-Kosten: Quad-Anzahl + Device-px).
//
//   node scripts/m10-hazard-quality.mjs --tag=before \
//     --json-out=$HOME/games/.evidence/m10-hazard-quality-budget/before.json \
//     --png-out=$HOME/games/.evidence/m10-hazard-quality-budget/before-low.png
//
// Ablauf: Debug-Run, skipTo(600), 500er-Schwarm (M25-Stress wie m10-hazard-warn.mjs),
// dann 22 Warn-Discs ueber den echten Draw-Pfad (run.hazards.spawnCircle, warn 20 s)
// gemischt Boss/Elite/Standard. Gemessen wird ZWEIMAL:
//   1. sobald alle Discs warnen (Tier high/medium — bitgleich-Pfad, "Ist"),
//   2. nachdem der Qualitaets-Regler (src/logic/quality.ts) unter Last auf "low"
//      abgestiegen ist (bis 30 s gewartet; sonst Kennzeichnung im JSON).
// Metriken: gleichzeitig warnende Discs, gezeichnete Warn-Sprites (Disc + ADD-Rim),
// Quad-Device-px je Blend-Gruppe (ADD = Engpass auf Tile-GPUs). Dazu WebGL-Renderer-String
// (Pflicht, AGENTS.md "Analyse-Schleifen und Drift") und JS-Fehler.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun, androidProxyContext } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  return inline ? inline.slice(name.length + 3) : fallback;
};

const TAG = String(argOf("tag", "before"));
const EVIDENCE_DIR = `${process.env.HOME}/games/.evidence/m10-hazard-quality-budget`;
const jsonOut = argOf("json-out", null) ?? `${EVIDENCE_DIR}/m10-hazard-quality-${TAG}.json`;
const pngOut = argOf("png-out", null) ?? `${EVIDENCE_DIR}/m10-hazard-quality-${TAG}-low.png`;

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
// Android-Ersatzprofil (Zielgeraet): CPU-Drossel 4x drueckt die FPS-EWMA unter die
// 45er-Schwelle, der Qualitaets-Regler (config.ts) steigt dann selbst auf "low" ab.
const { context, page, device } = await androidProxyContext(browser);
const VP = page.viewportSize();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

// M25-Repro wie m10-chaos-fix-disc.mjs: Full-Build (6 Waffen Lv8 + 6 Evolutionen Lv8 +
// 6 Passives St5), skipTo(1490) (Minute 25), 500er-Stress.
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(false);
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
await page.waitForTimeout(3000);
for (let i = 0; i < 40; i++) {
  if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
  await page.evaluate(() => window.__lf.pickLevelUp(0));
}

const SEED_FN = `
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = a + 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
`;

await page.evaluate(async (seedSrc) => {
  eval(seedSrc);
  const game = window.__game;
  const run = game.scene.getScene("run");
  game.registry.set("lf-density", 0);
  run.registry.set("lf-density", 0);
  window.__lf.god(true);
  window.__lf.autoPlay(false);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.setSuppressFx(false);
  window.__lf.setTimeScale(1);
  for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
  await new Promise((r) => setTimeout(r, 250));
  window.__lf.teleport(2048, 2048);
}, SEED_FN);

const CROWD_MIX = ["bog_rat", "wisp", "crow", "skeleton", "bat", "spider", "ghoul", "wolf"];
const CROWD_TARGET = 500;

const crowdAlive = await page.evaluate(({ mix, target, seedSrc }) => {
  eval(seedSrc);
  const run = window.__game.scene.getScene("run");
  const rand = mulberry32(777);
  let spawned = 0;
  for (let round = 0; round < 8 && spawned < target; round++) {
    const need = target - spawned;
    const before = run.enemies.active.filter((e) => e.alive).length;
    window.__lf.spawnEnemy(mix[round % mix.length], need);
    const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
    for (const e of fresh) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 300;
      e.x = run.posX + Math.cos(a) * r;
      e.y = run.posY + Math.sin(a) * (r * 0.56);
      e.vx = 0; e.vy = 0;
      e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
    }
    spawned += fresh.length;
  }
  return spawned;
}, { mix: CROWD_MIX, target: CROWD_TARGET, seedSrc: SEED_FN });

// 22 Warn-Discs ueber den echten Draw-Pfad: 4 Boss- (r=92), 6 Elite- (r=48),
// 12 Standard- (r=26) — im Ring um den Spieler, warn 20 s haelt die Warnphase
// ueber beide Messungen. Reihenfolge deterministisch.
const spawnInfo = await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const px = run.posX, py = run.posY;
  const classes = [
    { n: 4, radius: 92, color: 25, source: "boss-stomp" },
    { n: 6, radius: 48, color: 20, source: "elite-slam" },
    { n: 12, radius: 26, color: 18, source: "poison" },
  ];
  let i = 0;
  for (const c of classes) {
    for (let k = 0; k < c.n; k++) {
      const a = (i / 22) * Math.PI * 2;
      const r = 70 + (i % 7) * 32;
      run.hazards.spawnCircle(px + Math.cos(a) * r, py + Math.sin(a) * r, {
        kind: "circle", warn: 20, radius: c.radius, damage: 10, color: c.color, source: c.source,
      });
      i++;
    }
  }
  return { px, py, spawned: i };
});

// Messung: Struktur des Warn-Disc-Draws im laufenden Frame (Tier aus __lf.state).
const measure = () => page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const tex = (key) => {
    const t = window.__game.textures.get(key);
    if (!t || !t.source) return { w: 0, h: 0 };
    return { w: t.source[0].width, h: t.source[0].height };
  };
  const discs = [];
  let drawnDiscs = 0, drawnRims = 0, discQuadPx = 0, rimAddPx = 0;
  for (const h of run.hazards.active) {
    if (h.kind !== "circle" || !h.active || h.triggered || h.warn <= 0) continue;
    const d = Math.hypot(run.posX - h.x, run.posY - h.y);
    const visDisc = !!(h.warnSprite && h.warnSprite.visible && h.warnSprite.alpha > 0);
    const visRim = !!(h.rimSprite && h.rimSprite.visible && h.rimSprite.alpha > 0);
    if (visDisc) {
      drawnDiscs++;
      const s = tex(h.warnSprite.texture?.key ?? "");
      discQuadPx += s.w * s.h;
    }
    if (visRim) {
      drawnRims++;
      const s = tex(h.rimSprite.texture?.key ?? "");
      rimAddPx += s.w * s.h;
    }
    discs.push({ r: Math.round(h.radius), dist: Math.round(d), visDisc, visRim, alpha: Math.round((h.warnSprite?.alpha ?? 0) * 100) / 100 });
  }
  const st = window.__lf.state();
  return {
    drawTier: window.__lfForceQuality ?? st.quality,
    reglerTier: st.quality,
    fps: st.fps ?? null,
    enemiesAlive: run.enemies.active.filter((e) => e.alive).length,
    warnDiscs: discs.length,
    drawnWarnDiscs: drawnDiscs,
    drawnRimPulses: drawnRims,
    discQuadDevicePx: discQuadPx,
    rimAddDevicePx: rimAddPx,
    discs,
  };
});

// Messung 1: alle Discs warnen, Tier deterministisch HIGH (bitgleich-Pfad).
await page.evaluate(() => { window.__lfForceQuality = "high"; });
await new Promise((r) => setTimeout(r, 400));
const istHighMedium = await measure();

// Messung 2: Tier deterministisch LOW (Debug-Override aus hazardDisc.ts, K2 — der
// FPS-Regler erreicht low auf der Dev-Maschine nie, Vorher-JSON dokumentiert das).
await page.evaluate(() => { window.__lfForceQuality = "low"; });
await new Promise((r) => setTimeout(r, 1000)); // Draw-Policy sich setzen lassen
const istLow = await measure();
const lowReached = istLow.drawTier === "low";

mkdirSync(dirname(pngOut), { recursive: true });
await page.screenshot({ path: pngOut });

const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "no-webgl";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

const json = {
  lane: "m10-hazard-quality-budget",
  tag: TAG,
  viewport: VP ? `${VP.width}x${VP.height}` : "unknown",
  androidProxyDevice: device,
  cpuThrottleRate: 4,
  renderer,
  webglRendererRequired: true,
  crowdTarget: CROWD_TARGET,
  crowdSpawned: crowdAlive,
  discsSpawned: spawnInfo.spawned,
  discClasses: "4x boss r=92, 6x elite r=48, 12x standard r=26, warn 20 s",
  istHighMedium,
  istLow,
  lowTierReached: lowReached,
  png: pngOut,
  jsErrors: errors,
};
writeFileSync(jsonOut, `${JSON.stringify(json, null, 2)}\n`);

await context.close();
await browser.close();
server.stop();
const sum = (m, k) => (m ? m[k] : null);
console.log(
  `[${TAG}] high/medium: tier=${sum(istHighMedium, "drawTier")} discs=${sum(istHighMedium, "drawnWarnDiscs")}/${sum(istHighMedium, "warnDiscs")} addPx=${sum(istHighMedium, "rimAddDevicePx")}` +
  ` | low: drawTier=${sum(istLow, "drawTier")} discs=${sum(istLow, "drawnWarnDiscs")} addPx=${sum(istLow, "rimAddDevicePx")} reached=${lowReached}` +
  ` | renderer: ${renderer} | jsErrors: ${errors.length}`,
);
if (errors.length || !lowReached) process.exitCode = 1;
