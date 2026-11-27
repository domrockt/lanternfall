/**
 * M5-Effekt-Frames: handgesetzte, prozedurale Pixel-Frames (4–8 je Effekt).
 * Laufzeit-Assets entstehen ausschließlich hier (TS-Generator), keine Downloads.
 *
 * Jeder Effekt hat: hellen Kern (13/12), Glow-Halo, Farbrampe und deutliche
 * Masse. Die Frames werden als eigene Texturen `key`, `key_2`, … registriert.
 */
import type Phaser from "phaser";
import { PAL } from "../palette";

interface FxDef {
  w: number;
  h: number;
  frames: string[][];
}

/** Paletten-INDEX → CSS-Farbe. */
const hex = (i: number): string => "#" + PAL[i].toString(16).padStart(6, "0");

function addFrame(scene: Phaser.Scene, key: string, rows: string[], w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? "";
    for (let x = 0; x < w; x++) {
      const ch = row[x];
      if (!ch || ch === ".") continue;
      // 0 ist in FX-Frames echte Tinte (Palette 0); Transparenz ist "."
      const idx = charCode(ch);
      if (!Number.isFinite(idx)) continue;
      ctx.fillStyle = hex(idx);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  scene.textures.addCanvas(key, canvas);
}

/** Zeichen → Palettenindex: 0-9 a-v (a=10 … v=31). */
function charCode(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  const code = ch.charCodeAt(0) - 97 + 10;
  return Math.max(0, Math.min(31, code));
}

function addFrames(scene: Phaser.Scene, base: string, def: FxDef): void {
  def.frames.forEach((rows, i) => addFrame(scene, i === 0 ? base : `${base}_${i + 1}`, rows, def.w, def.h));
}

/** Kreis-/Blob-Maske mit Palette-Farbrampe; deterministisch (kein Math.random). */
function blob(w: number, h: number, ramp: number[], opts: { squash?: number; core?: number; seed?: number } = {}): string[] {
  const out: string[] = [];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w / 2 - 1;
  const ry = (h / 2 - 1) * (opts.squash ?? 1);
  const core = opts.core ?? 0.32;
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / Math.max(1, rx);
      const ny = (y - cy) / Math.max(1, ry);
      let d = Math.sqrt(nx * nx + ny * ny);
      // leichte, deterministische Formwelle für handgesetzte Silhouette
      d += Math.sin((x + y * 0.7) * 1.7 + (opts.seed ?? 0)) * 0.055;
      if (d > 1) row += ".";
      else if (d < core) row += "d"; // lanternWhite (13): Kern
      else if (d < core + 0.18) row += "c"; // candleWhite (12)
      else {
        const idx = Math.min(ramp.length - 1, Math.floor((d - core) / (1 - core) * ramp.length));
        row += String.fromCharCode(97 + ramp[idx]);
      }
    }
    out.push(row);
  }
  return out;
}

function ring(w: number, h: number, ramp: number[], inner = 0.62, sweep = 1): string[] {
  const out: string[] = [];
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = w / 2 - 1;
  const ry = h / 2 - 1;
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / Math.max(1, rx);
      const ny = (y - cy) / Math.max(1, ry);
      const d = Math.sqrt(nx * nx + ny * ny);
      const a = Math.atan2(ny, nx);
      // Ring-Band mit Zacken (deterministisch gezackt)
      const edge = inner + Math.sin(a * 9 + sweep * 2) * 0.05;
      if (d < edge || d > 1) row += ".";
      else if (d < edge + 0.10) row += "c";
      else {
        const idx = Math.min(ramp.length - 1, Math.floor((d - edge) / (1 - edge) * ramp.length));
        row += String.fromCharCode(97 + ramp[idx]);
      }
    }
    out.push(row);
  }
  return out;
}

