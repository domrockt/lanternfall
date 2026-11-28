#!/usr/bin/env node
// m10-pickup-moment-shots: Sichtungs-Belege fuer den Aufnahme-Moment (K4).
//
//   node scripts/m10-pickup-moment-shots.mjs
//
// Fuer jedes der 6 Powerups: echter Erwerb ueber die Erkennung im Spiel
// (window.__lf.addPassive -> levelSys.passives-Diff -> PickupSystem-Moment),
// im 300er-Chaos, im Slow-Mo (run.timeScale = 0.12 -> 0,4 s Spielzeit
// ≈ 3,3 s Echtzeit) als 8-Frame-Sequenz aufgenommen.
//
// Belege:
//   shots/m10-pickup-moment-moment-<id>.gif   8 Frames, 4x nearest, je Powerup
//   shots/m10-pickup-moment-sheet.png         Kontaktblatt alle 6 (Peak-Frame)
//   shots/m10-pickup-moment-shots.json        Messwerte (triggered, xpLoss)
//
// Keine FPS-/Echtzeit-Messung des Spielpfads -> OHNE flock. Ein Lauf.
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const HORDE = [
  ["bog_rat", 70], ["wisp", 40], ["bogzombie", 30], ["crow", 30],
  ["skeleton", 25], ["bat", 25], ["ghoul", 30], ["spider", 30],
  ["wolf", 10], ["slime", 10],
];
const POWERUPS = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];
const FRAMES = 12;
const FRAME_MS = 300; // Wandzeit je Frame (~36 ms Spielzeit bei 0.12x) -> p=0..1
const SLOWMO = 0.12;
// Spieler sitzt in der Bildmitte (640x360); Icon/Ring leben darueber.
const CROP = "128x112+256+112";

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
const errors = [];
const tmp = `${process.env.HOME}/tmp/m10-pickup-moment`;
mkdirSync(tmp, { recursive: true });

try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);

  await page.evaluate(async ({ horde }) => {
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setTimeScale(1);
    for (let i = 0; i < 6; i++) run.bossFlags[i] = true;
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 200));
    window.__lf.skipTo(1000);
    window.__lf.teleport(2048, 2048);
    await new Promise((r) => setTimeout(r, 150));
    for (const [id, n] of horde) window.__lf.spawnEnemy(id, n);
    await new Promise((r) => setTimeout(r, 200));
    run.timeScale = 0.12; // Slow-Mo: Moment in Echtzeit abtastbar
  }, { horde: HORDE });

  const perPowerup = [];
  const frameFiles = [];
  for (const id of POWERUPS) {
    // Isolierung: alte Momente + alten Passiv-Stand entfernen, dann echten
    // Erwerb-Pfad ausloesen (addPassive -> Detection -> playPowerupMoment).
    await page.evaluate((pid) => {
      const run = window.__game.scene.getScene("run");
      run.pickups.clearMoments();
      run.levelSys.passives = run.levelSys.passives.filter((p) => p.id !== pid);
      window.__lf.addPassive(pid, 1);
    }, id);

    const started = await page.waitForFunction((pid) => {
      const run = window.__game.scene.getScene("run");
      return Array.isArray(run.pickups?.moments) && run.pickups.moments.some((m) => m.id === pid);
    }, id, { timeout: 5000 }).then(() => true).catch(() => false);

    if (!started) { perPowerup.push({ id, started: false }); continue; }

    const files = [];
    for (let f = 0; f < FRAMES; f++) {
      const file = `${tmp}/${id}-${String(f).padStart(2, "0")}.png`;
      await page.screenshot({ path: file });
      files.push(file);
      if (f < FRAMES - 1) await page.waitForTimeout(FRAME_MS);
    }
    frameFiles.push(...files);

    const state = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const m = run.pickups.moments.find((x) => x.t >= 0);
      return {
        triggered: run.pickups.momentStats.triggered,
        active: run.pickups.moments.map((x) => x.id),
        alpha: m ? Math.round(m.icon.alpha * 100) / 100 : null,
        tintFill: m ? Boolean(m.icon.tintFill) : null,
      };
    });
    perPowerup.push({ id, started: true, frames: files.length, ...state });
  }

  // GIFs (4x nearest) + Kontaktblatt bauen.
  const gifs = [];
  for (const p of perPowerup) {
    if (!p.started) continue;
    const out = `shots/m10-pickup-moment-moment-${p.id}.gif`;
    const files = frameFiles.filter((f) => f.includes(`/${p.id}-`));
    execFileSync("convert", [...files, "-crop", CROP, "+repage",
      "-filter", "point", "-scale", "400%", "-delay", "25", "-loop", "0", out], { stdio: "inherit" });
    gifs.push(out);
  }
  // Kontaktblatt: Frame 3 (Icon sichtbar, Rim Alpha 1) je Powerup.
  const sheetFrames = perPowerup
    .filter((p) => p.started)
    .map((p) => frameFiles.find((f) => f.includes(`/${p.id}-03.png`)));
  execFileSync("convert", [...sheetFrames, "-crop", CROP, "+repage",
    "-filter", "point", "-scale", "200%", "+append", "shots/m10-pickup-moment-sheet.png"], { stdio: "inherit" });

  const invariant = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const s = run.pickups.stats;
    return {
      triggered: run.pickups.momentStats.triggered,
      byId: run.pickups.momentStats.byId,
      xpLoss: s.spawnedXp - s.grantedXp - run.pickups.totalXp,
      enemies: run.enemies.active.filter((e) => e.alive).length,
    };
  });
  const rendererInfo = await page.evaluate(() => {
    const info = window.__lf.rendererInfo();
    return { context: info.context, renderer: info.renderer, vendor: info.vendor, version: info.version };
  });

  const result = { powerups: perPowerup, invariant, rendererInfo, jsErrors: errors };
  writeFileSync("shots/m10-pickup-moment-shots.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ gifs, triggered: invariant.triggered, xpLoss: invariant.xpLoss, jsErrors: errors.length }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
