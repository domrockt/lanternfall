#!/usr/bin/env node
// M10-font-ui-frame-polish — Befund-Messung Bitmap-Font + 9-Slice-UI-Rahmen.
//
// Misst (Lane m10-font-ui-frame-polish, Karten #320/#321-Rest):
//  1. Glyph-Raster (statisch aus src/gfx/glyphs.ts): isolierte Einzelpixel
//     (Fehlstufen), nur-diagonal verbundene Ketten, geschlossene Loecher mit
//     minimaler Lochbreite ("Lochanteil").
//  2. UI-Rahmen (statisch aus src/gfx/gen-ui.ts, Grid ui_frame): Kanten-Zuege
//     (Durchgaengigkeit), Eckpixel, WCAG-Kontrast Kantenfarbe vs Panel-Innen-
//     flaeche und vs Innenfase (Grenzwert 3:1).
//  3. Live-Screens Titel / Options-Overlay / Results: fraktionale Skalierung
//     oder Position an sichtbaren Font-/Rahmen-Objekten (glyph_*, ui_frame).
//  4. Belege: Full-Screenshots + 4x-nearest-Crops (Rahmen-Panel, Knopf,
//     Glyph-Probe) als shots/m10-uiframe-<tag>-*.png + shots/m10-uiframe-<tag>.json.
//
// Läuft OHNE flock (keine FPS-/Echtzeit-Messung).
//   node scripts/m10-uiframe-polish.mjs --tag=before
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));

// ---------------------------------------------------------------- Statik ---
/** Zeichen → Palettenindex (identisch zu scripts/art/palette-check.mjs). */
export function decodeChar(ch) {
  if (ch === "." || ch === undefined || ch === "") return -1;
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

function lumOf(hex) {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = f((hex >> 16) & 255), g = f((hex >> 8) & 255), b = f(hex & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function wcag(a, b) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** 8-Fach-Komponenten der Ink-Pixel eines Glyphs (5x7). */
function inkComponents(rows) {
  const seen = Array.from({ length: 7 }, () => Array(5).fill(false));
  const comps = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 5; x++) {
      if (rows[y][x] !== "1" || seen[y][x]) continue;
      const stack = [[x, y]];
      seen[y][x] = true;
      const px = [];
      while (stack.length) {
        const [cx, cy] = stack.pop();
        px.push([cx, cy]);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx > 4 || ny > 6 || seen[ny][nx]) continue;
            if (rows[ny][nx] === "1") { seen[ny][nx] = true; stack.push([nx, ny]); }
          }
        }
      }
      const hasOrth = px.some(([cx, cy]) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const nx = cx + dx, ny = cy + dy;
          return nx >= 0 && ny >= 0 && nx < 5 && ny < 7 && rows[ny][nx] === "1";
        }));
      comps.push({ size: px.length, hasOrth, pixels: px });
    }
  }
  return comps;
}

/** Geschlossene Loecher: 4-Fach-Regionen von 0, die den Gridrand nicht erreichen. */
function glyphHoles(rows) {
  const seen = Array.from({ length: 7 }, () => Array(5).fill(false));
  const holes = [];
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 5; x++) {
      if (rows[y][x] === "1" || seen[y][x]) continue;
      const stack = [[x, y]];
      seen[y][x] = true;
      const px = [];
      let touchesBorder = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        px.push([cx, cy]);
        if (cx === 0 || cy === 0 || cx === 4 || cy === 6) touchesBorder = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx > 4 || ny > 6 || seen[ny][nx]) continue;
          if (rows[ny][nx] !== "1") { seen[ny][nx] = true; stack.push([nx, ny]); }
        }
      }
      if (!touchesBorder) {
        const xs = px.map((p) => p[0]), ys = px.map((p) => p[1]);
        holes.push({
          size: px.length,
          w: Math.max(...xs) - Math.min(...xs) + 1,
          h: Math.max(...ys) - Math.min(...ys) + 1,
        });
      }
    }
  }
  return holes;
}

export function analyzeGlyphs(GLYPHS) {
  const perGlyph = {};
  const strays = [], diagChains = [], thinHoles = [];
  for (const [ch, rows] of Object.entries(GLYPHS)) {
    const comps = inkComponents(rows);
    const holes = glyphHoles(rows);
    perGlyph[ch] = {
      components: comps.map((c) => ({ size: c.size, orth: c.hasOrth })),
      holes: holes.map((h) => ({ size: h.size, w: h.w, h: h.h })),
    };
    for (const c of comps) {
      if (c.size === 1 && !c.hasOrth) strays.push(ch);
      if (!c.hasOrth && c.size >= 2 && c.size <= 3) diagChains.push(ch);
    }
    for (const h of holes) if (Math.min(h.w, h.h) === 1) thinHoles.push({ ch, ...h });
  }
  return {
    glyphCount: Object.keys(GLYPHS).length,
    perGlyph,
    isolatedSinglePixels: strays,           // Fehlstufen: freistehende 1-px-Punkte
    diagonalOnlyChains: diagChains,          // Info: 2-3 px nur diagonal verbunden
    onePxHoles: thinHoles,                   // Info: geschlossene Loecher mit Breite 1
    holeGlyphShare: Math.round(
      Object.values(perGlyph).filter((g) => g.holes.length > 0).length
        / Object.keys(perGlyph).length * 1000) / 1000,
  };
}

