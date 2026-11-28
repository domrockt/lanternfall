#!/usr/bin/env node
// m10-levelup-panel-crisp K1/K4: Misst das offene Level-Up-Panel (3 Angebote)
// in 640x360@2, 780x360@3 und 960x540@2. Level-Up-Moment via Debug-Trigger
// (run.giveXp -> maybeOpenLevelUp, Panel oeffnet im Pause-Zustand).
// Scan: Glyph-/Rect-Boxen (5x7, Advance 6, Origin 0/0 am Container-Y),
// Überlappungen zwischen Karten/Titel/Untertitel, fraktionale Skalen,
// Fokus-Kontrast (WCAG) des gewählten Angebots gegen Karten-Hintergrund,
// Angebots-Snapshot für 3 Seeds (Bitgleichheits-Baseline für K4).
// Aufruf: node scripts/m10-levelup-panel.mjs before   (bzw. after)
// Kein flock — Screenshot-/Messlauf, kein Echtzeit-FPS.
// Belege nach ~/games/.evidence/m10-levelup-panel-crisp/ (nicht git-getrackt);
// nur Abnahme-Bilder wandern nach shots/abnahme/.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const GLYPH_H = 7;
const FORMATS = [
  { label: "640", cssW: 640, cssH: 360, dpr: 2 },
  { label: "780", cssW: 780, cssH: 360, dpr: 3 },
  { label: "960", cssW: 960, cssH: 540, dpr: 2 },
];
const SEEDS = [101, 202, 303];
const SHOT_SEED = 101;
const CONTRAST_MIN = 3; // Abnahmekriterium K3: Fokus-Kontrast >= 3:1
const GAP_MIN = 2; // Kriterium K1: keine Überlappung, Zeilen min. 2 px Luft

function r(n) { return Math.round(n * 10) / 10; }

/** Exakte Glyph-Box eines PixelText in Spielpixeln. */
function glyphBox(t) {
  if (!t || t.w <= 0) return null;
  const left = t.align === "center"
    ? t.x - Math.floor(t.w / 2) * t.scaleX
    : t.x;
  return {
    text: t.text,
    left: r(left), right: r(left + t.w * t.scaleX),
    top: r(t.y), bottom: r(t.y + GLYPH_H * t.scaleY),
  };
}

/** Box eines Rect/NineSlice/Image (Origin beruecksichtigt). */
function objBox(o, name, extra = {}) {
  if (!o) return null;
  const w = (o.width ?? 0) * o.scaleX;
  const h = (o.height ?? 0) * o.scaleY;
  const ox = (o.originX ?? 0.5);
  const oy = (o.originY ?? 0.5);
  return {
    name, ...extra,
    left: r(o.x - ox * w), right: r(o.x - ox * w + w),
    top: r(o.y - oy * h), bottom: r(o.y - oy * h + h),
  };
}

function overlap(a, b) {
  if (!a || !b) return null;
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return dx > 0 && dy > 0 ? { dx: r(dx), dy: r(dy), px: r(Math.min(dx, dy)) } : null;
}

