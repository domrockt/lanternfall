#!/usr/bin/env node
// M9 art-polish Belege (temporaer, wird in docs/lanes/art-polish.md belegt).
// Aufruf: node scripts/tmp-art-polish.mjs boss <before|after> | elites <before|after> | hud <16|195>
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const mode = argv[0];
const tag = argv[1] ?? "x";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const report = { mode, tag, frames: [] };

const page = await browser.newPage({
  viewport: { width: mode === "hud" && tag === "195" ? 780 : 640, height: 360 },
  deviceScaleFactor: 2,
});
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.setOption("scale", 1);
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setTimeScale(0.02);
  });
  await clearLevelUps();

  if (mode === "boss") {
    // Spieler an den oberen Welt-Rand: Kamera clamped -> identische Position.
    await page.evaluate(() => window.__lf.teleport(2048, 60));
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__lf.setTimeScale(1);
      for (let i = 0; i < 6; i++) window.__lf.spawnBoss(i);
      // Sofort einfrieren: Beleg zeigt den Spawn-Moment, nicht die Annäherung.
      window.__game.scene.pause("run");
    });
    await page.waitForTimeout(200);
    const data = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const cam = sc.cameras.main;
      return {
        camera: { scrollX: cam.scrollX, scrollY: cam.scrollY, w: cam.width, h: cam.height },
        player: { x: Math.round(sc.posX), y: Math.round(sc.posY) },
        bosses: sc.enemies.active.filter((e) => e.alive && e.boss).map((e) => ({
          index: e.bossIndex,
          x: Math.round(e.x), y: Math.round(e.y),
          screenY: Math.round(e.y - cam.scrollY),
          screenX: Math.round(e.x - cam.scrollX),
        })),
      };
    });
    report.frames.push(data);
    await page.screenshot({ path: `shots/art-polish-boss-${tag}.png` });
    console.log(JSON.stringify(data, null, 2));
  } else if (mode === "elites") {
    // Chaos Minute 25: 300+ Gegner, 24 Elites + normale Gegner eng um den Spieler.
    await page.evaluate(() => window.__lf.teleport(2048, 2048));
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      sc.elapsed = 1500;
      const spawn = (id, n, elite) => sc.spawner.spawnEnemy(id, n, sc.posX, sc.posY, elite);
      spawn("bog_rat", 170, false);
      spawn("wolf", 90, false);
      spawn("spider", 60, false);
      spawn("bogzombie", 40, true);
      spawn("skeleton", 24, true);
    });
    await page.waitForTimeout(400);
    // Frame nahezu einfrieren, damit der Shot die dichte Horde zeigt.
    await page.evaluate(() => window.__lf.setTimeScale(0.01));
    await page.waitForTimeout(150);
    const data = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const cam = sc.cameras.main;
      const alive = sc.enemies.active.filter((e) => e.alive);
      return {
        time: Math.round(sc.elapsed),
        enemies: alive.length,
        elites: alive.filter((e) => e.elite).length,
        lod: window.__lf.stats().lod,
        camera: { scrollX: Math.round(cam.scrollX), scrollY: Math.round(cam.scrollY), w: cam.width, h: cam.height },
      };
    });
    report.frames.push(data);
    await page.screenshot({ path: `shots/art-polish-elites-${tag}.png` });
    console.log(JSON.stringify(data, null, 2));
  } else if (mode === "hud") {
    // Level-up-Karte offen + Banner gleichzeitig (worst case) bei 16:9 / 19.5:9.
    await page.evaluate(() => {
      window.__lf.teleport(2048, 2048);
      window.__lf.setTimeScale(1);
      window.__lf.spawnBoss(0);
      window.__lf.giveXp(5000);
    });
    await page.waitForTimeout(900);
    await clearLevelUps();
    await page.evaluate(() => {
      // Banner erneut zeigen, dann Level-up oeffnen: beide Overlays gleichzeitig.
      const ui = window.__game.scene.getScene("ui");
      ui.showBanner?.("HUD-ANKER", "LEVEL UP + BANNER + BOSS", 23);
      window.__lf.giveXp(5000);
    });
    await page.waitForTimeout(500);
    const data = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const ui = window.__game.scene.getScene("ui");
      return {
        view: { w: window.__lf.state().viewWidth ?? null, h: null },
        time: Math.round(sc.elapsed),
        levelUpOpen: sc.levelUpOpen,
        bannerVisible: ui.bannerGroup?.visible ?? null,
        bossVisible: Boolean(sc.getHudState().boss),
        canvas: { w: window.__game.canvas.width, h: window.__game.canvas.height },
      };
    });
    report.frames.push(data);
    await page.screenshot({ path: `shots/art-polish-hud-${tag}.png` });
    console.log(JSON.stringify(data, null, 2));
  }
} finally {
  report.errors = errors;
  mkdirSync("~/tmp/m9-art-polish".replace("~", process.env.HOME), { recursive: true });
  writeFileSync(`${process.env.HOME}/tmp/m9-art-polish/${mode}-${tag}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}
if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
