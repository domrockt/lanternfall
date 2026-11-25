#!/usr/bin/env node
// M3-Abnahme Bosse: jeder Boss 20 s Kampf (God + alle Waffen), Screenshot/GIF,
// Truhen-Drop, Endboss-Phasen. Eine OK/FAIL-Zeile pro Boss mit Messwert.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const BOSSES = [
  ["moor_queen", 0], ["bone_lord", 1], ["pale_shepherd", 2],
  ["bell_golem", 3], ["coven", 4], ["hollow_king", 5],
];
const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];

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

try {
  for (const [id, index] of BOSSES) {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${40 + index}`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
    });
    await page.waitForTimeout(200);
    await clearLevelUps(page);
    await page.evaluate((i) => window.__lf.spawnBoss(i), index);
    // Warn-Banner (2,4 s real) abwarten, damit der Screenshot Boss + Effekt zeigt.
    await page.waitForTimeout(2600);
    await clearLevelUps(page);
    await page.evaluate((weapons) => {
      window.__lf.setTimeScale(3);
      for (const w of weapons) window.__lf.addWeapon(w, 8);
      // Lebende Zeugen für die Effekt-Screenshots.
      window.__lf.spawnEnemy("bog_rat", 6);
    }, WEAPONS);
    await page.waitForTimeout(200);

    const framesDir = `shots/boss-frames-${id}`;
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });

    let shot = false;
    let frames = 0;
    let minRatio = 1;
    let lastHp = Number.POSITIVE_INFINITY;
    let hazardsMax = 0;
    let shotsMax = 0;
    let summoned = 0;
    const phases = new Set();

    const start = Date.now();
    const deadline = start + 20000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(100);
      await clearLevelUps(page);
      const s = await page.evaluate(() => window.__lf.state());
      const b = s.boss;
      if (b) {
        minRatio = Math.min(minRatio, b.ratio);
        phases.add(b.phase);
        lastHp = b.hp;
      }
      hazardsMax = Math.max(hazardsMax, s.hazards);
      shotsMax = Math.max(shotsMax, s.enemyShots);
      summoned = Math.max(summoned, s.bossesSpawned.length);
      const effectVisible = (s.hazards > 0 || s.enemyShots > 0) && Boolean(b) && s.enemies >= 1;
      if (!shot && effectVisible && b) {
        // Effekt läuft: kurz pausieren für einen klaren Screenshot.
        await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
        await page.waitForTimeout(90);
        await page.screenshot({ path: `shots/m3-boss-${id}.png` });
        await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
        shot = true;
      }
      if (shot && frames < 36) {
        await page.screenshot({ path: `${framesDir}/f${String(frames).padStart(3, "0")}.png` });
        frames += 1;
      }
      if (s.bossesDefeated >= 1 && frames >= 12) break;
    }
    if (!shot) await page.screenshot({ path: `shots/m3-boss-${id}.png` });

    // Restframes für ein GIF (auch nach dem Tod: Truhe + Kristalle sichtbar).
    while (frames < 36) {
      await page.waitForTimeout(100);
      await clearLevelUps(page);
      await page.screenshot({ path: `${framesDir}/f${String(frames).padStart(3, "0")}.png` });
      frames += 1;
    }

    const final = await page.evaluate(() => window.__lf.state());
    const defeated = final.bossesDefeated >= 1;
    const chestDropped = final.chestsDropped >= 1;
    const damageDone = minRatio < 0.6;
    const phaseOk = index === 5 ? (phases.has(1) && phases.has(2) && phases.has(3)) : true;
    const mechanicOk = hazardsMax > 0 || shotsMax > 0;
    const ok = defeated && chestDropped && damageDone && phaseOk && mechanicOk && shot && errors.length === 0;
    results.push({ id, ok, shares: Math.round(minRatio * 100), phases: [...phases], hazardsMax, shotsMax, chest: chestDropped });

    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", "10",
      "-i", `${framesDir}/f%03d.png`,
      "-vf", "scale=480:270:flags=neighbor",
      `shots/m3-boss-${id}.gif`,
    ], { stdio: "inherit" });
    rmSync(framesDir, { recursive: true, force: true });

    const measure = `HP min ${Math.round(minRatio * 100)}%, Phasen ${[...phases].join("/")}, Warnflächen ${hazardsMax}, Schüsse ${shotsMax}, Truhe ${chestDropped ? "ja" : "nein"}`;
    console.log(`m3-boss-${id}: ${measure} -> ${ok ? "OK" : "FAIL"}`);
    // Fehlender Screenshot ist ein hartes Assert.
    if (!shot) console.log(`m3-boss-${id}: kein Wirkungs-Screenshot -> FAIL`);
    void lastHp; void summoned;
  }
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

const failed = results.filter((r) => !r.ok);
const missingShots = BOSSES.filter(([id]) => !readdirSync("shots").includes(`m3-boss-${id}.png`)).map(([id]) => id);
writeFileSync("shots/m3-bosses.json", JSON.stringify({ results, jsErrors: errors }, null, 2));
console.log(JSON.stringify({
  bosses: results.length,
  failed: [...failed.map((r) => r.id), ...missingShots],
  jsErrors: errors,
  passed: failed.length === 0 && missingShots.length === 0 && errors.length === 0,
}, null, 2));
process.exit(failed.length === 0 && missingShots.length === 0 && errors.length === 0 ? 0 : 1);