/** Zickzack-Blitz mit Seitenast; x-Versatz alle zwei Zeilen. */
function boltFrame(seed: number, height = 16, width = 12): string[] {
  const rows: string[] = [];
  let cx = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    const jitter = Math.round(Math.sin((y + seed * 3) * 1.9) * 1.6 + Math.sin((y + seed) * 4.1) * 0.8);
    cx = Math.max(1, Math.min(width - 2, Math.floor(width / 2) + jitter));
    let row = "";
    for (let x = 0; x < width; x++) {
      if (x === cx) row += "d";
      else if (Math.abs(x - cx) === 1) row += "c";
      else if (Math.abs(x - cx) === 2) row += "g"; // amber (20)
      else row += ".";
    }
    rows.push(row);
  }
  // Verzweigung ab der Mitte: kurzer Seitenast nach rechts/links.
  const dir = seed % 2 === 0 ? 1 : -1;
  for (let i = 0; i < 4; i++) {
    const y = Math.floor(height * 0.35) + i;
    const x = cx + dir * (i + 1);
    if (y < height && x > 0 && x < width - 1) {
      const arr = rows[y].split("");
      arr[x] = i < 2 ? "c" : "g";
      rows[y] = arr.join("");
    }
  }
  return rows;
}

/** Eiskristall (großer Diamant) mit Facetten und Glanzkante; 4 Zerfallsstufen. */
function iceFrame(stage: number): string[] {
  const w = 15;
  const h = 21;
  const cx = 7;
  const cy = 10;
  const half = Math.max(2, 5 - stage);
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      // Diamant: horizontale Breite nimmt zur Spitze ab, Kanten bleiben gerade.
      const inside = dx + Math.floor(dy * 0.55) < half + 2;
      if (!inside) row += ".";
      else if (dx <= 1 && dy <= 2) row += "d";        // lanternWhite Kern
      else if (dx <= 2 && y < cy) row += "b";          // boneLight Glanzkante
      else if (x < cx) row += "j";                     // paleMist helle Facette
      else if (dx <= 3) row += "i";                    // mist
      else row += "g";                                 // fogBlue Rand
    }
    out.push(row);
  }
  // 2-px-Kontur nur an den Außenkanten, damit der Kristall auf Gras steht.
  return out.map((r) => r.replace(/\.$/, "."));
}

/** Bewegungsunschärfe-Bogen für Kettenflegel/Zornpendel. */
function smearFrame(stage: number, width = 44, height = 16): string[] {
  const out: string[] = [];
  const cx = width / 2;
  const cy = height - 3;
  const radius = width / 2 - 2;
  const arc = 0.5 + stage * 0.22;
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const inBand = Math.abs(d - radius) < 2.4;
      const inArc = Math.abs(a + Math.PI / 2) < arc;
      if (!inBand || !inArc) row += ".";
      else {
        // Vorderer Teil heller (Smear-Kern), hinterer Trail dunkler.
        const t = 1 - Math.abs(a + Math.PI / 2) / arc;
        row += t > 0.72 ? "d" : t > 0.48 ? "c" : t > 0.28 ? "a" : "5";
      }
    }
    out.push(row);
  }
  return out;
}

/** Boden-Siegel (Sturm/Donner): kantige Rune mit 8 geraden Zacken, 5 Pulsframes. */
function sealFrame(stage: number, size = 32): string[] {
  const out: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const put = (x: number, y: number, ch: string): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < size && iy < size) out[iy][ix] = ch;
  };
  const line = (x0: number, y0: number, x1: number, y1: number, ch: string): void => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let t = 0; t <= steps; t++) {
      put(Math.round(x0 + (x1 - x0) * t / steps), Math.round(y0 + (y1 - y0) * t / steps), ch);
    }
  };
  const r = 11 + stage * 0.6;
  // Acht gerade Zacken von r*0.7 nach r (kein ovaler Ring).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    line(Math.round(c + Math.cos(a) * r * 0.68), Math.round(c + Math.sin(a) * r * 0.68),
      Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), i % 2 ? "c" : "d");
  }
  // Achtkantiger Außenring (gerade Segmente, 2 px).
  const points: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    points.push([Math.round(c + Math.cos(a) * r * 0.9), Math.round(c + Math.sin(a) * r * 0.9)]);
  }
  for (let i = 0; i < 8; i++) {
    const a = points[i];
    const b = points[(i + 1) % 8];
    line(a[0], a[1], b[0], b[1], stage === 0 ? "d" : "c");
    line(a[0], a[1] + 1, b[0], b[1] + 1, "g");
  }
  // Innenrune: drei gerade Linien + Kern.
  line(c - 4, c - 4, c + 4, c + 4, "g");
  line(c + 4, c - 4, c - 4, c + 4, "g");
  line(c, c - 5, c, c + 5, stage > 1 ? "d" : "c");
  put(c, c, "d");
  return out.map((row) => row.join(""));
}

