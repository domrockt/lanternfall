#!/usr/bin/env node
// M6-Lane "menus": Screenshots aller Menü-Szenen, Maus/Tastatur-Pfade,
// Options-Persistenz über Reload, Meta-Bestwerte. Exit 0 nur wenn alles grün.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
const DEFAULT_MUSIC = 0.55;
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Vor dem Laden Bestwerte setzen, damit Titel/CharSelect echte Meta-Daten zeigen.
await page.addInitScript(() => {
  if (localStorage.getItem("m6-seeded") === "1") return;
  localStorage.setItem("lanternfall-meta-v1", JSON.stringify({
    mira: { time: 754, kills: 456, level: 12, victories: 0, runs: 2 },
    kael: { time: 512, kills: 301, level: 9, victories: 1, runs: 3 },
  }));
  localStorage.removeItem("lanternfall-options-v1");
  localStorage.setItem("m6-seeded", "1");
});

const shots = [];
const snap = async (name) => {
  const path = `shots/m6-menus-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};
// M8-View ist dynamisch (logische Hoehe 360, Breite 480..860), nicht 480x270.
// Koordinaten werden aus der echten Spielflaeche (__game.scale) auf den Canvas gemappt.
const clickGame = async (x, y) => {
  const box = await page.locator("canvas").boundingBox();
  const view = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
  await page.mouse.click(box.x + (x / view.w) * box.width, box.y + (y / view.h) * box.height);
  await page.waitForTimeout(220);
};
const state = () => page.evaluate(() => window.__lf.state());
const options = () => page.evaluate(() => window.__lf.options());

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

let result = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(500);
  await snap("title");

  // Optionen per Maus öffnen; Werte per Tastatur ändern.
  await clickGame(240, 259);
  await page.waitForTimeout(200);
  await snap("options");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Credits per Maus öffnen und zurück.
  await clickGame(346, 259);
  await waitForScene(page, "credits");
  await page.waitForTimeout(250);
  await snap("credits");
  await clickGame(240, 334);
  await waitForScene(page, "title");

  // Charakterwahl: Kael per Maus wählen, dann START-Knopf.
  await clickGame(136, 259);
  await waitForScene(page, "charselect");
  await page.waitForTimeout(300);
  await clickGame(352, 185);
  await snap("charselect");
  const selectState = await state();
  check("charselect erreichbar", selectState.scene === "charselect", selectState.scene);
  await clickGame(280, 342);
  await waitForScene(page, "run");
  await page.waitForTimeout(500);
  check("run erreicht", (await state()).scene === "run");
  // Keine Level-up-Dialoge zwischen Build-Aufbau und Aufgeben.
  await page.evaluate(() => window.__lf.setSuppressLevelUps(true));

  // Build für die Pause-Übersicht füllen (6 Evolutionen + 6 Powerups).
  await page.evaluate(() => {
    const w = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
    for (const id of w) window.__lf.addWeapon(id, 8);
    const p = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];
    for (let i = 0; i < p.length; i++) window.__lf.addPassive(p[i], 1 + (i % 5));
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const paused = await state();
  check("Pause geöffnet", paused.paused === true);
  await snap("pause");

  // Pause-Optionen per Maus öffnen/schließen.
  await clickGame(240, 246);
  await page.waitForTimeout(200);
  await snap("options-pause");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const afterOptionsEsc = await state();
  check(
    "ESC schliesst Pause-Optionen, Pause bleibt",
    afterOptionsEsc.paused === true && afterOptionsEsc.scene === "run",
    `paused=${afterOptionsEsc.paused}`,
  );

  // Kur, Schaden sammeln, wieder pausieren und aufgeben.
  await clickGame(108, 246);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 30));
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Aufgeben per Tastatur (Fokus-Navigation der Pause-Knöpfe).
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(70);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(70);
  await page.keyboard.press("Enter");
  await waitForScene(page, "results");
  await page.waitForTimeout(400);
  const defeat = await state();
  check("Aufgeben führt zu Results", defeat.scene === "results", defeat.scene);
  await snap("results-defeat");

  // Neue Runde per Maus, dann Debug-Sieg -> Sieg-Ergebnis.
  await clickGame(146, 334);
  await waitForScene(page, "run");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__lf.setSuppressLevelUps(true);
    window.__lf.addWeapon("phoenix", 8);
    window.__lf.addWeapon("thunder_seal", 8);
    window.__lf.spawnEnemy("skeleton", 24);
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    window.__lf.skipTo(1700);
    window.__lf.finishRun("dawn");
  });
  await waitForScene(page, "results");
  await page.waitForTimeout(400);
  await snap("results-victory");
  check("Sieg-Ergebnis erreichbar", (await state()).scene === "results");

  // Zurück zum Titel und Meta-Anzeige prüfen.
  await clickGame(316, 334);
  await waitForScene(page, "title");
  await page.waitForTimeout(350);
  await snap("title-meta");
  const meta = await page.evaluate(() => window.__lf.meta());
  check("Meta: Kael hat 2 Runs", meta.kael.runs >= 2, String(meta.kael.runs));
  check("Meta: Kael-Sieg gespeichert", meta.kael.victories >= 1, String(meta.kael.victories));

  // Optionen ändern (Maus), Screenshot, dann Reload-Persistenz.
  await clickGame(240, 259);
  await page.waitForTimeout(200);
  await snap("options-open-final");
  await clickGame(414, 132);  // Musik +10% (Wert-Zone Zeile 1)
  await clickGame(345, 172);  // Screen-Shake umschalten (Zeile 3)
  await clickGame(345, 192);  // Damage-Numbers umschalten (Zeile 4)
  await clickGame(414, 232);  // Skalierung AUTO -> 2X (Zeile 6 nach MASTER MUTE)
  await page.waitForTimeout(250);
  const canvasBox = await page.locator("canvas").boundingBox();
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  check(
    "Skalierung 2X gestellt, Fit-View zentriert",
    Math.abs(cx - 480) <= 2 && Math.abs(cy - 270) <= 2
      && canvasBox.width === 720 && canvasBox.height === 540,
    `center ${cx}/${cy}, ${canvasBox.width}x${canvasBox.height}`,
  );
  await snap("options-changed");
  const beforeReload = await options();
  check("Optionen: Musik erhöht", beforeReload.music > DEFAULT_MUSIC, String(beforeReload.music));
  check("Optionen: Damage-Numbers aus", beforeReload.damageNumbers === false);
  check("Optionen: Skalierung 2X", beforeReload.scale === 2, String(beforeReload.scale));

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(350);
  const afterReload = await options();
  check(
    "Optionen überleben Reload",
    JSON.stringify(beforeReload) === JSON.stringify(afterReload),
    JSON.stringify(afterReload),
  );
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  await snap("options-reload-menu");
  await page.keyboard.press("Escape");

  // Für folgende Läufe wieder sinnvolle Defaults setzen.
  await page.evaluate(() => {
    window.__lf.setOption("music", 0.55);
    window.__lf.setOption("shake", true);
    window.__lf.setOption("damageNumbers", true);
    window.__lf.setOption("scale", 0);
  });

  result = {
    milestone: "M6-menus",
    shots,
    checks,
    optionsBeforeReload: beforeReload,
    optionsAfterReload: afterReload,
    meta: await page.evaluate(() => window.__lf.meta()),
    jsErrors: errors,
  };
} catch (err) {
  errors.push(String(err));
  console.error(err);
} finally {
  const missing = shots.filter((p) => !existsSync(p) || statSync(p).size < 10_000);
  check("alle Screenshots vorhanden", missing.length === 0, missing.join(", "));
  check("keine JS-Fehler", errors.length === 0, errors.join(" | "));
  const passed = checks.every((c) => c.ok);
  result = { ...result, passed, jsErrors: errors, checks, shots };
  writeFileSync("shots/m6-menus.json", JSON.stringify(result, null, 2));
  await browser.close();
  server.stop();
  console.log(`\n${passed ? "M6-menus: PASS" : "M6-menus: FAIL"} (${checks.filter((c) => c.ok).length}/${checks.length} Checks)`);
  process.exit(passed ? 0 : 1);
}
