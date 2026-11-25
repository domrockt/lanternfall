#!/usr/bin/env node
// M2-Abnahme: alle 12 Waffen (6 Basen + 6 Evolutionen) mit 50 Gegnern, 5 s,
// Screenshot pro Waffe + Schadensprüfung. Zusätzlich Truhen-GIF mit Evolution.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const ALL = [...WEAPONS, ...EVOLUTIONS];
const WAIT_MS = 5000;

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const results = [];

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return page;
}

async function clearLevelUps(page) {
  for (let i = 0; i < 60; i++) {
    const open = await page.evaluate(() => window.__lf?.state().levelUpOpen);
    if (!open) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
}

try {
  for (const id of ALL) {
    const page = await newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
      await startRun(page);
      await page.evaluate((weaponId) => {
        window.__lf.god(true);
        window.__lf.setTimeScale(2);
        window.__lf.addWeapon(weaponId, 8);
        window.__lf.spawnEnemy("bog_rat", 30);
        window.__lf.spawnEnemy("wisp", 20);
      }, id);
      const deadline = Date.now() + WAIT_MS;
      while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        await clearLevelUps(page);
      }
      await page.evaluate(() => window.__lf.setTimeScale(1));
      await clearLevelUps(page);
      // Frische Gegner + kurze Wirkphase, damit der Screenshot die Waffen-VFX zeigt.
      await page.evaluate(() => {
        window.__lf.spawnEnemy("bog_rat", 30);
        window.__lf.spawnEnemy("wisp", 10);
        window.__lf.setTimeScale(3);
      });
      const fxDeadline = Date.now() + 1500;
      while (Date.now() < fxDeadline) {
        await page.waitForTimeout(80);
        await clearLevelUps(page);
      }
      await page.evaluate(() => window.__lf.setTimeScale(1));
      await page.waitForTimeout(180);
      const state = await page.evaluate(() => window.__lf.state());
      const damage = state.damageByWeapon[id] ?? 0;
      const owned = state.weapons.some((w) => w.id === id && w.level === 8);
      await clearLevelUps(page);
      await page.screenshot({ path: `shots/m2-weapon-${id}.png` });
      const entry = { id, damage, owned, enemies: state.enemies, kills: state.kills, fps: state.fps, ok: owned && damage > 0 };
      results.push(entry);
      console.log(`${id}: Schaden ${damage}, Stufe8 ${owned ? "ja" : "NEIN"}, ${entry.ok ? "OK" : "FEHLER"}`);
    } finally {
      await page.close();
    }
  }

  // Regression: Evolution ersetzt die Basiswaffe, deren Runtime-State (Orbs) muss enden.
  const evoPage = await newPage();
  try {
    await evoPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=31`);
    await startRun(evoPage);
    await evoPage.evaluate(() => {
      window.__lf.god(true);
      window.__lf.addWeapon("lantern", 8);
      window.__lf.spawnEnemy("bog_rat", 20);
      window.__lf.setTimeScale(2);
    });
    await evoPage.waitForTimeout(1600);
    await evoPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(evoPage);
    const before = await evoPage.evaluate(() => window.__lf.state().damageByWeapon);
    await evoPage.evaluate(() => {
      window.__lf.addWeapon("soul_beacon", 8);
      window.__lf.spawnEnemy("bog_rat", 40);
      window.__lf.setTimeScale(2);
    });
    await evoPage.waitForTimeout(2600);
    await evoPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(evoPage);
    const afterState = await evoPage.evaluate(() => window.__lf.state());
    const lanternBefore = before.lantern ?? 0;
    const lanternAfter = afterState.damageByWeapon.lantern ?? 0;
    const soulDamage = afterState.damageByWeapon.soul_beacon ?? 0;
    const hasBase = afterState.weapons.some((w) => w.id === "lantern");
    const hasEvolved = afterState.weapons.some((w) => w.id === "soul_beacon");
    const oldOrbsGone = lanternAfter === lanternBefore;
    const evoOk = !hasBase && hasEvolved && oldOrbsGone && soulDamage > 0;
    results.push({ id: "evolution-state", damage: soulDamage, owned: evoOk, enemies: afterState.enemies, kills: afterState.kills, fps: afterState.fps, ok: evoOk });
    console.log(`Evolution-State: Laterne ${lanternBefore} -> ${lanternAfter}, Seele ${soulDamage}, Slot ${!hasBase && hasEvolved ? "nur Evolution" : "FEHLER"}: ${evoOk ? "OK" : "FEHLER"}`);
  } finally {
    await evoPage.close();
  }

  // Truhen-Sequenz als GIF + Evolution via Truhe beweisen.
  const chestPage = await newPage();
  try {
    await chestPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=12`);
    await startRun(chestPage);
    await chestPage.evaluate(() => {
      window.__lf.god(true);
      window.__lf.addWeapon("ember", 8);
      window.__lf.addPassive("tome", 1);
      window.__lf.spawnEnemy("bog_rat", 20);
      window.__lf.setTimeScale(2);
    });
    await chestPage.waitForTimeout(1200);
    await chestPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(chestPage);
    await chestPage.evaluate(() => window.__lf.skipTo(1500));
    await chestPage.evaluate(() => window.__lf.openChest());
    rmSync("shots/chest-frames", { recursive: true, force: true });
    mkdirSync("shots/chest-frames", { recursive: true });
    for (let i = 0; i < 48; i++) {
      await chestPage.screenshot({ path: `shots/chest-frames/f${String(i).padStart(3, "0")}.png` });
      await chestPage.waitForTimeout(90);
    }
    await chestPage.waitForTimeout(1200);
    const chestState = await chestPage.evaluate(() => window.__lf.state());
    const evolved = chestState.weapons.some((w) => w.id === "phoenix" && w.level === 8);
    await chestPage.screenshot({ path: "shots/m2-evolution-phoenix.png" });
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", "11",
      "-i", "shots/chest-frames/f%03d.png",
      "-vf", "scale=480:270:flags=neighbor",
      "shots/m2-chest.gif",
    ], { stdio: "inherit" });
    results.push({ id: "chest-evolution", damage: null, owned: evolved, enemies: chestState.enemies, kills: chestState.kills, fps: chestState.fps, ok: evolved });
    console.log(`Truhe -> Evolution: ${evolved ? "Phönixschwarm im Slot, OK" : "FEHLT"}`);
  } finally {
    await chestPage.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
const summary = {
  weapons: results.filter((r) => r.id !== "chest-evolution" && r.id !== "evolution-state").length,
  evolved: results.find((r) => r.id === "chest-evolution")?.owned ?? false,
  evolutionState: results.find((r) => r.id === "evolution-state")?.owned ?? false,
  failed: failed.map((r) => r.id),
  jsErrors: errors,
  passed: failed.length === 0 && errors.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.passed ? 0 : 1);
