#!/usr/bin/env node
// M10-options-touch-focus K1/K3: Zustandsmatrix der Menü-Fokus-/Pressed-Zustände.
//
//   node scripts/m10-options-focus.mjs --tag before
//   node scripts/m10-options-focus.mjs --tag after
//
// Läuft alle Menü-Screens (Title, Credits, CharSelect, Pause, Results plus das
// Options-Overlay) in zwei Browser-Kontexten ab:
//   - Desktop (Maus + Tastatur, 960x540)
//   - Touch (Pixel-7-Profil, hasTouch, 915x412)
// Je Screen/Eingabeart wird der sichtbare Fokus-/Pressed-Zustand der Menüknöpfe
// und Optionszeilen ausgelesen (Outline sichtbar? Textfarbe? Pressed-Dunkler?)
// plus Screenshot und Renderer-String (Pflicht: iGPU-Beweis).
//
// Ausgabe: shots/m10-options-focus-<tag>.json + shots/m10-options-focus-<tag>-*.png

import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const tag = opt("tag", "before");
const outJson = opt("out", `shots/m10-options-focus-${tag}.json`);

// Palette-Indizes (src/palette.ts): C.lantern=21, C.bone=10, C.candleWhite=12.
const LANTERN = 21;
const BONE = 10;

const PROBE = () => {
  // Palette-Indizes src/palette.ts: C.lantern=21, C.bone=10 (inline, da der
  // Funktionskoerper im Browser laeuft und Node-Konstanten nicht kennt).
  const LANTERN = 21;
  const isPixelText = (o) => o && Array.isArray(o.glyphs) && typeof o.value === "string";
  const walk = (obj, out, depth) => {
    if (!obj || depth > 6) return;
    const list = Array.isArray(obj.list) ? obj.list : null;
    if (list) {
      const outline = list.find((c) => c && c.type === "Rectangle" && c.isStroked);
      const label = list.find((c) => isPixelText(c));
      if (outline && label) {
        const bg = list.find((c) => c && c.type === "NineSlice");
        out.buttons.push({
          scene: out.scene,
          label: label.value,
          containerVisible: obj.visible !== false,
          outlineVisible: Boolean(outline.visible),
          labelColorIndex: label.colorIndex,
          bgAlpha: bg ? Math.round((bg.alpha ?? 1) * 100) / 100 : null,
          bgTint: bg ? (bg.tintTopLeft ?? null) : null,
          focusLantern: Boolean(outline.visible) && label.colorIndex === LANTERN,
        });
      }
      for (const c of list) walk(c, out, depth + 1);
      return;
    }
    if (isPixelText(obj)) out.texts.push({ scene: out.scene, value: obj.value, colorIndex: obj.colorIndex });
  };
  const result = { buttons: [], texts: [], options: [] };
  for (const key of ["title", "credits", "charselect", "ui", "results"]) {
    const scene = window.__game.scene.getScene(key);
    if (!scene || !scene.sys.isActive() && !scene.sys.isPaused() && key !== "ui") continue;
    const out = { scene: key, buttons: [], texts: [] };
    for (const obj of scene.children.list) walk(obj, out, 0);
    result.buttons.push(...out.buttons);
    result.texts.push(...out.texts);
    if (scene.options) {
      const o = scene.options;
      const rows = Array.isArray(o.rows) ? o.rows : [];
      result.options.push({
        scene: key,
        visible: Boolean(o.visible),
        selected: typeof o.selected === "number" ? o.selected : -1,
        rows: rows.map((r) => ({
          labelText: r.label.value,
          labelColorIndex: r.label.colorIndex,
          outlineVisible: Boolean(r.outline.visible),
        })),
      });
    }
  }
  return result;
};

const RENDERER = () => window.__lf.rendererInfo();

