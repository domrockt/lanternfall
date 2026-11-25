#!/usr/bin/env node
// M3-Abnahme Gegner: alle 30 einzeln (10 gleichzeitig) mit Screenshot + Verhaltens-Check.
// Bekannt: im natürlichen Endgame (26x, Minute 20–26) erreicht der Cap kurz
// 504 aktive Gegner (500 + Spezialwellen/Beschwörungen); 2/234 Samples > 500.
// Das ist dokumentiert und wird nicht wegoptimiert.
import { mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

/** id, archetype – aus GAME.md-Tabelle (Reihenfolge = Stufen 0–4). */
const ENEMIES = [
  ["bog_rat", "swarm"], ["wisp", "chaser"], ["mudling", "splitter"], ["crow", "swarm"],
  ["bogzombie", "chaser"], ["toad", "ranged"],
  ["skeleton", "chaser"], ["bat", "swarm"], ["ghoul", "chaser"], ["witchling", "ranged"],
  ["slime", "splitter"], ["scarecrow", "tank"],
  ["wolf", "charger"], ["banshee", "phaser"], ["golem", "tank"], ["spider", "swarm"],
  ["cultist", "summoner"], ["bomber", "exploder"],
  ["knight", "tank"], ["harpy", "orbiter"], ["lich", "summoner"], ["wraith", "phaser"],
  ["treant", "tank"], ["imp", "exploder"],
  ["horror", "ranged"], ["centipede", "charger"], ["gargoyle", "orbiter"],
  ["reaper_bat", "swarm"], ["abom", "splitter"], ["voidcaller", "summoner"],
];

const EFFECT_EXPECT = {
  ranged: "Schüsse",
  charger: "Sprint",
  phaser: "Blink",
  exploder: "Explosion",
  summoner: "Beschwörung",
  splitter: "Teilung",
};

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const results = [];

const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const sample = async () => page.evaluate(() => window.__lf.state());

try {
  for (const [id, archetype] of ENEMIES) {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate((arch) => {
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
      // Exploder müssen erst zünden dürfen; Waffen würden sie vorher töten.
      if (arch !== "exploder") {
        window.__lf.addWeapon("ember", 8);
        window.__lf.addWeapon("frost", 8);
        window.__lf.addWeapon("thorn", 8);
        // Splitter haben viel HP: zwei weitere Waffen garantieren eine Teilung
        // innerhalb des Messfensters (Kinder werden sofort wieder erschlagen).
        if (arch === "splitter") {
          window.__lf.addWeapon("storm", 8);
          window.__lf.addWeapon("lantern", 8);
        }
      }
    }, archetype);
    await page.waitForTimeout(400);
    await clearLevelUps(page);

    // 10 Gegner sichtbar um den Spieler; während der Messung nachspawnen,
    // damit Waffen die Stichprobe nicht auslöschen.
    await page.evaluate((eid) => window.__lf.spawnEnemy(eid, 10), id);

    const modes = new Set();
    const seenUids = new Map();
    let shots = 0;
    let maxShots = 0;
    let explosions = 0;
    let blinks = 0;
    let attacks = 0;
    let splitsSpawned = 0;
    let maxStep = 0;
    let lastPositions = new Map();
    let screenshotDone = false;
    // ranged/orbiter brauchen ein volles Messfenster für harte Verhaltens-Asserts.
    const rangedDists = [];
    const orbitTrack = new Map();
    const fullWindow = archetype === "ranged" || archetype === "orbiter";
    // Orbiter brauchen ein laengeres Fenster: der kumulierte Winkel haengt an
    // Geschwindigkeit/Radius und schwankte bei 7 s um die 120-Grad-Schwelle.
    const deadline = Date.now() + (archetype === "orbiter" ? 11000
      : fullWindow ? 7000 : archetype === "splitter" ? 6500 : 4200);
    let tick = 0;
    while (Date.now() < deadline) {
      await page.waitForTimeout(120);
      tick += 1;
      if (tick % 3 === 0) await page.evaluate((eid) => window.__lf.spawnEnemy(eid, 4), id);
      await clearLevelUps(page);
      const s = await sample();
      shots = s.enemyShots;
      maxShots = Math.max(maxShots, shots);
      explosions = s.explosions;
      blinks = 0;
      attacks = 0;
      splitsSpawned = s.splitsSpawned ?? 0;
      for (const e of s.enemyList) {
        if (e.id !== id) continue;
        seenUids.set(e.uid, e);
        modes.add(e.mode);
        blinks = Math.max(blinks, e.blinks);
        attacks = Math.max(attacks, e.attacks);
        const prev = lastPositions.get(e.uid);
        if (prev) {
          const d = Math.hypot(e.x - prev.x, e.y - prev.y);
          maxStep = Math.max(maxStep, d / 0.12);
        }
        lastPositions.set(e.uid, { x: e.x, y: e.y });
      }
      const px = s.player?.x ?? 0;
      const py = s.player?.y ?? 0;
      if (archetype === "ranged") {
        const mine = s.enemyList.filter((e) => e.id === id);
        if (mine.length && s.player) {
          rangedDists.push(Math.min(...mine.map((e) => Math.hypot(e.x - px, e.y - py))));
        }
      }
      if (archetype === "orbiter") {
        for (const e of s.enemyList) {
          if (e.id !== id) continue;
          const dx = e.x - px;
          const dy = e.y - py;
          const angle = Math.atan2(dy, dx);
          const r = Math.hypot(dx, dy);
          const prev = orbitTrack.get(e.uid);
          if (prev) {
            let delta = angle - prev.angle;
            while (delta > Math.PI) delta -= Math.PI * 2;
            while (delta < -Math.PI) delta += Math.PI * 2;
            prev.sweep += Math.abs(delta);
            prev.samples += 1;
            prev.rMin = Math.min(prev.rMin, r);
            prev.angle = angle;
          } else {
            orbitTrack.set(e.uid, { angle, sweep: 0, samples: 1, rMin: r });
          }
        }
      }
      // Screenshot im Wirk-Peak: Effekt sichtbar und ≥4 Gegner leben noch.
      const wantEffect =
        archetype === "ranged" ? shots > 0 :
        archetype === "charger" ? modes.has("charge") :
        archetype === "phaser" ? blinks > 0 :
        archetype === "exploder" ? explosions > 0 :
        archetype === "summoner" ? attacks > 0 :
        archetype === "splitter" ? splitsSpawned > 0 :
        true;
      const aliveMine = s.enemyList.filter((e) => e.id === id).length;
      if (!screenshotDone && wantEffect && aliveMine >= 4) {
        await page.screenshot({ path: `shots/m3-enemy-${id}.png` });
        screenshotDone = true;
      }
      if (screenshotDone && !fullWindow && (archetype === "charger" || archetype === "phaser"
        || archetype === "exploder" || archetype === "summoner" || archetype === "splitter")) break;
    }
    if (!screenshotDone) await page.screenshot({ path: `shots/m3-enemy-${id}.png` });

    const final = await sample();
    const aliveMine = final.enemyList.filter((e) => e.id === id).length;
    const movementOk = archetype === "ranged" || archetype === "summoner" || archetype === "orbiter"
      ? maxStep >= 2
      : maxStep >= 12;
    let effectOk = true;
    let measurement = `Tempo ${Math.round(maxStep)} px/s`;
    if (archetype === "ranged") {
      const sorted = rangedDists.slice().sort((a, b) => a - b);
      const minD = rangedDists.length ? Math.round(Math.min(...rangedDists)) : 0;
      const medD = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0;
      // Hält Abstand: min. 20 px, Median 40–170 px, mind. 25 Samples.
      effectOk = maxShots > 0 && rangedDists.length >= 25 && minD >= 20 && medD >= 40 && medD <= 170;
      measurement = `Projektile ${maxShots}, Distanz min/median ${minD}/${medD} px (${rangedDists.length} Samples)`;
    } else if (archetype === "orbiter") {
      let best = null;
      for (const t of orbitTrack.values()) {
        if (t.samples >= 15 && (!best || t.sweep > best.sweep)) best = t;
      }
      const deg = best ? Math.round((best.sweep * 180) / Math.PI) : 0;
      // Umkreist wirklich: ≥120° kumuliert über ≥15 Samples, Radius > 25 px.
      effectOk = Boolean(best && deg >= 120 && best.rMin > 25);
      measurement = `Winkel ${deg}° (${best?.samples ?? 0} Samples), Radius min ${Math.round(best?.rMin ?? 0)} px`;
    } else if (archetype === "charger") {
      effectOk = modes.has("charge") || maxStep > 80;
      measurement = `Modi ${[...modes].join("/")} Spitze ${Math.round(maxStep)} px/s`;
    } else if (archetype === "phaser") {
      effectOk = blinks > 0;
      measurement = `Blinks ${blinks}`;
    } else if (archetype === "exploder") {
      effectOk = explosions > 0;
      measurement = `Explosionen ${explosions}`;
    } else if (archetype === "summoner") {
      effectOk = attacks > 0;
      measurement = `Beschwörungen ${attacks}`;
    } else if (archetype === "splitter") {
      effectOk = splitsSpawned > 0;
      measurement = `Teilungen ${splitsSpawned}`;
    }
    // Bewegung ist Pflicht für Archetypen ohne eigenen Effekt-Assert; bei
    // ranged/charger/phaser/exploder/summoner/splitter belegt der Effekt das
    // Verhalten (sie sterben evtl. vor dem ersten Messintervall).
    const movementRequired = ["chaser", "swarm", "tank", "orbiter"].includes(archetype);
    const ok = effectOk && (!movementRequired || movementOk) && (aliveMine > 0 || screenshotDone) && errors.length === 0;
    results.push({ id, archetype, ok, maxStep, alive: aliveMine });
    console.log(`m3-enemy-${id}: ${measurement}, sichtbar ${aliveMine}: ${ok ? "OK" : "FAIL"}`);
  }
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
console.log(JSON.stringify({
  checked: results.length,
  failed: failed.map((r) => r.id),
  jsErrors: errors,
  passed: failed.length === 0 && errors.length === 0,
}, null, 2));
process.exit(failed.length === 0 && errors.length === 0 ? 0 : 1);
