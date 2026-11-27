#!/usr/bin/env node
// m10-chest-arrow-onscreen, Karte K2/K4: Randpfeil zur Truhe messen.
// Truhen an 4 Rand- + 4 Eckpositionen (Views 640x360 und 780x360), Zoom-Fall
// (Boss-Intro-Puls zoom 1.14) und Eintritts-Fall. Pro Frame Pfeilposition/-winkel
// gegen die erwartete Richtung (Kameramitte -> Truhe) geprueft.
// Baseline: node scripts/m10-chest-arrow.mjs --out shots/m10-chest-arrow-baseline.json
// Nachher:  node scripts/m10-chest-arrow.mjs --out shots/m10-chest-arrow-after.json --shots
// Keine FPS-Messung -> kein flock.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const TOLERANCE_DEG = 5;
const MARGIN = 24; // muss dem Clamp-Margin in ChestSystem.update entsprechen
const FAR = 1500;  // Distanz der Truhe hinter dem View-Rand (Eckfaelle entlarven die Klemme)

const FORMATS = [
  { label: "640x360", cssW: 640, cssH: 360 },
  { label: "780x360", cssW: 780, cssH: 360 },
];

function angleDiffDeg(a, b) {
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(d) * 180 / Math.PI;
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : "shots/m10-chest-arrow-baseline.json";
const withShots = args.includes("--shots");

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});
const errors = [];
const formats = [];

