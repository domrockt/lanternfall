#!/usr/bin/env node
// M8-Lane "input": Touch (Pixel-7-Profil, hasTouch/isMobile), Gamepad
// (gemocktes navigator.getGamepads) und Tastatur-Regression.
// Exit 0 nur wenn alle Checks und Shots gruen sind.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });
const pw = await loadPlaywright();
const { chromium, devices } = pw;
const server = await startServer();
const browser = await chromium.launch();

const shots = [];
const checks = [];
const errors = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};
const snap = async (page, name) => {
  const path = `shots/m8-input-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
  return path;
};
const attachErrors = (page) => {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
};
const state = (page) => page.evaluate(() => window.__lf.state());
const waitRun = async (page) => {
  await waitForScene(page, "run");
  await page.waitForTimeout(350);
};

async function canvasBox(page) {
  return page.locator("canvas").boundingBox();
}
async function viewSize(page) {
  return page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
}
async function gameToClient(page, x, y) {
  const box = await canvasBox(page);
  const view = await viewSize(page);
  return {
    x: box.x + (x / view.w) * box.width,
    y: box.y + (y / view.h) * box.height,
  };
}
async function tapGame(page, x, y) {
  const p = await gameToClient(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(180);
}

/** M8: Menuepunkt ueber seinen sichtbaren Text finden (unabhaengig von der View-Breite). */
async function tapText(page, label) {
  const b = await page.evaluate((wanted) => {
    const visit = (obj) => {
      if (!obj || obj.visible === false) return null;
      if (typeof obj.textWidth === "number" && obj.valueText === wanted) return obj.getBounds();
      if (obj.type === "Container" && Array.isArray(obj.list)) {
        for (const c of obj.list) { const r = visit(c); if (r) return r; }
      }
      return null;
    };
    for (const scene of window.__game.scene.getScenes(true)) {
      for (const obj of scene.children.list) {
        const r = visit(obj);
        if (r) return { x: r.centerX, y: r.centerY };
      }
    }
    return null;
  }, label);
  if (!b) throw new Error(`tapText: "${label}" nicht sichtbar`);
  await tapGame(page, b.x, b.y);
}

/** M8: erste Level-up-Karte ueber die echte Kartenflaeche antippen. */
async function tapLevelCard(page, index = 0) {
  const b = await page.evaluate((i) => {
    const ui = window.__game.scene.getScene("ui");
    const card = ui?.cards?.[i];
    if (!card?.bg) return null;
    const r = card.bg.getBounds();
    return { x: r.centerX, y: r.centerY };
  }, index);
  if (!b) throw new Error("tapLevelCard: Karte nicht sichtbar");
  await tapGame(page, b.x, b.y);
}

// ── Touch: eine Minute nur per Touch, Menues per Tippen ───────────────────
async function runTouchSuite() {
  const pixel7 = devices["Pixel 7"] ?? {};
  const context = await browser.newContext({
    ...pixel7,
    viewport: { width: 915, height: 412 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  attachErrors(page);
  await page.bringToFront();
  const cdp = await context.newCDPSession(page);

  const touchStart = async (id, x, y) => {
    const p = await gameToClient(page, x, y);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
  };
  const touchMove = async (id, x, y) => {
    const p = await gameToClient(page, x, y);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: p.x, y: p.y, id, radiusX: 4, radiusY: 4, force: 1 }],
    });
  };
  const touchEnd = async (id) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=11`);
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(450);

  check(
    "index.html: touch-action none + kein Textselect",
    await page.evaluate(() => {
      const css = getComputedStyle(document.body);
      const canvas = getComputedStyle(document.querySelector("canvas"));
      const viewport = document.querySelector("meta[name=viewport]")?.content ?? "";
      return css.touchAction === "none" && canvas.touchAction === "none"
        && css.userSelect === "none" && viewport.includes("user-scalable=no");
    }),
  );

  await snap(page, "touch-menus");
  // Titel: START per Tippen, Charakterwahl: Kael per Tippen, START per Tippen.
  await tapText(page, "START");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(250);
  // M10-input-fix: CharSelect rendert den Namen als PixelText-Wert (Mixed Case),
  // nicht mehr als Knopf-Label "BRUDER KAEL".
  await tapText(page, "Bruder Kael");
  await tapText(page, "START (ENTER)");
  await waitRun(page);
  check("Touch: Menues per Tippen bis in den Run", (await state(page)).scene === "run");
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(false);
    window.__lf.spawnEnemy("bog_rat", 8);
  });
  await page.waitForTimeout(300);

  // Joystick-Drag: links aufsetzen, nach rechts ziehen -> Spieler bewegt sich.
  const before = await state(page);
  await touchStart(1, 92, 200);
  await page.waitForTimeout(120);
  for (const x of [100, 110, 120, 130, 140]) {
    await touchMove(1, x, 200);
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(650);
  await snap(page, "joystick-touch");
  const afterDrag = await state(page);
  check(
    "Touch-Joystick bewegt den Spieler",
    Number(afterDrag.playerX) > Number(before.playerX) + 5,
    `x ${before.playerX} -> ${afterDrag.playerX}`,
  );
  // Mehrfinger: waehrend der Joystick-Finger (id 1) noch aktiv ist, tippt ein
  // zweiter Finger den Pause-Knopf oben rechts.
  const view = await viewSize(page);
  const pauseCenter = { x: view.w - 10 - 15, y: 10 + 9 };
  await tapGame(page, pauseCenter.x, pauseCenter.y);
  await page.waitForTimeout(300);
  check("Touch: Pause per zweitem Finger bei aktivem Joystick", (await state(page)).paused === true);
  await touchEnd(1);
  await page.waitForTimeout(150);
  await snap(page, "pause-touch");
  await tapText(page, "FORTSETZEN");
  await page.waitForTimeout(220);
  check("Touch: FORTSETZEN per Tippen", (await state(page)).paused === false);

  // Level-up: Karte per Tippen waehlen.
  await page.evaluate(() => window.__lf.giveXp(800));
  await page.waitForFunction(() => window.__lf.state().levelUpOpen === true, { timeout: 3000 });
  await page.waitForTimeout(220);
  await snap(page, "levelup-touch");
  const loadoutBefore = await page.evaluate(() =>
    JSON.stringify([window.__lf.state().weapons, window.__lf.state().passives]));
  await tapLevelCard(page, 0);
  // giveXp(800) kann mehrere Level-ups stauen: jede weitere Karte per Tippen.
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(160);
    const st = await state(page);
    if (!st.levelUpOpen) break;
    await tapLevelCard(page, 0);
  }
  const afterLevel = await state(page);
  const loadoutAfter = await page.evaluate(() =>
    JSON.stringify([window.__lf.state().weapons, window.__lf.state().passives]));
  check(
    "Touch: Level-up-Karten per Tippen gewaehlt",
    afterLevel.levelUpOpen === false && loadoutAfter !== loadoutBefore,
    `loadoutChanged=${loadoutAfter !== loadoutBefore}`,
  );

  // Truhe: Panel per Tippen uebernehmen.
  await page.evaluate(() => window.__lf.openChest());
  await page.waitForTimeout(600);
  await snap(page, "chest-touch");
  await page.waitForTimeout(120);
  const chestView = await viewSize(page);
  await tapGame(page, chestView.w / 2, chestView.h / 2);
  await page.waitForTimeout(350);
  check("Touch: Truhe per Tippen uebernommen", (await state(page)).chestOpen === false);

  // Eine Minute Spiel nur per Touch: Joystick halten und level-ups antippen.
  const loopStart = Date.now();
  await touchStart(2, 100, 196);
  let touchX = 100;
  let touchY = 196;
  let levelTaps = 0;
  while (Date.now() - loopStart < 60_000) {
    const st = await state(page);
    if (st.levelUpOpen) {
      await touchEnd(2);
      await page.waitForTimeout(130);
      await tapLevelCard(page, 0);
      levelTaps += 1;
      await touchStart(2, touchX, touchY);
    } else if (st.paused) {
      // Sicherheitsnetz: niemals in der Touch-Minute stecken bleiben.
      await touchEnd(2);
      await tapText(page, "FORTSETZEN");
      await touchStart(2, touchX, touchY);
    }
    const angle = ((Date.now() - loopStart) / 1000) * 1.4;
    touchX = 100 + Math.cos(angle) * 26;
    touchY = 196 + Math.sin(angle) * 20;
    await touchMove(2, touchX, touchY);
    await page.waitForTimeout(700);
  }
  await touchEnd(2);
  const minuteState = await state(page);
  check(
    "Touch: eine Minute Spiel ohne Tastatur/Gamepad",
    minuteState.scene === "run" && minuteState.time >= 50,
    `scene=${minuteState.scene}, sim=${minuteState.time}s, levelTaps=${levelTaps}`,
  );
  await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 18));
  await page.waitForTimeout(350);
  await snap(page, "touch-run");

  // Pause -> AUFGABE per Tippen -> Results; TITEL per Tippen.
  await tapGame(page, pauseCenter.x, pauseCenter.y);
  await page.waitForTimeout(220);
  await tapText(page, "AUFGABE");
  await waitForScene(page, "results");
  await page.waitForTimeout(350);
  await snap(page, "touch-results");
  await tapText(page, "TITEL");
  await waitForScene(page, "title");
  check("Touch: Results/Titel per Tippen", (await state(page)).scene === "title");

  await context.close();
}

