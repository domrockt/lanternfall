#!/usr/bin/env node
// Lane m10-esc-pause-fix, Karte #1 (Repro): verify-input 27/28-FAIL
// "Tastatur: ESC setzt fort" reproduzieren und den Ist-Zustand belegen.
//
// Faehrt denselben Keyboard-Pfad wie scripts/verify-input.mjs (runKeyboardSuite)
// und instrumentiert dabei:
//  - run.togglePause/resumeRun-Aufrufe (Zeit + Zustand beim Aufruf),
//  - DOM-Keydowns (key, repeat, isTrusted, Zeitstempel),
//  - 20-ms-Zustands-Poll von run.paused um jeden ESC-Press.
//
// Belege: shots/m10-esc-pause-before.json (Ist-Zustand), -after.json nach dem Fix.
// Ohne Spielcode-Aenderung; laeuft ohne flock (keine FPS-Messung).
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const outName = process.argv[2] ?? "before"; // before | after
const outJson = `shots/m10-esc-pause-${outName}.json`;

ensureBuild();
mkdirSync("shots", { recursive: true });
const pw = await loadPlaywright();
const { chromium } = pw;
const server = await startServer();
const browser = await chromium.launch();

const jsErrors = [];
const result = { name: `m10-esc-pause-${outName}`, generatedAt: new Date().toISOString(), checks: [] };
const check = (name, ok, detail) => {
  result.checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

const context = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: true });
const page = await context.newPage();
page.on("pageerror", (e) => jsErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });
await page.bringToFront();
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=31`);
await page.waitForFunction(() => Boolean(window.__lf), undefined, { timeout: 45000 });
await waitForScene(page, "title");
await page.keyboard.press("Enter");
await waitForScene(page, "charselect");
await page.keyboard.press("Enter");
await waitForScene(page, "run");
await page.waitForTimeout(350);

// Instrumentierung: togglePause-/resumeRun-Protokoll + DOM-Keydown-Log + 20-ms-Poll.
// Das ist der Ist-Zustands-Beleg: wie oft toggelt ein einziger ESC-Press?
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  window.__escProbe = { calls: [], keydowns: [], polls: [], pollTimer: null, polling: false, onKeyCalls: [] };
  const ui = window.__game.scene.getScene("ui");
  const origOnKey = ui.onKey.bind(ui);
  ui.onKey = (ev) => {
    window.__escProbe.onKeyCalls.push({
      at: performance.now(), paused: run.paused, repeat: ev.repeat,
      uiId: ui.scene.key + "#" + (ui.sys.settings.status ?? ""),
    });
    return origOnKey(ev);
  };
  for (const fn of ["togglePause", "resumeRun", "giveUp"]) {
    const orig = run[fn].bind(run);
    run[fn] = (...args) => {
      window.__escProbe.calls.push({
        fn, at: performance.now(),
        paused: run.paused, levelUpOpen: run.levelUpOpen, chestOpen: run.chestOpen, finished: run.finished,
        stack: new Error().stack?.split("\n").slice(1, 5).join(" <- "),
      });
      return orig(...args);
    };
  }
  window.addEventListener("keydown", (e) => {
    window.__escProbe.keydowns.push({ key: e.key, repeat: e.repeat, trusted: e.isTrusted, at: performance.now() });
  });
  window.__escProbe.startPoll = () => {
    if (window.__escProbe.polling) return;
    window.__escProbe.polling = true;
    window.__escProbe.pollTimer = setInterval(() => {
      window.__escProbe.polls.push({ at: performance.now(), paused: run.paused });
    }, 20);
  };
  window.__escProbe.stopPoll = () => {
    clearInterval(window.__escProbe.pollTimer);
    window.__escProbe.polling = false;
  };
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
});

// Wärme: Bewegung wie im verify-input (kein Level-up-Overlay soll maskieren).
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(850);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(120);

const state = () => page.evaluate(() => window.__lf.state().paused);

// ── A) Grundpfad aus verify-input: ESC pausiert, ESC setzt fort ────────────
await page.evaluate(() => window.__escProbe.startPoll());
await page.keyboard.press("Escape");
const pausedOk = await page.waitForFunction(
  () => window.__lf.state().paused === true, undefined, { timeout: 6000 },
).then(() => true).catch(() => false);
check("ESC pausiert", pausedOk);

await page.evaluate(() => { window.__escProbe.keydowns = []; });
await page.keyboard.press("Escape");
const resumedOk = await page.waitForFunction(
  () => window.__lf.state().paused === false, undefined, { timeout: 6000 },
).then(() => true).catch(() => false);
await page.evaluate(() => window.__escProbe.stopPoll());
const probe = await page.evaluate(() => ({
  calls: window.__escProbe.calls, keydowns: window.__escProbe.keydowns, polls: window.__escProbe.polls,
  onKeyCalls: window.__escProbe.onKeyCalls,
  activeScenes: window.__game.scene.getScenes(true).map((s) => s.scene.key),
  allScenes: window.__game.scene.scenes.map((s) => s.scene.key),
  uiKeydownListeners: window.__game.scene.getScene("ui").input.keyboard.listenerCount("keydown"),
  globalKeydownListeners: typeof window.__game.input.keyboard.listenerCount === "function"
    ? window.__game.input.keyboard.listenerCount("keydown")
    : "n/a",
}));
check("ESC setzt fort", resumedOk, `resumed=${resumedOk} (Probe im JSON-Feld "probe")`);
result.probe = probe;
result.kbDiag = await page.evaluate(() => {
  const kb = window.__game.scene.getScene("ui").input.keyboard;
  return {
    pluginEmitListenerCount: kb.listenerCount("keydown"),
    sceneStatus: window.__game.scene.getScene("ui").sys.settings.status,
    sceneActive: window.__game.scene.isActive("ui"),
  };
});

// ── B) Robustheit: 10x ESC-Wechsel (Key-Repeat/Doppel-Trigger-Falle) ────────
let alternating = true;
let expected = await state();
for (let i = 0; i < 10; i++) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(140);
  const now = await state();
  if (now !== expected) { alternating = false; break; }
  expected = !expected;
}
check("10x ESC wechselt abwechselnd (kein Doppel-Trigger)", alternating, `zuletzt paused=${await state()}`);

// ── C) Key-Repeat: ESC halten darf nicht doppelt togglen ────────────────────
const before = await state();
await page.keyboard.down("Escape");
await page.waitForTimeout(700); // laenger als OS-Repeat-Delay
const duringHold = await state();
await page.keyboard.up("Escape");
await page.waitForTimeout(140);
const afterHold = await state();
check("ESC halten togglet exakt einmal", before !== afterHold && duringHold === afterHold,
  `vor=${before} beimHalten=${duringHold} nach=${afterHold}`);
await page.keyboard.press("Escape"); // Ausgangszustand wiederherstellen
await page.waitForTimeout(140);

// ── D) Untermenue: O oeffnet Optionen, ESC verlaesst sie, Pause bleibt ─────
await page.keyboard.press("Escape"); // pausieren
await page.waitForFunction(() => window.__lf.state().paused === true, undefined, { timeout: 4000 }).catch(() => {});
await page.keyboard.press("o");
await page.waitForTimeout(200);
const optionsOpen = await page.evaluate(() => window.__game.scene.getScene("ui").options.visible);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const afterSubEsc = await page.evaluate(() => ({
  paused: window.__lf.state().paused,
  optionsVisible: window.__game.scene.getScene("ui").options.visible,
}));
check("ESC im Untermenue verlaesst es, Pause bleibt", optionsOpen === true && afterSubEsc.paused === true && afterSubEsc.optionsVisible === false,
  JSON.stringify({ optionsOpen, ...afterSubEsc }));
await page.keyboard.press("Escape"); // wieder fortsetzen
await page.waitForTimeout(200);

// ── E) Touch/Gamepad-Resumepfade unveraendert (Kernzustandspruefung) ───────
// Touch-Pause ueber den Pause-Knopf (wie verify-input, Pixel-7-Profil-Mapping
// gespiegelt): Pause-Knopf oben rechts.
const touch = await page.evaluate(() => {
  const view = { w: window.__game.scale.width, h: window.__game.scale.height };
  return { x: view.w - 10 - 15, y: 10 + 9 };
});
const box = await page.locator("canvas").boundingBox();
const sx = box.x + (touch.x / 960) * box.width;
const sy = box.y + (touch.y / 540) * box.height;
await page.touchscreen.tap(sx, sy);
const touchPaused = await page.waitForFunction(
  () => window.__lf.state().paused === true, undefined, { timeout: 4000 },
).then(() => true).catch(() => false);
check("Touch: Pause-Knopf pausiert (Pfad unveraendert)", touchPaused);
// Fortsetzen per FORTSETZEN-Knopf (Pause-Menue, Fokus liegt dort).
await page.evaluate(() => { window.__lf.autoPlay; /* noop, nur Klarheit */ });
const resumeBtn = await page.evaluate(() => {
  const ui = window.__game.scene.getScene("ui");
  const btn = ui.pauseButtons?.[0];
  if (!btn) return null;
  const r = btn.container.getBounds();
  return { x: r.centerX, y: r.centerY };
});
if (resumeBtn) {
  const rx = box.x + (resumeBtn.x / 960) * box.width;
  const ry = box.y + (resumeBtn.y / 540) * box.height;
  await page.touchscreen.tap(rx, ry);
  const touchResumed = await page.waitForFunction(
    () => window.__lf.state().paused === false, undefined, { timeout: 4000 },
  ).then(() => true).catch(() => false);
  check("Touch: FORTSETZEN setzt fort (Pfad unveraendert)", touchResumed);
} else {
  check("Touch: FORTSETZEN setzt fort (Pfad unveraendert)", false, "pauseButtons[0] nicht gefunden");
}

check("keine JS-Fehler", jsErrors.length === 0, jsErrors.join(" | ").slice(0, 400));

result.passed = result.checks.every((c) => c.ok);
result.jsErrors = jsErrors;
writeFileSync(outJson, JSON.stringify(result, null, 2));
console.log(`\nm10-esc-pause: ${result.passed ? "PASS" : "FAIL"} (${result.checks.filter((c) => c.ok).length}/${result.checks.length}) -> ${outJson}`);
await browser.close();
server.stop();
process.exit(result.passed ? 0 : 1);
