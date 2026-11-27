#!/usr/bin/env node
// M10-Lane "menu-touch-targets": Synthetische Touch-Taps auf allen Menue-Pfaden.
// Profile: 640x360@3 und 780x360@3 (Handy-Formate). Loggt je Ziel Treffer/Misserfolg,
// die echten Interaktiv-Rechtecke (getBounds) und schreibt JSON.
//
// Aufruf: node scripts/verify-menu-touch.mjs [--out shots/m10-menu-touch-before.json]
// Exit 0 nur, wenn alle Checks gruen sind (vor dem Fix erwartet: FAIL mit Belegen).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "shots/m10-menu-touch-before.json";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();

const PROFILES = [
  { name: "640x360@3", width: 640, height: 360, dpr: 3 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
];

const round = (n) => Math.round(n * 10) / 10;

async function newPage(profile) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { context, page, errors };
}

async function boot(page) {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(300);
}

async function viewOf(page) {
  return page.evaluate(() => ({
    w: window.__game.scale.width,
    h: window.__game.scale.height,
    cssW: window.__game.scale.canvas.style.width || "",
    cssH: window.__game.scale.canvas.style.height || "",
  }));
}

/** Tap in logischen Spielpixeln auf den Canvas (CSS-Viewport-Mapping). */
async function tapGame(page, x, y) {
  const box = await page.locator("canvas").boundingBox();
  const view = await viewOf(page);
  await page.touchscreen.tap(
    box.x + (x / view.w) * box.width,
    box.y + (y / view.h) * box.height,
  );
  await page.waitForTimeout(180);
}

/** Alle interaktiven Rechtecke der aktiven Szenen in logischen Pixeln. */
async function collectBounds(page) {
  return page.evaluate(() => {
    const game = window.__game;
    const out = [];
    const walk = (scene, obj) => {
      if (!obj) return;
      if (obj.input) {
        try {
          const b = obj.getBounds();
          out.push({
            scene: scene.scene.key,
            type: obj.type,
            x: Math.round(b.x * 10) / 10,
            y: Math.round(b.y * 10) / 10,
            w: Math.round(b.width * 10) / 10,
            h: Math.round(b.height * 10) / 10,
            visible: obj.visible !== false,
            depth: obj.depth,
          });
        } catch { /* Objekt ohne Bounds */ }
      }
      if (Array.isArray(obj.list)) obj.list.forEach((child) => walk(scene, child));
    };
    game.scene.getScenes(true).forEach((scene) => scene.children.list.forEach((o) => walk(scene, o)));
    return out;
  });
}

async function sceneOf(page) {
  return (await page.evaluate(() => window.__lf.state())).scene;
}

async function optionsOpen(page, sceneKey) {
  return page.evaluate((key) => {
    const s = window.__game.scene.getScene(key);
    return Boolean(s && s.options && s.options.visible);
  }, sceneKey);
}

async function optionState(page) {
  return page.evaluate(() => window.__lf.options());
}

function expectedOption(before, row) {
  const out = { ...before };
  if (row === 0) out.music = Math.round((before.music + 0.1) * 10) / 10;
  if (row === 1) out.sfx = Math.round((before.sfx + 0.1) * 10) / 10;
  if (row === 2) out.shake = !before.shake;
  if (row === 3) out.damageNumbers = !before.damageNumbers;
  if (row === 4) out.muted = !before.muted;
  if (row === 5) out.scale = ({ 0: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 })[before.scale] ?? 2;
  return out;
}

const checks = [];

