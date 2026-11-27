#!/usr/bin/env node
// Lane m10-esc-pause-fix: verify-input-Keyboard-Pfad (ESC -> Pause -> ESC ->
// fortsetzen) mit Instrumentierung:
//  - run.togglePause/resumeRun-Aufrufe (Zeit, Zustand davor/danach),
//  - DOM-Keydowns (key, repeat, isTrusted),
//  - 20-ms-Zustands-Poll von run.paused um den Grundpfad.
//
// Belege: shots/m10-esc-pause-before.json (Ist-Zustand, FAIL)
//         shots/m10-esc-pause-after.json  (nach dem Fix)
// Ohne flock (keine FPS-Messung).
import { mkdirSync, writeFileSync } from "node:fs";
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

// Instrumentierung: togglePause-/resumeRun-Protokoll (Zustand davor/danach)
// + DOM-Keydown-Log + 20-ms-Poll.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  window.__escProbe = { calls: [], keydowns: [], polls: [], pollTimer: null, polling: false };
  for (const fn of ["togglePause", "resumeRun", "giveUp"]) {
    const orig = run[fn].bind(run);
    run[fn] = (...args) => {
      const before = run.paused;
      const we = window.event;
      window.__escProbe.calls.push({
        fn, at: performance.now(),
        pausedBefore: before,
        evTime: we ? we.timeStamp : null, evType: we ? we.type : null,
      });
      const out = orig(...args);
      window.__escProbe.calls[window.__escProbe.calls.length - 1].pausedAfter = run.paused;
      return out;
    };
  }
  window.addEventListener("keydown", (e) => {
    window.__escProbe.keydowns.push({ key: e.key, repeat: e.repeat, trusted: e.isTrusted, ts: e.timeStamp });
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
/** Pause-Zustand zuverlaessig auf `target` bringen (max. 3 ESC-Presses). */
const setPaused = async (target) => {
  for (let i = 0; i < 3; i++) {
    if ((await state()) === target) return true;
    await page.keyboard.press("Escape");
    const ok = await page.waitForFunction(
      (t) => window.__lf.state().paused === t, target, { timeout: 4000 },
    ).then(() => true).catch(() => false);
    if (ok) return true;
  }
  return (await state()) === target;
};

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
}));
check("ESC setzt fort", resumedOk, `resumed=${resumedOk} (Probe im JSON-Feld "probe")`);
result.probe = probe;

// ── B) Robustheit: 10x ESC-Wechsel (Doppel-Trigger-Falle) ──────────────────
if (!(await setPaused(false))) check("B: Normalisierung auf fortgesetzt", false);
const pressLog = [];
let alternating = true;
for (let i = 0; i < 10; i++) {
  const before = await state();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(140);
  const after = await state();
  pressLog.push({ i, before, after, toggled: before !== after });
  if (before === after) { alternating = false; break; }
}
check("10x ESC wechselt abwechselnd (kein Doppel-Trigger)", alternating, JSON.stringify(pressLog));
result.pressLog = pressLog;

// ── C) Key-Repeat: ESC halten darf nicht doppelt togglen ────────────────────
if (!(await setPaused(false))) check("C: Normalisierung auf fortgesetzt", false);
const before = await state();
await page.keyboard.down("Escape");
await page.waitForTimeout(700); // laenger als OS-Repeat-Delay
const duringHold = await state();
await page.keyboard.up("Escape");
await page.waitForTimeout(140);
const afterHold = await state();
check("ESC halten togglet exakt einmal", before !== afterHold && duringHold === afterHold,
  `vor=${before} beimHalten=${duringHold} nach=${afterHold}`);

// ── D) Untermenue: O oeffnet Optionen, ESC verlaesst sie, Pause bleibt ─────
if (!(await setPaused(true))) check("D: Normalisierung auf pausiert", false);
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
await setPaused(false);

// ── E) Touch-Resumepfade unveraendert (game coords -> client korrekt mappen) ─
const view = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
const box = await page.locator("canvas").boundingBox();
const toClient = (x, y) => ({
  x: box.x + (x / view.w) * box.width,
  y: box.y + (y / view.h) * box.height,
});
// Pause-Knopf oben rechts (wie verify-input).
const knob = toClient(view.w - 10 - 15, 10 + 9);
await page.touchscreen.tap(knob.x, knob.y);
const touchPaused = await page.waitForFunction(
  () => window.__lf.state().paused === true, undefined, { timeout: 4000 },
).then(() => true).catch(() => false);
check("Touch: Pause-Knopf pausiert (Pfad unveraendert)", touchPaused);
// Fortsetzen per FORTSETZEN-Knopf (Pause-Menue).
const resumeBtn = await page.evaluate(() => {
  const ui = window.__game.scene.getScene("ui");
  const btn = ui.pauseButtons?.[0];
  if (!btn) return null;
  const r = btn.container.getBounds();
  return { x: r.centerX, y: r.centerY };
});
if (resumeBtn) {
  const rp = toClient(resumeBtn.x, resumeBtn.y);
  await page.touchscreen.tap(rp.x, rp.y);
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