/** Rahmen-Analyse: Kanten-Zuege, Ecken, Kontrast gegen Innenflaeche/Fase. */
export function analyzeFrame(frame, PAL) {
  const g = frame.frames[0].map((row) => [...row].map(decodeChar));
  const H = g.length, W = g[0].length;
  const edge = (name, cells) => {
    const runs = [];
    for (const [x, y, v] of cells) {
      if (runs.length && runs[runs.length - 1].v === v) runs[runs.length - 1].len++;
      else runs.push({ v, len: 1, x, y });
    }
    return { name, runs: runs.map((r) => ({ color: r.v, len: r.len, at: [r.x, r.y] })) };
  };
  const top = edge("top", Array.from({ length: W }, (_, x) => [x, 0, g[0][x]]));
  const bottom = edge("bottom", Array.from({ length: W }, (_, x) => [x, H - 1, g[H - 1][x]]));
  const left = edge("left", Array.from({ length: H }, (_, y) => [0, y, g[y][0]]));
  const right = edge("right", Array.from({ length: H }, (_, y) => [W - 1, y, g[y][W - 1]]));
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]
    .map(([x, y]) => ({ x, y, color: g[y][x] }));
  const center = g[Math.floor(H / 2)][Math.floor(W / 2)];
  const innerBevel = g[2][2];
  const lum = (i) => lumOf(PAL[i]);
  const contrast = (edgeRun, against, label) => ({
    edge: `${label} (${edgeRun.color})`,
    against: `${label === "" ? "" : ""}${against}`,
    ratio: Math.round(wcag(lum(edgeRun.color), lum(against)) * 100) / 100,
  });
  const dom = (e) => e.runs.reduce((a, b) => (b.len > a.len ? b : a));
  const res = { w: W, h: H, top, bottom, left, right, corners, centerColor: center };
  res.contrast = {
    topLight_vs_interior: contrast(dom(top), center, "top"),
    leftLight_vs_interior: contrast(dom(left), center, "left"),
    bottomDark_vs_interior: contrast(dom(bottom), center, "bottom"),
    rightDark_vs_interior: contrast(dom(right), center, "right"),
    topLight_vs_innerBevel: contrast(dom(top), innerBevel, "topBevel"),
  };
  res.pass3to1 = {
    top: res.contrast.topLight_vs_interior.ratio >= 3,
    left: res.contrast.leftLight_vs_interior.ratio >= 3,
    bottom: res.contrast.bottomDark_vs_interior.ratio >= 3,
    right: res.contrast.rightDark_vs_interior.ratio >= 3,
  };
  return res;
}