/** Lichtsäule für Level-up/Evolution; heller Kern + Farbsaum. */
function pillarFrame(stage: number, width = 26, height = 72): string[] {
  const out: string[] = [];
  const cx = (width - 1) / 2;
  for (let y = 0; y < height; y++) {
    let row = "";
    const t = y / height;
    const halfW = 3 + Math.sin(t * 5 + stage) * 1.4 + (1 - t) * 2;
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - cx);
      if (dx > halfW) row += ".";
      else if (dx < halfW * 0.34) row += "d";
      else if (dx < halfW * 0.66) row += "c";
      else row += t < 0.5 ? "g" : "a";
    }
    out.push(row);
  }
  return out;
}

/** Explosionsring in Stufen: Kern → Ring → Splitter → Nachglühen. */
function shockFrame(stage: number, size = 48): string[] {
  const out: string[] = [];
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = 3 + stage * 5.2;
  const thick = Math.max(1, 5 - stage);
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.atan2(y - cy, x - cx);
      const jag = Math.sin(a * 11) * 1.4;
      if (stage === 0 && d < r) row += d < r * 0.4 ? "d" : "c";
      else if (Math.abs(d - (r + jag)) < thick) row += stage < 2 ? "c" : "a";
      else if (stage >= 2 && Math.abs(d - (r * 0.7 + jag)) < thick - 1) row += "g";
      else row += ".";
    }
    out.push(row);
  }
  return out;
}

/** Kleine Shard-Motive für Todes-Effekte (4 Klassen). */
const DEATH_MOTIFS: Record<string, { ramp: number[]; glyph: string; shape: "bone" | "blob" | "void" | "dust" }> = {
  bone: { ramp: [10, 11, 7], glyph: "K", shape: "bone" },
  blob: { ramp: [30, 31, 29], glyph: "o", shape: "blob" },
  void: { ramp: [5, 6, 8], glyph: "V", shape: "void" },
  dust: { ramp: [8, 9, 7], glyph: "D", shape: "dust" },
};

function deathFrame(shape: "bone" | "blob" | "void" | "dust", stage: number): string[] {
  const w = 9;
  const h = 9;
  const out: string[] = [];
  const ramp = DEATH_MOTIFS[shape].ramp;
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const dx = x - 4;
      const dy = y - 4;
      const d = Math.hypot(dx, dy);
      const spread = 1 + stage * 1.1;
      let on = false;
      if (shape === "bone") on = Math.abs(dx) <= 1 && Math.abs(dy) < spread || stage > 1 && d < spread && (x + y + stage) % 3 === 0;
      if (shape === "blob") on = d < spread && (x * 3 + y * 5 + stage) % 4 !== 0;
      if (shape === "void") on = Math.abs(d - stage * 1.2) < 1.4 || stage === 0 && d < 2;
      if (shape === "dust") on = d < spread && (x + y * 2 + stage * 3) % 2 === 0;
      if (!on) row += ".";
      else if (d < 1.5) row += "d";
      else row += String.fromCharCode(97 + ramp[Math.min(ramp.length - 1, Math.floor(d / 4 * ramp.length))]);
    }
    out.push(row);
  }
  return out;
}

function thornFrame(stage: number): string[] {
  const out: string[] = [];
  const ramp = [16, 17, 18];
  for (let y = 0; y < 9; y++) {
    let row = "";
    const half = Math.max(0, 3 - Math.floor(stage / 2));
    for (let x = 0; x < 9; x++) {
      const dx = Math.abs(x - 4);
      if (dx > half - Math.abs(y - 4) * 0.4) row += ".";
      else if (dx === 0) row += "d";
      else row += String.fromCharCode(97 + ramp[Math.min(2, dx)]);
    }
    out.push(row);
  }
  return out;
}

