#!/usr/bin/env node
// M6-final Belege: Master-Mute (Option + sofort + Reload), Damage-Aggregation
// ab 120 Gegnern (Runtime-Wert), zweispaltiger Ergebnis-Screen + Bestwert-Banner.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${detail ?? ""}`);
}

const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const report = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
  await startRun(page);
  await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(5); window.__lf.autoPlay(true); });
  await page.waitForTimeout(1200);

  // 1) Master-Mute: Option setzen, SFX-Zahler darf nicht weiter steigen.
  const before = await page.evaluate(() => window.__lf.audio());
  await page.evaluate(() => window.__lf.setOption("muted", true));
  const mutedState = await page.evaluate(() => ({ audio: window.__lf.audio(), opts: window.__lf.options() }));
  await page.waitForTimeout(1600);
  const after = await page.evaluate(() => window.__lf.audio());
  report.mute = { before, mutedState, after };
  check("Master-Mute Option gesetzt", mutedState.opts.muted === true && mutedState.audio.muted === true,
    `options.muted=${mutedState.opts.muted} audio.muted=${mutedState.audio.muted}`);
  check("Master-Mute blockt SFX", after.sfxPlayed <= mutedState.audio.sfxPlayed,
    `sfxPlayed ${mutedState.audio.sfxPlayed} -> ${after.sfxPlayed}`);

  // Optionsmenue mit MASTER MUTE-Zeile im Titel fotografieren.
  await page.evaluate(() => { window.__lf.setTimeScale(1); window.__lf.autoPlay(false); });
  await page.evaluate(() => window.__lf.finishRun("giveup"));
  await page.waitForFunction(() => window.__lf.state().scene === "results", { timeout: 5000 });
  await page.keyboard.press("2"); // TITEL
  await page.waitForFunction(() => window.__lf.state().scene === "title", { timeout: 5000 });
  await page.keyboard.press("KeyO");
  await page.waitForTimeout(300);
  await page.screenshot({ path: "shots/final-options-mute.png" });
  const muteRow = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("title");
    return sc.options ? sc.options.container.visible : null;
  });
  check("Optionsmenue sichtbar (Master-Mute-Zeile)", muteRow === true, `visible=${muteRow}`);

  // 2) Reload: Master-Mute bleibt erhalten und Audio startet stumm.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await page.waitForTimeout(500);
  const reloaded = await page.evaluate(() => ({ opts: window.__lf.options(), audio: window.__lf.audio() }));
  report.reload = reloaded;
  check("Master-Mute nach Reload persistiert", reloaded.opts.muted === true && reloaded.audio.muted === true,
    `muted=${reloaded.opts.muted}/${reloaded.audio.muted}`);
  await page.evaluate(() => window.__lf.setOption("muted", false));

  // 3) Damage-Aggregation ab 120 Gegnern (Runtime-Wert).
  await startRun(page);
  await page.evaluate(() => { window.__lf.setTimeScale(0.05); window.__lf.god(true); });
  await page.waitForTimeout(200);
  const agg119 = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const need = Math.max(0, 110 - sc.enemies.count);
    if (need > 0) window.__lf.spawnEnemy("bog_rat", need);
    return { enemies: sc.enemies.count, stats: window.__lf.stats() };
  });
  await page.waitForTimeout(150);
  const aggAt110 = await page.evaluate(() => window.__lf.stats());
  await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 20));
  await page.waitForTimeout(150);
  const aggAt130 = await page.evaluate(() => window.__lf.stats());
  report.aggregation = { agg119, aggAt110, aggAt130 };
  check("Aggregation unter 120 aus", aggAt110.damageAggregate === false,
    `enemies=${aggAt110.enemies} aggregate=${aggAt110.damageAggregate}`);
  check("Aggregation ab 120 an", aggAt130.damageAggregate === true,
    `enemies=${aggAt130.enemies} aggregate=${aggAt130.damageAggregate}`);

  // 4) Ergebnis-Screen zweispaltig: alle 6 Waffen Stufe 8, Schaden erzeugen,
  //    dann echten Dawn-Results-Screen zeigen.
  await page.evaluate(() => {
    window.__lf.setTimeScale(12);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.spawnEnemy("bog_rat", 80);
    window.__lf.spawnEnemy("crow", 40);
  });
  await page.waitForTimeout(4200);
  report.damageBeforeFinish = await page.evaluate(() => window.__lf.state());
  await page.evaluate(() => window.__lf.finishRun("dawn"));
  await page.waitForFunction(() => window.__lf.state().scene === "results", { timeout: 6000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "shots/final-results-victory.png" });
  const resultInfo = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("results");
    return { scene: "results", reason: sc.result.reason, entries: Object.keys(sc.result.damageByWeapon).length };
  });
  report.results = resultInfo;
  check("Ergebnis-Screen Sieg mit Schadenstabelle", resultInfo.reason === "dawn" && resultInfo.entries >= 3,
    `reason=${resultInfo.reason} weapons=${resultInfo.entries}`);
} finally {
  writeFileSync("shots/final-verify.json", JSON.stringify({ checks, report, errors }, null, 2));
  await browser.close();
  server.stop();
}

const failed = checks.filter((c) => !c.ok);
if (errors.length > 0) {
  console.error("JS-Fehler:", errors);
  process.exit(1);
}
if (failed.length > 0) {
  console.error(`${failed.length} Checks FAIL`);
  process.exit(1);
}
console.log(`Alle ${checks.length} Checks PASS`);
