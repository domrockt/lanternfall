#!/usr/bin/env node
// m10-chest-panel-ui K1/K4: Misst das offene Truhen-Panel in 640x360 und 780x360@3.
// Glyph-Boxen (PixelText: 5x7-Glyphen, Origin 0/0 am Container-Y) von Titel,
// Untertitel, Truhen-Icon und Evo-Slot-Namen; Überlappungsliste in px.
// Aufruf: node scripts/m10-chest-panel.mjs before   (bzw. after)
// Kein flock — Screenshot-/Messlauf, kein Echtzeit-FPS. Läuft ohne Modell-Loop:
// EIN Lauf pro Tag ("before"/"after"), Ergebnis = shots/m10-chest-panel-<tag>.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const GLYPH_H = 7;
const FORMATS = [
  { label: "640", cssW: 640, cssH: 360, dpr: 2 },
  { label: "780", cssW: 780, cssH: 360, dpr: 3 },
];
const GAP_MIN = 4; // Abnahmekriterium: Untertitel-Oberkante >= Titel-Unterkante + 4 px

/** Exakte Glyph-Box eines PixelText (align center) in Spielpixeln. */
function glyphBox(t) {
  if (!t || t.w <= 0) return null;
  const left = t.x - Math.floor(t.w / 2) * t.scaleX;
  return {
    text: t.text,
    left: r(left),
    right: r(left + t.w * t.scaleX),
    top: r(t.y),
    bottom: r(t.y + GLYPH_H * t.scaleY),
  };
}

function iconBox(img) {
  return {
    texture: img.texture,
    left: r(img.x - (img.w * img.scaleX) / 2),
    right: r(img.x + (img.w * img.scaleX) / 2),
    top: r(img.y - (img.h * img.scaleY) / 2),
    bottom: r(img.y + (img.h * img.scaleY) / 2),
  };
}

function r(n) {
  return Math.round(n * 10) / 10;
}

function overlap(a, b) {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return dx > 0 && dy > 0 ? { dx: r(dx), dy: r(dy), px: r(Math.min(dx, dy)) } : null;
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

    // Evolution erzwingen -> längster Evo-Name im Panel (wie m10-chest-layout.mjs).
    await page.evaluate(() => {
      window.__lf.god(true);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
      window.__lf.addWeapon("lantern", 8);
      window.__lf.addPassive("charm", 1);
      run.debugTriggerEvent("chest");
    });
    await page.waitForTimeout(950);
    const rewards = await page.evaluate(() => window.__game.scene.getScene("run").chestResult?.rewards.length ?? 0);
    // Roll-Sequenz abwarten (feste Timings wie im Panel: Basis + 220 ms je weiterem Slot).
    await page.waitForTimeout(1450 + Math.max(0, rewards - 1) * 220 + 100);

    const panel = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const g = ui.chestGroup;
      const texts = [];
      const images = [];
      for (const obj of g.list) {
        if (typeof obj.valueText === "string" && typeof obj.textWidth === "number") {
          texts.push({
            name: obj.name || "",
            text: obj.valueText,
            x: obj.x, y: obj.y,
            scaleX: obj.scaleX, scaleY: obj.scaleY,
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
        }
      }
      return { texts, images };
    });

    const shot = `shots/m10-chest-panel-${tag}-${fmt.label}.png`;
    await page.screenshot({ path: shot });
    await context.close();

    // Boxen: Titel (chest-title, Scale 2), Untertitel (BELOHNUNGEN...), Truhen-Icon,
    // Evo-Slot-Namen (sichtbare Slot-Texte in den Slot-Reihen).
    const title = glyphBox(panel.texts.find((t) => t.name === "chest-title" && t.visible));
    const subtitle = glyphBox(panel.texts.find((t) => t.text.startsWith("BELOHNUNGEN") && t.visible));
    const chestImg = panel.images.find((i) => i.visible && (i.texture === "chest_open" || i.texture === "chest_closed"));
    const icon = chestImg ? iconBox(chestImg) : null;
    const slotTexts = panel.texts
      .filter((t) => t.visible && !t.name && !t.text.startsWith("BELOHNUNGEN")
        && t.text !== "TRUHE GEÖFFNET" && t.text !== "TIPPE ODER A = ÜBERNEHMEN" && t.y > 240 && t.y < 300)
      .map(glyphBox).filter(Boolean);
    const evoNames = slotTexts.filter((b) => b.text && b.text !== "?");

    const boxes = { title, subtitle, icon };
    const overlaps = [];
    const pairs = [
      ["title", "subtitle"],
      ["subtitle", "icon"],
      ["title", "icon"],
    ];
    for (const [a, b] of pairs) {
      if (boxes[a] && boxes[b]) {
        const o = overlap(boxes[a], boxes[b]);
        if (o) overlaps.push({ a, b, ...o });
      }
    }
    for (let i = 0; i < evoNames.length; i++) {
      for (const key of ["title", "subtitle", "icon"]) {
        if (boxes[key]) {
          const o = overlap(boxes[key], evoNames[i]);
          if (o) overlaps.push({ a: key, b: `evoName${i}`, ...o });
        }
      }
    }
    const gapTitleSubtitle = title && subtitle ? r(subtitle.top - title.bottom) : null;
    const gapSubtitleIcon = subtitle && icon ? r(icon.top - subtitle.bottom) : null;
    const inside = [title, subtitle, icon, ...evoNames].every((b) => b
      && b.top >= 0 && b.left >= 0 && b.right <= fmt.cssW && b.bottom <= fmt.cssH);
    const pass = overlaps.length === 0 && gapTitleSubtitle !== null && gapTitleSubtitle >= GAP_MIN
      && gapSubtitleIcon !== null && gapSubtitleIcon >= GAP_MIN && inside;

    formats.push({
      label: fmt.label,
      internal: `${fmt.cssW}x${fmt.cssH}@${fmt.dpr}`,
      rewards,
      boxes: { title, subtitle, icon, evoNames },
      gaps: { titleToSubtitle: gapTitleSubtitle, subtitleToIcon: gapSubtitleIcon },
      gapMin: GAP_MIN,
      insidePanelViewport: inside,
      overlaps,
      screenshot: shot,
      ok: pass,
    });
  }

  const report = {
    schema: "m10-chest-panel-ui/v1",
    tag,
    generatedAt: new Date().toISOString(),
    seed: 101,
    gapMinPx: GAP_MIN,
    note: tag === "before"
      ? "Ist-Stand: Untertitel-Anchor 54+oy, Titel (Scale 2) endet bei 52+oy -> Gap 2 px (< 4)."
      : "Nach Fix: Untertitel aus Titel-Baseline + GLYPH_H*Scale + Gap >= 4 px abgeleitet.",
    jsErrors: errors.length,
    formats,
    passed: formats.every((f) => f.ok) && errors.length === 0,
  };
  writeFileSync(`shots/m10-chest-panel-${tag}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    tag,
    passed: report.passed,
    formats: formats.map((f) => ({
      label: f.label,
      gapTitleSubtitle: f.gaps.titleToSubtitle,
      gapSubtitleIcon: f.gaps.subtitleToIcon,
      overlaps: f.overlaps.length,
      inside: f.insidePanelViewport,
    })),
    jsErrors: errors.length,
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