function orbFrame(stage: number): string[] {
  const out: string[] = [];
  const w = 11;
  const h = 11;
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - 5, y - 5);
      if (d > 4.6) row += ".";
      else if (d < 1.2 + Math.sin(stage + x) * 0.2) row += "d";
      else if (d < 2.4) row += "c";
      else if (d < 3.3) row += stage < 2 ? "g" : "a";
      else row += "5";
    }
    out.push(row);
  }
  return out;
}

/** Kalter, hohler Halo (kein warmes Weiß im Zentrum): nur ein 2-px-Ring. */
function coldHaloFrame(stage: number): string[] {
  const size = 24;
  const out: string[] = [];
  const c = (size - 1) / 2;
  const r = 10.5 + stage * 0.4;
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d < r - 2 || d > r + 0.7) row += ".";
      else if (d > r - 0.8) row += "9";   // paleMist heller Rand
      else row += "6";                    // fogBlue
    }
    out.push(row);
  }
  return out;
}

/**
 * Geisterflamme (Seele): geschlossene Tinte an Scheitel und welligem Schweif,
 * asymmetrischer Flammenkorper (kein Obelisk), 2x2-Kern mit 9-Glutrand und
 * diagonale 8/5-Schattierung. 3 Frames @ ~5 Hz.
 */
function orbSoulFrame(stage: number): string[] {
  const w = 15;
  const h = 24;
  const cx = 7;
  const widths = [0, 1, 1, 2, 2, 3, 2, 3, 4, 3, 4, 4, 3, 2];
  const lean = stage === 0 ? 0 : stage === 1 ? 1 : -1;
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    const body = y < 14;
    const center = body
      ? cx + Math.round(lean * (y / 13) * 1.4 + Math.sin(y * 0.85 + stage * 2.1) * 0.8)
      : cx + Math.round(Math.sin(y * 1.15 + stage * 2.4) * 0.9);
    const half = body ? widths[y] : 1;
    for (let x = 0; x < w; x++) {
      const dx = x - center;
      if (body && y === 0) {
        // Geschlossener Scheitel: nur Tinte, von y1 gefüllt umschlossen.
        row += dx === 0 ? "0" : ".";
        continue;
      }
      if (dx < -half || dx > half) { row += "."; continue; }
      if (dx === -half || dx === half) { row += "0"; continue; }
      const coreRow = body && y >= 10 && y <= 11;
      const core = coreRow && (x === center || x === center + 1);
      if (core) { row += "d"; continue; }
      const glow = coreRow && Math.abs(y - 10.5) < 2.1 && dx >= -1 && dx <= 2;
      if (glow) { row += "9"; continue; }
      if (body && y >= 2 && y <= 6 && dx < 0) { row += "8"; continue; }
      if (body && y > 6 && dx >= 0) { row += "5"; continue; }
      row += "6";
    }
    out.push(row);
  }
  return out;
}

// ── Evolutions-Signaturen (M10) ────────────────────────────────
// Jede Evolution bekommt eine eigene Treffer-/Todes-Signatur aus Form + Palette +
// Lifetime, damit die 6 Evolutions-Waffen bereits am getroffenen Gegner erkennbar
// sind. Rein visuell: die Tabelle ist reine Daten und wird von Tests auf paarweise
// Eindeutigkeit geprueft; Kollisionen (gleiche Form UND gleicher Hauptindex UND
// gleiche Hit-Lifetime) sind damit testbar.

export type EvoSignatureShape = "ring" | "beam" | "splitter" | "cloud";

export interface EvoSignature {
  /** Evolutions-ID (== Waffen-ID im Slot, z. B. "phoenix"). */
  evolution: string;
  /** Basiswaffe, aus der die Evolution entsteht. */
  baseWeapon: string;
  shape: EvoSignatureShape;
  /** [Hauptfarbe, Sekundaerfarbe, Kernfarbe] als Palettenindizes. */
  palette: readonly [number, number, number];
  /** Lebensdauer des Trefferfunken in s (Timing-Signatur). */
  hitLifetime: number;
  /** Lebensdauer des Todes-Puffs in s (Timing-Signatur). */
  deathLifetime: number;
  hitCount: number;
  deathCount: number;
}

export const SIGNATURE_FRAME_COUNT = 4;

