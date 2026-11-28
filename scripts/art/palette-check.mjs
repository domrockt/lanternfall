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
  // M10-palette-guard-evo (K1): Gegner-Geschosse liegen als eigene Grid-Tabelle
  // neben SPRITE_GRIDS und waren bislang von der Compliance-Fixture NICHT
  // abgedeckt — jetzt mitgeprueft (Truhen-Keys chest_closed/chest_open und die
  // Evo-/Boss-Keys laufen ueber SPRITE_GRIDS bzw. die FX-Erfassung mit).
  for (const [name, def] of Object.entries(textures.ENEMY_PROJECTILES ?? {})) {
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

// ── M10-palette-guard-evo (K1): Evo-FX-, Boss- und Truhen-Keys ──────────────
// Die Evo-FX-Kette (zornpendel, gewittersiegel, dornensturm, winter-w2,
// form-polish) und die wartenden Merges (chest-reveal, evo-fx-winter) bringen
// NEUE Texturen nach main. Diese Helfer machen die Abdeckung dieser Gruppen
// im Report UND im Test sichtbar (per-Key-Report + ratchet, statt Globalsumme).

/** Spiegel von BAKED_SIGNATURES in addEvolutionSignatures (src/gfx/gen-fx.ts,
 *  fuer die Guard-Lane read-only): Signaturen mit drawScale werden in voller
 *  Zielgroesse gebacken (phoenix 128, soul_beacon 96) — die 32x32-signatureFrame-
 *  Menge der fx-guard-Fixture erfasst diese Frames nicht. Die Rahmen sind ueber
 *  die Canvas-Erfassung gedeckt; dieser Export liefert sie zusaetzlich benannt
 *  (Report-Modus: Verstoesse je Key). */
export function collectEvolutionSources(genFx) {
  const out = [];
  for (const id of genFx.EVOLUTION_SIGNATURE_IDS) {
    const sig = genFx.EVOLUTION_SIGNATURES[id];
    const baked = sig.drawScale
      ? { phoenix: { size: 128, frame: genFx.phoenixSignatureFrame }, soul_beacon: { size: genFx.SOUL_SIGNATURE_SIZE, frame: genFx.soulSignatureFrame } }[id]
      : undefined;
    const w = baked ? baked.size : 32;
    const h = baked ? baked.size : 32;
    for (const kind of ["hit", "death"]) {
      out.push({
        id, kind, baked: Boolean(baked),
        key: genFx.signatureTextureKey(id, kind), w, h,
        frames: Array.from({ length: genFx.SIGNATURE_FRAME_COUNT }, (_, i) =>
          baked ? baked.frame(kind, i) : genFx.signatureFrame(sig.shape, sig.palette, i, kind)),
      });
    }
  }
  return out;
}

/** Boss-Keys: gen-bosses-Grids + Boss-Frames aus enemySprites + fx_boss_core. */
export function collectBossSourceKeys({ statics, numeric, fx }) {
  return {
    grids: statics.filter((a) => a.file === "src/gfx/gen-bosses.ts").map((a) => a.name),
    frames: [...new Set(numeric.filter((a) => a.name.startsWith("boss_")).map((a) => a.name.split("#")[0]))],
    fx: fx.filter((a) => a.name.startsWith("fx_boss")).map((a) => a.name),
  };
}

/** Truhen-Keys (chest_*) aus SPRITE_GRIDS — chest-reveal-Merge erweitert diese. */
export function collectChestKeys(statics) {
  return statics.filter((a) => a.file === "src/gfx/textures.ts" && a.name.startsWith("chest")).map((a) => a.name);
}

/** Hebel-Pointer je Datei/Key-Familie: wo wird der Verstoß gedreht, welcher
 *  Kettenglied-Job ist betroffen. Fuer Report + Bedarfsmeldung (K3). */
export function leverFor(file, key) {
  if (file === "src/gfx/gen-fx.ts") {
    if (key.includes("evo_hit_wrath_pendulum") || key.includes("evo_death_wrath_pendulum"))
      return { lever: "EVOLUTION_SIGNATURES.wrath_pendulum + signatureFrame/bake in src/gfx/gen-fx.ts", job: "Evo-Kette: zornpendel / form-polish" };
    if (key.includes("thunder_seal")) return { lever: "EVOLUTION_SIGNATURES.thunder_seal (fx_evo_*_thunder_seal) in src/gfx/gen-fx.ts", job: "Evo-Kette: gewittersiegel / form-polish" };
    if (key.includes("thorn_storm")) return { lever: "EVOLUTION_SIGNATURES.thorn_storm (fx_evo_*_thorn_storm) in src/gfx/gen-fx.ts", job: "Evo-Kette: dornensturm / form-polish" };
    if (key.includes("eternal_winter") || key.includes("winter")) return { lever: "EVOLUTION_SIGNATURES.eternal_winter (fx_evo_*_eternal_winter) in src/gfx/gen-fx.ts", job: "Evo-Kette: winter-w2 / evo-fx-winter / form-polish" };
    if (key.includes("soul")) return { lever: "soulSignatureFrame / orbSoulFrame in src/gfx/gen-fx.ts", job: "Evo-Kette: form-polish (soulpyre)" };
    if (key.includes("phoenix")) return { lever: "phoenixSignatureFrame / phoenix*Frame in src/gfx/gen-fx.ts", job: "Evo-Kette: form-polish (phoenix)" };
    if (key.startsWith("fx_boss")) return { lever: "deathFrameSets() (fx_boss_core) in src/gfx/gen-fx.ts", job: "Boss-FX-Lane" };
    return { lever: "createFxTextures()-Frames in src/gfx/gen-fx.ts", job: "FX-/Evo-Kette" };
  }
  if (file === "src/gfx/textures.ts") {
    if (key.startsWith("chest")) return { lever: `SPRITE_GRIDS.${key} in src/gfx/textures.ts`, job: "Truhen-Lane: chest-reveal-Merge" };
    if (key.startsWith("enemy_shot")) return { lever: `ENEMY_PROJECTILES.${key} in src/gfx/textures.ts`, job: "Gegner-/Fairness-Lane" };
    return { lever: `SPRITE_GRIDS.${key} in src/gfx/textures.ts`, job: "Art-Lane" };
  }
  if (file === "src/gfx/gen-bosses.ts") return { lever: `GEN_BOSSES.${key} in src/gfx/gen-bosses.ts`, job: "Boss-Art-Lane" };
  if (file === "src/gfx/enemySprites.ts") return { lever: `bossSpriteFrames (${key}) in src/gfx/enemySprites.ts`, job: "Boss-Art-Lane" };
  return { lever: `${file} :: ${key}`, job: "unbestimmt (Datei-Eigentuemer pruefen)" };
}

/** Report-Modus: Verstöße je Basis-Key (Frames zusammengefasst, '#' gefasst)
 *  mit Datei + Hebel + betroffenem Kettenglied-Job. */
export function violationsPerKey(assets) {
  const byKey = new Map();
  for (const a of assets) {
    if (a.offPalette + a.alphaViolations === 0) continue;
    const key = a.name.includes("#") ? a.name.split("#")[0] : a.name;
    const cur = byKey.get(`${a.file}::${key}`);
    if (!cur) {
      byKey.set(`${a.file}::${key}`, {
        file: a.file, key,
        frames: 1, offPalette: a.offPalette, alphaViolations: a.alphaViolations,
        first: a.violations[0] ?? null,
        ...leverFor(a.file, key),
      });
    } else {
      cur.frames++;
      cur.offPalette += a.offPalette;
      cur.alphaViolations += a.alphaViolations;
    }
  }
  return [...byKey.values()].sort((a, b) => (b.offPalette + b.alphaViolations) - (a.offPalette + a.alphaViolations));
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

// ── M10 FX-Frame-Guard (Lane m10-palette-fx-guard) ─────────────────────────
// Ergaenzung zur statischen Pixel-Invariante: gerenderte FX-Frames gegen die
// Mixel-Regeln pruefen (Dom 21:45Z: "eine Pixelgroesse fuer alles", Dither nur
// an Uebergangskanten 1-2 px, Kerne flaechig hell).

/**
 * Dither-/Halftone-Metrik fuer ein FX-Frame (Zeichen-Zeilen, "." = transparent).
 *
 * Ein Pixel gilt als Dither-Pixel, wenn es BOTH-Directions-Abwechslung hat:
 * mind. ein horizontaler UND ein vertikaler Nachbar ist opak und andersfarbig.
 * Das ist die Signatur von Schachbrett-/Halftone-Rastern (Abwechslung in beiden
 * Achsen); Streifen, Konturen und Zickzack-Beams wechseln nur quer zur Richtung
 * und bleiben unbeanstandet.
 *
 * Die BANDDICKE misst pro Dither-Pixel die durchgehende Dither-Lauf-Laenge in
 * allen 4 Richtungen (x, y, Diagonale \, Diagonale /) und nimmt das Minimum —
 * das ist die duennste Achse des Rasters an dieser Stelle. Ein Ring-/Kanten-
 * Dither (1-2 px radial) bleibt unter der Grenze, ein flaechiger Halftone-Kern
 * (z. B. Phoenix-Dither) ist in allen Richtungen dick und faellt auf.
 * bandPx = Maximum dieser Minima ueber alle Dither-Pixel (0 ohne Dither).
 */
export function ditherMetrics(rows) {
  const h = rows.length;
  const w = h ? rows[0].length : 0;
  const idx = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    const line = new Int16Array(w);
    for (let x = 0; x < w; x++) line[x] = decodeChar(row[x]);
    idx.push(line);
  }
  const isDither = Array.from({ length: h }, () => new Uint8Array(w));
  let ditherPixels = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = idx[y][x];
      if (c < 0) continue;
      let hDiff = false, vDiff = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = idx[ny][nx];
        if (n < 0 || n === c) continue;
        if (dx !== 0) hDiff = true;
        else vDiff = true;
      }
      if (hDiff && vDiff) { isDither[y][x] = 1; ditherPixels++; }
    }
  }
  // Banddicke: je Dither-Pixel durchgehende Lauf-Laenge in 4 Richtungen,
  // Minimum = duennste Achse; bandPx = Maximum dieser Minima.
  const runsAt = (y, x, dy, dx) => {
    let n = 1;
    for (let s = 1; ; s++) {
      const ny2 = y + dy * s, nx2 = x + dx * s;
      if (ny2 < 0 || nx2 < 0 || ny2 >= h || nx2 >= w || !isDither[ny2][nx2]) break;
      n++;
    }
    for (let s = 1; ; s++) {
      const ny2 = y - dy * s, nx2 = x - dx * s;
      if (ny2 < 0 || nx2 < 0 || ny2 >= h || nx2 >= w || !isDither[ny2][nx2]) break;
      n++;
    }
    return n;
  };
  let bandPx = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isDither[y][x]) continue;
      const t = Math.min(runsAt(y, x, 0, 1), runsAt(y, x, 1, 0), runsAt(y, x, 1, 1), runsAt(y, x, 1, -1));
      if (t > bandPx) bandPx = t;
    }
  }
  return { ditherPixels, bandPx };
}

