#!/usr/bin/env node
// M8-Abnahme Display: 7 Geraete-Profile, Screenshots je Szene, Spielpixel=n*n
// Geraetepixel, keine abgeschnittenen Texte, Touch-Minute auf iPhone-Profil.
//
//   flock /home/ai/games/.lf-perf.lock node scripts/verify-display.mjs
//
// Ausgabe: shots/m8-<profil>-<szene>.png + shots/m8-display.json; Exit 0 = PASS.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene, startRun } from "./harness.mjs";

const BASE_HEIGHT = 360;
const MIN_WIDTH = 480;
const MAX_WIDTH = 860;
const PROFILES = [
  { name: "hd", width: 1920, height: 1080, dpr: 1 },
  { name: "uhd", width: 3840, height: 2160, dpr: 1 },
  { name: "wqhd15", width: 2560, height: 1440, dpr: 1.5 },
  { name: "laptop", width: 1366, height: 768, dpr: 1 },
  { name: "iphone14", width: 844, height: 390, dpr: 3, hasTouch: true, isMobile: true },
  { name: "pixel7", width: 915, height: 412, dpr: 2, hasTouch: true, isMobile: true },
  { name: "ipadpro", width: 1366, height: 1024, dpr: 2, hasTouch: true },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Erwartete View nach der verbindlichen Formel (identisch zu src/logic/view.ts). */
function expectedView(p) {
  const dw = Math.round(p.width * p.dpr);
  const dh = Math.round(p.height * p.dpr);
  if (p.height > p.width) return { portrait: true, width: 480, height: 360, n: null };
  const maxN = Math.floor(Math.min(dh / BASE_HEIGHT, dw / MIN_WIDTH));
  if (maxN < 2) return { portrait: false, fit: true, width: 480, height: 360, n: null };
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(dw / maxN)), Math.floor(dw / maxN));
  return { portrait: false, fit: false, width, height: 360, n: maxN };
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const checks = [];
const errors = [];
const results = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
}

async function canvasInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const rect = canvas.getBoundingClientRect();
    const run = window.__game.scene.getScene("run");
    const scale = window.__game.scale;
    return {
      css: [rect.width, rect.height],
      device: [Math.round(rect.width * window.devicePixelRatio), Math.round(rect.height * window.devicePixelRatio)],
      internal: [scale.width, scale.height],
      dpr: window.devicePixelRatio,
      runInternal: run ? [run.scale.width, run.scale.height] : null,
    };
  });
}

/** Alle sichtbaren PixelText-Rechtecke muessen in der View bleiben (kein Cutoff). */
async function textsInView(page) {
  return page.evaluate(() => {
    const out = [];
    const game = window.__game;
    const scenes = game.scene.getScenes(true);
    for (const scene of scenes) {
      const visit = (obj) => {
        if (!obj || obj.visible === false) return;
        if (obj.type === "Container" && Array.isArray(obj.list)) {
          for (const child of obj.list) visit(child);
          return;
        }
        if (typeof obj.textWidth === "number" && obj.visible !== false) {
          const b = obj.getBounds();
          const parentOk = obj.parentContainer ? obj.parentContainer.visible !== false : true;
          if (!parentOk) return;
          const W = scene.scale.width;
          const H = scene.scale.height;
          if (b.x < -2 || b.y < -2 || b.right > W + 2 || b.bottom > H + 2) {
            out.push({
              scene: scene.scene.key,
              text: obj.valueText ?? "",
              box: [Math.round(b.x), Math.round(b.y), Math.round(b.right), Math.round(b.bottom)],
              view: [W, H],
            });
          }
        }
      };
      for (const obj of scene.children.list) visit(obj);
    }
    return out;
  });
}

async function shot(page, profile, scene) {
  await page.screenshot({ path: `shots/m8-${profile}-${scene}.png` });
}