export const EVOLUTION_SIGNATURES: Readonly<Record<string, EvoSignature>> = {
  // Glutfunke + Arkanes Buch: heisser Splitter-Regen, kurz und hell.
  phoenix: {
    evolution: "phoenix", baseWeapon: "ember", shape: "splitter",
    palette: [20, 18, 13], hitLifetime: 0.16, deathLifetime: 0.62,
    hitCount: 6, deathCount: 14,
  },
  // Kettenflegel + Eisenherz: goldener Ring-Schlag, sehr kurz.
  wrath_pendulum: {
    evolution: "wrath_pendulum", baseWeapon: "flail", shape: "ring",
    palette: [21, 20, 10], hitLifetime: 0.12, deathLifetime: 0.30,
    hitCount: 4, deathCount: 8,
  },
  // Frostnova + Sanduhr: kalte Nebelwolke, langsam ausklingend.
  eternal_winter: {
    evolution: "eternal_winter", baseWeapon: "frost", shape: "cloud",
    palette: [9, 6, 12], hitLifetime: 0.22, deathLifetime: 0.75,
    hitCount: 5, deathCount: 10,
  },
  // Dornensalve + Windstiefel: gruener Splitter-Kranz, mittleres Timing.
  thorn_storm: {
    evolution: "thorn_storm", baseWeapon: "thorn", shape: "splitter",
    palette: [18, 16, 17], hitLifetime: 0.18, deathLifetime: 0.42,
    hitCount: 5, deathCount: 11,
  },
  // Sturmrune + Wetzstein: weisser Blitz-Beam, extrem kurz.
  thunder_seal: {
    evolution: "thunder_seal", baseWeapon: "storm", shape: "beam",
    palette: [13, 20, 12], hitLifetime: 0.10, deathLifetime: 0.24,
    hitCount: 3, deathCount: 7,
  },
  // Geisterlaterne + Magnetamulett: helle Seelenwolke, langes Nachgluehen.
  soul_beacon: {
    evolution: "soul_beacon", baseWeapon: "lantern", shape: "cloud",
    palette: [12, 8, 5], hitLifetime: 0.26, deathLifetime: 0.55,
    hitCount: 4, deathCount: 9,
  },
};

export const EVOLUTION_SIGNATURE_IDS = Object.keys(EVOLUTION_SIGNATURES);

export function evolutionSignature(evolution: string): EvoSignature | undefined {
  return EVOLUTION_SIGNATURES[evolution];
}

/** Texture-Key der Treffer-/Todes-Signatur (Framecount bleibt konstant 4). */
export function signatureTextureKey(evolution: string, kind: "hit" | "death"): string {
  return `fx_evo_${kind}_${evolution}`;
}

/**
 * LOD-Ansicht einer Signatur: Palette-Index bleibt IMMER erhalten, nur Alpha und
 * Blend werden gedaempft (minimal: Alpha 0,5 / NORMAL). Damit bleiben die 6
 * Signaturen auch bei 300+ Gegnern paarweise unterscheidbar.
 */
export function lodSignatureView(
  sig: EvoSignature,
  level: "full" | "reduced" | "minimal",
): { shape: EvoSignatureShape; paletteIndex: number; alpha: number; blend: "ADD" | "NORMAL" } {
  const alpha = level === "full" ? 1 : level === "reduced" ? 0.72 : 0.5;
  return {
    shape: sig.shape,
    paletteIndex: sig.palette[0],
    alpha,
    blend: level === "minimal" ? "NORMAL" : "ADD",
  };
}

/** Kollision = gleiche Form, gleicher Haupt-Palettenindex und gleiches Hit-Timing. */
export function signaturesCollide(a: EvoSignature, b: EvoSignature): boolean {
  return a.shape === b.shape && a.palette[0] === b.palette[0] && a.hitLifetime === b.hitLifetime;
}

function putPixel(rows: string[][], x: number, y: number, idx: number): void {
  const iy = Math.round(y);
  const ix = Math.round(x);
  if (iy < 0 || ix < 0 || iy >= rows.length || ix >= rows[iy].length) return;
  const i = Math.max(0, Math.min(31, idx));
  // Zeichenformat: 0-9 = Index 0-9, a-v = Index 10-31.
  rows[iy][ix] = i < 10 ? String.fromCharCode(48 + i) : String.fromCharCode(97 + i - 10);
}

