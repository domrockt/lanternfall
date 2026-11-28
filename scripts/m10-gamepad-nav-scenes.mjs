#!/usr/bin/env node
// Lane m10-gamepad-nav-scenes-r2 K5: Gamepad-Navigation über ALLE Menü-Szenen.
//
// Fahrt mit synthetischem Gamepad (gemocktes navigator.getGamepads, gleiche
// Technik wie der Kern-Harness scripts/m10-gamepad-nav.mjs) durch:
//   Title (4 Knöpfe inkl. VOLLBILD, wrap) → Options auf/zu
//   CharSelect (Panels + ZURÜCK/START, A=auswählen, B=zurück) → Run
//   Pause-Overlay (FORTSETZEN/OPTIONEN/AUFGABE, Repeat-Debounce, 1 Frame=1 Aktion)
//   Results (NEUE RUNDE/TITEL, wrap, B=zurück) → Credits (ZURÜCK)
//
// Belege: ~/games/.evidence/m10-gamepad-nav-scenes-r2/ (JSON + PNGs)
// Abnahme-Bilder (640x360, Fokusrahmen sichtbar): shots/abnahme/m10-gamepad-nav-scenes-*.png
// Exit 0 nur wenn alle Checks grün und 0 JS-Fehler.
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const EVIDENCE = `${homedir()}/games/.evidence/m10-gamepad-nav-scenes-r2`;
const ABNAHME = "shots/abnahme";
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(ABNAHME, { recursive: true });

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.stack ?? String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Synthetisches Pad VOR dem App-Start einhängen (readSceneGamepad liest die
// Browser-API zuerst). Buttons als boolesches Array nach Standard-Index.
await page.addInitScript(() => {
  window.__padButtons = [];
  window.__padAxes = [0, 0];
  navigator.getGamepads = () => [{
    connected: true,
    axes: window.__padAxes,
    buttons: Array.from({ length: 17 }, (_, i) => {
      const p = window.__padButtons[i] === true;
      return { pressed: p, value: p ? 1 : 0 };
    }),
  }];
  if (localStorage.getItem("m6-seeded") !== "1") {
    localStorage.setItem("m6-seeded", "1");
    localStorage.removeItem("lanternfall-options-v1");
  }
});

const BTN = { confirm: 0, back: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };
const setPad = (i) => page.evaluate((b) => {
  window.__padButtons = [];
  if (b >= 0) window.__padButtons[b] = true;
}, i);
/** Ein Pad-Press: ~4 Frames halten, dann ~4 Frames loslassen. */
const press = async (b) => {
  await setPad(b);
  await page.waitForTimeout(70);
  await setPad(-1);
  await page.waitForTimeout(70);
};

/** Ein Pad-Press mit Haltedauer (Repeat-/Doppel-Event-Probe). */
const hold = async (b, ms) => {
  await setPad(b);
  await page.waitForTimeout(ms);
  await setPad(-1);
  await page.waitForTimeout(70);
};

const state = () => page.evaluate(() => {
  const g = window.__game.scene;
  const t = g.getScene("title");
  const cs = g.getScene("charselect");
  const ui = g.getScene("ui");
  const run = g.getScene("run");
  const res = g.getScene("results");
  return {
    scene: window.__lf.state().scene,
    titleSelected: t && t.focus ? t.focus.currentIndex : -1,
    titleOptionsOpen: t && t.options ? t.options.visible : false,
    csRow: cs ? cs.padRow : -1,
    csChar: cs ? cs.index : -1,
    csBtn: cs && cs.buttonFocus ? cs.buttonFocus.currentIndex : -1,
    pauseVisible: ui && ui.pauseGroup ? ui.pauseGroup.visible : false,
    pauseFocus: ui && ui.pauseFocus ? ui.pauseFocus.currentIndex : -1,
    resultsFocus: res && res.focus ? res.focus.currentIndex : -1,
    uiOptionsOpen: ui && ui.options ? ui.options.visible : false,
    paused: run ? run.paused : false,
  };
});

const checks = [];
const snaps = [];
const deadEnds = [];
const snap = async (name) => {
  const path = `${EVIDENCE}/m10-gamepad-nav-scenes-${name}.png`;
  await page.screenshot({ path });
  snaps.push(path);
  return path;
};
const check = (name, ok, info = "") => {
  checks.push({ name, ok, info });
  if (!ok) console.log(`  FAIL ${name} — ${info}`);
  return ok;
};

await page.goto(`http://127.0.0.1:${server.port}/`);
await waitForScene(page, "title");
await page.waitForTimeout(400); // padArmed-Gate: leeres Pad schärft den Pad-Pfad

// --- 1. Title: Fokus-Kreis über ALLEN 4 Knöpfen (wrap) -----------------------
let s = await state();
check("title: startfokus START (0)", s.titleSelected === 0, `selected=${s.titleSelected}`);
await snap("title");
await press(BTN.right);
s = await state();
check("title: right → OPTIONEN (1)", s.titleSelected === 1, `selected=${s.titleSelected}`);
await press(BTN.right);
await press(BTN.right);
s = await state();
check("title: 3x right → VOLLBILD (3)", s.titleSelected === 3, `selected=${s.titleSelected}`);
await press(BTN.right);
s = await state();
check("title: right wrappt 3 → 0", s.titleSelected === 0, `selected=${s.titleSelected}`);
await press(BTN.left);
s = await state();
check("title: left wrappt 0 → 3", s.titleSelected === 3, `selected=${s.titleSelected}`);
await press(BTN.left); await press(BTN.left); await press(BTN.left);
s = await state();
check("title: 3x left → START (0)", s.titleSelected === 0, `selected=${s.titleSelected}`);

// --- 2. Title → Options (Kern) per Gamepad auf/zu ----------------------------
await press(BTN.right); // OPTIONEN (1)
await press(BTN.confirm);
s = await state();
check("title: confirm auf OPTIONEN öffnet Options", s.titleOptionsOpen === true, `open=${s.titleOptionsOpen}`);
await snap("title-options");
await press(BTN.back);
s = await state();
check("title: B schließt Options, Fokus bleibt navigierbar", s.titleOptionsOpen === false && s.scene === "title",
  `open=${s.titleOptionsOpen} scene=${s.scene}`);
await press(BTN.left); // zurück auf START (0)
s = await state();

// --- 3. CharSelect: Panels per D-Pad, A=auswählen, B=zurück -------------------
await press(BTN.confirm); // START
await waitForScene(page, "charselect");
await page.waitForTimeout(400);
s = await state();
check("charselect: Startzustand Reihe Knöpfe, Fokus START", s.csRow === 1 && s.csBtn === 1 && s.csChar === 0,
  `row=${s.csRow} btn=${s.csBtn} char=${s.csChar}`);
await press(BTN.up);
s = await state();
check("charselect: up → Panel-Reihe", s.csRow === 0, `row=${s.csRow}`);
await press(BTN.right);
s = await state();
check("charselect: right fokussiert KAEL (Panel 1)", s.csChar === 1, `char=${s.csChar}`);
await snap("charselect-kael");
await press(BTN.confirm); // A = auswählen
s = await state();
check("charselect: A wählt Panel (kein Szenenwechsel)", s.scene === "charselect" && s.csChar === 1,
  `scene=${s.scene} char=${s.csChar}`);
await press(BTN.back); // B = zurück
await waitForScene(page, "title");
await page.waitForTimeout(400);
check("charselect: B zurück zum Titel", (await state()).scene === "title", "scene");

// --- 4. CharSelect → Run: Knopf-Reihe navigieren, START bestätigen ------------
await press(BTN.confirm); // START (Fokus frisch auf 0)
await waitForScene(page, "charselect");
await page.waitForTimeout(400);
s = await state();
check("charselect: Wiedereintritt Fokus START (Knopf-Reihe)", s.csRow === 1 && s.csBtn === 1,
  `row=${s.csRow} btn=${s.csBtn}`);
await press(BTN.left);
s = await state();
check("charselect: left → ZURÜCK (0)", s.csBtn === 0, `btn=${s.csBtn}`);
await press(BTN.right);
s = await state();
check("charselect: right → START (1)", s.csBtn === 1, `btn=${s.csBtn}`);
await press(BTN.confirm); // A auf START
await waitForScene(page, "run");
check("charselect: A auf START startet Run", (await state()).scene === "run", "scene");

// --- 5. Pause-Overlay (UI.ts): Fokus-Kreis + Options + 1 Frame = 1 Aktion ------
await page.waitForTimeout(600);
s = await state();
check("run: Pause geschlossen", s.pauseVisible === false, `paused=${s.paused}`);
await hold(BTN.start, 100); // Pad-Start-Knopf pausiert (Run.ts-Trigger)
s = await state();
check("run: Pad-Start öffnet Pause-Overlay", s.pauseVisible === true && s.paused === true,
  `visible=${s.pauseVisible} paused=${s.paused}`);
check("pause: Startfokus FORTSETZEN (0)", s.pauseFocus === 0, `focus=${s.pauseFocus}`);
await snap("pause-fortsetzen");
await hold(BTN.down, 250); // gehalten: Repeat-Debounce → genau ein Schritt
s = await state();
check("pause: 250 ms down gehalten = genau ein Schritt (OPTIONEN)", s.pauseFocus === 1, `focus=${s.pauseFocus}`);
await press(BTN.confirm);
s = await state();
check("pause: confirm auf OPTIONEN öffnet Options", s.uiOptionsOpen === true, `open=${s.uiOptionsOpen}`);
await snap("pause-optionen");
await press(BTN.back);
s = await state();
check("pause: B schließt Options, Pause bleibt", s.uiOptionsOpen === false && s.pauseVisible === true,
  `open=${s.uiOptionsOpen} visible=${s.pauseVisible}`);
await press(BTN.down);
s = await state();
check("pause: down → AUFGABE (2)", s.pauseFocus === 2, `focus=${s.pauseFocus}`);
await snap("pause-aufgabe");
await press(BTN.confirm); // AUFGABE → Results
await waitForScene(page, "results");
check("pause: confirm auf AUFGABE → Results", (await state()).scene === "results", "scene");

// --- 6. Results: beide Knöpfe navigierbar, B = Titel ---------------------------
await page.waitForTimeout(400);
s = await state();
check("results: Fokus NEUE RUNDE (0)", s.resultsFocus === 0, `focus=${s.resultsFocus}`);
await snap("results");
await press(BTN.right);
s = await state();
check("results: right → TITEL (1)", s.resultsFocus === 1, `focus=${s.resultsFocus}`);
await press(BTN.left);
s = await state();
check("results: left → NEUE RUNDE (wrap)", s.resultsFocus === 0, `focus=${s.resultsFocus}`);
await press(BTN.back);
await waitForScene(page, "title");
await page.waitForTimeout(300);
check("results: B zurück zum Titel", (await state()).scene === "title", "scene");

// --- 7. Credits: ZURÜCK per A und B --------------------------------------------
await page.evaluate(() => {
  window.__game.scene.getScene("title").scene.start("credits", { seed: 1, debug: false });
});
await waitForScene(page, "credits");
await page.waitForTimeout(400);
await snap("credits");
await press(BTN.confirm);
await waitForScene(page, "title");
check("credits: A auf ZURÜCK → Titel", (await state()).scene === "title", "scene");
await page.evaluate(() => {
  window.__game.scene.getScene("title").scene.start("credits", { seed: 1, debug: false });
});
await waitForScene(page, "credits");
await page.waitForTimeout(400);
await press(BTN.back);
await waitForScene(page, "title");
check("credits: B → Titel", (await state()).scene === "title", "scene");

check("keine js-fehler", errors.length === 0, errors.join(" | "));

// --- Abnahme-Bilder (in git: shots/abnahme) ------------------------------------
for (const name of ["title", "charselect-kael", "pause-fortsetzen", "results", "credits"]) {
  try { copyFileSync(`${EVIDENCE}/m10-gamepad-nav-scenes-${name}.png`, `${ABNAHME}/m10-gamepad-nav-scenes-${name}.png`); }
  catch (e) { console.log(`  WARN copy ${name}: ${e.message}`); }
}

await browser.close();
await server.stop();

const passed = checks.every((c) => c.ok) && deadEnds.length === 0;
const report = {
  lane: "m10-gamepad-nav-scenes-r2",
  card: "K5",
  date: new Date().toISOString(),
  passed,
  summary: {
    checks: checks.length,
    checksPassed: checks.filter((c) => c.ok).length,
    deadEnds: deadEnds.length,
    errors: errors.length,
  },
  checks,
  shots: snaps,
};
const jsonPath = `${EVIDENCE}/m10-gamepad-nav-scenes.json`;
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(`\nJSON: ${jsonPath}`);
console.log(`${passed ? "m10-gamepad-nav-scenes: PASS" : "m10-gamepad-nav-scenes: FAIL"} ` +
  `(${report.summary.checksPassed}/${report.summary.checks} Checks)`);
process.exit(passed ? 0 : 1);