// ------------------------------------------------------------------ Live ---
const SCAN_SRC = `
  function lfRendererName(game) {
    const gl = game.renderer?.gl ?? null;
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null;
  }
  function lfCollectObjects(scene) {
    const out = [];
    const visit = (list, ox, oy) => {
      for (const obj of list) {
        if (!obj) continue;
        const wx = ox + (obj.x ?? 0), wy = oy + (obj.y ?? 0);
        if (obj.list) visit(obj.list, wx, wy);
        if (obj.texture && obj.frame) {
          out.push({
            type: obj.type, texKey: String(obj.texture.key),
            frameName: String(obj.frame.name ?? ""),
            frameW: obj.frame.width, frameH: obj.frame.height,
            scaleX: obj.scaleX, scaleY: obj.scaleY, x: wx, y: wy,
            originX: obj.originX, originY: obj.originY,
            // NineSlice/Glyphs: Anzeigegroesse kommt bei NineSlice aus width/
            // height (nicht aus scale) — displayWidth ist die Wahrheit.
            displayW: obj.displayWidth ?? obj.frame.width * obj.scaleX,
            displayH: obj.displayHeight ?? obj.frame.height * obj.scaleY,
            alpha: obj.alpha, visible: obj.visible, depth: obj.depth,
          });
        }
      }
    };
    visit(scene.children.list, 0, 0);
    return out;
  }
  /** Fraktionale Skalierung/Position NUR an Font-/Rahmen-Objekten (Lane-Scope). */
  function lfFractional(objs) {
    const inScope = (o) => String(o.texKey).startsWith("glyph_") || String(o.texKey) === "ui_frame";
    const out = [];
    for (const o of objs) {
      if (!o.visible || o.alpha < 0.05 || !inScope(o)) continue;
      const dw = o.displayW, dh = o.displayH;
      const left = o.x - o.originX * dw, top = o.y - o.originY * dh;
      if (Math.abs(dw - Math.round(dw)) > 1e-3 || Math.abs(dh - Math.round(dh)) > 1e-3
        || Math.abs(left - Math.round(left)) > 1e-3 || Math.abs(top - Math.round(top)) > 1e-3) {
        out.push({ texKey: o.texKey, type: o.type, scaleX: o.scaleX, scaleY: o.scaleY,
          x: o.x, y: o.y, displayW: Math.round(dw * 100) / 100, displayH: Math.round(dh * 100) / 100 });
      }
    }
    return out;
  }
  /** 4x-nearest-Crop aus dem Framebuffer; Koordinaten im internen Spielraum. */
  async function lfCrop(game, x, y, w, h, outScale = 4) {
    const factor = game.canvas.width / game.scale.width;
    const img = await new Promise((resolve) =>
      game.renderer.snapshotArea(Math.round(x * factor), Math.round(y * factor),
        Math.round(w * factor), Math.round(h * factor), resolve));
    const c = document.createElement("canvas");
    c.width = Math.round(w * factor); c.height = Math.round(h * factor);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const up = document.createElement("canvas");
    up.width = Math.round(w * outScale); up.height = Math.round(h * outScale);
    const uctx = up.getContext("2d");
    uctx.imageSmoothingEnabled = false;
    uctx.drawImage(c, 0, 0, up.width, up.height);
    return up.toDataURL("image/png");
  }
  /** Groesste ui_frame-NineSlice-Flaeche der Szene + Knopf-Label-Bounds. */
  function lfFrameRects(scene) {
    const objs = lfCollectObjects(scene).filter((o) => o.texKey === "ui_frame" && o.visible);
    const labels = [];
    const walk = (list) => {
      for (const c of list) {
        if (!c) continue;
        if (c.list) walk(c.list);
        if (c.valueText !== undefined) labels.push({ text: c.valueText, x: c.x, y: c.y, w: c.textWidth ?? 0 });
      }
    };
    walk(scene.children.list);
    return { frames: objs, labels };
  }
`;

/** Selektoren (in-page): Rechteck je nach Token. */
const SELECTORS = `
  function lfPickRect(kind, frames, labels) {
    const pad = (f, p, scale) => ({ x: f.x - f.displayW / 2 - p, y: f.y - f.displayH / 2 - p,
      w: f.displayW + 2 * p, h: f.displayH + 2 * p, scale });
    const sorted = [...frames].sort((a, b) => b.displayW * b.displayH - a.displayW * a.displayH);
    if (kind === "title-button") {
      const f = frames.filter((o) => o.displayW < 200).sort((a, b) => b.displayW - a.displayW)[0];
      return f && pad(f, 3, 4);
    }
    if (kind === "options-panel") { const f = sorted[0]; return f && pad(f, 3, 3); }
    if (kind === "results-panel") { const f = sorted[0]; return f && pad(f, 3, 2); }
    return null;
  }
`;

