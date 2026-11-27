#!/usr/bin/env node
// m10-chest-arrow-fix, Karte K1: Repro des Re-Abnahme-Befunds (5/10 FAIL bei
// 640x360 auf iGPU, shots/qa-reaccc-chest-arrow.json) mit erweiterter Diagnostik.
//
// Formate 640x360@2 (QA-Bedingung), 640x360@3 und 780x360@3 (Abnahme-Stand).
//
// Zwei Sampling-Wege je Frame:
// - "raf": requestAnimationFrame-Kallback (wie das alte Baseline-Skript
//   scripts/m10-chest-arrow.mjs). Läuft im rAF-Tick UNABHÄNGIG vom
//   Phaser-TimeStep: bei fps.limit 60 skippt Phaser rAF-Ticks, ohne update zu
//   rendern — das Sample zeigt dann den letzen gerenderten Zustand (Stale).
//   Diagnose-Nachweis: game.loop.frame ändert sich nicht.
// - "post": POST_UPDATE-Event der Run-Szene, direkt NACH ChestSystem.update —
//   genau der Zustand, den der folgende Render zeigt. Das ist das mass-
//   gebende Spiel-Verhalten; Bewertung (ok/FAIL) basiert auf "post".
//
// Je Sample: Kamera-Rohdaten (scrollX/Y, worldView, width/height, zoom),
// Renderbudget-State (__rbDbg.scale), Live-Gegenrechnung
// run.chests.computeArrowLayout(cam, chest) im selben Frame und 3 Richtungs-
// Darstellungen: (1) erwarteter Winkel Truhe vs. worldView-Mitte,
// (2) arrow.rotation, (3) gerenderter Winkel aus arrow.x/y.
//
// Optionaler URL-Zusatz: --query "rbscale=1" pinnt den Renderbudget-Teiler.
// Keine FPS-Messung -> kein flock.
// Aufruf: node scripts/m10-chest-arrow-repro.mjs --out shots/m10-chest-arrow-fix-repro.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const TOLERANCE_DEG = 5;
const MARGIN = 24;
const FAR = 1500;

const FORMATS = [
  { label: "640x360@2", cssW: 640, cssH: 360, dpr: 2 },
  { label: "640x360@3", cssW: 640, cssH: 360, dpr: 3 },
  { label: "780x360@3", cssW: 780, cssH: 360, dpr: 3 },
];

function angleDiffDeg(a, b) {
  const d = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(d) * 180 / Math.PI;
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : "shots/m10-chest-arrow-fix-repro.json";
const qIdx = args.indexOf("--query");
const extraQuery = qIdx >= 0 ? args[qIdx + 1] : "";
const withShots = args.includes("--shots");
const shotPrefix = "shots/m10-chest-arrow-fix";

// Frame-Sampling im Browser: post = POST_UPDATE (massgebend), raf = rAF-Tick
// (Alt-Verhalten, nur Diagnose). rafSkip = rAF-Tick, in dem Phaser keinen
// Step gemacht hat (loop.frame unveraendert).
const SAMPLER = (count) => new Promise((resolve) => {
  const run = window.__game.scene.getScene("run");
  const cam = run.cameras.main;
  const arrow = run.chests["arrow"];
  const chest = run.chests.chests[0];
  const post = [];
  const raf = [];
  let rafSeen = -1;
  const onPost = () => {
    const live = chest ? run.chests.computeArrowLayout(cam, chest.x, chest.y) : null;
    post.push({
      visible: arrow.visible, x: arrow.x, y: arrow.y, rot: arrow.rotation,
      liveVisible: live ? live.visible : null, liveX: live ? live.x : null, liveY: live ? live.y : null, liveAngle: live ? live.angle : null,
      wx: cam.worldView.x, wy: cam.worldView.y, ww: cam.worldView.width, wh: cam.worldView.height,
      zoom: cam.zoom, cw: cam.width, ch: cam.height, scx: cam.scrollX, scy: cam.scrollY,
      rb: (window.__rbDbg ?? {}).scale ?? null, bufW: window.__game.canvas.width, bufH: window.__game.canvas.height,
      px: run.posX, py: run.posY, loopFrame: window.__game.loop.frame,
    });
    if (post.length >= count) run.events.off("postupdate", onPost);
  };
  run.events.on("postupdate", onPost);
  function step() {
    const live = chest ? run.chests.computeArrowLayout(cam, chest.x, chest.y) : null;
    const frame = window.__game.loop.frame;
    const skipped = frame === rafSeen;
    rafSeen = frame;
    raf.push({
      visible: arrow.visible, x: arrow.x, y: arrow.y, rot: arrow.rotation,
      liveVisible: live ? live.visible : null, liveX: live ? live.x : null, liveY: live ? live.y : null, liveAngle: live ? live.angle : null,
      wx: cam.worldView.x, wy: cam.worldView.y, ww: cam.worldView.width, wh: cam.worldView.height,
      zoom: cam.zoom, cw: cam.width, ch: cam.height, scx: cam.scrollX, scy: cam.scrollY,
      rb: (window.__rbDbg ?? {}).scale ?? null, loopFrame: frame, skipped,
    });
    if (raf.length >= count && post.length >= count) resolve({ post, raf });
    else requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
});

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});
const errors = [];
const formats = [];