async function newPage(browser, { touch = false } = {}) {
  const context = await browser.newContext(touch
    ? { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true }
    : { viewport: { width: 960, height: 540 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${serverPort}/?debug=1`, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__lf && window.__game), undefined, { timeout: 45000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(400);
  return { context, page, errors };
}

const canvasBox = (page) => page.locator("canvas").boundingBox();
async function gameToClient(page, x, y) {
  const box = await canvasBox(page);
  const view = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
  return { x: box.x + (x / view.w) * box.width, y: box.y + (y / view.h) * box.height };
}
/** Zentrum des interaktiven Knopfs mit Label (logische Koordinaten). */
async function buttonCenter(page, sceneKey, label) {
  return page.evaluate(([scene, wanted]) => {
    const isPixelText = (o) => o && Array.isArray(o.glyphs) && typeof o.value === "string";
    const visit = (obj, parent) => {
      if (!obj || obj.visible === false) return null;
      if (isPixelText(obj) && obj.value === wanted && parent && Array.isArray(parent.list)) {
        const hit = parent.list.find((c) => c && c.visible !== false && c.input && c.input.enabled);
        const b = (hit ?? obj).getBounds();
        return { x: b.centerX, y: b.centerY };
      }
      if (obj.type === "Container" && Array.isArray(obj.list)) {
        for (const c of obj.list) { const r = visit(c, obj); if (r) return r; }
      }
      return null;
    };
    const s = window.__game.scene.getScene(scene);
    if (!s) return null;
    for (const obj of s.children.list) {
      const r = visit(obj, null);
      if (r) return r;
    }
    return null;
  }, [sceneKey, label]);
}

let shotIndex = 0;
async function shot(page, name, matrix, screen, mode, note = "") {
  const file = `shots/m10-options-focus-${tag}-${screen}-${mode}-${String(shotIndex).padStart(2, "0")}.png`;
  shotIndex++;
  await page.screenshot({ path: file });
  const state = await page.evaluate(PROBE);
  const renderer = await page.evaluate(RENDERER);
  matrix.entries.push({ screen, mode, note, state, screenshot: file, renderer: renderer.renderer ?? "", context: renderer.context ?? "" });
  return state;
}

ensureBuild();
const server = await startServer();
const serverPort = server.port;
const playwright = await loadPlaywright();
const browser = await playwright.chromium.launch();

const matrix = {
  lane: "m10-options-touch-focus",
  tag,
  startedAt: new Date().toISOString(),
  palette: { lantern: LANTERN, bone: BONE },
  entries: [],
};

try {
  // ---------- Desktop-Kontext: Maus + Tastatur ----------
  {
    const { page, errors } = await newPage(browser);

    // --- Title ---
    await shot(page, "title-idle", matrix, "title", "keyboard", "idle ohne Eingabe");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(120);
    await shot(page, "title-after-ArrowDown", matrix, "title", "keyboard", "ArrowDown -> Auswahl verschiebt sich");
    const hoverC = await buttonCenter(page, "title", "START");
    const hoverP = hoverC ? await gameToClient(page, hoverC.x, hoverC.y) : { x: 0, y: 0 };
    await page.mouse.move(hoverP.x, hoverP.y);
    await page.waitForTimeout(120);
    await shot(page, "title-hover-START", matrix, "title", "mouse", "Hover über START");
    // Pressed auf OPTIONEN (nicht destruktiv, Overlay geht auf).
    const optC = await buttonCenter(page, "title", "OPTIONEN");
    const optP = await gameToClient(page, optC.x, optC.y);
    await page.mouse.move(optP.x, optP.y);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await shot(page, "title-pressed-OPTIONEN", matrix, "title", "mouse", "pointerdown gehalten auf OPTIONEN (Pressed)");
    await page.mouse.up();
    await page.waitForTimeout(200);
    // --- Options-Overlay (Title) ---
    await shot(page, "title-options-open", matrix, "options", "mouse", "Overlay nach Klick OPTIONEN");
    // Maus: Zeile 0 (MUSIK +) und Zeile 6 (ZURÜCK schliesst) anklicken.
    const viewD = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
    const rowYD = (row) => 84 + Math.round((360 - 270) / 2) + row * 20 + 3;
    {
      const p0 = await gameToClient(page, viewD.w / 2, rowYD(0));
      await page.mouse.click(p0.x, p0.y);
      await page.waitForTimeout(150);
      const s0 = await page.evaluate(PROBE);
      const o0 = s0.options.find((o) => o.scene === "title");
      matrix.entries.push({ screen: "options", mode: "mouse", note: "Klick Zeile 0 (MUSIK)",
        overlayOpen: Boolean(o0?.visible), selected: o0?.selected ?? -1, rows: o0?.rows ?? [] });
      const p6 = await gameToClient(page, viewD.w / 2, rowYD(6));
      await page.mouse.click(p6.x, p6.y);
      await page.waitForTimeout(150);
      const s6 = await page.evaluate(PROBE);
      matrix.entries.push({ screen: "options", mode: "mouse", note: "Klick Zeile 6 (ZURÜCK schliesst)",
        overlayOpen: Boolean(s6.options.find((o) => o.scene === "title")?.visible) });
    }
    // Tastatur-Fokus: Overlay ist nach dem ZURÜCK-Klick geschlossen -> einmal
    // 'o' oeffnet, dann 6x ArrowDown zur Zeile 6 (ZURÜCK).
    await page.keyboard.press("o");
    await page.waitForTimeout(200);
    for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(60); }
    await shot(page, "options-row6-keyboard", matrix, "options", "keyboard", "6x ArrowDown -> Zeile 6 (ZURÜCK) fokussiert");
    const beforeRows = await page.evaluate(PROBE);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);
    const afterRows = await page.evaluate(PROBE);
    matrix.entries.push({
      screen: "options", mode: "keyboard",
      note: "Enter auf Zeile 6 schliesst Overlay (7/7 anwählbar)",
      closedOverlay: !Boolean(afterRows.options.find((o) => o.scene === "title")?.visible),
      screenshot: `shots/m10-options-focus-${tag}-options-keyboard-closecheck.json-inline`,
      state: { before: beforeRows.options, after: afterRows.options },
    });

    // --- Credits (via 'c') ---
    await page.keyboard.press("c");
    await page.waitForTimeout(600);
    await waitForScene(page, "credits");
    await shot(page, "credits-idle", matrix, "credits", "keyboard", "idle, ZURÜCK fokussiert");
    const crC = await buttonCenter(page, "credits", "ZURÜCK");
    if (crC) {
      const crP = await gameToClient(page, crC.x, crC.y);
      await page.mouse.move(crP.x, crP.y);
      await page.waitForTimeout(120);
      await shot(page, "credits-hover", matrix, "credits", "mouse", "Hover über ZURÜCK");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await waitForScene(page, "title");
    await page.waitForTimeout(300);

    // --- CharSelect (via Enter) ---
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    await waitForScene(page, "charselect");
    await shot(page, "charselect-idle", matrix, "charselect", "keyboard", "idle, START fokussiert");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    await shot(page, "charselect-ArrowRight", matrix, "charselect", "keyboard", "ArrowRight -> Charakterwechsel, Knopf-Fokus?");
    const csC = await buttonCenter(page, "charselect", "ZURÜCK");
    if (csC) {
      const csP = await gameToClient(page, csC.x, csC.y);
      await page.mouse.move(csP.x, csP.y);
      await page.waitForTimeout(120);
      await shot(page, "charselect-hover-ZURUECK", matrix, "charselect", "mouse", "Hover über ZURÜCK");
      await page.mouse.move(10, 10);
      await page.waitForTimeout(120);
    }
    // Pressed auf START (destruktiv -> Run; segue).
    const stC = await buttonCenter(page, "charselect", "START (ENTER)");
    const stP = await gameToClient(page, stC.x, stC.y);
    await page.mouse.move(stP.x, stP.y);
    await page.mouse.down();
    await page.waitForTimeout(120);
    await shot(page, "charselect-pressed-START", matrix, "charselect", "mouse", "pointerdown gehalten auf START (Pressed)");
    await page.mouse.up();
    await waitForScene(page, "run", 15000);
    await page.waitForTimeout(800);

    // --- Pause (ESC) ---
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await shot(page, "pause-idle", matrix, "pause", "keyboard", "idle, FORTSETZEN fokussiert");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(120);
    await shot(page, "pause-ArrowDown", matrix, "pause", "keyboard", "ArrowDown -> OPTIONEN fokussiert");
    const auC = await buttonCenter(page, "ui", "AUFGABE");
    if (auC) {
      const auP = await gameToClient(page, auC.x, auC.y);
      await page.mouse.move(auP.x, auP.y);
      await page.waitForTimeout(120);
      await shot(page, "pause-hover-AUFGABE", matrix, "pause", "mouse", "Hover über AUFGABE (nur Hover, kein Klick)");
    }
    // Pressed auf OPTIONEN im Pause (Overlay geht auf, dann ESC).
    const poC = await buttonCenter(page, "ui", "OPTIONEN");
    if (poC) {
      const poP = await gameToClient(page, poC.x, poC.y);
      await page.mouse.move(poP.x, poP.y);
      await page.mouse.down();
      await page.waitForTimeout(120);
      await shot(page, "pause-pressed-OPTIONEN", matrix, "pause", "mouse", "pointerdown gehalten auf OPTIONEN (Pressed)");
      await page.mouse.up();
      await page.waitForTimeout(200);
      await shot(page, "pause-options-open", matrix, "options", "mouse", "Options-Overlay aus Pause");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
    // ESC: Pause schliessen? m10-esc-pause-fix: ESC resumed.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // --- Results ---
    await page.evaluate(() => window.__lf.finishRun("death"));
    await page.waitForTimeout(800);
    await waitForScene(page, "results", 10000);
    await shot(page, "results-idle", matrix, "results", "keyboard", "idle, NEU fokussiert");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    await shot(page, "results-ArrowRight", matrix, "results", "keyboard", "ArrowRight -> TITEL fokussiert");
    const reC = await buttonCenter(page, "results", "NEUE RUNDE");
    if (reC) {
      const reP = await gameToClient(page, reC.x, reC.y);
      await page.mouse.move(reP.x, reP.y);
      await page.waitForTimeout(120);
      await shot(page, "results-hover-NEU", matrix, "results", "mouse", "Hover über NEU");
    }

    if (errors.length) matrix.desktopJsErrors = errors;
    await page.context().close();
  }

  // ---------- Touch-Kontext ----------
  {
    const { page, errors } = await newPage(browser, { touch: true });

    await shot(page, "title-idle", matrix, "title", "touch", "idle, Pixel-7-Profil");
    // Tap auf OPTIONEN -> Overlay.
    const toC = await buttonCenter(page, "title", "OPTIONEN");
    const toP = await gameToClient(page, toC.x, toC.y);
    await page.touchscreen.tap(toP.x, toP.y);
    await page.waitForTimeout(300);
    await shot(page, "title-options-open", matrix, "options", "touch", "Overlay nach Tap OPTIONEN");
    // 7/7 Zeilen antippen: Zeilen 0..5 aendern Werte, Zeile 6 schliesst.
    for (let row = 0; row < 7; row++) {
      // Zeilen-Pitch 20, erste Zeile bei y = 84 + oy + 3 (oy = 45 bei 915x412 -> H=360? oy=round((360-270)/2)=45).
      const view = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
      const oy = Math.round((360 - 270) / 2);
      const y = 84 + oy + row * 20 + 3;
      const p = await gameToClient(page, view.w / 2, y);
      await page.touchscreen.tap(p.x, p.y);
      await page.waitForTimeout(200);
      const st = await page.evaluate(PROBE);
      const opt = st.options.find((o) => o.scene === "title");
      const vis = opt?.visible ?? false;
      matrix.entries.push({
        screen: "options", mode: "touch", note: `Tap Zeile ${row}`,
        overlayStillOpen: vis,
        selected: opt?.selected ?? -1,
        rows: opt?.rows ?? [],
      });
      if (!vis) break;
    }
    await shot(page, "options-after-row-taps", matrix, "options", "touch", "Endzustand nach Zeilen-Taps");
    // Tap auf START -> charselect.
    const tsC = await buttonCenter(page, "title", "START");
    const tsP = await gameToClient(page, tsC.x, tsC.y);
    await page.touchscreen.tap(tsP.x, tsP.y);
    await page.waitForTimeout(800);
    await waitForScene(page, "charselect", 10000);
    await shot(page, "charselect-tap-START", matrix, "charselect", "touch", "nach Tap START");
    // Tap START -> run; Pause per ESC (Touch-HUD-Pause-Knopf sitzt im
    // TouchControls-Container, nicht im Szenen-Baum suchbar; die Menue-Interaktion
    // im Overlay bleibt echter Touch).
    const csC2 = await buttonCenter(page, "charselect", "START (ENTER)");
    const csP2 = await gameToClient(page, csC2.x, csC2.y);
    await page.touchscreen.tap(csP2.x, csP2.y);
    await waitForScene(page, "run", 15000);
    await page.waitForTimeout(800);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await shot(page, "pause-tap", matrix, "pause", "touch", "Pause-Overlay (Einstieg via ESC, Buttons via Touch)");

    if (errors.length) matrix.touchJsErrors = errors;
    await page.context().close();
  }

  matrix.finishedAt = new Date().toISOString();
  matrix.entryCount = matrix.entries.length;
  writeFileSync(outJson, JSON.stringify(matrix, null, 2));
  console.log(`[m10-options-focus] ${matrix.entryCount} Eintraege -> ${outJson}`);
} finally {
  await browser.close();
  server.stop();
}
