#!/usr/bin/env node
// M10 chest-timing lane, Karte #2160: Randpfeil-Winkel und Truhen-Panel-Layout
// bei 640x360 (16:9), 780x360 (19.5:9) und 480x360 (4:3).
// Pixel-Check: Kerzenweiße Namensglyphen im Screenshot vs. Panel-/Slot-Rand.
// Start: flock /home/ai/games/.lf-perf.lock node scripts/m10-chest-layout.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const FORMATS = [
  { label: "16x9", cssW: 640, cssH: 360, dpr: 2 },   // intern 640x360
  { label: "19.5x9", cssW: 780, cssH: 360, dpr: 2 }, // intern 780x360
  { label: "4x3", cssW: 480, cssH: 360, dpr: 2 },    // intern 480x360
];
const PANEL_FRAME_W = 452;
const PANEL_FRAME_H = 244;
const OY = Math.round((360 - 270) / 2); // 45
const TEXT_BAND_Y0 = 200 + OY;          // 245
const TEXT_BAND_Y1 = 222 + OY;          // 267
const SLOT_BG_W = 96;

/** Liest ein PNG-Crop per ImageMagick und liefert die BBox der Kerzenweiß-Pixel. */
function analyzePng(png, x0, y0, w, h) {
  const out = execFileSync("convert", [
    png, "-crop", `${w}x${h}+${x0}+${y0}`, "+repage", "-depth", "8", "txt:-",
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1, n = 0;
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+),(\d+):.*#([0-9A-Fa-f]{6})/);
    if (!m) continue;
    if (m[3].toUpperCase() !== "F2EDD8") continue; // PAL C.candleWhite
    const x = Number(m[1]) + x0;
    const y = Number(m[2]) + y0;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    n += 1;
  }
  return n > 0 ? { n, minX, minY, maxX, maxY } : { n: 0, minX: null, minY: null, maxX: null, maxY: null };
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const formats = [];
let report;
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
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
      run.chests.spawn(1800, 1600);
    });
    await page.waitForTimeout(150);

    const arrow = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      const chest = run.chests.chests[0];
      return {
        visible: run.chests["arrow"].visible,
        rotation: run.chests["arrow"].rotation,
        arrowX: run.chests["arrow"].x,
        arrowY: run.chests["arrow"].y,
        chestX: chest.x,
        chestY: chest.y,
        camX: cam.worldView.x,
        camY: cam.worldView.y,
        camW: cam.width,
        camH: cam.height,
      };
    });
    const expAngle = Math.atan2(
      arrow.chestY - (arrow.camY + arrow.camH / 2),
      arrow.chestX - (arrow.camX + arrow.camW / 2),
    );
    const diffDeg = Math.abs(Math.atan2(
      Math.sin(arrow.rotation - expAngle),
      Math.cos(arrow.rotation - expAngle),
    )) * 180 / Math.PI;
    const edge = Math.min(arrow.arrowX, arrow.arrowY, arrow.camW - arrow.arrowX, arrow.camH - arrow.arrowY);
    await page.screenshot({ path: `shots/m10-chest-arrow-${fmt.label}.png` });

    // Truhen-Panel öffnen und bis nach dem Ausrollen aller Slots aufnehmen.
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      run.chests.clear();
      run.teleport(1000, 1000);
      // Evolution erzwingen: der längste Name "SEELENLEUCHTFEUER" muss
      // vollständig auf zwei Zeilen im Panel stehen (Pixel-Check unten).
      window.__lf.addWeapon("lantern", 8);
      window.__lf.addPassive("charm", 1);
      run.debugTriggerEvent("chest");
    });
    await page.waitForTimeout(950);
    const n = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      return run.chestResult?.rewards.length ?? 0;
    });
    await page.waitForTimeout(1450 + (n - 1) * 220 + 100 - 50);
    const slotInfo = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const run = window.__game.scene.getScene("run");
      const names = (run.chestResult?.rewards ?? []).map((r) => r.name.toUpperCase());
      const slots = ui.chestSlots ?? [];
      return slots.map((slot, i) => ({
        visible: slot.bg.visible,
        expectedName: names[i] ?? "",
        line1: slot.text.valueText,
        line2: slot.text2.visible ? slot.text2.valueText : "",
        x: slot.bg.x,
      }));
    });
    const visible = slotInfo.filter((s) => s.visible);

    const shot = `shots/m10-chest-panel-${fmt.label}.png`;
    await page.screenshot({ path: shot });

    // Pixel-Check: Textband (Zeile 1+2) je sichtbarem Slot.
    const s = fmt.dpr; // Screenshot-Pixel pro logischem Spielpixel
    const frameW = Math.min(PANEL_FRAME_W, fmt.cssW - 24);
    const cx = fmt.cssW / 2;
    const frameLeft = (cx - frameW / 2) * s;
    const frameRight = (cx + frameW / 2) * s;
    const bandY = TEXT_BAND_Y0 * s;
    const bandH = (TEXT_BAND_Y1 - TEXT_BAND_Y0) * s;
    const checks = [];
    let overlapCount = 0;
    for (let i = 0; i < n; i++) {
      const center = cx + (i - (n - 1) / 2) * 86;
      const slotLeft = (center - SLOT_BG_W / 2) * s;
      const slotRight = (center + SLOT_BG_W / 2) * s;
      const bbox = analyzePng(shot, Math.round(slotLeft), Math.round(bandY), Math.round(SLOT_BG_W * s), Math.round(bandH));
      if (!bbox.n) {
        checks.push({ slot: i, textPixels: 0, ok: false, reason: "keine Namenspixel" });
        overlapCount += 1;
        continue;
      }
      const slotMargin = Math.min(bbox.minX - slotLeft, slotRight - bbox.maxX);
      const panelMargin = Math.min(bbox.minX - frameLeft, frameRight - bbox.maxX);
      const ok = slotMargin >= 2 && panelMargin >= 2;
      if (!ok) overlapCount += 1;
      checks.push({
        slot: i,
        name: [visible[i].line1, visible[i].line2].filter(Boolean).join(" "),
        textPixels: bbox.n,
        slotMarginPx: Math.round(slotMargin * 10) / 10,
        panelMarginPx: Math.round(panelMargin * 10) / 10,
        bbox: { minX: bbox.minX, maxX: bbox.maxX, minY: bbox.minY, maxY: bbox.maxY },
        ok,
      });
    }
    const maxLines = Math.max(0, ...visible.map((v) => (v.line2 ? 2 : 1)));
    const twoLineNames = visible.filter((v) => Boolean(v.line2)).length;
    const namesComplete = visible.every((v) => {
      const joined = `${v.line1}${v.line2}`.replace(/\s/g, "");
      return joined.length > 0 && joined === v.expectedName.replace(/\s/g, "");
    });
    formats.push({
      label: fmt.label,
      internal: `${fmt.cssW}x${fmt.cssH}`,
      arrow: {
        visible: arrow.visible,
        angleDeg: Math.round(arrow.rotation * 180 / Math.PI * 10) / 10,
        expectedDeg: Math.round(expAngle * 180 / Math.PI * 10) / 10,
        deltaDeg: Math.round(diffDeg * 100) / 100,
        edgeDistancePx: Math.round(edge * 10) / 10,
        ok: arrow.visible && diffDeg <= 5 && edge <= 26,
      },
      panel: {
        slots: n,
        maxLines,
        twoLineNames,
        namesComplete,
        overlaps: overlapCount,
        checks,
        ok: overlapCount === 0 && maxLines <= 2 && namesComplete && twoLineNames >= 1,
      },
      screenshotArrow: `shots/m10-chest-arrow-${fmt.label}.png`,
      screenshotPanel: shot,
    });
    await context.close();
  }

  const passed = formats.every((f) => f.arrow.ok && f.panel.ok) && errors.length === 0;
  report = {
    schema: "m10-chest-layout/v1",
    generatedAt: new Date().toISOString(),
    toleranceDeg: 5,
    minMarginPx: 2,
    formats,
    verdict: {
      arrowAllFormats: formats.every((f) => f.arrow.ok),
      textNoOverlap: formats.every((f) => f.panel.ok),
      maxTwoLines: formats.every((f) => f.panel.maxLines <= 2 && f.panel.twoLineNames >= 1),
      jsErrors: errors.length,
      passed,
    },
    errors,
  };
  writeFileSync("shots/m10-chest-layout.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    passed,
    formats: formats.map((f) => ({
      label: f.label,
      arrowDeltaDeg: f.arrow.deltaDeg,
      edgePx: f.arrow.edgeDistancePx,
      slots: f.panel.slots,
      maxLines: f.panel.maxLines,
      minSlotMarginPx: f.panel.checks.length ? Math.min(...f.panel.checks.map((c) => c.slotMarginPx ?? -999)) : null,
      minPanelMarginPx: f.panel.checks.length ? Math.min(...f.panel.checks.map((c) => c.panelMarginPx ?? -999)) : null,
      overlaps: f.panel.overlaps,
    })),
    errors,
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