function lum(argb) {
  const c = (argb & 0xffffff);
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f((c >> 16) & 255) + 0.7152 * f((c >> 8) & 255) + 0.0722 * f(c & 255);
}
function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return r((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05));
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const tag = process.argv[2] === "before" ? "before" : "after";
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const seedSnapshots = [];
const formats = [];
try {
  // Phase A: Angebots-Snapshot fuer Bitgleichheit (K4-Baseline), Seed-Loop.
  for (const seed of SEEDS) {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`seed${seed}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`seed${seed}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
    await startRun(page);
    const offers = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      run.giveXp(200);
      return (run.currentOffers ?? []).map((o) => ({
        kind: o.kind, id: o.id, name: o.name, level: o.level, isNew: o.isNew, description: o.description,
      }));
    });
    seedSnapshots.push({ seed, offers });
    await context.close();
  }

  // Phase B: Formate — Panel oeffnen, messen, Screenshot.
  for (const fmt of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: fmt.cssW, height: fmt.cssH },
      deviceScaleFactor: fmt.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SHOT_SEED}`);
    await startRun(page);
    await page.evaluate(() => window.__game.scene.getScene("run").giveXp(200));
    await page.waitForTimeout(250);

    const view = await page.evaluate(() => ({
      gameWidth: window.__game.config.width,
      gameHeight: window.__game.config.height,
      canvasCssWidth: window.__game.canvas.style.width,
      canvasCssHeight: window.__game.canvas.style.height,
      levelUpOpen: window.__game.scene.getScene("run").levelUpOpen,
      paused: window.__game.scene.getScene("run").paused,
      selected: window.__game.scene.getScene("ui").selected,
    }));

    const panel = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const g = ui.levelGroup;
      const texts = [];
      const rects = [];
      const images = [];
      const scales = [];
      const scan = (list) => {
        for (const obj of list) {
          if (typeof obj.valueText === "string" && typeof obj.textWidth === "number") {
            texts.push({
              name: obj.name || "", text: obj.valueText, align: obj.align,
              x: obj.x, y: obj.y, scaleX: obj.scaleX, scaleY: obj.scaleY,
              w: obj.textWidth, visible: obj.visible,
            });
            scales.push({ name: obj.name || obj.valueText.slice(0, 12), scaleX: obj.scaleX, scaleY: obj.scaleY });
          } else if (obj.type === "Rectangle") {
            rects.push({
              name: obj.name || "", x: obj.x, y: obj.y, width: obj.width, height: obj.height,
              scaleX: obj.scaleX, scaleY: obj.scaleY, originX: obj.originX, originY: obj.originY,
              fillColor: obj.fillColor, fillAlpha: obj.fillAlpha,
              strokeColor: obj.strokeColor, lineWidth: obj.lineWidth ?? obj.strokeWidth,
              visible: obj.visible,
            });
            scales.push({ name: obj.name || "rect", scaleX: obj.scaleX, scaleY: obj.scaleY });
          } else if (obj.type === "Image") {
            images.push({
              name: obj.name || "", texture: obj.texture && obj.texture.key,
              x: obj.x, y: obj.y, width: obj.width, height: obj.height,
              scaleX: obj.scaleX, scaleY: obj.scaleY, visible: obj.visible,
            });
            scales.push({ name: obj.name || obj.texture?.key, scaleX: obj.scaleX, scaleY: obj.scaleY });
          }
        }
      };
      scan(g.list);
      return { texts, rects, images, scales, selected: ui.selected };
    });

    const shot = `shots/m10-levelup-panel-${tag}-${fmt.label}.png`;
    await page.screenshot({ path: shot });
    await context.close();

    // Boxen bestimmen (nur sichtbare).
    const T = (pred) => glyphBox(panel.texts.find((t) => t.visible && pred(t)));
    const title = T((t) => t.name === "levelup-title");
    const sub = T((t) => t.name === "levelup-sub" && t.text.length > 0);
    const hints = [0, 1].map((i) => T((t) => t.name === `levelup-hint-${i}`));
    const foot = T((t) => t.name === "levelup-foot");
    const bgRects = panel.rects.filter((rc) => rc.visible && rc.name.startsWith("levelup-card-"));
    const bgBoxes = bgRects.map((rc) => objBox(rc, rc.name));
    const slotBox = objBox(panel.rects.find((rc) => rc.visible && rc.lineWidth === 2 && !rc.name), "slot");
    const icon = panel.images.find((i) => i.visible && i.texture?.startsWith("icon_"));
    const iconBox = icon ? objBox(icon, "icon", { texture: icon.texture }) : null;
    const cardTexts = panel.texts.filter((t) => t.visible && !t.name);
    // Karten-Texte nach Y-Stufen gruppieren: Nummer(88), Name(154), Stufe(166), Desc(180/192/204).
    const byY = (lo, hi) => cardTexts.filter((t) => t.y % 1000 >= lo && t.y % 1000 < hi).map(glyphBox).filter(Boolean);
    const oy = Math.round((view.gameHeight - 270) / 2);
    const numbers = byY(88 + oy - 1, 88 + oy + 1);
    const names = byY(154 + oy - 1, 154 + oy + 1);
    const levels = byY(166 + oy - 1, 166 + oy + 1);
    const descs = cardTexts.filter((t) => (t.y - oy) % 1000 >= 180 && (t.y - oy) % 1000 < 205).map(glyphBox).filter(Boolean);
    const dividerBoxes = panel.rects.filter((rc) => rc.visible && rc.height === 1 && !rc.name)
      .map((rc) => objBox(rc, "divider"));
    const dividerBox = dividerBoxes[0] ?? null;

    // Überlappungs-Checks.
    const overlaps = [];
    const push = (a, b) => { const o = overlap(a, b); if (o) overlaps.push({ a: a?.name ?? "text", b: b?.name ?? "text", ...o }); };
    const chromatic = [title, sub, ...hints, foot];
    for (const a of chromatic) for (const b of bgBoxes) push(a, b);
    push(title, sub);
    for (let i = 0; i < bgBoxes.length; i++) {
      for (let j = i + 1; j < bgBoxes.length; j++) push(bgBoxes[i], bgBoxes[j]);
    }
    // In-Karte: Icon/Slot vs Trennlinie vs Textzeilen; Trennlinie darf die
    // Karte nicht verlassen (Vorher-Mangel: Divider ragt raus, kreuzt
    // Panelrahmen und Nachbar-Karte).
    if (dividerBoxes.length) {
      for (let di = 0; di < dividerBoxes.length; di++) {
        const dv = dividerBoxes[di];
        push(dv, iconBox); push(dv, slotBox);
        for (let ci = 0; ci < bgBoxes.length; ci++) {
          if (ci === di) {
            // Eigene Karte: Trennlinie liegt als Deko AUF dem Hintergrund —
            // Kriterium ist Voll-Einschluss (inset), keine Überlappung.
            const insideOwn = dv.left >= bgBoxes[ci].left && dv.right <= bgBoxes[ci].right
              && dv.top >= bgBoxes[ci].top && dv.bottom <= bgBoxes[ci].bottom;
            if (!insideOwn) overlaps.push({ a: `divider${di}`, b: `levelup-card-${ci}`, note: "nicht in eigener Karte enthalten" });
          } else {
            push(dv, bgBoxes[ci]);
          }
        }
      }
    }
    const rows = [...numbers, ...names, ...levels, ...descs];
    if (dividerBox) for (const t of rows) push(t, dividerBox);
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) push(rows[i], rows[j]);
    }

    // Fraktionale Skalen (Sichtfeld levelGroup, Top-Level-Objekte).
    const fractional = panel.scales.filter(
      (s) => !Number.isInteger(s.scaleX) || !Number.isInteger(s.scaleY),
    );

    // Fokus-Kontrast: gewaehlte Karte stroke vs Karten-Fuellfarbe (nightMid).
    const selectedIdx = panel.selected ?? 0;
    const selRect = bgRects[selectedIdx];
    const unselRect = bgRects.find((rc, i) => i !== selectedIdx && rc.strokeColor !== selRect?.strokeColor) ?? bgRects.find((rc) => rc !== selRect);
    const ratioSelected = selRect ? contrast(selRect.strokeColor, selRect.fillColor) : null;
    const ratioUnselected = unselRect ? contrast(unselRect.strokeColor, unselRect.fillColor) : null;

    const inside = [title, sub, foot, iconBox, dividerBox, slotBox, ...rows, ...bgBoxes].every((b) => !b
      || (b.top >= 0 && b.left >= 0 && b.right <= view.gameWidth && b.bottom <= view.gameHeight));
    const pass = overlaps.length === 0 && fractional.length === 0
      && ratioSelected !== null && ratioSelected >= CONTRAST_MIN && inside;

    formats.push({
      label: fmt.label,
      internal: `${fmt.cssW}x${fmt.cssH}@${fmt.dpr}`,
      view,
      boxes: { title, sub, hints, foot, cards: bgBoxes, slot: slotBox, icon: iconBox, dividers: dividerBoxes, numbers, names, levels, descs },
      overlaps,
      fractionalScales: fractional,
      scaleCalls: panel.scales.length,
      focus: {
        selected: selectedIdx,
        strokeColorSelected: selRect ? (selRect.strokeColor & 0xffffff).toString(16) : null,
        ratioSelected, ratioUnselected, contrastMin: CONTRAST_MIN,
      },
      insideGameView: inside,
      screenshot: shot,
      ok: pass,
    });
  }

  // Phase C: Fokus-Verhalten je Eingabeart (K3). Muster options-touch-focus:
  // Startfokus 0 beim Öffnen, stillstehender Zeiger wählt nichts (Hover-Guard).
  const focusCases = [];
  {
    const ctx = await browser.newContext({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`focus: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`focus: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SHOT_SEED}`);
    await startRun(page);
    // Tastatur: Panel oeffnet, Startfokus soll 0 sein.
    const keyboard = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      run.giveXp(200);
      return new Promise((res) => setTimeout(() => res({
        selected: window.__game.scene.getScene("ui").selected,
        levelUpOpen: run.levelUpOpen,
      }), 200));
    });
    focusCases.push({ input: "keyboard-open", ...keyboard, expect: "selected=0" });
    // Panel schliessen: Angebote per Enter picken, bis zu (mehrere Level-Ups;
    // giveXp(200) kann ~7 Level-Ups queuen, der Loop muss komplett abarbeiten).
    for (let i = 0; i < 12; i++) {
      const open = await page.evaluate(() => window.__game.scene.getScene("run").levelUpOpen);
      if (!open) break;
      await page.keyboard.press("Enter");
      await page.waitForTimeout(120);
    }

    // Maus parkt auf Karten-2-Mitte (game 568,203; CSS = game bei 780x360@3),
    // DANN Panel oeffnen -> Guard soll Fokus 0 lassen (Vorher: Hover-Leak 2).
    await page.mouse.move(568, 203);
    await page.waitForTimeout(80);
    const mouseParked = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      run.giveXp(200);
      return new Promise((res) => setTimeout(() => res({
        selected: window.__game.scene.getScene("ui").selected,
        levelUpOpen: run.levelUpOpen,
      }), 200));
    });
    focusCases.push({ input: "mouse-parked-pre-open", ...mouseParked, expect: "selected=0 (Guard) / 2 (Leak, Vorher)" });
    // Echte Bewegung nach dem Öffnen: 1 px links, Hover soll Karte 2 waehlen
    // (566 liegt noch in Karte 2: 472..632).
    await page.mouse.move(566, 203);
    await page.waitForTimeout(120);
    const hoverMoved = await page.evaluate(() => ({
      selected: window.__game.scene.getScene("ui").selected,
      levelUpOpen: window.__game.scene.getScene("run").levelUpOpen,
    }));
    focusCases.push({ input: "mouse-move-after-open", ...hoverMoved, expect: "selected=2 (Hover nach Bewegung)" });
    await ctx.close();
  }

  const report = {
    schema: "m10-levelup-panel-crisp/v1",
    tag,
    generatedAt: new Date().toISOString(),
    shotSeed: SHOT_SEED,
    seedSnapshots,
    contrastMin: CONTRAST_MIN,
    note: tag === "before"
      ? "Ist-Stand vor dem Crisp-Fix: Panel-Layout UI.ts createLevelUpUI (Anker 134/36/56+oy, Karten 158+oy, Icon Scale 3)."
      : "Nach Fix: ganzzahlige Skalen, 0 Überlappungen, Fokus-Kontrast >= 3:1.",
    jsErrors: errors.length,
    focusCases,
    formats,
    passed: formats.every((f) => f.ok) && errors.length === 0 && seedSnapshots.every((s) => s.offers.length > 0),
  };
  writeFileSync(`shots/m10-levelup-panel-${tag}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    tag,
    passed: report.passed,
    jsErrors: errors.length,
    seeds: seedSnapshots.map((s) => ({ seed: s.seed, offers: s.offers.length })),
    formats: formats.map((f) => ({
      label: f.label, view: `${f.view.gameWidth}x${f.view.gameHeight}`,
      overlaps: f.overlaps.length, fractional: f.fractionalScales.length,
      focusContrast: f.focus.ratioSelected, inside: f.insideGameView, ok: f.ok,
    })),
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
