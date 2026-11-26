#!/usr/bin/env node
// M6-Nachtrag A7: Endgame-Lesbarkeit bei 6 Waffen auf Maximalstufe.
// Vorher/Nachher im SELBEN Run, gleiche Gegnerdichte, gleiche Zeit:
// Nur der Debug-Schalter setFxDamping wechselt (fxAlpha 1 vs 0,62).
// Zusaetzlich ein kurzes GIF (12 Frames) waehrend die Effekte wirken.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const report = { frames: [] };
// Stats und PNG atomar: derselbe Frame-Zustand fuer HUD und JSON.
async function capture(name, path) {
  const stats = await page.evaluate(() => window.__lf.stats());
  await page.screenshot({ path });
  const frame = {
    name, path, time: stats.time, level: stats.level, kills: stats.kills,
    enemies: stats.enemies, fxAlpha: stats.fxAlpha, lodLevel: stats.lod?.level,
  };
  report.frames.push(frame);
  return frame;
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setTimeScale(30);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
  });
  // Regulaer bis ~23:20 laufen lassen (skipTo wuerde alle Bosse gleichzeitig
  // spawnen und Banner stapeln). Danach Banner ausklingen lassen.
  while (true) {
    const s = await page.evaluate(() => window.__lf.stats());
    if (s.time >= 1400) break;
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    while (sc.levelUpOpen) window.__lf.pickLevelUp(0);
    window.__lf.setTimeScale(1);
    window.__lf.spawnEnemy("bog_rat", 220);
    window.__lf.spawnEnemy("skeleton", 200);
    window.__lf.spawnEnemy("wolf", 160);
  });
  await page.waitForTimeout(420);
  // GIF zuerst: 12 Frames im echten Lauf, waehrend die Effekte wirken.
  for (let i = 0; i < 8; i++) {
    await page.screenshot({ path: `shots/tmp-vfx-${String(i).padStart(2, "0")}.png` });
    await page.waitForTimeout(70);
  }
  // Grossen Evolutions-Effekt waehrend der Horde ausloesen, kurz wirken
  // lassen, dann den Frame einfrieren (Vorher/Nachher exakt identisch).
  // Reproduzierbarer Pool-Effekt (echtes FxSystem-Sprite, das die Daempfung
  // skaliert) mitten in der Horde; danach Frame einfrieren.
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const c = sc.combat;
    c.fx.burst("fx_spark", sc.posX, sc.posY, 90, { life: 3, scaleFrom: 1.6, alphaFrom: 1 });
    c.fx.spawnAnim("fx_halo", sc.posX, sc.posY, { life: 3, scaleFrom: 4.2, alphaFrom: 1, additive: true });
    c.fx.spawnAnim("fx_shock", sc.posX, sc.posY, { life: 3, scaleFrom: 3.4, alphaFrom: 1 });
  });
  await page.waitForTimeout(120);
  // Event-Banner ausblenden, damit nur Effekte/Gegner bewertet werden.
  await page.evaluate(() => {
    window.__game.scene.getScene("ui").bannerGroup?.setVisible(false);
    window.__game.scene.pause("run");
  });
  await page.waitForTimeout(120);
  const paused = await page.evaluate(() => window.__lf.stats());
  // Erst ungedaempft (vorher), dann gedaempft (nachher) im selben Frame.
  const before = await page.evaluate(() => {
    window.__lf.setFxDamping(false);
    return window.__lf.stats();
  });
  await page.screenshot({ path: "shots/final-vfx-m25-before.png" });
  const after = await page.evaluate(() => {
    window.__lf.setFxDamping(true);
    return window.__lf.stats();
  });
  await page.screenshot({ path: "shots/final-vfx-m25-after.png" });
  await page.evaluate(() => { window.__lf.setFxDamping(true); window.__game.scene.resume("run"); });

  execFileSync("ffmpeg", [
    "-y", "-framerate", "8", "-i", "shots/tmp-vfx-%02d.png",
    "-vf", "scale=480:270:flags=neighbor,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse=dither=none",
    "-loop", "0", "shots/final-vfx-m25.gif",
  ], { stdio: "ignore" });

  report.paused = {
    time: paused.time, level: paused.level, kills: paused.kills, enemies: paused.enemies,
    fxCount: await page.evaluate(() => window.__game.scene.getScene("run").combat.fx.count),
    particleCount: await page.evaluate(() => window.__game.scene.getScene("run").combat.particles.count),
  };
  report.after = { time: after.time, level: after.level, kills: after.kills, enemies: after.enemies, fxAlpha: after.fxAlpha, lodLevel: after.lod?.level };
  report.before = { time: before.time, level: before.level, kills: before.kills, enemies: before.enemies, fxAlpha: before.fxAlpha, lodLevel: before.lod?.level };
  report.sameDensity = after.time === before.time && after.kills === before.kills && after.enemies === before.enemies;
  report.errors = errors;
} finally {
  writeFileSync("shots/final-vfx-readability.json", JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}
if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
console.log("VFX-Belege:", JSON.stringify({
  after: report.after, before: report.before, sameDensity: report.sameDensity,
}));
