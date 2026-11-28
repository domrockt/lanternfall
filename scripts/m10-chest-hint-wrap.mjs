#!/usr/bin/env node
// m10-chest-hint-wrap K1/K4: Misst im offenen Truhen-Panel die Slot-Label-Zeilen
// (text/text2) und beide Evo-Hint-Zeilen (chest-hint-0/1) in 640x360@2 und
// 780x360@3. Glyph-Boxen (PixelText: valueText/textWidth, 5x7, Origin-Mitte)
// wie m10-chest-panel.mjs — kein Container-getBounds.
//
// Geprueft wird je Profil:
//  - midWordCut: bricht ein Slot-Label mitten im Wort, ohne Trennstrich "-"?
//  - charsLost:  gehen Zeichen verloren (Name != Zeileninhalt)?
//  - hintLines:  Texte beider Evo-Hint-Zeilen + Vollstaendigkeit des Satzes.
//  - overlaps:   Hint-Zeilen vs. Truhen-Icon / Slot-Boxen; alles im Rahmen+Viewport.
//
// Aufruf: node scripts/m10-chest-hint-wrap.mjs before   (bzw. after)
// EIN Lauf pro Tag ("before"/"after"); Ergebnis shots/m10-chest-hint-wrap-<tag>.json.
// Kein flock — Screenshot-/Messlauf, kein Echtzeit-FPS.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const GLYPH_H = 7;
const GLYPH_ADVANCE = 6;
const FORMATS = [
  { label: "640", cssW: 640, cssH: 360, dpr: 2 },
  { label: "780", cssW: 780, cssH: 360, dpr: 3 },
];
// Panel-Konstanten (müssen mit src/scenes/UI.ts übereinstimmen; Anker aus
// m10-chest-panel-ui: Untertitel 58+oy, Icon 92+oy @2.6, Hints 122/130+oy).
const CHEST_FRAME_W = 452;
const CHEST_FRAME_H = 244;
const CHEST_FRAME_CY = 140;
const CHEST_ICON_Y = 92;
const CHEST_ICON_SCALE = 2.6;
const CHEST_HINT_Y = 122;
const CHEST_HINT_PITCH = 8;
const SLOT_CHARS = 13; // maxChars der Slot-Label in UI.ts (slotNameLines/slotLabelLines)
// Beschreibungen aus src/data/evolutions.ts (stabile Daten) für die
// Vollständigkeitsprüfung des Evo-Satzes "AUS <desc> WIRD <name>.".
const EVO_DESCRIPTIONS = {
  phoenix: "Glutfunke + Arkanes Buch",
  wrath_pendulum: "Kettenflegel + Eisenherz",
  eternal_winter: "Frostnova + Sanduhr",
  thorn_storm: "Dornensalve + Windstiefel",
  thunder_seal: "Sturmrune + Wetzstein",
  soul_beacon: "Geisterlaterne + Magnetamulett",
};

/** Exakte Glyph-Box eines PixelText (align center) in Spielpixeln. */
function glyphBox(t) {
  if (!t || t.w <= 0) return null;
  const left = t.x - Math.floor(t.w / 2);
  return {
    text: t.text,
    left: r(left),
    right: r(left + t.w),
    top: r(t.y),
    bottom: r(t.y + GLYPH_H),
  };
}

function iconBox(img) {
  return {
    left: r(img.x - (img.w * img.scaleX) / 2),
    right: r(img.x + (img.w * img.scaleX) / 2),
    top: r(img.y - (img.h * img.scaleY) / 2),
    bottom: r(img.y + (img.h * img.scaleY) / 2),
  };
}

function rectBox(rc) {
  return {
    left: r(rc.x - rc.width / 2),
    right: r(rc.x + rc.width / 2),
    top: r(rc.y - rc.height / 2),
    bottom: r(rc.y + rc.height / 2),
  };
}

function r(n) {
  return Math.round(n * 10) / 10;
}

function overlapBox(a, b) {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return dx > 0 && dy > 0 ? { dx: r(dx), dy: r(dy), px: r(Math.min(dx, dy)) } : null;
}

/** Zeileninhalt ohne Leerzeichen/Trennstriche — für Verlustfreiheits-Vergleich. */
function norm(s) {
  return s.replaceAll(" ", "").replaceAll("-", "");
}

/**
 * Bruchart der Slot-Label-Zeilen: ok (passt / Wortgrenze / Trennstrich) oder
 * "mid-word" (Schnitt mitten im Wort ohne Trennstrich).
 */
function classifyBreak(name, lines) {
  const [l1, l2] = lines;
  if (!l1) return "empty";
  if (!l2) return "fits";
  if (name[l1.length] === " ") return "word-boundary";
  if (l1.endsWith("-")) return "hyphen";
  return "mid-word";
}