async function snapCrop(page, sceneName, kind, outPath) {
  const dataUrl = await page.evaluate(async ({ src, sceneName, kind }) => {
    // eslint-disable-next-line no-eval
    eval(src);
    const game = window.__game;
    const scene = game.scene.getScene(sceneName);
    const { frames } = lfFrameRects(scene);
    const rect = lfPickRect(kind, frames);
    if (!rect) return null;
    return lfCrop(game, rect.x, rect.y, rect.w, rect.h, rect.scale ?? 4);
  }, { src: SCAN_SRC + SELECTORS, sceneName, kind });
  if (!dataUrl) { console.log(`SKIP ${outPath} (kein Rechteck)`); return null; }
  writeFileSync(outPath, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  console.log("crop", outPath);
  return outPath;
}

// ------------------------------------------------------------------- Run ---
/** Nur bei Direktaufruf ausfuehren — Tests importieren nur die Analysefunktionen. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await runLane();

async function runLane() {
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding"],
});

// Statische Analyse ueber Vite-SSR (einzelne Quellen der Wahrheit).
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const { GLYPHS } = await vite.ssrLoadModule("/src/gfx/glyphs.ts");
const { GEN_UI } = await vite.ssrLoadModule("/src/gfx/gen-ui.ts");
const { PAL } = await vite.ssrLoadModule("/src/palette.ts");
const glyphs = analyzeGlyphs(GLYPHS);
const frame = analyzeFrame(GEN_UI.ui_frame, PAL);
await vite.close();

const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const out = { tag: TAG, profile: "640x360@2", renderer: null, screens: {}, glyphs, frame, jsErrors: [] };
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 15000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(2000);

  const scanScreen = async (name, sceneName) => {
    out.screens[name] = await page.evaluate(({ src, sceneName }) => {
      // eslint-disable-next-line no-eval
      eval(src);
      const game = window.__game;
      const scene = game.scene.getScene(sceneName);
      const objs = lfCollectObjects(scene);
      return {
        scene: sceneName,
        objectCount: objs.length,
        fontFrameObjects: objs.filter((o) => String(o.texKey).startsWith("glyph_") || o.texKey === "ui_frame").length,
        fractionalFontFrame: lfFractional(objs),
        renderer: lfRendererName(game),
      };
    }, { src: SCAN_SRC, sceneName });
    out.renderer = out.screens[name].renderer;
  };

  const shot = (name) => page.screenshot({ path: `shots/m10-uiframe-${TAG}-${name}.png` });

  // 1) Titel
  await shot("title");
  await scanScreen("title", "title");
  await snapCrop(page, "title", "title-button",
    `shots/m10-uiframe-${TAG}-title-button-4x.png`);
  // Glyph-Probe: alle Glyphen einmal sichtbar rendern, 4x ablichten, wieder entfernen.
  await page.evaluate(async ({ src }) => {
    // eslint-disable-next-line no-eval
    eval(src);
    const game = window.__game;
    const scene = game.scene.getScene("title");
    const { PixelText } = window.__lfFont;
    const lines = [
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "ÄÖÜäöüß:.,!%+-/?'&*=()<>·",
    ];
    const texts = lines.map((s, i) => {
      const t = new PixelText(scene, 8, 240 + i * 12, s, 10, "left");
      t.setDepth(5000);
      return t;
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__lfSpecRect = { x: 4, y: 236, w: 240, h: 30, scale: 4 };
    await new Promise((r) => setTimeout(r, 30));
    const game2 = window.__game;
    const rect = window.__lfSpecRect;
    const dataUrl = await lfCrop(game2, rect.x, rect.y, rect.w, rect.h, rect.scale);
    window.__lfSpecData = dataUrl;
    for (const t of texts) t.destroy();
  }, { src: SCAN_SRC }).catch((e) => errors.push("specimen: " + String(e)));
  const spec = await page.evaluate(() => window.__lfSpecData ?? null);
  if (spec) {
    writeFileSync(`shots/m10-uiframe-${TAG}-glyph-specimen-4x.png`,
      Buffer.from(spec.replace(/^data:image\/png;base64,/, ""), "base64"));
    console.log("crop", `shots/m10-uiframe-${TAG}-glyph-specimen-4x.png`);
  }

  // 2) Options-Overlay (Taste O im Titel)
  await page.keyboard.press("o");
  await page.waitForTimeout(500);
  await shot("options");
  await scanScreen("options", "title");
  await snapCrop(page, "title", "options-panel",
    `shots/m10-uiframe-${TAG}-options-panel-3x.png`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 3) Results (Run starten, Aufgeben ueber finishRun)
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__lf.setSuppressLevelUps(true);
    window.__lf.god(true);
    window.__lf.skipTo(1700);
    window.__lf.finishRun("dawn");
  });
  await waitForScene(page, "results", 30000);
  await page.waitForTimeout(600);
  await shot("results");
  await scanScreen("results", "results");
  await snapCrop(page, "results", "results-panel",
    `shots/m10-uiframe-${TAG}-results-panel-2x.png`);
} finally {
  out.jsErrors = errors;
  writeFileSync(`shots/m10-uiframe-${TAG}.json`, JSON.stringify(out, null, 2));
  await page.close();
  await browser.close();
  await server?.close?.().catch?.(() => {});
}

console.log(JSON.stringify({
  glyphs: { isolatedSinglePixels: glyphs.isolatedSinglePixels,
    diagonalOnlyChains: glyphs.diagonalOnlyChains,
    onePxHoles: glyphs.onePxHoles, holeGlyphShare: glyphs.holeGlyphShare },
  frame: { contrast: frame.contrast, pass3to1: frame.pass3to1,
    corners: frame.corners, edges: { top: frame.top.runs, bottom: frame.bottom.runs,
      left: frame.left.runs, right: frame.right.runs } },
  screens: Object.fromEntries(Object.entries(out.screens).map(([k, v]) =>
    [k, { fontFrameObjects: v.fontFrameObjects, fractional: v.fractionalFontFrame.length,
      fractionalDetail: v.fractionalFontFrame }])),
  jsErrors: errors.length,
}, null, 2));
}
