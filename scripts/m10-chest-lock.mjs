#!/usr/bin/env node
// m10-chest-lock-touch, Karte K1/K4: Truhen-Gesten-Sperre deterministisch messen.
//
// Bedarfsmeldung m10-input-qa (2026-11-27): 7/105 Touch-Checks FAIL "Sperre Truhe"
// (Basis f26dc4b). Dieses Skript stellt 7 Konstellationen ("Geste waehrend die
// Truhe offen ist") mit echten Touch-Events (CDP Input.dispatchTouchEvent,
// Pixel-7-Profil) nach und nimmt pro Frame playerX/Stick/Truhe/Pause auf:
//
//   C1 Joystick-Drift:       Touchstart bei offener Truhe + Drag halten
//   C2 Drift beim Oeffnen:   Joystick laeuft, Truhe oeffnet sich beim Halten
//   C3 Kleben nach Dismiss:  Finger startet bei offener Truhe, Truhe wird
//                            uebernommen, der Finger bleibt gehalten
//   C4 Dash-Swipe:           schneller Swipe bei offener Truhe
//   C5 Langzeit-Drift:       60 Frames Move-Versuche bei offener Truhe
//   C6 Pause-Tap:            Tap auf die Pause-Knopf-Position bei offener Truhe
//   C7 Kein Kleben:          abgelehnter Finger bleibt nach Dismiss tot,
//                            neue Geste funktioniert sofort
//
// Negativ-Block (kein Matrix-FAIL-Teil): normale Gesten ausserhalb der Truhe.
//
// Aufrufe:
//   node scripts/m10-chest-lock.mjs --out shots/m10-chest-lock-baseline.json
//   node scripts/m10-chest-lock.mjs --out shots/m10-chest-lock-after.json --shots
// Keine FPS-/Echtzeit-Messung -> kein flock.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun, waitForScene } from "./harness.mjs";

mkdirSync("shots", { recursive: true });
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : "shots/m10-chest-lock-baseline.json";
const withShots = args.includes("--shots");
const baseSha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();

// Move-Pfad links unten (linke Bildhaelfte -> Joystick), wie im m10-input-qa-Repro.
const STICK_X = 92;
const STICK_Y = 200;
const PAUSE_X = 455; // Pause-Knopf: 480 - 10 Margin - 15 halbe Breite
const PAUSE_Y = 19;  // 10 Margin + 9 halbe Hoehe

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const checks = [];
const negative = [];

function check(list, name, ok, detail = "") {
  list.push({ name, ok: Boolean(ok), detail });
}

async function newPage() {
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const cdp = await context.newCDPSession(page);

  // Game-View-Koordinaten (480x270) -> CSS-Pixel des Canvas.
  const toClient = async (x, y) => {
    const box = await page.locator("canvas").boundingBox();
    const view = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
    return { x: box.x + (x / view.w) * box.width, y: box.y + (y / view.h) * box.height };
  };

  const touchStart = async (id, x, y) => {
    const p = await toClient(x, y);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
  };
  const touchMove = async (id, x, y) => {
    const p = await toClient(x, y);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
  };
  const touchEnd = async () => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  return { context, page, touch: { touchStart, touchMove, touchEnd } };
}