/** Form-Frame einer Signatur: 4 Frames (klein → gross / ausklingend). */
export function signatureFrame(shape: EvoSignatureShape, palette: readonly [number, number, number], stage: number): string[] {
  const size = 17;
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  if (shape === "ring") {
    const r = 3.2 + t * 5.4;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = Math.atan2(y - c, x - c);
      const jag = Math.sin(a * 8) * 0.7;
      const edge = Math.abs(d - (r + jag));
      if (edge < 0.7) putPixel(rows, x, y, palette[2]);
      else if (edge < 1.6) putPixel(rows, x, y, palette[stage === 3 ? 1 : 0]);
    }
    return rows.map((r) => r.join(""));
  }
  if (shape === "beam") {
    const h = 5 + stage * 3;
    for (let i = 0; i < h; i++) {
      const y = Math.round(c + i - h / 2);
      putPixel(rows, c, y, palette[2]);
      putPixel(rows, c - 1, y, palette[0]);
      putPixel(rows, c + 1, y, palette[0]);
      if (i % 3 === 1) {
        putPixel(rows, c - 2 - (stage % 2), y, palette[1]);
        putPixel(rows, c + 2, y, palette[1]);
      }
    }
    return rows.map((r) => r.join(""));
  }
  if (shape === "splitter") {
    const len = 3 + stage * 2.2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let k = 2; k <= len; k++) {
        putPixel(rows, c + Math.cos(a) * k, c + Math.sin(a) * k, k > len - 1 ? palette[2] : palette[i % 2]);
      }
    }
    putPixel(rows, c, c, palette[2]);
    return rows.map((r) => r.join(""));
  }
  // cloud: weicher, asymmetrischer Puff mit hellem Kern.
  const rad = 2.5 + t * 5.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c, dy = y - c;
    const wobble = Math.sin(x * 0.9 + y * 1.3 + stage) * 0.7;
    const d = Math.hypot(dx, dy) + wobble;
    if (d > rad) continue;
    putPixel(rows, x, y, d < rad * 0.35 ? palette[2] : d < rad * 0.7 ? palette[1] : palette[0]);
  }
  return rows.map((r) => r.join(""));
}

/** Registriert die 12 Signatur-Texturen (6 Hit + 6 Death, je 4 Frames). */
function addEvolutionSignatures(scene: Phaser.Scene): void {
  for (const id of EVOLUTION_SIGNATURE_IDS) {
    const sig = EVOLUTION_SIGNATURES[id];
    for (const kind of ["hit", "death"] as const) {
      const def: FxDef = {
        w: 17,
        h: 17,
        frames: Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => signatureFrame(sig.shape, sig.palette, i)),
      };
      addFrames(scene, signatureTextureKey(id, kind), def);
    }
  }
}

