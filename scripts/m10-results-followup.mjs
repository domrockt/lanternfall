#!/usr/bin/env node
// M10-results-followup (#4382): Ergebnis-Screen nach view-fill-refit +
// menubg-crisp gegen alle 3 Abnahme-Formate neu pruefen.
//
// Rendert den Ergebnis-Screen bei 640x360 (dpr 1, Fill-View), 780x360@3 und
// 1920x1080 (dpr 1 -> logisch 640x360@3) im Stressmodus mit allen 12
// Waffennamen (?debug=1&stress12), Victory (dawn) und Defeat (death), und
// misst die ECHT gerenderten Bounding-Boxen aller Text-/Balken-/Icon-Elemente.
//
//   shots/m10-results-followup-<view>-<case>-<tag>.png
//   shots/m10-results-followup-<tag>.json   (je Format: Text-Rechtecke + Overlaps)
//
// Renderer-String-Pflicht: der WebGL-Renderer wird mitgemessen; swiftShader /
// Software-Renderer = FAIL (iGPU-Pflicht der Abnahme).
// Kein FPS-Gate, kein flock: reine Geometrie-/Anzeige-Messung.
// Aufruf: node scripts/m10-results-followup.mjs --tag before|after
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const VIEWS = [
  { view: "640x360", width: 640, height: 360, dpr: 1 },
  { view: "780x360@3", width: 780, height: 360, dpr: 3 },
  { view: "1920x1080", width: 1920, height: 1080, dpr: 1 },
];
const CASES = [
  { case: "victory", reason: "dawn" },
  { case: "defeat", reason: "death" },
];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];

// Echte Bounding-Boxen aus der laufenden Szene sammeln (Struktur-Erkennung,
// Klassennamen sind im Bundle minified; Container-Skalierung selbst aufloesen).
async function collect(page) {
  return page.evaluate(() => {
    const sc = window.__game.scene.getScene("results");
    const round = (v) => Math.round(v * 10) / 10;
    const union = (a, b) => ({
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.max(a.x + a.w, b.x + b.w) - Math.min(a.x, b.x),
      h: Math.max(a.y + a.h, b.y + b.h) - Math.min(a.y, b.y),
    });
    function boundsOf(o, px, py, psx, psy) {
      if (!o.list && o.texture === undefined && o.geom === undefined && o.fillColor === undefined) return null;
      if (o.list) {
        const cx = px + psx * o.x, cy = py + psy * o.y;
        const csx = psx * (o.scaleX ?? 1), csy = psy * (o.scaleY ?? 1);
        let b = null;
        for (const c of o.list) {
          if (c.visible === false) continue;
          const r = boundsOf(c, cx, cy, csx, csy);
          if (r) b = b ? union(b, r) : r;
        }
        return b;
      }
      const w = (o.displayWidth ?? o.width ?? 0) * psx;
      const h = (o.displayHeight ?? o.height ?? 0) * psy;
      if (w <= 0 || h <= 0) return null;
      const ox = o.originX ?? 0.5, oy = o.originY ?? 0.5;
      return { x: px + psx * o.x - ox * w, y: py + psy * o.y - oy * h, w, h };
    }
    const items = [];
    for (const o of sc.children.list) {
      if (o.visible === false) continue;
      const b = boundsOf(o, 0, 0, 1, 1);
      if (!b) continue;
      const kind = o.list
        ? (typeof o.valueText === "string" ? "pixeltext" : "container")
        : (o.geom !== undefined || o.fillColor !== undefined ? "rect" : "image");
      items.push({
        kind,
        depth: o.depth ?? 0,
        text: kind === "pixeltext" ? o.valueText : undefined,
        key: o.texture?.key ?? undefined,
        x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h),
      });
    }
    const proof = typeof sc.proof === "function" ? sc.proof() : null;
    // Renderer-String (WebGL UNMASKED_RENDERER_WEBGL) + logische View.
    let renderer = null;
    try {
      const r = window.__game.renderer;
      const gl = r.gl ?? (r.canvas && r.canvas.getContext("webgl2")) ?? null;
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        renderer = ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER);
      }
    } catch { renderer = "unavailable"; }
    return {
      items, proof, renderer,
      logical: { w: sc.viewW ?? sc.scale.width, h: sc.viewH ?? sc.scale.height },
      canvas: { w: sc.scale.width, h: sc.scale.height },
    };
  });
}

function classify(it) {
  if (it.kind === "image" && it.key === "vignette") return "background";
  if (it.kind === "rect" && it.w >= 400 && it.h >= 200) return "panel";
  if (it.kind === "pixeltext") return "text";
  if (it.kind === "image") return "icon";
  if (it.kind === "rect" && it.w <= 90 && it.h <= 8) return "bar";
  if (it.kind === "rect" && it.w <= 2) return "divider";
  if (it.kind === "rect" && it.w <= 200 && it.h <= 24) return "box";
  if (it.kind === "container") return "button";
  return "other";
}

