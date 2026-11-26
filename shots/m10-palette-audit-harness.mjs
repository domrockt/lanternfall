#!/usr/bin/env node
/**
 * M10 Palette-Audit-Harness. Ausgefuehrt aus ~/tmp/m10-palette-audit/audit.mjs; diese
 * Datei ist die byte-identische Belegkopie im Lane-Commit (shots/m10-palette-*).
 *
 * Liest die Textur-Grids aus src/gfx/gen-{enemies,bosses,chars,fx,icons,ui}.ts
 * und die Palettenindizes aus src/palette.ts. Fuer jedes Frame:
 *   - Pixel gesamt (opake Pixel)
 *   - Off-Palette-Pixel (Zeichen/Index ausserhalb 0..31)
 *   - transparente Loecher IN der Silhouette (Flood-Fill von aussen)
 *   - Kontur: Randpixel (opak mit transparentem 4-Nachbarn) und davon nicht Index 0
 * Halbtransparenz: die Grids kennen nur "." (transparent) oder Palettenindex,
 * also per Konstruktion 0 Alpha-Kanten; zusaetzlich wird geprueft, ob ein
 * Frame-Zeichen kein gueltiger Index ist (dann Off-Palette).
 *
 * Aufruf: node audit.mjs [repoRoot] [outJson]
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? process.cwd());
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const require = createRequire(path.join(root, "node_modules/"));

/** Grid-Dateien sind reine JS-Objektliterale: interface-Zeile weg, export const -> module.exports. */
function loadGrid(file, exportName) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const m = new RegExp(`export\\s+const\\s+${exportName}\\b[^=]*=\\s*`).exec(src);
  if (!m) throw new Error(`export ${exportName} in ${file} nicht gefunden`);
  let start = m.index + m[0].length;
  while (src[start] !== "{" && src[start] !== "[") start++;
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  const literal = src.slice(start, end + 1);
  const module = { exports: {} };
  new Function("module", `module.exports.${exportName} = ${literal};`)(module);
  return module.exports[exportName];
}

const PAL = loadGrid("src/palette.ts", "PAL");

/**
 * gen-fx.ts erzeugt Frames zur Laufzeit ueber Funktionen. Wir transpilieren die
 * Datei einmal mit `tsc --ignoreConfig` nach ~/tmp/m10-palette-audit/fxbuild und
 * fuehren sie dann mit gestubbter Canvas/Phaser-Szene aus.
 */
function loadFx(fxBuildDir) {
  fs.rmSync(fxBuildDir, { recursive: true, force: true });
  execFileSync(path.join(root, "node_modules/.bin/tsc"), [
    "src/gfx/gen-fx.ts", "src/palette.ts",
    "--ignoreConfig", "--target", "es2020", "--module", "commonjs", "--outDir", fxBuildDir, "--skipLibCheck",
  ], { cwd: root, stdio: "pipe" });
  const loadCjs = (file, req) => {
    const module = { exports: {} };
    const code = fs.readFileSync(file, "utf8");
    new Function("require", "exports", "module", code)(req, module.exports, module);
    return module.exports;
  };
  const palette = loadCjs(path.join(fxBuildDir, "palette.js"), () => {});
  const req = (id) => {
    if (id === "../palette") return palette;
    throw new Error(`unexpected require ${id}`);
  };
  return loadCjs(path.join(fxBuildDir, "gfx/gen-fx.js"), req);
}
const HEX2IDX = new Map(PAL.map((v, i) => [v, i]));
const VALID = /^[0-9a-v]$/;

function charIndex(ch) {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "v") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

