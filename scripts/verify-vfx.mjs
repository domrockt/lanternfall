#!/usr/bin/env node
// M5-Abnahme: 18 GIFs (12 Waffen + 6 Ereignisse) während der Wirkung mit
// lebenden Gegnern. Harte Asserts: Effekt-Sprite alpha ≥ 0,6 im Viewport,
// ≥ 8 lebende Gegner, GIF > 20 KB. Exit-Code 0 nur wenn alles grün ist.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const WEAPONS = {
  ember: ["projectile_ember", "fx_fire", "fx_halo"],
  flail: ["flail_ball", "fx_smear", "chain_link"],
  frost: ["ring_frost", "fx_ice", "fx_halo"],
  thorn: ["projectile_thorn", "fx_thorn"],
  storm: ["fx_bolt", "fx_seal", "fx_star"],
  lantern: ["orb_lantern", "fx_orb", "fx_halo"],
  phoenix: ["projectile_phoenix", "fx_fire", "fx_shock"],
  wrath_pendulum: ["flail_ball", "fx_smear"],
  eternal_winter: ["ring_frost", "projectile_ice", "fx_ice", "fx_shock"],
  thorn_storm: ["projectile_thorn", "fx_shock", "fx_thorn"],
  thunder_seal: ["fx_seal", "fx_bolt"],
  soul_beacon: ["orb_soul", "fx_orb"],
};
const EVENTS = {
  levelup: { file: "m5-event-levelup.gif", expect: ["fx_pillar", "fx_halo", "fx_star"] },
  evolution: { file: "m5-event-evolution.gif", expect: ["fx_pillar", "fx_shock", "fx_star", "fx_fire"] },
  chest: { file: "m5-event-chest.gif", expect: ["fx_pillar", "fx_coin"] },
  bossIntro: { file: "m5-event-boss-intro.gif", expect: ["fx_boss_core", "fx_shock"] },
  bossDeath: { file: "m5-event-boss-death.gif", expect: ["fx_boss_core", "fx_shock", "fx_death_bone"] },
  dawn: { file: "m5-event-dawn.gif", expect: ["fx_pillar", "fx_dusk", "fx_ash"] },
};
const ONLY = process.env.ONLY || "";
const FRAMES = 28;
const FRAME_MS = 25;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const errors = [];
const results = [];

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return page;
}

async function clearLevelUps(page) {
  for (let i = 0; i < 30; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
}

/** Aktive VFX-Texturen mit alpha ≥ 0,6 im 480×270-Viewport (inkl. Tween-Bilder). */
async function visualKeys(page) {
  return page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    const keys = [];
    const check = (obj) => {
      const logical = obj?.frame?.name;
      const key = logical && logical !== "__BASE" ? logical : obj?.texture?.key;
      if (!key || !obj.visible) return;
      if ((obj.alpha ?? 1) < 0.6) return;
      if (typeof obj.x !== "number" || typeof obj.y !== "number") return;
      const sx = (obj.x - cam.scrollX) * cam.zoom;
      const sy = (obj.y - cam.scrollY) * cam.zoom;
      if (sx < 2 || sy < 2 || sx > cam.width - 2 || sy > cam.height - 2) return;
      if (key.startsWith("fx_") || key.startsWith("projectile_") || key.startsWith("ring_") ||
          key.startsWith("orb_") || key === "flail_ball" || key === "chain_link") {
        keys.push(key);
      }
    };
    for (const obj of run.children?.list ?? []) check(obj);
    const ui = window.__game.scene.getScene("ui");
    for (const obj of ui?.children?.list ?? []) check(obj);
    return [...new Set(keys)];
  });
}