export function createFxTextures(scene: Phaser.Scene): void {
  // Glut: weiß → gelb → orange → rot → dunkelrot
  addFrames(scene, "fx_fire", {
    w: 14, h: 14,
    frames: [0, 1, 2, 3, 4, 5].map((i) => blob(14, 14, [21, 20, 18, 17, 16, 15], { core: 0.18 + i * 0.045, seed: i * 1.3 })),
  });
  // Treffer-Spark mit Kern und Kreuzstrahl
  addFrames(scene, "fx_star", {
    w: 9, h: 9,
    frames: [
      ["....d....", "...dcd...", "..dcccd..", "dcccc g d", "..dcccd..", "...dcd...", "....d....", ".........", "........."],
      [".........", "....d....", "...dcd...", "..dcccd..", "....d....", ".........", ".........", ".........", "........."],
      [".........", ".........", "....d....", "....d....", "....d....", ".........", ".........", ".........", "........."],
    ].map((rows) => rows.map((r) => r.replace(/ /g, "."))),
  });
  addFrames(scene, "fx_halo", { w: 24, h: 24, frames: [0, 1].map((i) => ring(24, 24, [20, 18, 17], 0.3 + i * 0.16, i)) });
  addFrames(scene, "fx_ice", { w: 15, h: 21, frames: [0, 1, 2, 3].map(iceFrame) });
  addFrames(scene, "fx_smear", { w: 44, h: 16, frames: [0, 1, 2, 3, 4].map((i) => smearFrame(i)) });
  addFrames(scene, "fx_bolt", { w: 12, h: 16, frames: [0, 1, 2, 3, 4, 5].map((i) => boltFrame(i)) });
  addFrames(scene, "fx_seal", { w: 32, h: 32, frames: [0, 1, 2, 3, 4].map((i) => sealFrame(i)) });
  addFrames(scene, "fx_thorn", { w: 9, h: 9, frames: [0, 1, 2].map(thornFrame) });
  addFrames(scene, "fx_orb", { w: 11, h: 11, frames: [0, 1, 2, 3].map(orbFrame) });
  addFrames(scene, "fx_pillar", { w: 26, h: 72, frames: [0, 1, 2, 3, 4].map((i) => pillarFrame(i)) });
  addFrames(scene, "fx_shock", { w: 48, h: 48, frames: [0, 1, 2, 3, 4, 5].map((i) => shockFrame(i)) });
  addFrames(scene, "fx_death_bone", { w: 9, h: 9, frames: [0, 1, 2, 3].map((i) => deathFrame("bone", i)) });
  addFrames(scene, "fx_death_blob", { w: 9, h: 9, frames: [0, 1, 2, 3].map((i) => deathFrame("blob", i)) });
  addFrames(scene, "fx_death_void", { w: 9, h: 9, frames: [0, 1, 2, 3].map((i) => deathFrame("void", i)) });
  addFrames(scene, "fx_death_dust", { w: 9, h: 9, frames: [0, 1, 2, 3].map((i) => deathFrame("dust", i)) });
  // Boss-Kern: große Glut mit Knochenring (Intro/Tod)
  addFrames(scene, "fx_boss_core", {
    w: 32, h: 32,
    frames: [0, 1, 2, 3, 4, 5].map((i) => blob(32, 32, [19, 18, 17, 16, 15], { core: 0.14 + i * 0.03, seed: i * 2.1 })),
  });
  // Dunkler Rauchring für Zerfall
  addFrames(scene, "fx_dusk", { w: 20, h: 20, frames: [0, 1, 2].map((i) => ring(20, 20, [5, 4, 3], 0.55 - i * 0.1, i)) });
  // Staub/Asche für Tod-Klassen (klein, normal blend)
  addFrames(scene, "fx_ash", { w: 5, h: 5, frames: [0, 1].map(() => [".ccc.", "c555c", "c505c", "c555c", ".ccc."]) });
  // Seelenflamme fuer das Seelenleuchtfeuer (2 Frames, 15x22).
  addFrames(scene, "orb_soul", { w: 15, h: 22, frames: [0, 1, 2].map(orbSoulFrame) });
  // Kalter Halo fuer Seelen (blau-grau statt warmem Amber-Ring).
  addFrames(scene, "fx_halo_cold", { w: 24, h: 24, frames: [0, 1].map(coldHaloFrame) });
  // M10: eigene Treffer-/Todes-Signatur je Evolution (Form + Palette + Timing).
  addEvolutionSignatures(scene);
}

/** Alle Frame-Keys eines Effekts (für FxSystem-Animationen). */
export function fxFrames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}_${i + 1}`));
}

export const FX_FRAME_COUNTS: Record<string, number> = {
  fx_fire: 6, fx_star: 3, fx_halo: 2, fx_ice: 4, fx_smear: 5, fx_bolt: 6,
  fx_seal: 5, fx_thorn: 3, fx_orb: 4, fx_pillar: 5, fx_shock: 6,
  fx_death_bone: 4, fx_death_blob: 4, fx_death_void: 4, fx_death_dust: 4,
  fx_boss_core: 6, fx_dusk: 3, fx_ash: 2, fx_halo_cold: 2,
  ...Object.fromEntries(EVOLUTION_SIGNATURE_IDS.flatMap((id) => [
    [signatureTextureKey(id, "hit"), SIGNATURE_FRAME_COUNT],
    [signatureTextureKey(id, "death"), SIGNATURE_FRAME_COUNT],
  ])),
};