async function runProfile(p) {
  const expected = expectedView(p);
  const context = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: p.dpr,
    hasTouch: Boolean(p.hasTouch),
    isMobile: Boolean(p.isMobile),
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${p.name}: ${String(e)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${p.name}: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(450);
  await shot(page, p.name, "title");
  const canvas = await canvasInfo(page);
  const viewOk = canvas.internal[0] === expected.width && canvas.internal[1] === expected.height;
  check(`${p.name}: View ${expected.width}x${expected.height}`, viewOk,
    `${canvas.internal[0]}x${canvas.internal[1]} css=${canvas.css.map((n) => Math.round(n)).join("x")}`);
  if (!expected.fit) {
    const n = expected.n;
    const perfect = Math.abs(canvas.device[0] - expected.width * n) <= 1
      && Math.abs(canvas.device[1] - expected.height * n) <= 1;
    check(`${p.name}: Spielpixel = ${n}x${n} Geraetepixel`, perfect,
      `device=${canvas.device.join("x")} erwartet=${expected.width * n}x${expected.height * n} dpr=${canvas.dpr}`);
  } else {
    check(`${p.name}: Fit-Rueckfall (n<2)`, canvas.device[0] <= Math.round(p.width * p.dpr) + 1);
  }

  // Titel/Optionen/Credits
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  await shot(page, p.name, "options");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  await page.keyboard.press("c");
  await waitForScene(page, "credits");
  await page.waitForTimeout(250);
  await shot(page, p.name, "credits");
  await page.keyboard.press("Escape");
  await waitForScene(page, "title");
  await page.waitForTimeout(200);

  // Charakterwahl + Run
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(350);
  await shot(page, p.name, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.addWeapon("ember", 8);
    window.__lf.addWeapon("storm", 8);
    window.__lf.spawnEnemy("bog_rat", 80);
    window.__lf.spawnEnemy("wisp", 20);
  });
  await page.waitForTimeout(700);
  await shot(page, p.name, "run");

  // Level-up
  await page.evaluate(() => window.__lf.giveXp(2400));
  await page.waitForFunction(() => window.__lf.state().levelUpOpen === true, { timeout: 3000 });
  await page.waitForTimeout(500);
  const levelCut = await textsInView(page);
  check(`${p.name}: Level-up ohne Text-Cutoff`, levelCut.length === 0, JSON.stringify(levelCut.slice(0, 3)));
  await shot(page, p.name, "levelup");
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => window.__lf.state());
    if (!st.levelUpOpen) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
    await page.waitForTimeout(120);
  }

  // Truhe
  await page.evaluate(() => window.__lf.openChest());
  await page.waitForTimeout(750);
  await shot(page, p.name, "chest");
  await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    if (run.chestOpen) run.finishChest();
  });
  await page.waitForTimeout(250);

  // Pause
  await page.keyboard.press("Escape");
  await page.waitForTimeout(350);
  const pauseCut = await textsInView(page);
  check(`${p.name}: Pause ohne Text-Cutoff`, pauseCut.length === 0, JSON.stringify(pauseCut.slice(0, 3)));
  await shot(page, p.name, "pause");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Ergebnis
  await page.evaluate(() => window.__lf.finishRun("dawn"));
  await waitForScene(page, "results");
  await page.waitForTimeout(500);
  const resultCut = await textsInView(page);
  check(`${p.name}: Ergebnis ohne Text-Cutoff`, resultCut.length === 0, JSON.stringify(resultCut.slice(0, 3)));
  await shot(page, p.name, "results");

  results.push({ profile: p, expected, canvas });
  await context.close();
}

