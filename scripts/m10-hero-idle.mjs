#!/usr/bin/env node
// m10-hero-idle-frames #3: Runtime-Belege Idle-/Walk-Umschaltung (Kael + Mira).
// Nimmt je Held: Texture-Keys ueber Zeit (idle stehend, walk mit ArrowRight),
// Canvas-Frames fuer Idle-/Walk-GIFs + JSON-Befund nach shots/m10-hero-idle-ingame.json.
// Werkzeug-Charakter: ein Lauf, Auswertung aus dem JSON — kein Tuning-Loop.
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const report = { heroes: {}, jsErrors: [] };

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);

for (const hero of ["kael", "mira"]) {
  // CharSelect-Index 0 = Mira (Enter direkt), Index 1 = Kael (Taste "2" vor Enter).
  await waitForScene(page, "title");
  await page.keyboard.press("Enter"); // title -> charselect
  await waitForScene(page, "charselect");
  if (hero === "kael") await page.keyboard.press("2");
  await page.keyboard.press("Enter"); // charselect -> run
  await waitForScene(page, "run");
  await page.waitForFunction(() => Boolean(window.__game?.scene?.getScene("run")?.playerBody), null, { timeout: 8000 });
  await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });

  const probe = () => page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    return { key: sc.playerBody.texture.key, x: sc.posX, y: sc.posY, moving: sc.moving };
  });

  // ── Idle: 2.5 s stehen, 10 fps Screenshots + Key-Probierung ──
  mkdirSync(`/home/ai/tmp/m10-hero-idle-frames/${hero}-idle`, { recursive: true });
  const idleKeys = [];
  for (let i = 0; i < 25; i++) {
    const p = await probe();
    idleKeys.push(p.key);
    await page.screenshot({ path: `/home/ai/tmp/m10-hero-idle-frames/${hero}-idle/f${String(i).padStart(3, "0")}.png` });
    await page.waitForTimeout(100);
  }

  // ── Walk: 1.6 s ArrowRight, 10 fps ──
  mkdirSync(`/home/ai/tmp/m10-hero-idle-frames/${hero}-walk`, { recursive: true });
  await page.keyboard.down("ArrowRight");
  const walkKeys = [];
  for (let i = 0; i < 16; i++) {
    const p = await probe();
    walkKeys.push(p.key);
    await page.screenshot({ path: `/home/ai/tmp/m10-hero-idle-frames/${hero}-walk/f${String(i).padStart(3, "0")}.png` });
    await page.waitForTimeout(100);
  }
  await page.keyboard.up("ArrowRight");

  const uniq = (a) => [...new Set(a)];
  report.heroes[hero] = {
    idleKeysUnique: uniq(idleKeys),
    walkKeysUnique: uniq(walkKeys),
    idleSample: idleKeys.slice(0, 8),
    walkSample: walkKeys.slice(0, 8),
  };

  // Run-Szene fuer den naechsten Helden beenden (Reload der Seite).
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
}

report.jsErrors = errors;
writeFileSync("shots/m10-hero-idle-ingame.json", JSON.stringify(report, null, 1));
console.log(JSON.stringify(report.heroes, null, 1));
console.log(errors.length ? "JS ERRORS: " + errors.join(" | ") : "no JS errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