function analyse(w, h, decode) {
  const idx = new Array(w * h).fill(-1);
  let invalid = 0;
  const invalidCoords = [];
  let opaque = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = decode(x, y);
      if (v === null || v === undefined) continue;
      if (v < 0 || v > 31) {
        invalid++;
        if (invalidCoords.length < 200) invalidCoords.push([x, y]);
        continue;
      }
      idx[y * w + x] = v;
      opaque++;
    }
  }

  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (idx[p] !== -1 || outside[p]) return;
    outside[p] = 1;
    stack.push([x, y]);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const [x, y] = stack.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  let holes = 0;
  const holeCoords = [];
  const holeComponents = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (idx[p] !== -1 || outside[p]) continue;
      // neue Loch-Komponente
      let size = 0;
      const st = [[x, y]];
      while (st.length) {
        const [cx, cy] = st.pop();
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
        const cp = cy * w + cx;
        if (idx[cp] !== -1 || outside[cp]) continue;
        outside[cp] = 1;
        size++;
        if (holeCoords.length < 100) holeCoords.push([cx, cy]);
        st.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      holes += size;
      holeComponents.push({ x, y, size });
    }
  }
  holeComponents.sort((a, b) => b.size - a.size);

  let perimeter = 0, perimeterNonInk = 0, perimeterGlow = 0;
  const nonInkCoords = [];
  const boundaryHist = {};
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (idx[p] === -1) continue;
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      let boundary = false;
      for (const [nx, ny] of nb) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { boundary = true; break; }
        if (idx[ny * w + nx] === -1) { boundary = true; break; }
      }
      if (!boundary) continue;
      perimeter++;
      const c = idx[p];
      boundaryHist[c] = (boundaryHist[c] ?? 0) + 1;
      if (c !== 0) {
        perimeterNonInk++;
        if (c === 12 || c === 13) perimeterGlow++;
        else if (nonInkCoords.length < 100) nonInkCoords.push([x, y, c]);
      }
    }
  }

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (idx[y * w + x] !== -1) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const bbox = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

  return {
    opaque,
    invalid,
    invalidCoords,
    holes,
    holeCoords,
    holeComponents: holeComponents.slice(0, 20),
    holeComponentCount: holeComponents.length,
    perimeter,
    perimeterNonInk,
    perimeterGlow,
    boundaryHist,
    nonInkCoords,
    bbox,
    contourMissingPct: perimeter ? +(100 * perimeterNonInk / perimeter).toFixed(1) : 0,
  };
}

function fromGrid(def, fi) {
  const rows = def.frames[fi];
  const w = def.w, h = def.h;
  if (rows.length !== h) throw new Error(`${def.name ?? "sprite"} frame ${fi}: ${rows.length} Zeilen, erwartet ${h}`);
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error(`${def.name ?? "sprite"} frame ${fi} Zeile ${y}: Breite ${rows[y].length}, erwartet ${w}`);
  }
  const dec = (x, y) => {
    const ch = (rows[y] ?? "")[x];
    if (!ch || ch === ".") return null;
    return VALID.test(ch) ? charIndex(ch) : -2;
  };
  return analyse(w, h, dec);
}

function fxFrames() {
  const captured = new Map();
  class FakeCanvas {
    constructor() { this._w = 0; this._h = 0; this.px = new Map(); this.ctx = null; }
    set width(v) { this._w = v; }
    get width() { return this._w; }
    set height(v) { this._h = v; }
    get height() { return this._h; }
    getContext() {
      if (this.ctx) return this.ctx;
      let color = 0;
      const self = this;
      this.ctx = {
        imageSmoothingEnabled: false,
        set fillStyle(v) {
          const m = /^#([0-9a-fA-F]{6})$/.exec(v);
          color = m ? parseInt(m[1], 16) : -1;
        },
        fillRect(x, y) { self.px.set(y * 10000 + x, color); },
      };
      return this.ctx;
    }
  }
  const prevDoc = globalThis.document;
  globalThis.document = { createElement: () => new FakeCanvas() };
  const mod = loadFx(path.join(os.homedir(), "tmp/m10-palette-audit/fxbuild"));
  const scene = {
    textures: { exists: () => false, addCanvas: (key, canvas) => captured.set(key, canvas) },
  };
  mod.createFxTextures(scene);
  globalThis.document = prevDoc;

  const out = {};
  for (const [key, canvas] of captured) {
    const w = canvas.width, h = canvas.height;
    const dec = (x, y) => {
      const c = canvas.px.get(y * 10000 + x);
      if (c === undefined) return null;
      const i = HEX2IDX.get(c);
      return i === undefined ? -2 : i;
    };
    out[key] = { ...analyse(w, h, dec), w, h };
  }
  return out;
}

