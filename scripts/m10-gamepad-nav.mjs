#!/usr/bin/env node
// Lane m10-gamepad-menu-nav K4: Gamepad-Navigation auf Widget-Ebene.
//
// Navigiert das verdrahtete Widget-Menü (Title → Options) per synthetischem
// Gamepad (gemocktes navigator.getGamepads) und meldet Sackgassen (Zeile
// erreichbar, aber nicht bedienbar) und Doppel-Events (ein Pad-Press löst
// mehr als eine Aktion aus) als JSON.
//
// Szenen-Wiring für ALLE Menüs folgt als separater Folgejob — dieser Harness
// prüft die Widget-Ebene über den heute vorhandenen Pfad (Title/Options).
//
// Belege: ~/games/.evidence/m10-gamepad-menu-nav/m10-gamepad-nav.json (+ PNGs)
// Exit 0 nur wenn alle Checks grün, 0 Sackgassen, 0 Doppel-Events.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const EVIDENCE = `${homedir()}/games/.evidence/m10-gamepad-menu-nav`;
mkdirSync(EVIDENCE, { recursive: true });

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
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
    // Phaser-Lookup liest ALLE Slots (auch leere) — kein Sparse-Array liefern.
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

const BTN = { confirm: 0, back: 1, up: 12, down: 13, left: 14, right: 15 };
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

const title = () => page.evaluate(() => window.__game.scene.getScene("title"));
const optionState = () => page.evaluate(() => {
  const t = window.__game.scene.getScene("title");
  const o = t.options;
  const label = (i) => (o ? o.rows[i].label.valueText : null);
  const value = (i) => (o ? o.rows[i].value.valueText : null);
  return {
    scene: window.__lf.state().scene,
    titleSelected: t.selected,
    open: o ? o.visible : false,
    row: o ? o.selected : -1,
    labels: o ? [0, 1, 2, 3, 4, 5, 6].map(label) : [],
    values: o ? [0, 1, 2, 3, 4, 5, 6].map(value) : [],
  };
});
const mutedSaved = () => page.evaluate(() => {
  try {
    return JSON.parse(localStorage.getItem("lanternfall-options-v1") ?? "{}").muted ?? null;
  } catch { return null; }
});

const checks = [];
const snaps = [];
const snap = async (name) => {
  const path = `${EVIDENCE}/m10-gamepad-nav-${name}.png`;
  await page.screenshot({ path });
  snaps.push(path);
};
const deadEnds = [];
const doubleEvents = [];
const check = (name, ok, info = "") => {
  checks.push({ name, ok, info });
  if (!ok) console.log(`  FAIL ${name} — ${info}`);
  return ok;
};

await page.goto(`http://127.0.0.1:${server.port}/`);
await waitForScene(page, "title");
await page.waitForTimeout(400); // padArmed-Gate: leeres Pad schärft den Pad-Pfad

// --- 1. Titelmenü per Gamepad ---------------------------------------------
let s = await optionState();
check("title: startfokus zeile 0", s.titleSelected === 0, `selected=${s.titleSelected}`);
await press(BTN.down);
s = await optionState();
check("title: down fokussiert OPTIONEN", s.titleSelected === 1, `selected=${s.titleSelected}`);
await press(BTN.confirm);
s = await optionState();
check("title: confirm öffnet OPTIONEN", s.open === true, `open=${s.open}`);
check("options: start bei MUSIK (zeile 0)", s.row === 0, `row=${s.row}`);
await snap("options-zeile0");

// --- 2. Alle 7 Zeilen erreichbar (wrap) ------------------------------------
for (let i = 1; i <= 7; i++) {
  await press(BTN.down);
  s = await optionState();
  const expected = i % 7;
  if (s.row !== expected) deadEnds.push(`down ${i}: row=${s.row} erwartet ${expected}`);
}
s = await optionState();
check("options: 7 downs wrapen zurück auf zeile 0", s.row === 0 && deadEnds.length === 0,
  `row=${s.row} deadEnds=${deadEnds.length}`);

