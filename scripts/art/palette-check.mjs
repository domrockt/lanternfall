#!/usr/bin/env node
/**
 * M10 palette-guard — Messskript fuer die harte Pixel-Invariante.
 *
 * Laedt alle Sprite-/Effekt-Grids ueber den Vite-SSR-Modul-Loader (wie
 * `scripts/acceptance-count.mjs`) und prueft jedes Pixel gegen die 32 Farben aus
 * `src/palette.ts`. Ein Pixel ist nur gueltig, wenn es entweder transparent (`.`)
 * oder ein Palettenindex 0–31 ist. Alpha-Werte gibt es in den Zeichen-Grids nicht
 * (nur `.` oder ein Index), deshalb ist `alphaViolations` per Konstruktion 0 und
 * wird als solches ausgewiesen (`hasAlphaField: false`).
 *
 * Ergebnis: `shots/m10-palette-guard-baseline.json` + gedruckte Top-10-Verstoesse.
 *
 * Aufruf: node scripts/art/palette-check.mjs [outJson]
 *         (Default outJson = shots/m10-palette-guard-baseline.json)
 *
 * Die Analyse-Funktionen sind exportiert, damit `tests/palette-compliance.test.ts`
 * exakt dieselbe Logik nutzt (kein zweiter, abweichender Parser).
 */
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";

/** Zeichen → Palettenindex: 0-9 = 0-9, a-v = 10-31, '.' = transparent. */
export const VALID_CHAR = /^[0-9a-v]$/;

export function decodeChar(ch) {
  if (ch === "." || ch === undefined || ch === "") return -1; // transparent
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -2; // ungueltig / off-palette
}

/** Palette-INDEX->Grenze: gueltige Zeichen-Indizes sind 0..pal.length-1. */
export function validIndex(idx, pal) {
  return Number.isInteger(idx) && idx >= 0 && idx < pal.length;
}

/** Set der echten Farbwerte (fuer Hex-Farben aus Canvas/FX). */
export function colorSet(pal) {
  return new Set(pal);
}

/**
 * Analysiert ein Zeichen-Grid. Liefert Zaehler und die ersten Koordinaten von
 * Verstoessen (Datei/Grid/Pixelindex/Farbe stehen im Aufrufer-Kontext).
 */
export function analyzeGrid(name, file, rows, w, h, pal) {
  const total = w * h;
  let opaque = 0;
  let offPalette = 0;
  let alphaViolations = 0;
  const colors = new Set();
  const violations = [];

  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      const idx = decodeChar(ch);
      if (idx === -1) continue; // transparent
      if (idx === -2 || !validIndex(idx, pal)) {
        offPalette++;
        if (violations.length < 50) violations.push({ x, y, index: y * w + x, char: ch ?? "", reason: "off-palette" });
        continue;
      }
      opaque++;
      colors.add(idx);
    }
  }

  return {
    name, file, w, h,
    hasAlphaField: false,
    total,
    opaque,
    transparent: total - opaque - offPalette,
    offPalette,
    alphaViolations,
    colorCount: colors.size,
    transparentPct: total ? +((100 * (total - opaque - offPalette)) / total).toFixed(2) : 0,
    offPalettePct: total ? +((100 * offPalette) / total).toFixed(3) : 0,
    violations,
  };
}

/**
 * Analysiert ein numerisches Pixel-Grid (`(number|null)[][]`, z. B. aus
 * `enemySpriteFrames`). Nur ganze Indizes 0–31 oder `null` sind gueltig; jeder
 * andere Wert (NaN, 32, -1, Float) ist off-palette.
 */
export function analyzePixelGrid(name, file, grid, pal) {
  const h = grid.length;
  const w = h ? grid[0].length : 0;
  const total = w * h;
  let opaque = 0;
  let offPalette = 0;
  const colors = new Set();
  const violations = [];
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < w; x++) {
      const v = row[x];
      if (v === null || v === undefined) continue;
      if (!validIndex(v, pal)) {
        offPalette++;
        if (violations.length < 50) violations.push({ x, y, index: y * w + x, color: String(v), reason: "off-palette" });
        continue;
      }
      opaque++;
      colors.add(v);
    }
  }
  return {
    name, file, w, h,
    hasAlphaField: false,
    total, opaque, transparent: total - opaque - offPalette,
    offPalette, alphaViolations: 0,
    colorCount: colors.size,
    transparentPct: total ? +((100 * (total - opaque - offPalette)) / total).toFixed(2) : 0,
    offPalettePct: total ? +((100 * offPalette) / total).toFixed(3) : 0,
    violations,
  };
}