try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({ viewport: { width: fmt.cssW, height: fmt.cssH }, deviceScaleFactor: fmt.dpr });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    const q = extraQuery ? `&${extraQuery}` : "";
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101${q}`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
    });
    await page.waitForTimeout(200);

    const header = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      const g = window.__game;
      const dbg = window.__rbDbg ?? {};
      return {
        scaleW: g.scale.width, scaleH: g.scale.height,
        canvasW: g.canvas.width, canvasH: g.canvas.height,
        camW: cam.width, camH: cam.height, zoom: cam.zoom,
        rbScale: dbg.scale ?? null,
      };
    });

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
        const cx = view.centerX + ox * (view.width / 2 + far);
        const cy = view.centerY + oy * (view.height / 2 + far);
        const p = run.teleport(view.centerX - ox * 60, view.centerY - oy * 60);
        run.chests.spawn(cx, cy);
        return { cx, cy, px: view.centerX - ox * 60, py: view.centerY - oy * 60 };
      }, { ...c, FAR });
      const { post, raf } = await page.evaluate(SAMPLER, 24);
      // Beleg-Screenshot waehrend der Wirkung (Truhe off-screen, Pfeil am Rand),
      // fuer den ersten Format-Lauf im Fall "right".
      if (withShots && fmt.dpr === 2 && c.id === "right") {
        await page.screenshot({ path: `${shotPrefix}-edge-${fmt.label.replace(/[^0-9x]/g, "")}.png` });
      }
      const analyse = (samples) => {
        let maxAngle = 0, maxPosErr = 0, firstVisible = null, edgeOkAll = true;
        const diag = [];
        for (const s of samples) {
          const cx = s.cw / 2, cy = s.ch / 2;
          const sx = cx + (chest.cx - (s.wx + s.ww / 2)) * s.zoom;
          const sy = cy + (chest.cy - (s.wy + s.wh / 2)) * s.zoom;
          const expAngle = Math.atan2(sy - cy, sx - cx);
          const rx = cx + (s.x - cx) * s.zoom;
          const ry = cy + (s.y - cy) * s.zoom;
          const rAngle = Math.atan2(ry - cy, rx - cx);
          const aErr = angleDiffDeg(rAngle, expAngle);
          const dx = sx - cx, dy = sy - cy;
          const hw = cx - MARGIN, hh = cy - MARGIN;
          const t = Math.min(hw / Math.max(1e-9, Math.abs(dx)), hh / Math.max(1e-9, Math.abs(dy)));
          const bx = cx + dx * t, by = cy + dy * t;
          const posErr = Math.hypot(rx - bx, ry - by);
          const edgeOk = rx >= MARGIN - 2 && rx <= s.cw - MARGIN + 2 && ry >= MARGIN - 2 && ry <= s.ch - MARGIN + 2;
          edgeOkAll &&= edgeOk;
          maxAngle = Math.max(maxAngle, aErr);
          maxPosErr = Math.max(maxPosErr, posErr);
          if (firstVisible === null) firstVisible = s.visible;
          if (aErr > TOLERANCE_DEG || posErr > 2 || !s.visible || !edgeOk) {
            diag.push({
              visible: s.visible, x: s.x, y: s.y, rotDeg: Math.round(s.rot * 180 / Math.PI * 10) / 10,
              expAngleDeg: Math.round(expAngle * 180 / Math.PI * 10) / 10,
              rAngleDeg: Math.round(rAngle * 180 / Math.PI * 10) / 10,
              liveAngleDeg: s.liveAngle === null ? null : Math.round(s.liveAngle * 180 / Math.PI * 10) / 10,
              liveVisible: s.liveVisible, liveX: s.liveX, liveY: s.liveY,
              aErr: Math.round(aErr * 100) / 100, posErr: Math.round(posErr * 10) / 10, edgeOk,
              zoom: s.zoom, cw: s.cw, ch: s.ch, rb: s.rb, loopFrame: s.loopFrame ?? null,
              wx: Math.round(s.wx), wy: Math.round(s.wy), px: Math.round(s.px), py: Math.round(s.py),
            });
          }
        }
        return { maxAngle, maxPosErr, firstVisible, edgeOkAll, diag };
      };
      const postA = analyse(post);
      const rafA = analyse(raf);
      const rafFirst = raf[0] ?? {};
      const caseOk = postA.firstVisible === true && postA.maxAngle <= TOLERANCE_DEG && postA.edgeOkAll;
      cases.push({
        id: c.id,
        chest: { x: Math.round(chest.cx), y: Math.round(chest.cy) },
        // Massgebend: Zustand nach ChestSystem.update (POST_UPDATE).
        visibleAtSpawn: postA.firstVisible === true,
        maxAngleDeg: Math.round(postA.maxAngle * 100) / 100,
        maxPosErrPx: Math.round(postA.maxPosErr * 10) / 10,
        edgeOk: postA.edgeOkAll,
        ok: caseOk,
        // Artefakt-Nachweis: Alt-Sampling (rAF vor dem Phaser-Step).
        raf: {
          visibleAtSpawn: rafA.firstVisible === true,
          maxAngleDeg: Math.round(rafA.maxAngle * 100) / 100,
          skippedFirstFrame: rafFirst.skipped === true,
          loopFrameFirst: rafFirst.loopFrame ?? null,
          ok: rafA.firstVisible === true && rafA.maxAngle <= TOLERANCE_DEG && rafA.edgeOkAll,
          diag: rafA.diag.slice(0, 4),
        },
        diag: caseOk ? undefined : postA.diag.slice(0, 8),
      });
    }

    // ---- Zoom-Fall: Boss-Intro-Puls (wie Baseline-Skript).
    await page.evaluate(() => window.__game.scene.getScene("run").cameras.main.setZoom(1.14));
    await page.waitForTimeout(80);
    const chestZoom = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      run.chests.clear();
      const view = cam.worldView;
      const cx = view.x + view.width + 10;
      const cy = view.centerY;
      run.chests.spawn(cx, cy);
      return { cx, cy };
    });
    const { post: zoomPost, raf: zoomRaf } = await page.evaluate(SAMPLER, 12);
    const analyseZoom = (samples) => {
      let visibleSamples = 0, maxAngle = 0, maxPosErr = 0;
      const diag = [];
      for (const s of samples) {
        const cx = s.cw / 2, cy = s.ch / 2;
        const sx = cx + (chestZoom.cx - (s.wx + s.ww / 2)) * s.zoom;
        const sy = cy + (chestZoom.cy - (s.wy + s.wh / 2)) * s.zoom;
        const expAngle = Math.atan2(sy - cy, sx - cx);
        const dx = sx - cx, dy = sy - cy;
        const t = Math.min((cx - MARGIN) / Math.max(1e-9, Math.abs(dx)), (cy - MARGIN) / Math.max(1e-9, Math.abs(dy)));
        const bx = cx + dx * t, by = cy + dy * t;
        if (!s.visible) continue;
        visibleSamples += 1;
        const rx = cx + (s.x - cx) * s.zoom;
        const ry = cy + (s.y - cy) * s.zoom;
        const aErr = angleDiffDeg(Math.atan2(ry - cy, rx - cx), expAngle);
        const posErr = Math.hypot(rx - bx, ry - by);
        maxAngle = Math.max(maxAngle, aErr);
        maxPosErr = Math.max(maxPosErr, posErr);
        if (aErr > TOLERANCE_DEG || posErr > 2) {
          diag.push({ visible: s.visible, x: s.x, y: s.y, zoom: s.zoom, cw: s.cw, rb: s.rb, aErr: Math.round(aErr * 100) / 100, posErr: Math.round(posErr * 10) / 10 });
        }
      }
      return { visibleSamples, maxAngle, maxPosErr, diag };
    };
    const zoomP = analyseZoom(zoomPost);
    const zoomR = analyseZoom(zoomRaf);
    const zoomOk = zoomP.visibleSamples >= 6 && zoomP.maxAngle <= TOLERANCE_DEG;
    cases.push({
      id: "zoom1.14", chest: { x: 0, y: 0 },
      visibleAtSpawn: zoomP.visibleSamples >= 6,
      maxAngleDeg: Math.round(zoomP.maxAngle * 100) / 100,
      maxPosErrPx: Math.round(zoomP.maxPosErr * 10) / 10,
      edgeOk: true, ok: zoomOk, zoomVisibleSamples: zoomP.visibleSamples,
      diag: zoomOk ? undefined : zoomP.diag.slice(0, 8),
      raf: { ok: zoomR.visibleSamples >= 6 && zoomR.maxAngle <= TOLERANCE_DEG, visibleSamples: zoomR.visibleSamples, maxAngleDeg: Math.round(zoomR.maxAngle * 100) / 100, diag: zoomR.diag.slice(0, 4) },
    });

    // ---- Eintritts-Fall: Pfeil muss verschwinden, sobald die Truhe im View ist.
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
      const onPost = () => {
        const v = cam.worldView;
        const inside = cx > v.x + 8 && cx < v.x + v.width - 8 && cy > v.y + 8 && cy < v.y + v.height - 8;
        out.push({ visible: arrow.visible, inside, zoom: cam.zoom, sx: cx - v.x, cw: cam.width, rb: (window.__rbDbg ?? {}).scale ?? null });
        if (out.length >= 14) run.events.off("postupdate", onPost);
      };
      run.events.on("postupdate", onPost);
      function step() {
        run.teleport(run.posX + 40, run.posY);
        if (out.length >= 14) resolve(out); else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }));
    const insideSamples = disappear.filter((s) => s.inside);
    const visibleWhileInside = insideSamples.filter((s) => s.visible).length;
    const disappearOk = disappear[0]?.visible === true && visibleWhileInside <= 1 && insideSamples.length >= 2;
    cases.push({
      id: "disappear", chest: { x: 0, y: 0 },
      visibleAtSpawn: disappear[0]?.visible === true,
      maxAngleDeg: null, maxPosErrPx: null, edgeOk: true, ok: disappearOk,
      insideSamples: insideSamples.length, visibleWhileInside,
      frames: disappear.map((s) => ({ v: s.visible ? 1 : 0, i: s.inside ? 1 : 0, sx: Math.round(s.sx), cw: s.cw, zoom: s.zoom, rb: s.rb })),
    });

    const insideShot = withShots && fmt.dpr === 2
      ? await page.evaluate(() => {
          const run = window.__game.scene.getScene("run");
          const cam = run.cameras.main;
          cam.setZoom(1);
          run.chests.clear();
          const view = cam.worldView;
          const cx = view.centerX + 80;
          const cy = view.centerY;
          run.teleport(cx - 40, cy);
          const chest = run.chests.spawn(cx, cy);
          return { chestX: cx, chestY: cy, spriteVisible: chest.sprite.visible };
        })
      : undefined;
    if (withShots && fmt.dpr === 2) {
      await page.waitForTimeout(150);
      insideShot.arrowVisible = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        const chest = run.chests.chests[0];
        const cam = run.cameras.main;
        return { arrow: run.chests["arrow"].visible, inView: !!chest && chest.x > cam.worldView.x && chest.x < cam.worldView.x + cam.worldView.width };
      });
      await page.screenshot({ path: `${shotPrefix}-inside-${fmt.label.replace(/[^0-9x]/g, "")}.png` });
    }

    formats.push({ label: fmt.label, dpr: fmt.dpr, header, cases, insideShot, ok: cases.every((c) => c.ok) });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const report = {
  schema: "m10-chest-arrow-fix-repro/v2",
  generatedAt: new Date().toISOString(),
  toleranceDeg: TOLERANCE_DEG,
  marginPx: MARGIN,
  extraQuery,
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
  formats: formats.map((f) => ({
    label: f.label, ok: f.ok,
    cases: f.cases.map((c) => ({ id: c.id, ok: c.ok, maxAngleDeg: c.maxAngleDeg, visibleAtSpawn: c.visibleAtSpawn, rafOk: c.raf?.ok, rafMaxAngle: c.raf?.maxAngleDeg, skippedFirstFrame: c.raf?.skippedFirstFrame })),
  })),
  jsErrors: errors.length,
}, null, 2));