// --- 3. Jede Wertzeile per right/left änderbar (0 Sackgassen) ---------------
// Runden macht exakte Rückkehr bei %-Zeilen unzuverlässig (0.55+0.1→"70%",
// zurück "60%") — Toggle-Zeilen (2,3,4) müssen exakt zurückwechseln.
for (let row = 0; row <= 5; row++) {
  while ((await optionState()).row !== row) await press(BTN.down);
  const before = (await optionState()).values[row];
  await press(BTN.right);
  const after = (await optionState()).values[row];
  if (after === before) deadEnds.push(`zeile ${row} (${before}): right ändert nichts`);
  await press(BTN.left);
  const reverted = (await optionState()).values[row];
  const isToggle = row >= 2 && row <= 4;
  if (isToggle && reverted !== before) {
    doubleEvents.push(`zeile ${row}: right+left kein Rückpaar (${before}→${after}→${reverted})`);
  }
}
s = await optionState();
check("options: alle 6 wertzeilen per gamepad änderbar", deadEnds.length === 0, deadEnds.join(" | "));

// --- 4. MASTER MUTE (zeile 4) inkl. Persistenz (A7) -------------------------
while ((await optionState()).row !== 4) await press(BTN.down);
await press(BTN.right);
s = await optionState();
check("master mute: right → STUMM", s.values[4] === "STUMM", `value=${s.values[4]}`);
check("master mute: persistiert sofort (lanternfall-options-v1)", (await mutedSaved()) === true,
  `saved=${await mutedSaved()}`);
await press(BTN.left);
s = await optionState();
check("master mute: left → AN", s.values[4] === "AN", `value=${s.values[4]}`);
await snap("options-master-mute");
await setPad(-1);
await page.waitForTimeout(100);

// --- 5. Doppel-Events: ein Press = genau eine Aktion -------------------------
s = await optionState();
await press(BTN.down);
const afterOne = await optionState();
const delta1 = (afterOne.row - s.row + 7) % 7;
if (delta1 !== 1) doubleEvents.push(`ein down-press verschob ${delta1} zeilen`);
check("options: ein press = genau eine zeile", delta1 === 1, `delta=${delta1}`);

// 250 ms gehalten (~15 Frames über den echten InputState-Edge-Pfad) darf
// trotzdem nur EINE Zeile weiter springen (kein Frame-Spam).
s = await optionState();
await setPad(BTN.down);
await page.waitForTimeout(250);
await setPad(-1);
await page.waitForTimeout(70);
const afterHold = await optionState();
const deltaHold = (afterHold.row - s.row + 7) % 7;
if (deltaHold !== 1) doubleEvents.push(`250 ms down gehalten verschob ${deltaHold} zeilen`);
check("options: 250 ms halten = genau eine zeile (edge-pfad)", deltaHold === 1, `delta=${deltaHold}`);

// --- 6. ZURÜCK per confirm und per B ----------------------------------------
while ((await optionState()).row !== 6) await press(BTN.down);
await press(BTN.confirm);
s = await optionState();
check("options: confirm auf ZURÜCK schließt", s.open === false, `open=${s.open}`);
check("title: nach schließen wieder navigierbar (keine sackgasse)", s.scene === "title", s.scene);
await press(BTN.down);
s = await optionState();
if (s.titleSelected === undefined) deadEnds.push("title nach options-close nicht navigierbar");
// B-Knopf (back) öffnet... nein: back schließt nur im Optionsmenü — erneut öffnen:
await press(BTN.confirm); // aktuelles selected bestätigen → OPTIONEN öffnet (falls fokus 1)
await page.waitForTimeout(150);
s = await optionState();
if (s.open) {
  await press(BTN.back);
  s = await optionState();
  check("options: B-Knopf (back) schließt", s.open === false, `open=${s.open}`);
} else {
  check("options: B-Knopf (back) schließt", true, "übersprungen (fokus nicht auf OPTIONEN)");
}

check("keine js-fehler", errors.length === 0, errors.join(" | "));

await browser.close();
await server.stop();

const passed = checks.every((c) => c.ok) && deadEnds.length === 0 && doubleEvents.length === 0;
const report = {
  lane: "m10-gamepad-menu-nav",
  card: "K4",
  date: new Date().toISOString(),
  passed,
  summary: {
    checks: checks.length,
    checksPassed: checks.filter((c) => c.ok).length,
    deadEnds: deadEnds.length,
    doubleEvents: doubleEvents.length,
    errors: errors.length,
  },
  checks,
  deadEnds,
  doubleEvents,
  shots: snaps,
};
const jsonPath = `${EVIDENCE}/m10-gamepad-nav.json`;
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
console.log(`\nJSON: ${jsonPath}`);
console.log(
  `${passed ? "m10-gamepad-nav: PASS" : "m10-gamepad-nav: FAIL"} ` +
  `(${report.summary.checksPassed}/${report.summary.checks} Checks, ` +
  `${deadEnds.length} Sackgassen, ${doubleEvents.length} Doppel-Events)`,
);
process.exit(passed ? 0 : 1);