function sentenceFor(reward) {
  const desc = EVO_DESCRIPTIONS[reward.id];
  return desc ? `AUS ${desc.toUpperCase()} WIRD ${reward.name.toUpperCase()}.` : null;
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
const formats = [];
try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: fmt.cssW, height: fmt.cssH },
      deviceScaleFactor: fmt.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);

    // Evolution erzwingen -> längster Evo-Name im Panel (wie m10-chest-panel.mjs).
    await page.evaluate(() => {
      window.__lf.god(true);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
      window.__lf.addWeapon("lantern", 8);
      window.__lf.addPassive("charm", 1);
      run.debugTriggerEvent("chest");
    });
    await page.waitForTimeout(950);
    const rewards = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      return (run.chestResult?.rewards ?? []).map((rw) => ({ kind: rw.kind, id: rw.id, name: rw.name }));
    });
    // Roll-Sequenz abwarten (feste Timings wie im Panel: Basis + 220 ms je weiterem Slot).
    await page.waitForTimeout(1450 + Math.max(0, rewards.length - 1) * 220 + 100);

    const panel = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const g = ui.chestGroup;
      const texts = [];
      const images = [];
      const rects = [];
      for (const obj of g.list) {
        if (typeof obj.valueText === "string" && typeof obj.textWidth === "number") {
          texts.push({
            name: obj.name || "",
            text: obj.valueText,
            x: obj.x, y: obj.y,
            w: obj.textWidth,
            visible: obj.visible,
          });
        } else if (obj.type === "Image") {
          images.push({
            texture: obj.texture && obj.texture.key,
            x: obj.x, y: obj.y, w: obj.width, h: obj.height,
            scaleX: obj.scaleX, scaleY: obj.scaleY,
            visible: obj.visible,
          });
        } else if (obj.type === "Rectangle") {
          rects.push({ x: obj.x, y: obj.y, width: obj.width, height: obj.height, visible: obj.visible });
        }
      }
      return { texts, images, rects };
    });

    const shot = `shots/m10-chest-hint-wrap-${tag}-${fmt.label}.png`;
    await page.screenshot({ path: shot });
    await context.close();

    const W = fmt.cssW;
    const oy = Math.round((fmt.cssH - 270) / 2);
    const cx = W / 2;
    const n = rewards.length;

    // Slot-Label-Zeilen: Zeile 1 (y≈202+oy), Zeile 2 (y≈213+oy) je Slot-x.
    const labelRows = panel.texts.filter((t) => t.visible && !t.name && t.y >= 200 + oy && t.y <= 215 + oy);
    const slots = [];
    for (let i = 0; i < n; i++) {
      const slotX = cx + (i - (n - 1) / 2) * 86;
      const row1 = labelRows.filter((t) => Math.abs(t.x - slotX) < 2 && t.y <= 206 + oy)
        .map(glyphBox).filter(Boolean);
      const row2 = labelRows.filter((t) => Math.abs(t.x - slotX) < 2 && t.y > 206 + oy)
        .map(glyphBox).filter(Boolean);
      const name = (rewards[i]?.name ?? "").toUpperCase();
      const lines = [row1[0]?.text ?? "", row2[0]?.text ?? ""];
      const charsLost = name.length > 0 && norm(lines.join("")) !== norm(name);
      slots.push({
        index: i,
        name,
        kind: rewards[i]?.kind,
        lines,
        boxes: [...row1, ...row2],
        breakType: classifyBreak(name, lines),
        charsLost,
        midWordCut: charsLost === false && classifyBreak(name, lines) === "mid-word",
        widthOk: [...row1, ...row2].every((b) => b.left >= slotX - 48 && b.right <= slotX + 48),
      });
    }

    // Evo-Hint-Zeilen (chest-hint-0/1) + Vollständigkeit des Satzes.
    const hintBoxes = [0, 1].map((i) => {
      const t = panel.texts.find((x) => x.name === `chest-hint-${i}` && x.visible);
      return t ? glyphBox(t) : null;
    });
    const hint0 = hintBoxes[0]?.text ?? "";
    const hint1 = hintBoxes[1]?.text ?? "";
    const evoReward = rewards.find((rw) => rw.kind === "evolution");
    const expected = evoReward ? sentenceFor(evoReward) : null;
    const hintChars = Math.max(24, Math.floor((Math.min(CHEST_FRAME_W, W - 24) - 20) / 6));
    const hintComplete = expected === null
      ? null
      : norm(`${hint0} ${hint1}`) === norm(expected) && hint0.length > 0;
    const hints = {
      expected,
      line0: hint0,
      line1: hint1,
      chestHintChars: hintChars,
      maxLineChars: Math.max(hint0.length, hint1.length),
      bothLinesNonEmpty: hint0.length > 0 && hint1.length > 0,
      complete: hintComplete,
      boxes: hintBoxes,
    };

    // Boxen für Überlappungs-/Grenzen-Prüfung: Hint-Zeilen vs. Icon und Slot-Boxen.
    const chestImg = panel.images.find((i) => i.visible && (i.texture === "chest_open" || i.texture === "chest_closed"));
    const icon = chestImg ? iconBox(chestImg) : null;
    const slotBgs = panel.rects
      .filter((rc) => rc.visible && rc.width === 96 && rc.height === 92)
      .map(rectBox);
    const overlaps = [];
    for (let i = 0; i < hintBoxes.length; i++) {
      if (!hintBoxes[i]) continue;
      if (icon) {
        const o = overlapBox(hintBoxes[i], icon);
        if (o) overlaps.push({ a: `hint-${i}`, b: "icon", ...o });
      }
      slotBgs.forEach((sb, j) => {
        const o = overlapBox(hintBoxes[i], sb);
        if (o) overlaps.push({ a: `hint-${i}`, b: `slot-bg-${j}`, ...o });
      });
    }
    // Slot-Label-Zeilen dürfen nicht in Nachbarslots ragen.
    for (let i = 1; i < slots.length; i++) {
      for (const b of slots[i - 1].boxes) {
        for (const b2 of slots[i].boxes) {
          const o = overlapBox(b, b2);
          if (o) overlaps.push({ a: `slot-${i - 1}-label`, b: `slot-${i}-label`, ...o });
        }
      }
    }

    const frame = {
      left: cx - Math.min(CHEST_FRAME_W, W - 24) / 2,
      right: cx + Math.min(CHEST_FRAME_W, W - 24) / 2,
      top: CHEST_FRAME_CY + oy - CHEST_FRAME_H / 2,
      bottom: CHEST_FRAME_CY + oy + CHEST_FRAME_H / 2,
    };
    const allBoxes = [...hintBoxes.filter(Boolean), ...slots.flatMap((s) => s.boxes)];
    const insideFrame = allBoxes.every((b) => b.left >= frame.left - 2 && b.right <= frame.right + 2
      && b.top >= frame.top - 2 && b.bottom <= frame.bottom + 2);
    const insideViewport = allBoxes.every((b) => b.top >= 0 && b.left >= 0 && b.right <= W && b.bottom <= fmt.cssH);

    const midWordCuts = slots.filter((s) => s.midWordCut);
    const pass = errors.length === 0
      && rewards.length > 0
      && midWordCuts.length === 0
      && slots.every((s) => !s.charsLost && s.widthOk)
      && overlaps.length === 0
      && insideFrame && insideViewport
      && (hintComplete === null || hintComplete);

    formats.push({
      label: fmt.label,
      internal: `${fmt.cssW}x${fmt.cssH}@${fmt.dpr}`,
      rewardCount: n,
      slots,
      hints,
      icon,
      frame,
      midWordCuts: midWordCuts.map((s) => s.name),
      charsLost: slots.filter((s) => s.charsLost).map((s) => s.name),
      overlaps,
      insideFrame,
      insideViewport,
      screenshot: shot,
      ok: pass,
    });
  }

  const report = {
    schema: "m10-chest-hint-wrap/v1",
    tag,
    generatedAt: new Date().toISOString(),
    seed: 101,
    slotMaxChars: SLOT_CHARS,
    note: tag === "before"
      ? "Ist-Stand: Slot-Label bricht ohne Trennstrich mitten im Wort (SEELENLEU/CHTFEUER); Evo-Satz auf einer Zeile, Hint-Zeile 2 leer."
      : "Nach Fix: Umbruch an Wortgrenzen bzw. mit Trennstrich; Evo-Satz verlustfrei über beide Hint-Zeilen.",
    jsErrors: errors.length,
    formats,
    passed: formats.every((f) => f.ok),
  };
  writeFileSync(`shots/m10-chest-hint-wrap-${tag}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    tag,
    passed: report.passed,
    formats: formats.map((f) => ({
      label: f.label,
      midWordCuts: f.midWordCuts,
      hintLines: [f.hints.line0, f.hints.line1],
      hintComplete: f.hints.complete,
      bothHintLinesNonEmpty: f.hints.bothLinesNonEmpty,
      overlaps: f.overlaps.length,
      insideFrame: f.insideFrame,
      jsErrors: errors.length,
    })),
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