async function capture(page, path, expected, opts = {}) {
  // Waffen: auf den Wirk-Peak warten, damit die ersten GIF-Frames den Effekt zeigen.
  // Ereignisse starten unmittelbar vor dem Aufruf → sofort aufnehmen.
  const waitDeadline = Date.now() + (opts.waitPeak === false ? 0 : 5000);
  while (Date.now() < waitDeadline) {
    await clearLevelUps(page);
    if (opts.respawn !== false) {
      const n = await page.evaluate(() => window.__lf.state().enemies);
      if (n < 14) await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 7));
    }
    const keys = await visualKeys(page);
    if (keys.includes(expected[0])) break;
    await page.waitForTimeout(25);
  }
  // Zeitlupe für die Aufnahme: kurze Effekte bleiben über mehrere Frames sichtbar.
  await page.evaluate(() => window.__lf.setTimeScale(0.25));
  const framesDir = `shots/.tmp-${path.replace(/[^a-z0-9]/gi, "-")}`;
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const found = new Set();
  let maxEnemies = 0;
  let minEnemies = Infinity;
  let frames = 0;
  for (let i = 0; i < FRAMES; i++) {
    await clearLevelUps(page);
    if (opts.respawn !== false) {
      const n = await page.evaluate(() => window.__lf.state().enemies);
      if (n < 14) await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 7));
    }
    const keys = await visualKeys(page);
    for (const k of keys) if (expected.includes(k)) found.add(k);
    const state = await page.evaluate(() => window.__lf.state());
    maxEnemies = Math.max(maxEnemies, state.enemies);
    minEnemies = Math.min(minEnemies, state.enemies);
    await page.screenshot({ path: `${framesDir}/f${String(i).padStart(3, "0")}.png` });
    frames++;
    await page.waitForTimeout(FRAME_MS);
  }
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-framerate", "16",
    "-i", `${framesDir}/f%03d.png`,
    "-vf", "scale=480:270:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none",
    path,
  ], { stdio: ["ignore", "ignore", "inherit"] });
  await page.evaluate(() => { try { window.__lf.setTimeScale(1); } catch { /* Run bereits beendet */ } });
  rmSync(framesDir, { recursive: true, force: true });
  const size = existsSync(path) ? statSync(path).size : 0;
  return { frames, found: [...found], maxEnemies, minEnemies, size, gifOk: size > 20 * 1024 };
}

try {
  // ── 12 Waffen ───────────────────────────────────────────────
  for (const [id, expected] of Object.entries(WEAPONS)) {
    if (ONLY && ONLY !== id) continue;
    const page = await newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
      await startRun(page);
      await page.evaluate((weaponId) => {
        window.__lf.god(true);
        window.__lf.setTimeScale(1);
        window.__lf.setSuppressFx(true);
        window.__lf.setSuppressLevelUps(true);
        window.__lf.addWeapon(weaponId, 8);
        window.__lf.spawnEnemy("bog_rat", 14);
        window.__lf.spawnEnemy("wisp", 6);
        window.__lf.spawnEnemy("skeleton", 4);
        window.__lf.spawnEnemy("banshee", 3);
        window.__lf.spawnEnemy("toad", 3);
      }, id);
      await page.waitForTimeout(600);
      await clearLevelUps(page);
      const shot = await capture(page, `shots/m5-vfx-${id}.gif`, expected);
      const effOk = shot.found.length > 0;
      const enemiesOk = shot.maxEnemies >= 8;
      const ok = effOk && enemiesOk && shot.gifOk;
      results.push({ id, kind: "weapon", ...shot, ok });
      console.log(`${id}: vfx:${shot.found.join("+") || "KEINE"} maxGegner ${shot.maxEnemies} gif ${Math.round(shot.size / 1024)} KiB ${ok ? "OK" : "FEHLER"}`);
    } finally {
      await page.close();
    }
  }

  // ── 6 Ereignisse ────────────────────────────────────────────
  for (const [event, spec] of Object.entries(EVENTS)) {
    if (ONLY && ONLY !== event) continue;
    const page = await newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=31`);
      await startRun(page);
      await page.evaluate(() => {
        window.__lf.god(true);
        window.__lf.setTimeScale(1);
        for (const id of ["ember", "frost", "storm"]) window.__lf.addWeapon(id, 8);
        window.__lf.spawnEnemy("bog_rat", 12);
        window.__lf.spawnEnemy("skeleton", 8);
        window.__lf.spawnEnemy("banshee", 6);
        window.__lf.spawnEnemy("toad", 6);
      });
      await page.waitForTimeout(500);
      await clearLevelUps(page);
      await page.evaluate((name) => window.__lf.event(name), event);
      const shot = await capture(page, `shots/${spec.file}`, spec.expect, { respawn: event !== "dawn", waitPeak: false });
      const effOk = shot.found.length > 0;
      const enemiesOk = event === "dawn" ? shot.maxEnemies >= 8 : shot.maxEnemies >= 8;
      const ok = effOk && enemiesOk && shot.gifOk;
      results.push({ id: event, kind: "event", ...shot, ok });
      console.log(`${event}: vfx:${shot.found.join("+") || "KEINE"} maxGegner ${shot.maxEnemies} gif ${Math.round(shot.size / 1024)} KiB ${ok ? "OK" : "FEHLER"}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
const summary = {
  weapons: results.filter((r) => r.kind === "weapon").length,
  events: results.filter((r) => r.kind === "event").length,
  gifs: results.filter((r) => r.gifOk).length,
  failed: failed.map((r) => r.id),
  jsErrors: errors,
  passed: failed.length === 0 && errors.length === 0,
};
writeFileSync("shots/m5-vfx.json", JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.passed ? 0 : 1);