const classes = {
  enemies: { file: "src/gfx/gen-enemies.ts", exportName: "GEN_ENEMIES" },
  bosses: { file: "src/gfx/gen-bosses.ts", exportName: "GEN_BOSSES" },
  chars: { file: "src/gfx/gen-chars.ts", exportName: "GEN_CHARS" },
  icons: { file: "src/gfx/gen-icons.ts", exportName: "GEN_ICONS" },
  ui: { file: "src/gfx/gen-ui.ts", exportName: "GEN_UI" },
  fx: { file: "src/gfx/gen-fx.ts", special: true },
};

const assets = [];
function addAsset(cls, name, def) {
  const frames = def.frames.map((_, i) => ({ frame: `${name}_${i}`, w: def.w, h: def.h, ...fromGrid(def, i) }));
  assets.push({ class: cls, name, w: def.w, h: def.h, frameCount: frames.length, frames });
}

for (const [cls, spec] of Object.entries(classes)) {
  if (cls === "fx") {
    const fx = fxFrames();
    for (const [key, m] of Object.entries(fx)) {
      assets.push({ class: "fx", name: key, w: m.w, h: m.h, frameCount: 1, frames: [{ frame: key, w: m.w, h: m.h, ...m }] });
    }
  } else {
    const rec = loadGrid(spec.file, spec.exportName);
    if (!rec) throw new Error(`missing export ${spec.exportName}`);
    for (const [name, def] of Object.entries(rec)) addAsset(cls, name, def);
  }
}

const summary = {};
for (const a of assets) {
  const s = summary[a.class] ??= { assets: 0, frames: 0, pixels: 0, offPalette: 0, holes: 0, perimeter: 0, contourMissing: 0 };
  s.assets++;
  s.frames += a.frameCount;
  for (const f of a.frames) {
    s.pixels += f.opaque;
    s.offPalette += f.invalid;
    s.holes += f.holes;
    s.perimeter += f.perimeter;
    s.contourMissing += f.perimeterNonInk;
  }
  a.pixels = a.frames.reduce((n, f) => n + f.opaque, 0);
  a.offPalette = a.frames.reduce((n, f) => n + f.invalid, 0);
  a.holes = a.frames.reduce((n, f) => n + f.holes, 0);
  const per = a.frames.reduce((n, f) => n + f.perimeter, 0);
  const miss = a.frames.reduce((n, f) => n + f.perimeterNonInk, 0);
  a.contourMissingPct = per ? +(100 * miss / per).toFixed(1) : 0;
}

const result = {
  milestone: "M10",
  lane: "m10-palette-audit",
  baseSha: process.env.BASE_SHA ?? "f26dc4b",
  generatedAt: new Date().toISOString(),
  paletteSize: PAL.length,
  summary,
  assets: assets.map((a) => ({
    class: a.class,
    name: a.name,
    frameCount: a.frameCount,
    pixels: a.pixels,
    offPalette: a.offPalette,
    holes: a.holes,
    contourMissingPct: a.contourMissingPct,
    frames: a.frames.map((f) => ({
      frame: f.frame,
      w: f.w,
      h: f.h,
      pixels: f.opaque,
      offPalette: f.invalid,
      offPaletteCoords: f.invalidCoords,
      holes: f.holes,
      holeCoords: f.holeCoords,
      holeComponents: f.holeComponents,
      holeComponentCount: f.holeComponentCount,
      perimeter: f.perimeter,
      contourMissing: f.perimeterNonInk,
      contourGlow: f.perimeterGlow,
      contourMissingPct: f.contourMissingPct,
      boundaryHist: f.boundaryHist,
      nonInkCoords: f.nonInkCoords,
    })),
  })),
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.error(`geschrieben: ${outPath}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