/**
 * Analysiert ein FX-Frame-Set (Zeichen-Zeilen) mit Palette-Index-Gueltigkeit,
 * binaerer Alpha-Annahme und Dither-Metrik. Char-Grids haben per Konstruktion
 * binaeres Alpha ("." = 0, Index = 1) — alphaViolations bleibt hier 0 und wird
 * fuer Canvas-gefangene FX in analyzeCapturedFx gezaehlt.
 */
export function analyzeFxGuard(name, file, rows, w, h, pal) {
  const base = analyzeGrid(name, file, rows, w, h, pal);
  const dither = ditherMetrics(rows);
  return { ...base, dither };
}

/**
 * Mixel-Coverage fuer einen FX-Key bei bekanntem max. Laufzeit-Draw-Scale.
 * Regel: Draw-Scale > 1 nur mit Bake-Stufe >= ceil(Scale) (effektiver Draw-Scale
 * = Scale / Level <= 1). Nicht-Mixel-Keys (Level 1) gelten dann als nicht
 * gedeckt — die Liste der nicht gedeckten Keys wird im Test als Ratchet gegen
 * die Fixture gepinnt (neue ungedeckte FX machen den Test rot).
 */
export function scaleCoverage(key, maxScale, { mixelMaxLevel, mixelLevelFor }) {
  const max = mixelMaxLevel(key);
  const level = mixelLevelFor(key, maxScale);
  const effective = maxScale / level;
  return {
    key, maxScale, bakeMaxLevel: max, level,
    effectiveScale: +effective.toFixed(3),
    covered: effective <= 1.001,
  };
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

    // M10-palette-guard-evo (K1): Evo-/Boss-/Truhen-Coverage explizit ausweisen.
    const evolution = collectEvolutionSources(genFx).map((s) => s.frames.map((rows, i) =>
      analyzeGrid(`${s.key}#${i}`, "src/gfx/gen-fx.ts", rows, s.w, s.h, palette.PAL))).flat();
    const staticsKeys = statics.map((a) => a.name);
    const coverage = {
      evolutionSignatures: collectEvolutionSources(genFx).map((s) => s.key),
      boss: collectBossSourceKeys({ statics, numeric: [], fx }),
      chest: collectChestKeys(statics),
      enemyProjectiles: staticsKeys.filter((n) => n.startsWith("enemy_shot")),
    };

    const assets = [...statics, ...fx, ...evolution];
    return { paletteSize: palette.PAL.length, assets, summary: summarize(assets), coverage, evolution };
  } finally {
    await server.close();
  }
}

