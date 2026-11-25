/**
 * M5-Effekt-Frames: handgesetzte, prozedurale Pixel-Frames (4–8 je Effekt).
 * Laufzeit-Assets entstehen ausschließlich hier (TS-Generator), keine Downloads.
 *
 * Jeder Effekt hat: hellen Kern (13/12), Glow-Halo, Farbrampe und deutliche
 * Masse. Die Frames werden als eigene Texturen `key`, `key_2`, … registriert.
 */
import Phaser from "phaser";
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
      if (ch === "0") continue; // 0 = Kontur bleibt transparent (Glow-Rand)
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

/** Eiskristall (Diamant) mit Glanzkante; 4 Dreh-/Zerfallsstufen. */
function iceFrame(stage: number): string[] {
  const ramp = [9, 8, 6, 5]; // paleMist → fogBlue
  const w = 11;
  const h = 15;
  const cx = 5;
  const half = Math.max(1, 4 - stage);
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - (h - 1) / 2);
      const inside = dx + dy * 0.55 < half + (stage === 0 ? 4 : 2);
      if (!inside) row += ".";
      else if (dx <= 1 && y < h / 2) row += "d";
      else if (dx <= 2) row += "b"; // boneLight
      else row += String.fromCharCode(97 + ramp[Math.min(3, Math.floor(dx / 2))]);
    }
    out.push(row);
  }
  return out;
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

/** Boden-Siegel (Sturm/Donner): Rune mit Zacken, 4 Pulsframes. */
function sealFrame(stage: number, size = 30): string[] {
  const out: string[] = [];
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const r = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    let row = "";
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const band = Math.abs(d - (r - stage * 1.2)) < 1.6;
      const spike = Math.abs(Math.sin(a * 6)) > 0.83 && Math.abs(d - r * 0.72) < 2.2;
      const innerRing = Math.abs(d - r * 0.46) < 1.2;
      if (band) row += stage === 0 ? "d" : "c";
      else if (spike || innerRing) row += "g";
      else row += ".";
    }
    out.push(row);
  }
  return out;
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
  addFrames(scene, "fx_ice", { w: 11, h: 15, frames: [0, 1, 2, 3].map(iceFrame) });
  addFrames(scene, "fx_smear", { w: 44, h: 16, frames: [0, 1, 2, 3, 4].map((i) => smearFrame(i)) });
  addFrames(scene, "fx_bolt", { w: 12, h: 16, frames: [0, 1, 2, 3, 4, 5].map((i) => boltFrame(i)) });
  addFrames(scene, "fx_seal", { w: 30, h: 30, frames: [0, 1, 2, 3, 4].map((i) => sealFrame(i)) });
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
}

/** Alle Frame-Keys eines Effekts (für FxSystem-Animationen). */
export function fxFrames(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : `${base}_${i + 1}`));
}

export const FX_FRAME_COUNTS: Record<string, number> = {
  fx_fire: 6, fx_star: 3, fx_halo: 2, fx_ice: 4, fx_smear: 5, fx_bolt: 6,
  fx_seal: 5, fx_thorn: 3, fx_orb: 4, fx_pillar: 5, fx_shock: 6,
  fx_death_bone: 4, fx_death_blob: 4, fx_death_void: 4, fx_death_dust: 4,
  fx_boss_core: 6, fx_dusk: 3, fx_ash: 2,
};