function addCheck(profile, name, ok, detail) {
  checks.push({ profile: profile.name, name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FAIL"} [${profile.name}] ${name}${detail ? ` (${detail})` : ""}`);
}

const boundsByProfile = {};
const errorsByProfile = {};
const centre = (p) => ({
  cx: Math.round(p.width / 2),
  oy: Math.round((p.height - 270) / 2),
});

function layoutOf(view) {
  const W = view.w;
  const H = view.h;
  const cx = Math.round(W / 2);
  const oy = Math.round((H - 270) / 2);
  const rowW = Math.min(520, W - 40);
  return {
    W, H, cx, oy, rowW,
    arrowL: cx + rowW / 2 - 12 - 100, // valueX - 100
    labelX: cx - rowW / 2 + 12,
  };
}

for (const profile of PROFILES) {
  const { context, page, errors } = await newPage(profile);
  let view;
  let W, H, cx, oy, rowW, arrowL, labelX;

  // Journeys + Bounds je Szene einsammeln.
  await boot(page);
  view = await viewOf(page);
  ({ W, H, cx, oy, rowW, arrowL, labelX } = layoutOf(view));
  boundsByProfile[profile.name] = { view, title: await collectBounds(page) };

  await tapGame(page, cx, 214 + oy); // OPTIONEN
  addCheck(profile, "Titel -> Options per Tap", await optionsOpen(page, "title"));
  boundsByProfile[profile.name].options = await collectBounds(page);
  await page.screenshot({ path: `shots/m10-menu-touch-options-${profile.width}.png` });

  // 7/7 Optionszeilen per Tap treffen (Mitte der Zeile = erhoehen/Toggle).
  for (let i = 0; i < 7; i++) {
    const y = 84 + oy + i * 20;
    if (i === 6) break;
    const before = await optionState(page);
    await tapGame(page, cx, y + 2);
    const after = await optionState(page);
    addCheck(
      profile, `Optionszeile ${i + 1} Tap trifft Wert`,
      JSON.stringify(after) === JSON.stringify(expectedOption(before, i)),
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
  }
  // Die Skalierungszeile hat die View veraendert: Layout neu lesen, bevor die
  // Pfeil-/Label-/ZURUECK-Proben auf festen Zeilenkoordinaten laufen.
  await page.evaluate(() => window.__lf.setOption("scale", 0));
  await page.waitForTimeout(250);
  view = await viewOf(page);
  ({ W, H, cx, oy, rowW, arrowL, labelX } = layoutOf(view));

  // Pfeil-Randprobe in Options: 16 px neben dem "<"-Glyph tippen.
  const beforeMusic = await optionState(page);
  await tapGame(page, arrowL + 16, 84 + oy + 2);
  const afterMusic = await optionState(page);
  addCheck(profile, "Options-Pfeil Randtreffer (16 px neben Glyph)",
    afterMusic.music < beforeMusic.music,
    `${beforeMusic.music} -> ${afterMusic.music}`);

  // Label-Tap: volle Zeilenbreite muss den Wert treffen (frueher: nur Hover).
  const beforeLabel = await optionState(page);
  await tapGame(page, labelX + 5, 84 + oy + 2);
  const afterLabel = await optionState(page);
  addCheck(profile, "Options-Zeilenlabel Tap trifft Wert",
    afterLabel.music !== beforeLabel.music,
    `${beforeLabel.music} -> ${afterLabel.music}`);

  const beforeBack = await optionsOpen(page, "title");
  await tapGame(page, cx, 84 + oy + 6 * 20 + 2);
  addCheck(profile, "ZURUECK-Zeile schliesst per Tap", beforeBack && !(await optionsOpen(page, "title")));
  await waitForScene(page, "title");

  // Edge-Probe: START-Knopf 16 px ueber der sichtbaren Unterkante tippen.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(250);
  view = await viewOf(page);
  ({ W, H, cx, oy, rowW, arrowL, labelX } = layoutOf(view));
  await tapGame(page, cx - 104, 214 + oy + 16); // START, sichtbar 22 hoch
  addCheck(profile, "START-Knopf Randtreffer (Offset 16)", await page.evaluate(
    () => window.__lf.state().scene === "charselect",
  ), await sceneOf(page));

  // Fuer die Folgepruefungen per Tastatur weitergehen, falls der Randtreffer
  // (noch) nicht greift - ein Fehlschlag soll die Reise nicht abbrechen.
  if ((await sceneOf(page)) === "title") {
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.waitForTimeout(150);
  }

  // CharSelect START-Randtreffer (16 px ueber Knopfmitte).
  boundsByProfile[profile.name].charselect = await collectBounds(page);
  await tapGame(page, cx + 40, H - 18 - 16);
  addCheck(profile, "CharSelect START Randtreffer (Offset 16)", await page.evaluate(
    () => window.__lf.state().scene === "run",
  ), await sceneOf(page));
  if ((await sceneOf(page)) === "charselect") {
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.waitForTimeout(200);
  }

  // Pause + Pause-Options per Tap, dann FORTSETZEN.
  await page.waitForTimeout(250);
  boundsByProfile[profile.name].run = await collectBounds(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  await tapGame(page, cx, 201 + oy); // OPTIONEN in Pause
  addCheck(profile, "Pause -> Options per Tap", await optionsOpen(page, "ui"));
  boundsByProfile[profile.name].pauseOptions = await collectBounds(page);
  await tapGame(page, cx, 84 + oy + 6 * 20 + 2); // ZURUECK
  addCheck(profile, "Pause-Options ZURUECK per Tap", !(await optionsOpen(page, "ui")));
  await tapGame(page, 108 + (cx - 240), 201 + oy); // FORTSETZEN
  addCheck(profile, "FORTSETZEN per Tap", await page.evaluate(
    () => window.__lf.state().paused === false,
  ));

  // Results erreichen (debug) und TITEL-Randtreffer tippen.
  await page.evaluate(() => window.__lf.finishRun("giveup"));
  await waitForScene(page, "results");
  await page.waitForTimeout(250);
  boundsByProfile[profile.name].results = await collectBounds(page);
  await tapGame(page, cx + 76, H - 26 + 12); // TITEL, sichtbar 20 hoch, Offset 12
  addCheck(profile, "Results -> TITEL Randtreffer (Offset 12)", await page.evaluate(
    () => window.__lf.state().scene === "title",
  ), await sceneOf(page));

  errorsByProfile[profile.name] = errors;
  addCheck(profile, "keine JS-Fehler", errors.length === 0, errors.join(" | "));
  await context.close();
}

const passed = checks.every((c) => c.ok);
const result = {
  milestone: "M10-menu-touch-targets",
  kind: "touch-probe",
  profiles: PROFILES.map((p) => p.name),
  views: Object.fromEntries(Object.entries(boundsByProfile).map(([k, v]) => [k, v.view ?? null])),
  bounds: boundsByProfile,
  jsErrors: errorsByProfile,
  checks,
  passed,
  summary: {
    checks: checks.length,
    passed: checks.filter((c) => c.ok).length,
    hitRate: round((checks.filter((c) => c.ok).length / checks.length) * 100),
  },
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`\nM10-menu-touch (${OUT}): ${passed ? "PASS" : "FAIL"} ${result.summary.passed}/${result.summary.checks} Checks`);

await browser.close();
server.stop();
process.exit(passed ? 0 : 1);