function label(it, i) {
  const base = `${it.cls}#${i}`;
  if (it.text !== undefined) return `${base}:${it.text.slice(0, 24)}`;
  if (it.key !== undefined) return `${base}:${it.key}`;
  return base;
}

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && a.x + a.w > b.x && a.y + a.h > b.y;
}

function contained(small, big) {
  return small.x >= big.x && small.y >= big.y &&
    small.x + small.w <= big.x + big.w + 0.5 && small.y + small.h <= big.y + big.h + 0.5;
}

function findOverlaps(items, view) {
  const elems = items
    .map((it) => ({ ...it, cls: classify(it) }))
    .filter((it) => !["background", "panel", "other"].includes(it.cls))
    .map((it, i) => ({ ...it, id: label(it, i) }));
  const overlaps = [];
  for (let i = 0; i < elems.length; i++) {
    for (let j = i + 1; j < elems.length; j++) {
      const a = elems[i], b = elems[j];
      if (!intersects(a, b)) continue;
      // Balken-Fuellung ueber Balken-Hintergrund ist Absicht.
      if (a.cls === "bar" && b.cls === "bar") continue;
      // Text in seinem eigenen Rahmen (Bestwert-Banner) ist Absicht.
      if ((a.cls === "box" && b.cls === "text" && contained(b, a)) ||
          (b.cls === "box" && a.cls === "text" && contained(a, b))) continue;
      overlaps.push({ a: a.id, b: b.id, cls: `${a.cls}|${b.cls}` });
    }
  }
  // Clipping: Panel-schneidende Elemente duerfen nicht darausragen; Knöpfe/
  // Fusszeile liegen unterhalb des Panels und sind dort gewollt.
  const panel = items.find((it) => classify(it) === "panel");
  const clipped = [];
  for (const it of elems) {
    if (panel && intersects(it, panel) && !contained(it, panel)) {
      clipped.push({ id: it.id, edge: "panel" });
    }
    if (it.x < -0.5 || it.y < -0.5 || it.x + it.w > view.w + 0.5 || it.y + it.h > view.h + 0.5) {
      clipped.push({ id: it.id, edge: "canvas" });
    }
  }
  return { elements: elems.length, overlaps, clipped };
}

const results = [];
try {
  for (const v of VIEWS) {
    for (const c of CASES) {
      const context = await browser.newContext({
        viewport: { width: v.width, height: v.height },
        deviceScaleFactor: v.dpr,
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${v.view}/${c.case}: ${String(e)}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${v.view}/${c.case}: ${m.text()}`); });
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&stress12&seed=7`);
      await startRun(page);
      await page.evaluate((reason) => window.__lf.finishRun(reason), c.reason);
      await page.waitForFunction(() => window.__lf.state().scene === "results", { timeout: 8000 });
      await page.waitForTimeout(400);
      const shot = `shots/m10-results-followup-${v.view.replace("@3", "")}-${c.case}-${TAG}.png`;
      await page.screenshot({ path: shot });
      const { items, proof, renderer, logical, canvas } = await collect(page);
      const m = findOverlaps(items, canvas);
      results.push({
        view: v.view, case: c.case, reason: c.reason, shot, renderer,
        logical, canvas,
        elements: m.elements,
        overlapCount: m.overlaps.length,
        overlaps: m.overlaps,
        clippedCount: m.clipped.length,
        clipped: m.clipped,
        sceneProofOverlaps: proof ? proof.overlaps : null,
        textItems: items.filter((it) => it.kind === "pixeltext")
          .map((it) => ({ text: it.text, x: it.x, y: it.y, w: it.w, h: it.h })),
        items,
      });
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

const totalOverlaps = results.reduce((s, r) => s + r.overlapCount, 0);
const totalClipped = results.reduce((s, r) => s + r.clippedCount, 0);
const software = results.some((r) => /swiftshader|software|llvmpipe/i.test(String(r.renderer)));
const out = {
  tag: TAG, generated: new Date().toISOString(),
  rendererOk: results.length > 0 && !software,
  results, totalOverlaps, totalClipped, errors,
};
writeFileSync(`shots/m10-results-followup-${TAG}.json`, JSON.stringify(out, null, 2));
for (const r of results) {
  console.log(`${r.view} ${r.case}: logical=${r.logical.w}x${r.logical.h} elements=${r.elements} overlaps=${r.overlapCount} clipped=${r.clippedCount} sceneProof=${r.sceneProofOverlaps} renderer=${r.renderer}`);
  for (const o of r.overlaps) console.log(`  OVERLAP ${o.a} <-> ${o.b} (${o.cls})`);
  for (const cl of r.clipped) console.log(`  CLIPPED ${cl.id} @${cl.edge}`);
}
console.log(`RESULT ${totalOverlaps === 0 && totalClipped === 0 && errors.length === 0 && !software ? "PASS" : "FAIL"} overlaps=${totalOverlaps} clipped=${totalClipped} errors=${errors.length} softwareRenderer=${software}`);
process.exit(totalOverlaps === 0 && totalClipped === 0 && errors.length === 0 && !software ? 0 : 1);