/**
 * Sammelt die statischen Zeichen-Grids aus den Modulen (textures + gen-*).
 * Erwartet die Modul-Namespaces, wie sie der SSR-Loader liefert.
 */
export function collectStaticSources({ textures, genEnemies, genBosses, genChars, genIcons, genProps, genTitle, genUi }) {
  const out = [];
  for (const [name, def] of Object.entries(textures.SPRITE_GRIDS)) {
    out.push({ file: "src/gfx/textures.ts", name, rows: def.rows, w: def.w, h: def.h });
  }
  const genMods = [
    ["src/gfx/gen-enemies.ts", genEnemies?.GEN_ENEMIES],
    ["src/gfx/gen-bosses.ts", genBosses?.GEN_BOSSES],
    ["src/gfx/gen-chars.ts", genChars?.GEN_CHARS],
    ["src/gfx/gen-icons.ts", genIcons?.GEN_ICONS],
    ["src/gfx/gen-props.ts", genProps?.GEN_PROPS],
    ["src/gfx/gen-title.ts", genTitle?.GEN_TITLE],
    ["src/gfx/gen-ui.ts", genUi?.GEN_UI],
  ];
  for (const [file, rec] of genMods) {
    if (!rec) continue;
    for (const [name, def] of Object.entries(rec)) {
      for (let i = 0; i < def.frames.length; i++) {
        out.push({ file, name: def.frames.length > 1 ? `${name}#${i}` : name, rows: def.frames[i], w: def.w, h: def.h });
      }
    }
  }
  return out;
}

/** Fake-Canvas: faengt fillStyle-Hexwerte je Pixel auf, ohne DOM. */
export function makeFakeDocument(captured) {
  class FakeCanvas {
    constructor() { this._w = 0; this._h = 0; this.px = new Map(); this.ctx = null; }
    set width(v) { this._w = v; }
    get width() { return this._w; }
    set height(v) { this._h = v; }
    get height() { return this._h; }
    getContext() {
      if (this.ctx) return this.ctx;
      let color = -1;
      const self = this;
      this.ctx = {
        imageSmoothingEnabled: false,
        globalAlpha: 1,
        set fillStyle(v) {
          const m = /^#([0-9a-fA-F]{6})$/.exec(v);
          color = m ? parseInt(m[1], 16) : -1;
          if (!m) console.error(`[palette-check] fillStyle ohne #rrggbb: ${v}`);
        },
        fillRect(x, y) { self.px.set(y * 10000 + x, { color, alpha: this.globalAlpha }); },
      };
      return this.ctx;
    }
  }
  return { createElement: () => new FakeCanvas() };
}

/** Analysiert die vom Fake-Canvas eingefangenen FX-Texturen. */
export function analyzeCapturedFx(captured, pal) {
  const palette = colorSet(pal);
  const out = [];
  for (const [key, canvas] of captured) {
    const w = canvas.width, h = canvas.height;
    const total = w * h;
    let opaque = 0, offPalette = 0, alphaViolations = 0;
    const colors = new Set();
    const violations = [];
    for (const [p, { color, alpha }] of canvas.px) {
      const x = p % 10000, y = Math.floor(p / 10000);
      if (alpha !== 0 && alpha !== 1) {
        alphaViolations++;
        if (violations.length < 50) violations.push({ x, y, index: y * w + x, color: `#${color.toString(16)}`, alpha, reason: "alpha" });
        continue;
      }
      if (alpha === 0) continue; // transparent
      if (!palette.has(color)) {
        offPalette++;
        if (violations.length < 50) violations.push({ x, y, index: y * w + x, color: `#${color.toString(16)}`, reason: "off-palette" });
        continue;
      }
      opaque++;
      colors.add(color);
    }
    out.push({
      name: key, file: "src/gfx/gen-fx.ts", w, h,
      hasAlphaField: true,
      total, opaque, transparent: total - opaque,
      offPalette, alphaViolations,
      colorCount: colors.size,
      transparentPct: total ? +((100 * (total - opaque)) / total).toFixed(2) : 0,
      offPalettePct: total ? +((100 * offPalette) / total).toFixed(3) : 0,
      violations,
    });
  }
  return out;
}