async function main() {
  const outPath = path.resolve(process.argv[2] ?? "shots/m10-palette-guard-baseline.json");
  const { paletteSize, assets, summary, coverage } = await loadAndAnalyze();

  const violations = assets
    .filter((a) => a.offPalette + a.alphaViolations > 0)
    .sort((a, b) => (b.offPalette + b.alphaViolations) - (a.offPalette + a.alphaViolations));
  const top = violations.slice(0, 10);

  const out = {
    milestone: "M10",
    lane: "m10-palette-guard-evo",
    generatedAt: new Date().toISOString(),
    paletteSize,
    summary,
    sources: {
      textures: assets.filter((a) => a.file === "src/gfx/textures.ts").length,
      gen: assets.filter((a) => a.file !== "src/gfx/textures.ts" && a.file !== "src/gfx/gen-fx.ts").length,
      fx: assets.filter((a) => a.file === "src/gfx/gen-fx.ts").length,
    },
    coverage,
    violationsPerKey: violationsPerKey(assets),
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
  const perKey = out.violationsPerKey;
  if (perKey.length === 0) {
    console.log("Verstoesse je Key: keine.");
  } else {
    console.log("Verstoesse je Key (Datei, Key, Hebel, Kettenglied-Job):");
    perKey.forEach((v, i) => console.log(`  ${i + 1}. ${v.file} :: ${v.key} — ${v.frames} Frame(s), off ${v.offPalette}, alpha ${v.alphaViolations}`
      + `\n     Hebel: ${v.lever}\n     Job: ${v.job}`));
  }
  console.log(`geschrieben: ${path.relative(process.cwd(), outPath)}`);
  process.exitCode = summary.offPalette === 0 && summary.alphaViolations === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