try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({ viewport: { width: fmt.cssW, height: fmt.cssH }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
    });
    await page.waitForTimeout(200);

    // ---- Rand-/Eckfaelle: Truhe weit ausserhalb spawnen, 24 Frames samplen.
    const CASES = [
      { id: "left", ox: -1, oy: 0 }, { id: "right", ox: 1, oy: 0 },
      { id: "top", ox: 0, oy: -1 }, { id: "bottom", ox: 0, oy: 1 },
      { id: "tl", ox: -1, oy: -1 }, { id: "tr", ox: 1, oy: -1 },
      { id: "bl", ox: -1, oy: 1 }, { id: "br", ox: 1, oy: 1 },
    ];
    const cases = [];
    for (const c of CASES) {
      const chest = await page.evaluate(({ ox, oy, FAR: far }) => {
        const run = window.__game.scene.getScene("run");
        const cam = run.cameras.main;
        run.chests.clear();
        const view = cam.worldView;
        // View-Mitte + Richtung * (Halbbreite + weit dahinter) -> sicher ausserhalb.
        const cx = view.centerX + ox * (view.width / 2 + far);
        const cy = view.centerY + oy * (view.height / 2 + far);
        const p = run.teleport(view.centerX - ox * 60, view.centerY - oy * 60);
        run.chests.spawn(cx, cy);
        return { cx, cy, px: view.centerX - ox * 60, py: view.centerY - oy * 60 };
      }, { ...c, FAR });
      const samples = await page.evaluate(() => new Promise((resolve) => {
        const run = window.__game.scene.getScene("run");
        const cam = run.cameras.main;
        const arrow = run.chests["arrow"];
        const out = [];
        let n = 0;
        function step() {
          out.push({
            visible: arrow.visible, x: arrow.x, y: arrow.y, rot: arrow.rotation,
            wx: cam.worldView.x, wy: cam.worldView.y, ww: cam.worldView.width, wh: cam.worldView.height,
            zoom: cam.zoom, cw: cam.width, ch: cam.height,
          });
          if (++n >= 24) resolve(out); else requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }));
      // Analyse in Node: gerenderte Screen-Pos (scrollFactor 0 wird um Kameramitte gezoomt).
      let maxAngle = 0, maxPosErr = 0, firstVisible = null, edgeOkAll = true;
      for (const s of samples) {
        const cx = s.cw / 2, cy = s.ch / 2;
        const sx = cx + (chest.cx - (s.wx + s.ww / 2)) * s.zoom;
        const sy = cy + (chest.cy - (s.wy + s.wh / 2)) * s.zoom;
        const expAngle = Math.atan2(sy - cy, sx - cx);
        const rx = cx + (s.x - cx) * s.zoom;
        const ry = cy + (s.y - cy) * s.zoom;
        const rAngle = Math.atan2(ry - cy, rx - cx);
        maxAngle = Math.max(maxAngle, angleDiffDeg(rAngle, expAngle));
        // Soll-Randpunkt: Strahl Mitte->Truhe geschnitten mit Margin-Box.
        const dx = sx - cx, dy = sy - cy;
        const hw = cx - MARGIN, hh = cy - MARGIN;
        const t = Math.min(hw / Math.max(1e-9, Math.abs(dx)), hh / Math.max(1e-9, Math.abs(dy)));
        const bx = cx + dx * t, by = cy + dy * t;
        maxPosErr = Math.max(maxPosErr, Math.hypot(rx - bx, ry - by));
        edgeOkAll &&= rx >= MARGIN - 2 && rx <= s.cw - MARGIN + 2 && ry >= MARGIN - 2 && ry <= s.ch - MARGIN + 2;
        if (firstVisible === null) firstVisible = s.visible;
      }
      cases.push({
        id: c.id,
        chest: { x: Math.round(chest.cx), y: Math.round(chest.cy) },
        visibleAtSpawn: firstVisible === true,
        maxAngleDeg: Math.round(maxAngle * 100) / 100,
        maxPosErrPx: Math.round(maxPosErr * 10) / 10,
        edgeOk: edgeOkAll,
        ok: firstVisible === true && maxAngle <= TOLERANCE_DEG && edgeOkAll,
      });
      if (withShots && c.id === "right") {
        await page.screenshot({ path: "shots/m10-chest-arrow-edge.png" });
      }
    }

    // ---- Zoom-Fall: Boss-Intro-Puls simulieren, Truhe knapp ausserhalb des
    //      SICHTBAREN Bereichs (worldView nach dem Zoom, +10 px dahinter).
    //      Pre-fix vergleicht update() worldView-Koordinaten mit camera.width
    //      (= 640 statt sichtbarer 561 bei zoom 1.14) und haelt die Truhe
    //      faelschlich fuer sichtbar -> Pfeil fehlt.
    await page.evaluate(() => window.__game.scene.getScene("run").cameras.main.setZoom(1.14));
    await page.waitForTimeout(80);
    const zoomCase = await page.evaluate(() => new Promise((resolve) => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      run.chests.clear();
      const view = cam.worldView; // jetzt aktualisiert (zoom aktiv)
      const cx = view.x + view.width + 10;
      const cy = view.centerY;
      run.chests.spawn(cx, cy);
      const arrow = run.chests["arrow"];
      const out = [];
      let n = 0;
      function step() {
        out.push({ visible: arrow.visible, x: arrow.x, y: arrow.y, rot: arrow.rotation,
          wx: cam.worldView.x, wy: cam.worldView.y, ww: cam.worldView.width, wh: cam.worldView.height,
          zoom: cam.zoom, cw: cam.width, ch: cam.height, chestX: cx, chestY: cy });
        if (++n >= 12) { cam.setZoom(1); resolve(out); } else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }));
    let zoomVisibleSamples = 0;
    let zoomMaxAngle = 0;
    let zoomMaxPosErr = 0;
    for (const s of zoomCase) {
      const cx = s.cw / 2, cy = s.ch / 2;
      const sx = cx + (s.chestX - (s.wx + s.ww / 2)) * s.zoom;
      const sy = cy + (s.chestY - (s.wy + s.wh / 2)) * s.zoom;
      const expAngle = Math.atan2(sy - cy, sx - cx);
      const dx = sx - cx, dy = sy - cy;
      const t = Math.min((cx - MARGIN) / Math.max(1e-9, Math.abs(dx)), (cy - MARGIN) / Math.max(1e-9, Math.abs(dy)));
      const bx = cx + dx * t, by = cy + dy * t;
      if (s.visible) {
        zoomVisibleSamples += 1;
        const rx = cx + (s.x - cx) * s.zoom;
        const ry = cy + (s.y - cy) * s.zoom;
        zoomMaxAngle = Math.max(zoomMaxAngle, angleDiffDeg(Math.atan2(ry - cy, rx - cx), expAngle));
        zoomMaxPosErr = Math.max(zoomMaxPosErr, Math.hypot(rx - bx, ry - by));
      }
    }
    cases.push({
      id: "zoom1.14",
      chest: { x: 0, y: 0 },
      visibleAtSpawn: zoomVisibleSamples >= 6,
      maxAngleDeg: Math.round(zoomMaxAngle * 100) / 100,
      maxPosErrPx: Math.round(zoomMaxPosErr * 10) / 10,
      edgeOk: true,
      ok: zoomVisibleSamples >= 6 && zoomMaxAngle <= TOLERANCE_DEG,
      zoomVisibleSamples,
    });

    // ---- Eintritts-Fall: Spieler laeuft Richtung Truhe; Pfeil muss verschwinden,
    //      sobald die Truhe im View ist (8-px-Einzug).
    const disappear = await page.evaluate(() => new Promise((resolve) => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      run.chests.clear();
      const view = cam.worldView;
      const cx = view.x + view.width + 300;
      const cy = view.centerY;
      run.chests.spawn(cx, cy);
      const arrow = run.chests["arrow"];
      const out = [];
      let n = 0;
      function step() {
        const v = cam.worldView;
        const inside = cx > v.x + 8 && cx < v.x + v.width - 8 && cy > v.y + 8 && cy < v.y + v.height - 8;
        out.push({ visible: arrow.visible, inside, zoom: cam.zoom, sx: cx - v.x, cw: cam.width });
        run.teleport(run.posX + 40, run.posY);
        if (++n >= 14) resolve(out); else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }));
    const insideSamples = disappear.filter((s) => s.inside);
    const visibleWhileInside = insideSamples.filter((s) => s.visible).length;
    cases.push({
      id: "disappear",
      chest: { x: 0, y: 0 },
      visibleAtSpawn: disappear[0]?.visible === true,
      maxAngleDeg: null,
      maxPosErrPx: null,
      edgeOk: true,
      ok: disappear[0]?.visible === true && visibleWhileInside <= 1 && insideSamples.length >= 2,
      insideSamples: insideSamples.length,
      visibleWhileInside,
      frames: disappear.map((s) => ({ v: s.visible ? 1 : 0, i: s.inside ? 1 : 0, sx: Math.round(s.sx), cw: s.cw })),
    });

    if (withShots) {
      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        run.chests.clear();
        const view = run.cameras.main.worldView;
        run.chests.spawn(view.x + view.width + 260, view.centerY);
      });
      await page.waitForTimeout(120);
      await page.screenshot({ path: "shots/m10-chest-arrow-inside.png" });
    }

    formats.push({
      label: fmt.label,
      internal: `${fmt.cssW}x${fmt.cssH}`,
      toleranceDeg: TOLERANCE_DEG,
      cases,
      ok: cases.every((c) => c.ok),
    });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const report = {
  schema: "m10-chest-arrow/v1",
  generatedAt: new Date().toISOString(),
  toleranceDeg: TOLERANCE_DEG,
  marginPx: MARGIN,
  formats,
  verdict: {
    allCasesOk: formats.every((f) => f.ok),
    jsErrors: errors.length,
    passed: formats.every((f) => f.ok) && errors.length === 0,
  },
  errors,
};
writeFileSync(outFile, JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  outFile,
  passed: report.verdict.passed,
  formats: formats.map((f) => ({ label: f.label, ok: f.ok, cases: f.cases.map((c) => ({ id: c.id, ok: c.ok, maxAngleDeg: c.maxAngleDeg, visibleAtSpawn: c.visibleAtSpawn })) })),
  jsErrors: errors.length,
}, null, 2));