/** Touch-Minute auf iPhone-Profil (nur Touch, 0 JS-Fehler). */
async function touchMinute() {
  const p = PROFILES.find((x) => x.name === "iphone14");
  const context = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: p.dpr,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`touch: ${String(e)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`touch: ${m.text()}`); });
  const cdp = await context.newCDPSession(page);
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=11`);
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), { timeout: 8000 });
  await waitForScene(page, "title");
  const box = await page.locator("canvas").boundingBox();
  const view = await page.evaluate(() => [window.__game.scale.width, window.__game.scale.height]);
  const toClient = (x, y) => ({
    x: box.x + (x / view[0]) * box.width,
    y: box.y + (y / view[1]) * box.height,
  });
  const tap = async (x, y) => {
    const c = toClient(x, y);
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(180);
  };
  /** Menuepunkt per sichtbarem Text (View-unabhaengig). */
  const tapText = async (label) => {
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
    if (!b) throw new Error(`touch tapText: "${label}" nicht sichtbar`);
    await tap(b.x, b.y);
  };
  /** Erste Level-up-Karte ueber ihre echte Flaeche antippen. */
  const tapCard = async () => {
    const b = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const r = ui?.cards?.[0]?.bg?.getBounds();
      return r ? { x: r.centerX, y: r.centerY } : null;
    });
    if (!b) throw new Error("touch tapCard: Karte nicht sichtbar");
    await tap(b.x, b.y);
  };
  const start = async (id, x, y) => {
    const c = toClient(x, y);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y, id, force: 1 }] });
  };
  const move = async (id, x, y) => {
    const c = toClient(x, y);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x, y: c.y, id, force: 1 }] });
  };
  const end = async () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await tapText("START");
  await waitForScene(page, "charselect");
  await tapText("BRUDER KAEL");
  await tapText("START (ENTER)");
  await waitForScene(page, "run");
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.spawnEnemy("bog_rat", 12);
  });
  await page.waitForTimeout(250);

  const loopStart = Date.now();
  await start(2, 100, 196);
  let tx = 100;
  let ty = 196;
  let levelTaps = 0;
  while (Date.now() - loopStart < 60_000) {
    const st = await page.evaluate(() => window.__lf.state());
    if (st.levelUpOpen) {
      await end();
      await page.waitForTimeout(140);
      await tapCard();
      levelTaps += 1;
      await start(2, tx, ty);
    } else if (st.paused) {
      await end();
      await tapText("FORTSETZEN");
      await start(2, tx, ty);
    }
    const a = ((Date.now() - loopStart) / 1000) * 1.4;
    tx = 100 + Math.cos(a) * 26;
    ty = 196 + Math.sin(a) * 20;
    await move(2, tx, ty);
    await page.waitForTimeout(700);
  }
  await end();
  const state = await page.evaluate(() => window.__lf.state());
  check("Touch-Minute iPhone: Run aktiv >= 50 Sim-Sekunden", state.scene === "run" && state.time >= 50,
    `scene=${state.scene} sim=${Math.round(state.time)}s levelTaps=${levelTaps}`);
  await shot(page, "iphone14", "touch-run");
  await context.close();
}

/** Hochkant: Dreh-Overlay sichtbar, Run pausiert; zurueck im Querformat weiter. */
async function portraitCheck() {
  const context = await browser.newContext({
    viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`portrait: ${String(e)}`));
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=5`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await startRun(page);
  await page.waitForTimeout(400);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(700);
  const portrait = await page.evaluate(() => ({
    overlay: document.getElementById("lf-rotate")?.classList.contains("visible") ?? false,
    paused: window.__lf.stats().paused,
    view: [window.__game.scale.width, window.__game.scale.height],
    internal: [window.__game.scale.width, window.__game.scale.height],
  }));
  check("Hochkant: Dreh-Overlay + Pause", portrait.overlay && portrait.paused,
    JSON.stringify(portrait));
  await shot(page, "portrait", "rotate");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(900);
  const back = await page.evaluate(() => ({
    overlay: document.getElementById("lf-rotate")?.classList.contains("visible"),
    view: [window.__game.scale.width, window.__game.scale.height],
  }));
  check("Querformat zurueck: kein Overlay, View 844x360", !back.overlay && back.view[0] === 844 && back.view[1] === 360,
    JSON.stringify(back));
  await context.close();
}

let passed = false;
try {
  for (const p of PROFILES) await runProfile(p);
  await touchMinute();
  await portraitCheck();
  passed = checks.every((c) => c.ok) && errors.length === 0;
} finally {
  const summary = { milestone: "M8-display", checks, errors, profiles: results, passed };
  writeFileSync("shots/m8-display.json", JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ passed, checks: checks.length, failed: checks.filter((c) => !c.ok).length, jsErrors: errors.length }, null, 2));
  await browser.close();
  server.stop();
}
process.exit(passed ? 0 : 1);