// ── Gamepad: gemocktes navigator.getGamepads (Hotplug + Stick/A/B/Start) ───
async function runGamepadSuite() {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  attachErrors(page);
  await page.bringToFront();
  await page.addInitScript(() => {
    const pad = {
      index: 0,
      id: "Mock Pad (M8-input)",
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__mockPad = pad;
    window.__mockPadConnected = false;
    Object.defineProperty(navigator, "getGamepads", {
      configurable: true,
      value: () => (window.__mockPadConnected ? [window.__mockPad] : []),
    });
  });

  const setPad = async (axes, pressed = []) => {
    await page.evaluate(({ axes, pressed }) => {
      const pad = window.__mockPad;
      pad.axes = axes;
      pad.buttons.forEach((b, i) => {
        const down = pressed.includes(i);
        b.pressed = down;
        b.value = down ? 1 : 0;
        b.touched = down;
      });
    }, { axes, pressed });
    await page.waitForTimeout(170);
  };
  const pressButton = async (index) => {
    await setPad([0, 0, 0, 0], [index]);
    await page.waitForTimeout(120);
    await setPad([0, 0, 0, 0], []);
    await page.waitForTimeout(90);
  };

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=23`);
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(400);
  // Hotplug: erst nach dem Titel verbinden (Polling/Plugin muss ihn finden).
  await page.evaluate(() => { window.__mockPadConnected = true; });
  await page.waitForTimeout(300);
  await pressButton(0);
  await waitForScene(page, "charselect");
  check("Gamepad Hotplug: A startet Charakterwahl", true);

  await pressButton(15);
  await page.waitForTimeout(120);
  await pressButton(0);
  await waitRun(page);
  const char = await state(page);
  check("Gamepad: D-Pad + A waehlt Kael und startet", char.character === "kael", char.character);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(false);
  });

  const gpBefore = await state(page);
  await setPad([1, 0, 0, 0]);
  await page.waitForTimeout(900);
  const gpAfter = await state(page);
  await setPad([0, 0, 0, 0]);
  check(
    "Gamepad: linker Stick bewegt den Spieler",
    Number(gpAfter.playerX) > Number(gpBefore.playerX) + 5,
    `x ${gpBefore.playerX} -> ${gpAfter.playerX}`,
  );
  await snap(page, "gamepad-run");

  // Hotplug-Abbau: getrenntes Pad darf nicht weiterbewegen, Reconnect wieder.
  await page.evaluate(() => { window.__mockPadConnected = false; });
  await page.waitForTimeout(350);
  const offBefore = await state(page);
  await setPad([1, 0, 0, 0]);
  await page.waitForTimeout(700);
  const offAfter = await state(page);
  check(
    "Gamepad: getrenntes Pad bewegt nicht",
    Math.abs(Number(offAfter.playerX) - Number(offBefore.playerX)) <= 1,
    `x ${offBefore.playerX} -> ${offAfter.playerX}`,
  );
  await page.evaluate(() => { window.__mockPadConnected = true; });
  await page.waitForTimeout(350);
  const onBefore = await state(page);
  await page.waitForTimeout(700);
  const onAfter = await state(page);
  await setPad([0, 0, 0, 0]);
  check(
    "Gamepad: Reconnect bewegt wieder",
    Number(onAfter.playerX) > Number(onBefore.playerX) + 3,
    `x ${onBefore.playerX} -> ${onAfter.playerX}`,
  );

  // Start = Pause, B = zurueck (resume), Start+A = Fortsetzen.
  const optionsVisible = () => page.evaluate(() =>
    window.__game.scene.getScene("ui").options.visible);
  await pressButton(9);
  check("Gamepad: Start pausiert", (await state(page)).paused === true);
  await snap(page, "gamepad-pause-focus");
  // Fokus sichtbar: D-Pad rechts -> OPTIONEN, A oeffnet, Start darf die Pause
  // im Optionsmenue nicht aufheben, B schliesst nur das Menue.
  await pressButton(15);
  await pressButton(0);
  await page.waitForTimeout(200);
  check(
    "Gamepad: A oeffnet Optionen, Fokus sichtbar, Pause bleibt",
    (await optionsVisible()) === true && (await state(page)).paused === true,
  );
  await pressButton(9);
  check(
    "Gamepad: Start im Optionsmenue hebt Pause nicht auf",
    (await optionsVisible()) === true && (await state(page)).paused === true,
  );
  await pressButton(1);
  await page.waitForTimeout(180);
  check(
    "Gamepad: B schliesst Optionen, Pause bleibt",
    (await optionsVisible()) === false && (await state(page)).paused === true,
  );
  await pressButton(1);
  await page.waitForTimeout(180);
  check("Gamepad: B setzt Pause fort", (await state(page)).paused === false);
  await pressButton(9);
  await pressButton(0);
  await page.waitForTimeout(180);
  check("Gamepad: A bestaetigt Fokus (Fortsetzen)", (await state(page)).paused === false);

  // Level-up und Truhe per Pad-Aktionen.
  await page.evaluate(() => window.__lf.giveXp(900));
  await page.waitForFunction(() => window.__lf.state().levelUpOpen === true, { timeout: 3000 });
  await page.waitForTimeout(150);
  await snap(page, "gamepad-levelup");
  const gpLoadoutBefore = await page.evaluate(() =>
    JSON.stringify([window.__lf.state().weapons, window.__lf.state().passives]));
  await pressButton(0);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(140);
    if (!(await state(page)).levelUpOpen) break;
    await pressButton(0);
  }
  const gpLevel = await state(page);
  const gpLoadoutAfter = await page.evaluate(() =>
    JSON.stringify([window.__lf.state().weapons, window.__lf.state().passives]));
  check(
    "Gamepad: Level-up per A",
    gpLevel.levelUpOpen === false && gpLoadoutAfter !== gpLoadoutBefore,
    `loadoutChanged=${gpLoadoutAfter !== gpLoadoutBefore}`,
  );

  await page.evaluate(() => window.__lf.openChest());
  await page.waitForTimeout(450);
  await pressButton(0);
  await page.waitForTimeout(300);
  check("Gamepad: Truhe per A uebernommen", (await state(page)).chestOpen === false);

  // Results: Fokus rechts + A -> Titel.
  await page.evaluate(() => window.__lf.finishRun("dawn"));
  await waitForScene(page, "results");
  await page.waitForTimeout(350);
  await snap(page, "gamepad-results");
  await pressButton(15);
  await pressButton(0);
  await waitForScene(page, "title");
  check("Gamepad: Results per D-Pad+A verlaesst zum Titel", (await state(page)).scene === "title");

  await context.close();
}

// ── Tastatur-Regression: unveraenderte Bewegung/ESC ───────────────────────
async function runKeyboardSuite() {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  attachErrors(page);
  await page.bringToFront();
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=31`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    // Kein Level-up-Overlay soll den ESC-Pause-Test maskieren.
    window.__lf.setSuppressLevelUps(true);
  });

  const kbBefore = await state(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(850);
  await page.keyboard.up("ArrowRight");
  // Phaser verarbeitet Keydowns in der naechsten Frame-Queue; kommt Escape im
  // selben Browser-Task wie das ArrowRight-Keyup, geht die Pause-Flanke verloren.
  // Eine Frame-Luecke macht den Check deterministisch (Merge-Befund M8-input).
  await page.waitForTimeout(120);
  const kbAfter = await state(page);
  check(
    "Tastatur: Pfeil rechts bewegt den Spieler unveraendert",
    Number(kbAfter.playerX) > Number(kbBefore.playerX) + 5,
    `x ${kbBefore.playerX} -> ${kbAfter.playerX}`,
  );
  await page.evaluate(() => { window.__esc = []; window.addEventListener("keydown", (e) => window.__esc.push(e.key)); });
  await page.keyboard.press("Escape");
  const pausedOk = await page.waitForFunction(
    () => window.__lf.state().paused === true, { timeout: 3000 },
  ).then(() => true).catch(() => false);
  const escDetail = JSON.stringify(await page.evaluate(() => ({
    paused: window.__lf.state().paused,
    levelUp: window.__lf.state().levelUpOpen,
    chest: window.__lf.state().chestOpen,
    keys: window.__esc,
    listeners: window.__game.scene.getScene("ui").input.keyboard.listenerCount("keydown"),
    optionsVisible: window.__game.scene.getScene("ui").options.visible,
    runPausedBefore: window.__game.scene.getScene("run").paused,
  })));
  check("Tastatur: ESC pausiert", pausedOk, escDetail);
  await page.evaluate(() => { window.__esc = []; });
  await page.keyboard.press("Escape");
  const resumedOk = await page.waitForFunction(
    () => window.__lf.state().paused === false, { timeout: 3000 },
  ).then(() => true).catch(() => false);
  const resumeDetail = JSON.stringify(await page.evaluate(() => ({
    paused: window.__lf.state().paused, keys: window.__esc,
    listeners: window.__game.scene.getScene("ui").input.keyboard.listenerCount("keydown"),
    optionsVisible: window.__game.scene.getScene("ui").options.visible,
  })));
  check("Tastatur: ESC setzt fort", resumedOk, resumeDetail);
  await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 12));
  await page.waitForTimeout(300);
  await snap(page, "keyboard-run");
  await context.close();
}

let result = {};
try {
  await runTouchSuite();
  await runGamepadSuite();
  await runKeyboardSuite();
} catch (err) {
  errors.push(String(err));
  console.error(err);
} finally {
  const missing = shots.filter((p) => !existsSync(p) || statSync(p).size < 10_000);
  check("alle Shots vorhanden (>10KB)", missing.length === 0, missing.join(", "));
  check("keine JS-Fehler", errors.length === 0, errors.join(" | "));
  const passed = checks.every((c) => c.ok);
  result = { milestone: "M8-input", passed, checks, shots, jsErrors: errors };
  writeFileSync("shots/m8-input.json", JSON.stringify(result, null, 2));
  await browser.close();
  server.stop();
  console.log(`\n${passed ? "M8-input: PASS" : "M8-input: FAIL"} (${checks.filter((c) => c.ok).length}/${checks.length} Checks)`);
  process.exit(passed ? 0 : 1);
}