async function setupRun(page) {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=11`);
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), undefined, { timeout: 45000 });
  await waitForScene(page, "title");
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.autoPlay(false);
    window.__game.scene.getScene("run").teleport(2048, 2048);
  });
  await page.waitForTimeout(250);
}

/** Pro-Frame-Sampler: playerX/Stick/Truhe/Pause ueber N Frames aufzeichnen. */
async function installSampler(page) {
  await page.evaluate(() => {
    // Event-Log + finishChest-Aufrufe mitprotokollieren (Diagnose).
    window.__evlog = [];
    const rec = (type) => (e) => {
      const ch = e.changedTouches ? [...e.changedTouches].map((t) => t.identifier).join(",") : "";
      window.__evlog.push(`${type}(${ch})`);
    };
    for (const t of ["touchstart", "touchmove", "touchend", "pointerdown", "pointerup"]) {
      window.addEventListener(t, rec(t), { capture: true });
    }
    const run = window.__game.scene.getScene("run");
    const orig = run.finishChest.bind(run);
    run.finishChest = (...a) => { window.__evlog.push("finishChest()"); return orig(...a); };
    window.__lfSample = (frames) => new Promise((resolve) => {
      const run = window.__game.scene.getScene("run");
      const ui = window.__game.scene.getScene("ui");
      const out = [];
      let n = 0;
      const tick = () => {
        const state = window.__lf.state();
        const touch = ui.touch ?? {};
        out.push({
          x: Math.round(run.posX * 10) / 10,
          stick: Boolean(touch.stickContainer?.visible),
          id: touch.identifier ?? null,
          chest: state.chestOpen === true,
          paused: state.paused === true,
        });
        n += 1;
        if (n >= frames) resolve(out);
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
}
const sample = (page, frames) => page.evaluate((f) => window.__lfSample(f), frames);

const maxXDelta = (samples, from = 0) => {
  let m = 0;
  for (let i = from + 1; i < samples.length; i++) m = Math.max(m, Math.abs(samples[i].x - samples[i - 1].x));
  return Math.round(m * 10) / 10;
};
const playerX = (page) => page.evaluate(() => window.__game.scene.getScene("run").posX);
const openChest = async (page) => {
  await page.evaluate(() => window.__lf.openChest());
  // Deterministisch warten, bis die Truhe wirklich offen ist (Sperre aktiv).
  await page.waitForFunction(() => window.__lf.state().chestOpen === true, undefined, { timeout: 4000 });
};
const dismissChest = async (page) => {
  // Bestaetigen-Taste uebernimmt die Truhe (UI.onKey -> finishChest); aequivalent
  // zum "TIPPE = UEBERNEHMEN"-Pfad, aber deterministisch ohne Touch-Race.
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().chestOpen === false, undefined, { timeout: 4000 });
};

// ─────────────────────────── Konstellationen ───────────────────────────

async function c1DriftStartAtChest(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  await touch.touchStart(1, STICK_X, STICK_Y);
  const p = sample(page, 30);
  for (let i = 0; i < 12; i++) {
    await touch.touchMove(1, STICK_X + 6 * (i + 1), STICK_Y);
    await page.waitForTimeout(25);
    if (withShots && i === 3) {
      await page.screenshot({ path: "shots/m10-chest-lock-c1-drift.png" });
    }
  }
  const s = await p;
  await touch.touchEnd();
  const moved = maxXDelta(s);
  check(checks, "C1 Joystick-Drift: Touchstart bei offener Truhe + Drag bewegt nicht",
    moved === 0 && !s.some((f) => f.stick) && s.every((f) => f.chest),
    `movedPx=${moved} stick=${s.some((f) => f.stick)} chestBleibtOffen=${s.every((f) => f.chest)} xEnd=${s.at(-1).x}`);
}

async function c2DriftWhileOpening(page, touch) {
  await touch.touchStart(1, STICK_X, STICK_Y);
  await touch.touchMove(1, STICK_X + 20, STICK_Y);
  await page.waitForTimeout(120); // Joystick laeuft
  const before = await playerX(page);
  await openChest(page);
  const p = sample(page, 30);
  for (let i = 0; i < 10; i++) {
    await touch.touchMove(1, STICK_X + 30 + 4 * i, STICK_Y);
    await page.waitForTimeout(25);
    if (withShots && i === 2) {
      await page.screenshot({ path: "shots/m10-chest-lock-c2-hold-open.png" });
    }
  }
  const s = await p;
  await touch.touchEnd();
  const drift = Math.round(Math.abs(s.at(-1).x - before) * 10) / 10;
  const afterOpenDrift = maxXDelta(s, 1);
  check(checks, "C2 Drift beim Oeffnen: gehaltener Joystick stoppt beim Truhe-Oeffnen sofort",
    drift === 0 && afterOpenDrift === 0 && !s.some((f) => f.stick),
    `driftPx=${drift} afterOpenDriftPx=${afterOpenDrift} stick=${s.some((f) => f.stick)} xVor=${Math.round(before)}`);
}

async function c3NoStickAfterDismiss(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  // Finger startet bei offener Truhe (muss abgelehnt werden) und bleibt gehalten.
  await touch.touchStart(1, STICK_X, STICK_Y);
  await dismissChest(page); // Truhe uebernommen, Finger 1 weiter gehalten
  const p = sample(page, 25);
  for (let i = 0; i < 8; i++) {
    await touch.touchMove(1, STICK_X + 40, STICK_Y - 4 * i);
    await page.waitForTimeout(25);
  }
  const s = await p;
  await touch.touchEnd();
  const moved = maxXDelta(s);
  check(checks, "C3 Kleben nach Dismiss: gehaltener Finger startet nach Truhe-Uebernahme keinen Joystick",
    moved === 0 && !s.some((f) => f.stick) && s.every((f) => !f.chest),
    `movedPx=${moved} stick=${s.some((f) => f.stick)} chestZu=${s.every((f) => !f.chest)}`);
}

async function c4DashSwipe(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  const x0 = await playerX(page);
  await touch.touchStart(1, STICK_X, STICK_Y);
  const p = sample(page, 14);
  for (let i = 0; i < 4; i++) {
    await touch.touchMove(1, STICK_X + 18 * (i + 1), STICK_Y);
    await page.waitForTimeout(10);
  }
  await touch.touchEnd(); // Swipe-Release uebernimmt die Truhe (Skip-Pfad)
  const s = await p;
  const moved = maxXDelta(s);
  const chestDuring = s.slice(0, 4).every((f) => f.chest);
  check(checks, "C4 Dash-Swipe: schneller Swipe bei offener Truhe bewegt nicht",
    moved === 0 && !s.some((f) => f.stick) && chestDuring,
    `movedPx=${moved} stick=${s.some((f) => f.stick)} chestWaehrendSwipe=${chestDuring} x0=${Math.round(x0)}`);
}

async function c5LongDrift(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  await touch.touchStart(1, STICK_X, STICK_Y);
  const p = sample(page, 60);
  for (let i = 0; i < 20; i++) {
    const dx = i % 2 === 0 ? 30 : 8;
    await touch.touchMove(1, STICK_X + dx, STICK_Y - (i % 3) * 8);
    await page.waitForTimeout(20);
  }
  const s = await p;
  await touch.touchEnd();
  const moved = maxXDelta(s);
  const stickAt = s.findIndex((f) => f.stick);
  const at = stickAt >= 0 ? s[stickAt] : null;
  check(checks, "C5 Langzeit-Drift: 60 Frames Move-Versuche bei offener Truhe bewegen nicht",
    moved === 0 && !s.some((f) => f.stick) && s.every((f) => f.chest),
    `movedPx=${moved} stick=${s.some((f) => f.stick)} frames=${s.length}`
      + (at ? ` stickAbFrame=${stickAt} chest=${at.chest} paused=${at.paused} id=${at.id}` : "")
      + ` verlauf=${s.slice(0, 14).map((f) => `${f.chest ? "C" : "c"}${f.stick ? "S" : "s"}${f.paused ? "P" : "p"}${f.id ?? "-"}`).join(" ")}`
      + ` evlog=${(await page.evaluate(() => window.__evlog.splice(0, 24))).join(" ")}`);
}

async function c6PauseTap(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  await touch.touchStart(1, PAUSE_X, PAUSE_Y);
  const p = sample(page, 14);
  await page.waitForTimeout(60);
  await touch.touchEnd();
  const s = await p;
  const moved = maxXDelta(s);
  // Truhe offen => Run ist per Design pausiert (chestPausedBefore). Der Tap auf
  // die Pause-Position ist ein Skip-Tap: Truhe zu, Run laeuft weiter, KEIN
  // Pause-Menue, kein Stick, keine Bewegung.
  const pausedNachChestZu = s.some((f) => !f.chest && f.paused);
  check(checks, "C6 Pause-Tap: Tap auf Pause-Position bei offener Truhe uebernimmt nur die Truhe",
    !pausedNachChestZu && moved === 0 && !s.some((f) => f.stick) && !s.at(-1).chest,
    `pausedNachTruheZu=${pausedNachChestZu} movedPx=${moved} stick=${s.some((f) => f.stick)} chestNachTap=${s.at(-1).chest}`);
}

async function c7NoStuckNewGesture(page, touch) {
  await openChest(page);
  await page.waitForTimeout(120);
  // Finger wird bei offener Truhe abgelehnt und bleibt gehalten.
  await touch.touchStart(1, STICK_X, STICK_Y);
  await page.waitForTimeout(60);
  await dismissChest(page);
  // Alter Finger bewegt weiter -> darf weiterhin kein Joystick sein.
  const p1 = sample(page, 15);
  await touch.touchMove(1, STICK_X + 30, STICK_Y);
  await page.waitForTimeout(40);
  await touch.touchMove(1, STICK_X + 34, STICK_Y);
  await page.waitForTimeout(40);
  const sOld = await p1;
  await touch.touchEnd();
  const movedOld = maxXDelta(sOld);
  // Neue Geste (neuer Touchstart) muss sofort funktionieren.
  await touch.touchStart(3, STICK_X, STICK_Y);
  const p2 = sample(page, 25);
  await touch.touchMove(3, STICK_X + 30, STICK_Y);
  await page.waitForTimeout(60);
  await touch.touchMove(3, STICK_X + 44, STICK_Y);
  await page.waitForTimeout(60);
  if (withShots) await page.screenshot({ path: "shots/m10-chest-lock-c7-new-gesture.png" });
  const sNew = await p2;
  await touch.touchEnd();
  const movedNew = Math.abs(sNew.at(-1).x - sNew[0].x);
  check(checks, "C7 Kein Kleben + neue Geste: alter Finger bleibt tot, neuer Touchstart bewegt",
    movedOld === 0 && !sOld.some((f) => f.stick) && movedNew > 5 && sNew.some((f) => f.stick),
    `movedOldPx=${movedOld} movedNewPx=${Math.round(movedNew * 10) / 10} stickNeu=${sNew.some((f) => f.stick)}`);
}

// Negativ-Block: normale Gesten ausserhalb der Truhe (kein Matrix-FAIL-Teil).
async function negativeSuite(page, touch) {
  // N1: normaler Drag bewegt den Spieler.
  const x0 = await playerX(page);
  await touch.touchStart(1, STICK_X, STICK_Y);
  const p1 = sample(page, 25);
  await touch.touchMove(1, STICK_X + 30, STICK_Y);
  await page.waitForTimeout(80);
  await touch.touchMove(1, STICK_X + 40, STICK_Y);
  await page.waitForTimeout(80);
  const s1 = await p1;
  await touch.touchEnd();
  const moved = Math.abs(s1.at(-1).x - x0);
  check(negative, "N1 normaler Drag bewegt den Spieler", moved > 5, `movedPx=${Math.round(moved * 10) / 10}`);

  // N2: Pause-Tap im Run pausiert (Puls), danach ESC weiter.
  await touch.touchStart(2, PAUSE_X, PAUSE_Y);
  await page.waitForTimeout(80);
  await touch.touchEnd();
  const paused = await page.waitForFunction(
    () => window.__lf.state().paused === true, undefined, { timeout: 4000 },
  ).then(() => true).catch(() => false);
  check(negative, "N2 Pause-Tap im Run pausiert", paused);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.__lf.state().paused === false, undefined, { timeout: 4000 }).catch(() => {});

  // N3: nach Resume funktioniert der Joystick sofort wieder.
  const x1 = await playerX(page);
  await touch.touchStart(3, STICK_X, STICK_Y);
  const p3 = sample(page, 25);
  await touch.touchMove(3, STICK_X + 34, STICK_Y);
  await page.waitForTimeout(120);
  const s3 = await p3;
  await touch.touchEnd();
  const moved3 = Math.abs(s3.at(-1).x - x1);
  check(negative, "N3 nach Resume bewegt der Joystick wieder", moved3 > 5, `movedPx=${Math.round(moved3 * 10) / 10}`);
}

let result = { milestone: "m10-chest-lock-touch", baseSha, passed: false };
try {
  // Jede Konstellation in einer FRISCHEN Seite: der Auto-Finish-Timer der Truhe
  // (UI.onChestOpen: finishChest bei 1650 ms + 220 ms je Reward) laeuft nach einem
  // Dismiss weiter und wuerde die Truhe des naechsten Cases vorzeitig schliessen.
  const cases = [
    ["C1", c1DriftStartAtChest],
    ["C2", c2DriftWhileOpening],
    ["C3", c3NoStickAfterDismiss],
    ["C4", c4DashSwipe],
    ["C5", c5LongDrift],
    ["C6", c6PauseTap],
    ["C7", c7NoStuckNewGesture],
  ];
  for (const [label, fn] of cases) {
    const { context, page, touch } = await newPage();
    try {
      await setupRun(page);
      await installSampler(page);
      await fn(page, touch);
    } catch (err) {
      check(checks, `${label} (${fn.name}) abgebrochen`, false, String(err));
    } finally {
      await context.close().catch(() => {});
    }
  }
  {
    const { context, page, touch } = await newPage();
    try {
      await setupRun(page);
      await installSampler(page);
      await negativeSuite(page, touch);
    } catch (err) {
      check(negative, "Negativ-Block abgebrochen", false, String(err));
    } finally {
      await context.close().catch(() => {});
    }
  }

  result.checks = checks;
  result.negative = negative;
  result.jsErrors = errors;
  result.passed = checks.every((c) => c.ok) && errors.length === 0;
} catch (err) {
  result.error = String(err && err.stack ? err.stack : err);
  result.checks = checks;
  result.jsErrors = errors;
}

writeFileSync(outFile, JSON.stringify(result, null, 2) + "\n");
console.log(`[m10-chest-lock] ${outFile}: passed=${result.passed} (${checks.filter((c) => c.ok).length}/${checks.length} Konstellationen ok, ${negative.filter((c) => c.ok).length}/${negative.length} Negativ-Checks ok)`);
for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.name} — ${c.detail}`);
for (const c of negative) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.name} — ${c.detail}`);

await browser.close();
await server.stop();
process.exit(result.passed ? 0 : 1);