/** Fasst Einzel-Grids zu einer Gesamtbilanz zusammen. */
export function summarize(assets) {
  const s = { assets: assets.length, pixels: 0, opaque: 0, offPalette: 0, alphaViolations: 0 };
  for (const a of assets) {
    s.pixels += a.total;
    s.opaque += a.opaque;
    s.offPalette += a.offPalette;
    s.alphaViolations += a.alphaViolations;
  }
  s.offPalettePct = s.pixels ? +((100 * s.offPalette) / s.pixels).toFixed(4) : 0;
  s.transparentPct = s.pixels ? +((100 * (s.pixels - s.opaque)) / s.pixels).toFixed(2) : 0;
  return s;
}

export async function loadAndAnalyze(root = process.cwd()) {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const palette = await server.ssrLoadModule("/src/palette.ts");
    const textures = await server.ssrLoadModule("/src/gfx/textures.ts");
    const genEnemies = await server.ssrLoadModule("/src/gfx/gen-enemies.ts");
    const genBosses = await server.ssrLoadModule("/src/gfx/gen-bosses.ts");
    const genChars = await server.ssrLoadModule("/src/gfx/gen-chars.ts");
    const genIcons = await server.ssrLoadModule("/src/gfx/gen-icons.ts");
    const genProps = await server.ssrLoadModule("/src/gfx/gen-props.ts");
    const genTitle = await server.ssrLoadModule("/src/gfx/gen-title.ts");
    const genUi = await server.ssrLoadModule("/src/gfx/gen-ui.ts");
    const genFx = await server.ssrLoadModule("/src/gfx/gen-fx.ts");

    const statics = collectStaticSources({ textures, genEnemies, genBosses, genChars, genIcons, genProps, genTitle, genUi })
      .map((g) => analyzeGrid(g.name, g.file, g.rows, g.w, g.h, palette.PAL));

    const captured = new Map();
    const prevDoc = globalThis.document;
    globalThis.document = makeFakeDocument(captured);
    try {
      genFx.createFxTextures({ textures: { exists: () => false, addCanvas: (key, canvas) => captured.set(key, canvas) } });
    } finally {
      globalThis.document = prevDoc;
    }
    const fx = analyzeCapturedFx(captured, palette.PAL);

    const assets = [...statics, ...fx];
    return { paletteSize: palette.PAL.length, assets, summary: summarize(assets) };
  } finally {
    await server.close();
  }
}

async function main() {
  const outPath = path.resolve(process.argv[2] ?? "shots/m10-palette-guard-baseline.json");
  const { paletteSize, assets, summary } = await loadAndAnalyze();

  const violations = assets
    .filter((a) => a.offPalette + a.alphaViolations > 0)
    .sort((a, b) => (b.offPalette + b.alphaViolations) - (a.offPalette + a.alphaViolations));
  const top = violations.slice(0, 10);

  const out = {
    milestone: "M10",
    lane: "m10-palette-guard",
    generatedAt: new Date().toISOString(),
    paletteSize,
    summary,
    sources: {
      textures: assets.filter((a) => a.file === "src/gfx/textures.ts").length,
      gen: assets.filter((a) => a.file !== "src/gfx/textures.ts" && a.file !== "src/gfx/gen-fx.ts").length,
      fx: assets.filter((a) => a.file === "src/gfx/gen-fx.ts").length,
    },
    assets: assets.map((a) => ({
      file: a.file, name: a.name, w: a.w, h: a.h,
      hasAlphaField: a.hasAlphaField,
      pixels: a.total, opaque: a.opaque, transparent: a.transparent,
      offPalette: a.offPalette, alphaViolations: a.alphaViolations,
      colorCount: a.colorCount,
      transparentPct: a.transparentPct, offPalettePct: a.offPalettePct,
      violations: a.violations,
    })),
    topViolations: top,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Palette ${paletteSize}: ${assets.length} Grids/Frames, ${summary.pixels} Pixel, `
    + `off-palette ${summary.offPalette} (${summary.offPalettePct} %), `
    + `alpha-Verstoesse ${summary.alphaViolations}, transparent ${summary.transparentPct} %`);
  if (top.length === 0) {
    console.log("Top-Verstoesse: keine (0 off-palette, 0 alpha).");
  } else {
    console.log("Top-10-Verstoesse:");
    top.forEach((a, i) => console.log(`  ${i + 1}. ${a.file} :: ${a.name} (${a.w}x${a.h}) — off ${a.offPalette}, alpha ${a.alphaViolations}`));
  }
  console.log(`geschrieben: ${path.relative(process.cwd(), outPath)}`);
  process.exitCode = summary.offPalette === 0 && summary.alphaViolations === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
