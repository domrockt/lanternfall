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

/** Ein Frame-Set: Groesse + Frames als Zeichen-Zeilen ("." = transparent). */
export interface FxFrameSet {
  w: number;
  h: number;
  frames: string[][];
}

/**
 * Alle Todes-/Boss-Frames als exportierbare Sets — Single Source of Truth fuer
 * createFxTextures (Texturen), tests/death-frames.test.ts (Guards) und
 * scripts/m10-death-frames.mjs (Kontakt-Boegen). Keine Sichtbelegung im Spiel.
 */
export function deathFrameSets(): Record<string, FxFrameSet> {
  return {
    fx_death_bone: { w: 9, h: 9, frames: [0, 1, 2, 3].map(boneDeathFrame) },
    fx_death_blob: { w: 9, h: 9, frames: [0, 1, 2, 3].map(blobDeathFrame) },
    fx_death_void: { w: 9, h: 9, frames: [0, 1, 2, 3].map(voidDeathFrame) },
    fx_death_dust: { w: 9, h: 9, frames: [0, 1, 2, 3].map(dustDeathFrame) },
    fx_death_fire: { w: 9, h: 9, frames: [0, 1, 2, 3].map(fireDeathFrame) },
    // Boss-Tod-Stufe: 32x32 mit 3-Stufen-Kern, Kontur, Ringen und Splittern.
    fx_boss_core: { w: 32, h: 32, frames: [0, 1, 2, 3, 4, 5].map(bossCoreFrame) },
  };
}

function addFrames(scene: Phaser.Scene, base: string, def: FxDef): void {
  def.frames.forEach((rows, i) => addFrame(scene, i === 0 ? base : `${base}_${i + 1}`, rows, def.w, def.h));
}

/** Kreis-/Blob-Maske mit Palette-Farbrampe; deterministisch (kein Math.random).
 *  density > 1 rendert dieselbe normierte Geometrie in w*density x h*density
 *  Pixeln (Mixel-Fix) — Level 1 bleibt byte-identisch zum alten Output. */
function blob(w: number, h: number, ramp: number[], opts: { squash?: number; core?: number; seed?: number } = {}, density = 1): string[] {
  const out: string[] = [];
  const W = w * density;
  const H = h * density;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const rx = (w / 2 - 1) * density;
  const ry = (h / 2 - 1) * (opts.squash ?? 1) * density;
  const core = opts.core ?? 0.32;
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
      const nx = (x - cx) / Math.max(1, rx);
      const ny = (y - cy) / Math.max(1, ry);
      let d = Math.sqrt(nx * nx + ny * ny);
      // leichte, deterministische Formwelle für handgesetzte Silhouette
      // (normierte Koordinaten, damit die Welle bei jeder Stufe gleich bleibt)
      d += Math.sin((x / density + (y / density) * 0.7) * 1.7 + (opts.seed ?? 0)) * 0.055;
      if (d > 1) row += ".";
      else if (d < core) row += "d"; // lanternWhite (13): Kern
      else if (d < core + 0.18) row += "c"; // candleWhite (12)
      else {
        const idx = Math.min(ramp.length - 1, Math.floor((d - core) / (1 - core) * ramp.length));
        // charOf (nicht 97+idx): Ramp-Indizes sind Palettenindizes, a-v = 10-31
        // (Off-by-10-Fix — 97+idx verschob Lantern/Amber in die Crimson-Baender).
        row += charOf(ramp[idx]);
      }
    }
    out.push(row);
  }
  return out;
}

function ring(w: number, h: number, ramp: number[], inner = 0.62, sweep = 1, density = 1): string[] {
  const out: string[] = [];
  const W = w * density;
  const H = h * density;
  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  const rx = (w / 2 - 1) * density;
  const ry = (h / 2 - 1) * density;
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let x = 0; x < W; x++) {
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
        // charOf (Off-by-10-Fix, siehe blob).
        row += charOf(ramp[idx]);
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
export function iceFrame(stage: number): string[] {
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
      else if (x < cx) row += "9";                     // paleMist helle Facette
      else if (dx <= 3) row += "8";                    // mist
      else row += "6";                                 // fogBlue Rand
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

/**
 * Gewittersiegel (m10-evo-fx-gewittersiegel): Boden-Siegel in Zielgröße 64x64,
 * 4 Phasen-Frames (0/1 Anticipation, 2 Impact-Flash, 3 Dauer-Puls), Draw-Scale 1.
 * Dunkle Siegel-Grundfläche (night 2 / nightMid 3, 1-px-Kontur nightSlate 4),
 * Blitz-Rune als kühle Treppe lanternWhite(13) → candleWhite(12) → glow(22) →
 * lantern(21), Zwischenstufe boneLight(11). Kein Ink(0), keine Grau-Stufen (5–9).
 */
export function thunderSealFrame(stage: number, size = 64): string[] {
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
  // Dunkle Siegel-Grundfläche: organischer Kreis (deterministischer Wobble),
  // außen nightSlate(4)-Kontur, Fläche nightMid(3) mit night(2)-Kern.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      const wobble = 25 + Math.sin(Math.atan2(dy, dx) * 3 + 1.7) * 1.4
        + Math.sin(Math.atan2(dy, dx) * 5 + 0.4) * 0.8;
      if (d > wobble) continue;
      if (d > wobble - 1.5) put(x, y, "4");
      else if (d > 17) put(x, y, "3");
      else put(x, y, "2");
    }
  }
  // Achteck-Außenring (1 px, gerade Segmente) + 8 gerade Zacken über den Ring.
  // m10-evo-fx-form-polish (Dom 03:00Z): der Siegel-Kreis muss beim Auslösen als
  // ANKÜNDIGUNG sichtbar sein — Anticipation/Dauer-Ring lantern(21) statt
  // nightSlate(4) (auf Nachtboden unsichtbar, Sichtung thunder_seal-640.png);
  // Impact bleibt glow(22). Grundfläche bleibt kühl-dunkel (2/3/4).
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([c + Math.cos(a) * 21, c + Math.sin(a) * 21]);
  }
  const ringCh = stage === 2 ? "m" : "l";
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 8];
    line(ax, ay, bx, by, ringCh);
    // Zacken: gerade Strahlen von r=19 nach 27-29 (handgezeichnete Längenvarianz,
    // deterministisch über den Winkel; Impact: hell, sonst kühl dunkel).
    const tickR = 27 + (i % 3);
    const tickCh = stage === 2 ? "d" : stage === 3 ? "b" : "l";
    line(c + Math.cos(a) * 19, c + Math.sin(a) * 19, c + Math.cos(a) * tickR, c + Math.sin(a) * tickR, tickCh);
  }
  // Blitz-Rune: gezackter Kernpfad durchs Zentrum, 1-px-Kern + 1-px Gelb-Kante.
  const path: [number, number][] = [
    [c + 1, 7], [c + 5, 19], [c - 3, 30], [c + 3, 42], [c - 2, 55],
  ];
  const coreCh = stage === 0 ? "b" : "d";
  const edgeCh = stage === 0 ? "c" : "m";
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    line(ax, ay, bx, by, coreCh);
    line(ax + 1, ay, bx + 1, by, edgeCh);
  }
  // Impact-Flash (Stage 2): kurze Strahlen + Funken-Tupfer (2-3 px, kein
  // Einzelpixel-Rauschen) statt flächiger Glut.
  if (stage === 2) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
      line(c + Math.cos(a) * 27, c + Math.sin(a) * 27, c + Math.cos(a) * 31, c + Math.sin(a) * 31, i % 2 ? "m" : "d");
    }
    // Vier Funken-Tupfer (deterministisch, 3-4 px je Tupfer).
    const sparks: [number, number, string][] = [
      [c - 8, c - 6, "d"], [c + 9, c - 4, "m"], [c - 6, c + 9, "m"], [c + 7, c + 8, "d"],
    ];
    for (const [sx, sy, ch] of sparks) {
      put(sx, sy, ch);
      put(sx + 1, sy, ch);
      put(sx, sy + 1, ch === "d" ? "m" : "d");
    }
  }
  return out.map((r) => r.join(""));
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
function shockFrame(stage: number, size = 48, density = 1): string[] {
  const out: string[] = [];
  const S = size * density;
  const cx = (S - 1) / 2;
  const cy = (S - 1) / 2;
  const r = (3 + stage * 5.2) * density;
  const thick = Math.max(1, 5 - stage) * density;
  for (let y = 0; y < S; y++) {
    let row = "";
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.atan2(y - cy, x - cx);
      const jag = Math.sin(a * 11) * 1.4 * density;
      if (stage === 0 && d < r) row += d < r * 0.4 ? "d" : "c";
      else if (Math.abs(d - (r + jag)) < thick) row += stage < 2 ? "c" : "a";
      else if (stage >= 2 && Math.abs(d - (r * 0.7 + jag)) < thick - density) row += "g";
      else row += ".";
    }
    out.push(row);
  }
  return out;
}

// ---------------------------------------------------------------------------
// M10-death-fx-frames: Todes-Frames mit eigenen Silhouetten (Art-Befund Runde 2,
// FAIL 2,5/5: alle Klassen wirkten als "expandierender Ring"). Jede Klasse hat
// jetzt eine eigene Formensprache, deterministisch (kein Math.random):
// - blob: dunkler Koerper + harter nightDeep-Rim + grosser weisser Kern + Tropfen
// - bone: 2-3 echte Knochenformen (Schaft + Endknubbel), zerfallen nach unten
// - dust: Ascheflakes (unregelmaessige Flocken, schraeg aufstiebend)
// - fire: Flammenzungen mit abloesenden Spitzen + wenigen Glimmresten
// - void: aufsteigende Schwaden-Saeulen (statt Ring)
// ---------------------------------------------------------------------------

const DEATH_GRID = 9;

function deathGrid(): string[][] {
  return Array.from({ length: DEATH_GRID }, () => Array(DEATH_GRID).fill("."));
}

function deathPx(g: string[][], x: number, y: number, ch: string): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= DEATH_GRID || yi >= DEATH_GRID) return;
  g[yi][xi] = ch;
}

function deathRows(g: string[][]): string[] {
  return g.map((r) => r.join(""));
}

/** fx_death_blob (burst): dunkler Koerper, nightDeep-Rim, weisser Kern, Tropfen. */
function blobDeathFrame(stage: number): string[] {
  const g = deathGrid();
  const cx = 4;
  const cy = 4;
  // Koerper quillt (0), reisst auf (1-2), restet als Klumpen (3).
  // Spaete Stufen mit groesserem Rest (Art-Director Runde 3: dunkle Splitter
  // verschwinden sonst auf Nachtgrund fast komplett).
  const radius = [3.8, 3.4, 2.6, 1.8][stage];
  for (let y = 0; y < DEATH_GRID; y++) {
    for (let x = 0; x < DEATH_GRID; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      // Unregelmaessige, deterministische Silhouette (kein glatter Kreis-Ring).
      const edge = radius + Math.sin(a * 5 + 1.1) * 0.45 + Math.sin(a * 9 - 0.6) * 0.25;
      if (d > edge) continue;
      if (d > edge - 1.0) { deathPx(g, x, y, charOf(1)); continue; } // harter nightDeep-Rim
      if (d < 1.3) { deathPx(g, x, y, charOf(13)); continue; } // weisser Kern
      if (d < 1.9) { deathPx(g, x, y, charOf(12)); continue; } // candleWhite-Uebergang
      deathPx(g, x, y, (x * 7 + y * 13 + stage * 3) % 9 === 0 ? charOf(31) : charOf(30));
    }
  }
  // Grosse Tropfen: 4 feste Winkel, fliegen mit der Stufe nach aussen
  // (2px-Kopf + Schweif + nightDeep-Rim davor).
  const angles = [0.35, 1.95, 3.6, 5.2];
  for (const ang of angles) {
    const r = Math.min(4, 3.5 + stage * 0.55);
    const ax = Math.cos(ang);
    const ay = Math.sin(ang);
    const px = cx + ax * r;
    const py = cy + ay * r;
    deathPx(g, px, py, charOf(31)); // Tropfkopf
    deathPx(g, px - ay * 0.9, py + ax * 0.9, charOf(30)); // Kopf-Flanke
    deathPx(g, px - ax, py - ay, charOf(30)); // Schweif
    deathPx(g, px + ax, py + ay, charOf(1)); // Rim vor dem Kopf
    // Glanzpunkt auf dem Kopf (lesbar auch auf Nachtgrund).
    deathPx(g, px - ay * 0.9, py + ax * 0.9 - 1, charOf(12));
  }
  return deathRows(g);
}

/** fx_death_bone (crumble): 2-3 handgesetzte Knochenformen, Zerfall nach unten. */
function boneDeathFrame(stage: number): string[] {
  // Schaft = bone (a), Endknubbel = boneLight (b). Stufen: intakt → auseinander
  // → gebrochen → Truemmer/Staub.
  const frames: string[][][] = [
    [[
      ".........",
      ".b.....b.",
      ".baaaaab.",
      ".b.....b.",
      ".........",
      "b.b...b.b",
      ".a....a..",
      ".a....a..",
      "b.b...b.b",
    ]],
    [[
      ".........",
      "......a..",
      "b......b.",
      "baaaaab..",
      "b......b.",
      ".........",
      "b.b...b.b",
      ".a....a..",
      ".a....a..",
    ]],
    [[
      ".........",
      ".........",
      "b......b.",
      "baaa..ab.",
      "b......b.",
      ".........",
      "b.b......",
      ".a....b.b",
      ".a.....a.",
    ]],
    [[
      ".........",
      "....b....",
      "..b.b....",
      "..bab....",
      ".........",
      "......b.b",
      ".a.....a.",
      ".b.......",
      ".........",
    ]],
  ];
  return frames[Math.min(stage, 3)][0];
}

/** fx_death_dust (sputter-Staub): Ascheflakes — schraege Wind-Streifen, kein Ring. */
function dustDeathFrame(stage: number): string[] {
  const g = deathGrid();
  // Zwei schraeg aufstiebende Streifen, mit der Stufe hoeher/duenner werdend.
  for (let i = 0; i < 5; i++) {
    const x = 1 + i + stage * 0.5;
    const y = 7 - i - stage * 0.5;
    if ((i + stage) % 4 !== 3) deathPx(g, x, y, charOf(9));
    if ((i + stage) % 3 !== 2) deathPx(g, x + 1, y, charOf(8));
    if ((i + stage * 2) % 4 === 0) deathPx(g, x, y - 1, charOf(15)); // Glimmrest
  }
  // Einzeln verwehende Flocken abseits der Streifen.
  deathPx(g, 6.8, 1.6 + stage * 0.6, charOf(8));
  deathPx(g, 0.9, 3.9 + stage * 0.8, charOf(9));
  if (stage < 3) deathPx(g, 4.2, 2.4 + stage, charOf(8));
  return deathRows(g);
}

/** fx_death_fire (sputter-Shard): Flammenzungen + abloesende Funken + Glimmreste. */
function fireDeathFrame(stage: number): string[] {
  const g = deathGrid();
  // [x, hoehe, phase] — Zungen wachsen nach oben, Spitzen brechen heraus.
  const tongues: Array<[number, number, number]> = [
    [2.4, 4.2, 0], [4.5, 5.6, 1], [6.6, 3.8, 2],
  ];
  for (const [tx, hgt, ph] of tongues) {
    const h = hgt + stage * 1.2;
    const sway = Math.sin(ph * 2.1 + stage) * 0.7;
    for (let yy = 0; yy <= h; yy += 0.5) {
      const y = 8 - yy;
      if (y < 0) break;
      const taper = Math.max(0, 1 - yy / h);
      const half = 0.4 + taper * 0.9;
      const x = tx + sway * (yy / h);
      const idx = yy < h * 0.3 ? 19 : yy < h * 0.7 ? 18 : 20; // heisser Kern, amber Spitze
      for (let xx = -half; xx <= half; xx += 0.5) deathPx(g, x + xx, y, charOf(idx));
    }
    // Losgeloeste Zungen-Spitze als Funke (ab Stufe 2).
    if (stage >= 2) deathPx(g, tx + sway, 8 - h - 1.4, charOf(20));
  }
  // Asche/Glimm im Sog der Zungen (dunkel, sparsam) — eigener Kontrast.
  deathPx(g, 1.2, 6.5 - stage * 0.5, charOf(15));
  deathPx(g, 7.8, 5.5 - stage * 0.7, charOf(8));
  if (stage >= 1) deathPx(g, 3.4, 2.2 - stage * 0.4, charOf(16));
  return deathRows(g);
}

/** fx_death_void (dissolve): ein geschwungener aufsteigender Schwaden + Nebenwisp. */
function voidDeathFrame(stage: number): string[] {
  const g = deathGrid();
  // Haupt-Schwaden: unten breit, oben schmal, schwankt; loest sich in Punkten auf.
  const top = 0.8 + stage * 1.6;
  for (let y = 7.4; y >= top; y -= 0.5) {
    const sway = Math.sin(y * 0.75 + stage * 1.1) * 0.8;
    const frac = (7.4 - y) / Math.max(0.5, 7.4 - top);
    const w = Math.max(0.45, 0.55 + frac * 0.9 - stage * 0.08);
    for (let xx = -w; xx <= w; xx += 0.5) {
      const x = 3.6 + sway + xx;
      // Runde 3: Flaeche heller (fog statt fogBlue), Kern breiter — lesbar auf Nachtgrund.
      deathPx(g, x, y, Math.abs(xx) < w * 0.5 ? charOf(9) : charOf(7));
    }
  }
  // Abgeloeste Schwadenpunkte ueber der Spitze.
  deathPx(g, 3.6 + Math.sin(stage * 1.3), top - 0.9, charOf(9));
  if (stage >= 1) deathPx(g, 4.4, top - 0.2, charOf(7));
  // Kleiner Nebenwisp rechts, folgt mit Versatz.
  for (let y = 5.2 - stage * 0.7; y <= 6.8; y += 0.5) {
    deathPx(g, 6.3 + Math.sin(y * 0.9 + stage), y, charOf(7));
  }
  return deathRows(g);
}

/**
 * fx_boss_core (Boss-Tod-Stufe): 3-Stufen-Kern (lanternWhite → glow → amber,
 * kollabiert), zwei expandierende Zackenringe, 8 radiale Splitter und harte
 * ink-Kontur + Lichtkante — klar getrennt vom 9x9-Klassen-Shard (Blob).
 *
 * M10-Lesbarkeit (Karte #5219, Blocker "Boss-FX-Kontrast", Technik wie der
 * Ember-Fix #2879): der Kern ist ein kleiner lanternWhite-Fleck statt eines
 * Weiss-Blobs; eine geschlossene 1-px-Tintenkontur um den Glutkern plus eine
 * um +1/+1 versetzte Offset-Outline trennen den Boss-Effekt auch ueber heller
 * Horde. Nur Palettenfarben, binaeres Alpha.
 */
function bossCoreFrame(stage: number): string[] {
  const size = 32;
  const g: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const put = (x: number, y: number, idx: number): void => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= size || yi >= size) return;
    g[yi][xi] = charOf(idx);
  };
  const c = (size - 1) / 2;
  const t = stage / 5;
  // 3-Stufen-Kern, schrumpft mit der Stufe (Kern kollabiert).
  const rCore = [5.6, 5.0, 4.2, 3.4, 2.6, 1.8][stage];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= rCore) continue;
      if (d < rCore * 0.22) put(x, y, 13);
      else if (d < rCore * 0.62) put(x, y, 22);
      else put(x, y, 20);
    }
  }
  // M10 #5219: Kontur VOR den Ringen zeichnen (ueberschreiben sonst die Tinte).
  // Geschlossene 1-px-Tintenkontur unmittelbar ausserhalb des Kerns.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d >= rCore && d < rCore + 1.2) put(x, y, 0);
    }
  }
  // Offset-Outline: Kernsilhouette um +1/+1 versetzt, wo noch frei — liest sich
  // als harte Schattenkante und haelt den Kern auch ueber heller Horde getrennt.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (g[y][x] !== ".") continue;
      const d = Math.hypot(x - 1 - c, y - 1 - c);
      if (d < rCore + 1.2) put(x, y, 0);
    }
  }
  // Zwei expandierende Zackenringe (Flamme aussen, Glut innen). M10 #5219:
  // Radius an die neue Kontur angepasst — mit Jag (±1,1) und Band (±1,6) muss
  // der innere Rand ausserhalb der Tinte bleiben (rCore + 3,4 - 1,1 - 0,9 >= rCore + 1,2).
  for (let ring = 0; ring < 2; ring++) {
    const rr = rCore + 3.4 + ring * 4.5 + t * (7 - ring * 2);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - c;
        const dy = y - c;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - rr) > 2.2) continue;
        const a = Math.atan2(dy, dx);
        const jag = Math.sin(a * 7 + ring * 2.4 + stage) * 1.1;
        const band = Math.abs(d - (rr + jag));
        if (band < 0.9) put(x, y, ring === 0 ? 18 : 16);
        else if (band < 1.6) put(x, y, ring === 0 ? 17 : 15);
      }
    }
  }
  // Acht radiale Splitter (Diamanten), fliegen mit der Stufe nach aussen.
  // M10 #5219: Splitter starten ausserhalb und werden an der Kontur geclippt,
  // damit sie Kern-Kontur/Offset-Outline nicht uebermalen.
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.39;
    const dist = rCore + 4.2 + t * 8.5;
    const px = c + Math.cos(a) * dist;
    const py = c + Math.sin(a) * dist;
    const len = 2.4 + (i % 2);
    for (let k = -len; k <= len; k += 0.5) {
      const w = Math.max(0, 1.3 - Math.abs(k) * 0.6);
      for (let s = -w; s <= w; s += 0.5) {
        const x = px + Math.cos(a) * k - Math.sin(a) * s;
        const y = py + Math.sin(a) * k + Math.cos(a) * s;
        if (Math.hypot(x - c, y - c) < rCore + 1.4) continue;
        put(x, y, Math.abs(k) < 0.8 ? 19 : 20);
      }
    }
  }
  const rows = outlineAndRim(g);
  // M10 #5219: Die Lichtkante von oben-links wird im Boss-Frame auf Laterne (21)
  // gemappt statt Knochenhell (11) — 11 ist near-white und ließ den Kern
  // ausbrennen; die Lichtkante selbst bleibt erhalten.
  return rows.map((r) => r.replace(/b/g, charOf(21)));
}

// thornFrame (9x9, Ramp-Char 97+idx = fleshWarm/mossNight statt Glut) ist
// M10-evo-fx-dornensturm durch thornTrailFrame in gen-fx.ts ersetzt (14x14,
// Dorn-Treppe, Zielgröße).

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
function coldHaloFrame(stage: number, size = 24, density = 1): string[] {
  const S = size * density;
  const out: string[] = [];
  const c = (S - 1) / 2;
  const r = (10.5 + stage * 0.4) * density;
  for (let y = 0; y < S; y++) {
    let row = "";
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d < r - 2 * density || d > r + 0.7 * density) row += ".";
      else if (d > r - 0.8 * density) row += "9";   // paleMist heller Rand
      else row += "6";                    // fogBlue
    }
    out.push(row);
  }
  return out;
}

/**
 * Seelenflamme (Seele, neu M10 m10-evo-fx-soulpyre): Zielgrösse 22x32, wird mit
 * Draw-Scale 1 gezeichnet (nie > 1x hochskaliert). Farb-Treppe Seelenfeuer
 * (art-director Runde 1: ohne warmes candleWhite — kühle Lesbarkeit):
 * Kern lanternWhite(13) → boneLight(11)/bone(10) → marshLight(31) → marsh(30),
 * Kontur mossDark(29) statt Ink — kein Ink(0), keine Nacht-/Grau-Töne (1–9).
 * 3 Flacker-Frames (Sway + Zungenbreite) @ ~5 Hz.
 */
export const SOUL_RAMP = [13, 11, 10, 31, 30, 29] as const;

export function orbSoulFrame(stage: number): string[] {
  const w = 22;
  const h = 32;
  const cx = 10.5;
  const sway = stage === 0 ? 0 : stage === 1 ? 1.0 : -0.9;
  const out: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = "";
    const v = y / (h - 1); // 0 = Spitze, 1 = Schweif-Ende
    const center = cx + sway * (0.25 - v) * 2.2 + Math.sin(y * 0.62 + stage * 2.0) * 0.7;
    // Breitenprofil: Spitze (0) → Bauch (~y15) → weicher Schweif (y26+)
    let half: number;
    if (y === 0) half = 0.6;
    else if (y < 5) half = 1.2 + y * 0.55;
    else if (y < 15) half = 4.6 + Math.sin((y - 5) * 0.5 + stage) * 0.5;
    else if (y < 26) half = 5.2 - (y - 15) * 0.22;
    else half = Math.max(0.8, 2.6 - (y - 26) * 0.7);
    if (stage === 2) half -= 0.25; // Frame 2 etwas schlanker (Flackern)
    for (let x = 0; x < w; x++) {
      const d = Math.abs(x - center) / half;
      if (d > 1.05) { row += "."; continue; }
      if (d > 0.92) { row += charOf(29); continue; }
      const n = d + Math.sin(x * 1.7 + y * 0.9 + stage * 1.3) * 0.05;
      const idx = n < 0.46 ? 13
        : n < 0.64 ? 11
        : n < 0.75 ? (y < 20 ? 10 : 31)
        : n < 0.88 ? 31
        : 30;
      row += charOf(idx);
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
  /**
   * M10-evo-fx-phoenix / m10-evo-fx-soulpyre: gesetzt, wenn die Signatur-Textur
   * bereits in Zielgrösse gebacken wird und mit Draw-Scale 1 gezeichnet wird
   * (Phönix 128x128, Seelenleuchtfeuer 96x96) — Mixel-Regel „nie > 1x
   * hochskalieren". Welcher Frame-Generator/ welche Grösse pro Signatur gilt,
   * steht in BAKED_SIGNATURES (addEvolutionSignatures).
   */
  drawScale?: readonly [number, number];
}

export const SIGNATURE_FRAME_COUNT = 4;

export const EVOLUTION_SIGNATURES: Readonly<Record<string, EvoSignature>> = {
  // Glutfunke + Arkanes Buch: heisser Splitter-Regen, kurz und hell.
  phoenix: {
    evolution: "phoenix", baseWeapon: "ember", shape: "splitter",
    palette: [20, 18, 19], hitLifetime: 0.16, deathLifetime: 0.62,
    hitCount: 6, deathCount: 14,
    // Zielgröße 128 gebacken (phoenixSignatureFrame), Draw-Scale 1 statt 32x32 @ 4,0-4,6.
    drawScale: [1, 1],
  },
  // Kettenflegel + Eisenherz: goldener Ring-Schlag, sehr kurz.
  // M10-evo-fx-zornpendel: Signatur in Zielgroesse 96x96 gebacken, Draw-Scale 1
  // (vorher 32x32 @ 4,0–4,6 = blockiger Ring mit 176 Ink-Pixeln).
  wrath_pendulum: {
    evolution: "wrath_pendulum", baseWeapon: "flail", shape: "ring",
    palette: [21, 20, 16], hitLifetime: 0.12, deathLifetime: 0.30,
    hitCount: 4, deathCount: 8,
    drawScale: [1, 1],
  },
  // Frostnova + Sanduhr: kalte Eiswolke, langsam ausklingend. Zielgröße 128x128
  // @ Draw-Scale 1 (Mixel-Regel), eisige Kristall-Treppe statt grauer Blob-Wolke.
  eternal_winter: {
    evolution: "eternal_winter", baseWeapon: "frost", shape: "cloud",
    palette: [9, 6, 11], hitLifetime: 0.22, deathLifetime: 0.75,
    hitCount: 5, deathCount: 10,
    drawScale: [1, 1],
  },
  // Dornensalve + Windstiefel: gruener Splitter-Kranz, mittleres Timing.
  // M10-evo-fx-dornensturm: Signatur in Zielgroesse 128x128 gebacken, Draw-Scale 1
  // (vorher 32x32 @ 4,0–4,6 = 188/354 Ink-Pixel).
  thorn_storm: {
    evolution: "thorn_storm", baseWeapon: "thorn", shape: "splitter",
    palette: [31, 30, 24], hitLifetime: 0.18, deathLifetime: 0.42,
    hitCount: 5, deathCount: 11,
    drawScale: [1, 1],
  },
  // Sturmrune + Wetzstein: klarer Gelb-Weiß-Blitz, extrem kurz.
  // m10-evo-fx-form-polish: in Zielgröße 96x96 gebacken (vorher 32x32 @ 3,2–4,6x
  // mit ~60 % Ink-Pixeln).
  thunder_seal: {
    evolution: "thunder_seal", baseWeapon: "storm", shape: "beam",
    palette: [12, 9, 7], hitLifetime: 0.10, deathLifetime: 0.24,
    hitCount: 3, deathCount: 7,
    drawScale: [1, 1],
  },
  // Geisterlaterne + Magnetamulett: helle Seelenwolke, langes Nachgluehen.
  // M10 m10-evo-fx-soulpyre: Signatur in Zielgroesse 96x96 gebacken, Draw-Scale 1
  // (vorher 32x32 @ 4,0–4,6 = graue Rechteck-Platte mit Ink-Rand).
  soul_beacon: {
    evolution: "soul_beacon", baseWeapon: "lantern", shape: "cloud",
    palette: [11, 8, 5], hitLifetime: 0.26, deathLifetime: 0.55,
    hitCount: 4, deathCount: 9,
    drawScale: [1, 1],
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
 * Blend werden gedaempft. Die Untergrenze liegt bei 0,85 (art-director-Abnahme
 * M10): die Signaturen bleiben auch bei 300+ Gegnern klar sichtbar, statt im
 * Chaos auf 0,5 zu verblassen.
 */
export function lodSignatureView(
  sig: EvoSignature,
  level: "full" | "reduced" | "minimal",
): { shape: EvoSignatureShape; paletteIndex: number; alpha: number; blend: "ADD" | "NORMAL" } {
  const alpha = level === "full" ? 1 : level === "reduced" ? 0.92 : 0.85;
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

/** Palettenindex als Pixel-Zeichen: 0-9 = Index 0-9, a-v = Index 10-31. */
function charOf(idx: number): string {
  const i = Math.max(0, Math.min(31, Math.round(idx)));
  return i < 10 ? String.fromCharCode(48 + i) : String.fromCharCode(97 + i - 10);
}

/** 1-px-Kontur in ink (0) plus helle Lichtkante oben-links (boneLight, 11). */
function outlineAndRim(rows: string[][]): string[] {
  const size = rows.length;
  const snapshot = rows.map((r) => r.slice());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (snapshot[y][x] !== ".") continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          if (snapshot[ny][nx] !== ".") { touches = true; break; }
        }
      }
      if (touches) rows[y][x] = charOf(0);
    }
  }
  // Lichtkante: obere/links angrenzende Farbpixel einer Kontur aufhellen.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ch = rows[y][x];
      if (ch === "." || ch === charOf(0)) continue;
      const aboveInk = y === 0 || rows[y - 1][x] === charOf(0);
      const leftInk = x === 0 || rows[y][x - 1] === charOf(0);
      if (aboveInk && leftInk) rows[y][x] = charOf(11);
    }
  }
  return rows.map((r) => r.join(""));
}

/** Form-Frame einer Signatur: 4 Frames (klein → gross / ausklingend). */
export function signatureFrame(
  shape: EvoSignatureShape,
  palette: readonly [number, number, number],
  stage: number,
  kind: "hit" | "death" = "hit",
): string[] {
  const size = 32;
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  const spread = death ? 1.4 : 1.0;
  // Form-Variante je Haupt-Palettenindex: verhindert, dass zwei Evolutionen mit
  // gleicher Grundform exakt dieselben Pixel erzeugen (siehe tests/fx-evolution).
  const variant = palette[0] % 7;

  if (shape === "ring") {
    // Geschlossener 2-px-Zackenring: amber aussen, lantern innen, ink-Kontur.
    const r = Math.min(13.2, (5.2 + t * 6.6) * spread);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = Math.atan2(y - c, x - c);
      const jag = Math.sin(a * 8 + variant * 0.4) * 1.15
        + Math.sin(a * 16 + stage * 1.7) * (death ? 0.85 : 0.35);
      const edge = d - (r + jag);
      if (edge >= -1.8 && edge < 0) putPixel(rows, x, y, palette[0]);
      else if (edge >= 0 && edge <= 1.8) putPixel(rows, x, y, palette[1]);
      else if (edge > 1.8 && edge <= 2.6) putPixel(rows, x, y, palette[2]);
    }
    return outlineAndRim(rows);
  }

  if (shape === "beam") {
    // 2-3 px breiter Zickzack: candleWhite-Kern, fogBlue/paleMist-Rand, ink-Kontur.
    const h = (death ? 28 : 20) + stage * 2;
    const beams = death ? 3 : 1;
    for (let b = 0; b < beams; b++) {
      const off = b === 0 ? 0 : b === 1 ? -3 : 3;
      for (let i = -h / 2; i <= h / 2; i++) {
        const y = Math.round(c + i);
        const wob = Math.round(Math.sin(i * 0.85 + variant + b * 1.3) * (death ? 2.4 : 1.7));
        const x = Math.round(c + off + wob);
        putPixel(rows, x, y, palette[0]);
        putPixel(rows, x - 1, y, palette[1]);
        putPixel(rows, x + 1, y, palette[1]);
      }
      if (b === 0) {
        for (let k = 1; k <= 5; k++) {
          putPixel(rows, c + 4 + k, c + k * 0.7, palette[1]);
          putPixel(rows, c - 5 - k, c - k * 0.7, palette[1]);
        }
      }
    }
    return outlineAndRim(rows);
  }

  if (shape === "splitter") {
    const shards = death ? 6 : 4;
    const base = death ? 5.5 : 6.5;
    const len = 4 + t * 4.5;
    for (let i = 0; i < shards; i++) {
      const a = variant * 0.37 + (i / shards) * Math.PI * 2 + stage * 0.13;
      const rr = base * spread;
      const cx = c + Math.cos(a) * rr;
      const cy = c + Math.sin(a) * rr;
      // Laenglicher Diamant entlang der Radialachse, mit hellem Kern.
      for (let k = -len; k <= len; k++) {
        const w = Math.max(0, 2.6 - Math.abs(k) * 0.55);
        for (let s = -w; s <= w; s += 1) {
          const px = cx + Math.cos(a) * k - Math.sin(a) * s;
          const py = cy + Math.sin(a) * k + Math.cos(a) * s;
          const idx = Math.abs(k) < 1.2 && Math.abs(s) < 1.2 ? palette[2]
            : Math.abs(k) > len - 1.5 ? palette[1] : palette[0];
          putPixel(rows, px, py, idx);
        }
      }
    }
    if (!death) putPixel(rows, c, c, palette[2]);
    return outlineAndRim(rows);
  }

  // cloud: zwei klar verschiedene Silhouetten — asymmetrische Eiswolke oder aufsteigender Wisp.
  if (palette[0] === 9) {
    // Ewiger Winter: asymmetrische Eiswolke, paleMist-Kern + fogBlue-Aussenband.
    const blobs: Array<[number, number, number]> = [
      [-4, -2, 4.4], [3.5, -3, 3.8], [5, 2.5, 4.2], [-2, 4, 3.9], [0, 0, 4.8],
    ];
    for (const [bx, by, br] of blobs) {
      const r = br * (death ? 1.45 : 1) * (1 + t * 0.35);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - (c + bx * spread), y - (c + by * spread));
        if (d > r) continue;
        const idx = d < r * 0.5 ? palette[0] : d < r * 0.85 ? palette[1] : palette[2];
        putPixel(rows, x, y, idx);
      }
    }
    // Drei Eis-Splitter am Rand, damit die Wolke nicht amorph bleibt.
    for (let i = 0; i < 3; i++) {
      const a = -0.6 + i * 1.1 + variant * 0.2;
      for (let k = 0; k < 5; k++) putPixel(rows, c + Math.cos(a) * (8 + k), c + Math.sin(a) * (7 + k), palette[1]);
    }
    return outlineAndRim(rows);
  }

  // Seelenleuchtfeuer: aufsteigender Wisp (schmaler Kern, breiter Saum, Schweif).
  const wisps = death ? 3 : 1;
  for (let w = 0; w < wisps; w++) {
    const offX = w === 0 ? 0 : w === 1 ? -5 : 5;
    const offY = w === 0 ? 0 : w === 1 ? 3 : -2;
    const top = 10 + t * 4;
    for (let yy = -top; yy <= 8; yy++) {
      const y = c + yy + offY;
      const taper = 1 - Math.max(0, yy + top * 0.2) / (top * 1.2);
      const half = Math.max(0.6, 4.2 * taper + (death ? 1.2 : 0));
      const sway = Math.sin(yy * 0.35 + stage * 0.9 + variant + w) * 1.7;
      for (let xx = -half; xx <= half; xx += 0.75) {
        const x = c + offX + sway + xx;
        const idx = Math.abs(xx) < half * 0.42 ? palette[0]
          : Math.abs(xx) < half * 0.78 ? palette[1] : palette[2];
        putPixel(rows, x, y, idx);
      }
    }
    // Zwei kleine seitliche Flammenarmen.
    for (let k = 0; k < 4; k++) {
      putPixel(rows, c + offX - 4 - k * 0.6, c + offY + 3 - k, palette[1]);
      putPixel(rows, c + offX + 4 + k * 0.6, c + offY + 2 + k * 0.4, palette[1]);
    }
  }
  return outlineAndRim(rows);
}

/**
 * Seelenleuchtfeuer-Signatur in Zielgroesse (m10-evo-fx-soulpyre): 96x96, wird mit
 * Draw-Scale 1 gezeichnet (vorher 32x32 @ 4,0–4,6 = graue Platte). Organische
 * Flammenzungen (spitze Taper, Sway) statt Rauten/Platten. art-director Runde 1
 * (FAIL→Fix): Kern **flaechig** lanternWhite(13) ohne Sinus-Wanderung (Kriterium
 * „Kerne flaeche hell"); 11/31/30 nur als schmale 1–2 px Uebergangsbaender an der
 * Kante, kein bone(10)/candleWhite(12) in der Signatur (warm-beiger Schmutz);
 * Sway wirkt nur auf die Aussenband-Grenzen. Dunkle Rand-Kontur mossDark(29)
 * statt Ink. Hit: 1 grosse + 1 kleine Zunge; Death: 3 Zungen + kleine Seelen-
 * Funken (1–2 px Flamme mit 29er-Kontur, keine freien Quadrate).
 */
export const SOUL_SIGNATURE_SIZE = 96;

export function soulSignatureFrame(kind: "hit" | "death", stage: number): string[] {
  const size = SOUL_SIGNATURE_SIZE;
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  const wisps = death ? 3 : 2;
  for (let wi = 0; wi < wisps; wi++) {
    const offX = wi === 0 ? 0 : wi === 1 ? -15 : 14;
    const offY = wi === 0 ? 8 : wi === 1 ? 14 : 12;
    const wispScale = wi === 0 ? 1 : 0.58;
    const top = ((death ? 36 : 28) + t * 8) * wispScale;
    const baseY = c + offY;
    // Flammenzunge: Basis unten, wandernde Spitze oben, Sway je Frame.
    for (let yy = 0; yy <= top; yy++) {
      const y = baseY - yy;
      const v = yy / top; // 0 Basis → 1 Spitze
      const half = Math.max(0.8, (1.2 + (1 - v) * 10.5 * wispScale) * (stage === 3 ? 0.82 : 1));
      const sway = Math.sin(yy * 0.14 + stage * 1.5 + wi * 2.3) * (2.6 * (1 - v * 0.5));
      const center = c + offX + sway + (death ? 0 : Math.sin(stage * 1.1) * 1.5);
      // Sway nur auf die Aussenband-Grenzen — der Kern (d < 0.52) bleibt flaeche 13.
      const wob = Math.sin(yy * 0.45 + stage * 2.1 + wi) * 0.035;
      for (let xx = -half; xx <= half; xx += 0.5) {
        const d = Math.abs(xx) / half;
        const idx = d < 0.52 ? 13
          : d < 0.63 + wob ? 11
          : d < 0.77 + wob ? 31
          : d < 0.90 + wob ? 30
          : 29;
        putPixel(rows, center + xx, y, idx);
      }
      // Dunkle Rand-Kontur (mossDark) statt Ink — Kontur nur als dunkle FarbStufe.
      putPixel(rows, center - half - 0.7, y, 29);
      putPixel(rows, center + half + 0.7, y, 29);
    }
  }
  if (death) {
    // Aufsteigende Seelen-Funken: kleine 1–2 px Flamme (13/31) mit 29er-Kontur —
    // keine freien Quadrate (art-director Runde 1).
    const sparks = 4 + stage;
    for (let i = 0; i < sparks; i++) {
      const a = i * 2.4 + stage * 0.7;
      const rr = 14 + ((i * 7 + stage * 5) % 20);
      const sx = Math.round(c + Math.cos(a) * rr);
      const sy = Math.round(c - 6 - ((i * 11 + stage * 9) % 24));
      putPixel(rows, sx, sy, 13);          // Flammenspitze
      putPixel(rows, sx, sy + 1, 31);      // Fuss
      putPixel(rows, sx - 1, sy, 29);      // Kontur links
      putPixel(rows, sx + 1, sy, 29);      // Kontur rechts
    }
  }
  return rows.map((r) => r.join(""));
}

// ── Mixel-Fix (Dom-Wunsch 21:15Z, Punkt 4a) ─────────────────────────────────
// Befund: große Feuer-/Aura-Effekte liegen als kleine Texturen vor (fx_fire
// 14x14, fx_halo/fx_halo_cold 24x24, fx_shock 48x48) und werden mit Scale > 1
// gezeichnet — ein Textur-Pixel deckt dann 1,4–4,6 Spielpixel (bei dpr 3 bis
// ~14 Device-Pixel) ab: grobe 6–8-px-Blöcke statt weicher Glow-Stufen.
//
// Fix: dieselben prozeduralen Generatoren rendern je Bake-Stufe L in L-facher
// Pixelgröße (w0*L x h0*L, identische normierte Geometrie). Das FxSystem wählt
// die kleinste Stufe L >= gewünschter Scale und zeichnet mit Scale/L <= 1 —
// ein Textur-Pixel deckt damit höchstens 1 Spielpixel ab, der Glow läuft in
// 1-px-Stufen. Level-1-Keys bleiben unverändert (Direkt-Pfaden kompatibel).

/** Die vier weichen Glow-/Explosions-Effekte mit Bake-Stufen (Mixel-Fix). */
/** Die vier weichen Glow-/Explosions-Effekte mit Bake-Stufen (Mixel-Fix) plus
 *  ring_frost (M10-evo-fx-winter: Aura-Siegel wird bis 2–3x gezeichnet). */
export const FX_MIXEL_BASES = ["fx_fire", "fx_halo_cold", "fx_halo", "fx_shock", "ring_frost"] as const;

export type FxMixelBase = (typeof FX_MIXEL_BASES)[number];

interface MixelBakeDef {
  base: FxMixelBase;
  /** Level-1-Texturgröße (Spielpixel-Basis). */
  w: number;
  h: number;
  frameCount: number;
  /** Höchste Bake-Stufe: deckt den größten real gezeichneten Scale ab
   *  (fx_halo bis 4,6 im Boss-Tod; shock bis 3,3; fire/cold < 2 + Reserve). */
  maxLevel: number;
  /** Frame-Generator in Spielpixel-Basis + Stufe (Stufe 1 == Level-1-Frame). */
  frame: (stage: number, density: number) => string[];
}

const MIXEL_BAKE_DEFS: readonly MixelBakeDef[] = [
  {
    base: "fx_fire", w: 14, h: 14, frameCount: 6, maxLevel: 3,
    frame: (i, d) => blob(14, 14, [21, 20, 18, 17, 16, 15], { core: 0.18 + i * 0.045, seed: i * 1.3 }, d),
  },
  {
    base: "fx_halo", w: 24, h: 24, frameCount: 2, maxLevel: 6,
    frame: (i, d) => ring(24, 24, [20, 18, 17], 0.3 + i * 0.16, i, d),
  },
  {
    base: "fx_halo_cold", w: 24, h: 24, frameCount: 2, maxLevel: 3,
    frame: (i, d) => coldHaloFrame(i, 24, d),
  },
  {
    base: "fx_shock", w: 48, h: 48, frameCount: 6, maxLevel: 4,
    frame: (i, d) => shockFrame(i, 48, d),
  },
  {
    // M10-evo-fx-winter: Frost-Aura-Siegel (früher Canvas in textures.ts). Wird
    // mit Scale radius/47 (bis ~2x, Extreme 3x) gezeichnet → Bake bis Level 3,
    // Draw-Scale <= 1. Identische Geometrie wie die alte 96x96-Canvas-Version
    // (2-px-Eisband mist/paleMist + candleWhite-Innenkante + 12 lanternWhite-
    // Zacken), damit der art-director-Fundstand erhalten bleibt.
    base: "ring_frost", w: 96, h: 96, frameCount: 1, maxLevel: 3,
    frame: (_i, d) => frostRingFrame(96, d),
  },
];

/**
 * M10-evo-fx-winter: Frost-Aura-Siegel als Row-Generator (Mixel-Bake).
 * Level 1 (96x96) entspricht der bisherigen Canvas-Textur aus textures.ts:
 * 2-px-Eisband mist(8)/paleMist(9) mit candleWhite(12)-Innenkante und 12
 * lanternWhite(13)-Zacken. Density = Bake-Stufe (identische normierte Geometrie).
 */
export function frostRingFrame(size: number, density: number): string[] {
  const L = Math.max(1, Math.round(density));
  const rows: string[][] = Array.from({ length: size * L }, () => Array(size * L).fill("."));
  const c = (size * L - 1) / 2;
  const put = (x: number, y: number, idx: number) => putPixel(rows, x, y, idx);
  // Gerastertes Eisband + Innenkante (Radien wie die Canvas-Version, × Stufe).
  // M10-evo-fx-winter Abnahme Runde 1 (art-director FAIL: Aura 3.5 auf hellem
  // Moor-Grund): 1 px kühle Außenkante in blueGrey(5) unter dem Band, damit der
  // Ring auf Gras-Mitteltönen nicht verschmilzt.
  for (let y = 0; y < size * L; y++) {
    for (let x = 0; x < size * L; x++) {
      const d = Math.sqrt((x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2);
      if (d >= 43.5 * L && d <= 45.5 * L) put(x, y, 8);
      else if (d >= 41.5 * L && d <= 43.5 * L) put(x, y, 9);
      else if (d >= 39.5 * L && d <= 40.5 * L) put(x, y, 12);
      else if (d > 45.5 * L && d <= 46.5 * L) put(x, y, 5);
    }
  }
  // 12 2-px-Zacken von r 43 nach r 47 (× Stufe), lanternWhite.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const x0 = Math.round(c + Math.cos(a) * 43 * L);
    const y0 = Math.round(c + Math.sin(a) * 43 * L);
    const x1 = Math.round(c + Math.cos(a) * 47 * L);
    const y1 = Math.round(c + Math.sin(a) * 47 * L);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= steps; t++) {
      const px = x0 + Math.round(((x1 - x0) * t) / Math.max(1, steps));
      const py = y0 + Math.round(((y1 - y0) * t) / Math.max(1, steps));
      for (let w = 0; w < 2 * L; w++) put(px + w, py, 13);
    }
  }
  return rows.map((r) => r.join(""));
}

/** Texture-Key einer Bake-Stufe (Level 1 = der normale Basis-Key). */
export function mixelTextureKey(base: string, level: number): string {
  return level <= 1 ? base : `${base}@${level}`;
}

/** Basis-Key eines Mixel-Effekts, wenn der Frame-Key dazugehört (sonst null).
 *  Laengste Basen zuerst, damit fx_halo_cold nicht als fx_halo matcht; bereits
 *  umgeschriebene Stufen-Keys ("fx_halo@2_1") werden ueber das "@" erkannt. */
export function mixelBaseFor(key: string): FxMixelBase | null {
  const at = key.indexOf("@");
  const plain = at >= 0 ? key.slice(0, at) : key;
  const bases = [...FX_MIXEL_BASES].sort((a, b) => b.length - a.length);
  for (const base of bases) {
    if (plain === base || plain.startsWith(`${base}_`)) return base;
  }
  return null;
}

/** Frame-Key in der Stufen-Variante (Level 1 = unverändert, nicht-Mixel = unverändert).
 *  Bereits auf eine Stufe umgeschriebene Keys werden auf die neue Stufe umgekeyt. */
export function mixelFrameKey(key: string, level: number): string {
  if (level <= 1) return key;
  const base = mixelBaseFor(key);
  if (!base) return key;
  const at = key.indexOf("@");
  if (at < 0) return `${base}@${level}${key.slice(base.length)}`;
  // Stufen-Anteil hinter "@" verwerfen, Frame-Suffix (ab dem naechsten "_") halten.
  const digits = /^\d+/.exec(key.slice(at + 1))?.[0] ?? "";
  const suffix = key.slice(at + 1 + digits.length);
  return `${base}@${level}${suffix}`;
}

/** Hoechste Bake-Stufe eines Basis-Keys (0, wenn kein Mixel-Effekt). */
export function mixelMaxLevel(key: string): number {
  const base = mixelBaseFor(key);
  if (!base) return 0;
  return MIXEL_BAKE_DEFS.find((def) => def.base === base)?.maxLevel ?? 1;
}

/**
 * Kleinste Bake-Stufe >= |scale| (1, wenn scale <= 1 oder kein Mixel-Key).
 * Nach der Stufenwahl zeichnet FxSystem mit Scale/L: der Draw-Scale bleibt
 * <= 1, solange der gewuenschte Scale <= maxLevel der Basis ist.
 */
export function mixelLevelFor(key: string, scale: number): number {
  const max = mixelMaxLevel(key);
  if (max <= 1) return 1;
  const s = Number.isFinite(scale) ? Math.abs(scale) : 1;
  if (!(s > 1)) return 1;
  return Math.min(max, Math.ceil(s));
}

/** Eine gebackene Stufe: Textur in Sprite-Pixelgroesse (w0*L x h0*L). */
export interface MixelBakedSet {
  base: FxMixelBase;
  level: number;
  w: number;
  h: number;
  frames: string[][];
}

/** Alle Bake-Stufen >= 2 (Level-1-Frames kommen aus den normalen addFrames-Pfaden). */
export function mixelBakes(): MixelBakedSet[] {
  const out: MixelBakedSet[] = [];
  for (const def of MIXEL_BAKE_DEFS) {
    for (let level = 2; level <= def.maxLevel; level++) {
      out.push({
        base: def.base,
        level,
        w: def.w * level,
        h: def.h * level,
        frames: Array.from({ length: def.frameCount }, (_, i) => def.frame(i, level)),
      });
    }
  }
  return out;
}

/** Level-1-Frames der Mixel-Basen (Quelle der normalen Textur-Keys; Beleg-Skript
 *  scripts/m10-fx-mixel.mjs und tests/fx-mixel.test.ts verglichen damit). */
export function mixelLevel1Frames(): Record<string, { w: number; h: number; frames: string[][] }> {
  const out: Record<string, { w: number; h: number; frames: string[][] }> = {};
  for (const def of MIXEL_BAKE_DEFS) {
    out[def.base] = {
      w: def.w,
      h: def.h,
      frames: Array.from({ length: def.frameCount }, (_, i) => def.frame(i, 1)),
    };
  }
  return out;
}

// ── Phönixschwarm-FX (M10-evo-fx-phoenix) ──────────────────────
// Vorlage für alle Evolutions-Effekt-Jobs: EINE Pixelgröße für alles — jede
// Textur wird direkt in ihrer Zielgröße gebacken und mit Draw-Scale 1 gezeichnet
// (nie > 1x hochskalieren). Klare Feuer-Farbtreppe Kern Glow(22)/Lantern(21) →
// Amber(20)/FlameBright(19) → Flame(18)/EmberOrange(17) → EmberBrown(16); keine
// Ink-Ränder (0), Konturen nur als warme Dunkelstufe (16/17). Aufbau ≤ 0,3 s
// (Launch) → klarer Impact (Boom) → kurzer Ausklang (Brandfleck).

/** Kleinste Rampe (Grenze, Index), deren Grenze d noch einhält. */
function rampAt(d: number, ramp: readonly (readonly [number, number])[]): number {
  for (const [limit, idx] of ramp) if (d <= limit) return idx;
  return ramp[ramp.length - 1][1];
}

/** Feuervogel (fliegt +x, Rotation übernimmt der Sprite): Flügelraute + Rumpfträne, 3 Schlag-Phasen. */
export function phoenixBirdFrame(flap: number, w = 15, h = 11): string[] {
  const rows: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  const cy = (h - 1) / 2;
  // Flügelraute: Mittelpunkt wandert mit der Schlagphase, rx/ry variieren.
  const wx = [4.0, 4.5, 5.0][flap];
  const ry = [4.2, 3.2, 2.4][flap];
  const rx = [3.2, 4.2, 5.0][flap];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < 9; x++) {
      const d = Math.hypot((x - wx) / rx, (y - cy) / ry);
      if (d <= 1) {
        putPixel(rows, x, y, d < 0.45 ? 21 : d < 0.8 ? 20 : 19);
      }
    }
  }
  // Rumpf: Träne von (6,cy) bis Kopf (14,cy), Kern Glow.
  for (let px = 5; px < 15; px++) {
    const t = (px - 5) / 9;
    const r = 0.6 + 1.7 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * t)) * (1 - t * 0.55);
    for (let pyf = -4; pyf <= 4; pyf++) {
      const d = Math.abs(pyf * 0.5);
      if (d <= r) putPixel(rows, px, cy + pyf * 0.5, d < 0.5 ? 22 : d < r - 0.4 ? 21 : 20);
    }
    putPixel(rows, px, cy + r + 0.2, 16); // Bauchkante: warme Dunkelstufe statt Ink
  }
  // Kopf-Haube + Schnabel-Glutkern.
  putPixel(rows, 13, cy - 1.5, 21);
  putPixel(rows, 13.5, cy - 2.5, 20);
  putPixel(rows, 14, cy - 3.5, 19);
  putPixel(rows, 14, cy, 13);
  // Schwanzflammen links.
  const tail = [2.0, 2.6, 3.4][flap];
  for (let k = 0; k < Math.ceil(tail * 2); k++) {
    const kk = k / 2;
    putPixel(rows, 1.5 - kk, cy + Math.sin(kk * 1.4 + flap) * 0.8, kk < 1 ? 18 : 17);
    putPixel(rows, 1.5 - kk, cy + 0.9 + Math.sin(kk * 1.4 + flap) * 0.8, 16);
  }
  return rows.map((r) => r.join(""));
}

/** Abschuss-Puff (Anticipation ≤ 0,3 s): kleine aufsteigende Glutwolke, 14x14, 3 Frames. */
export function phoenixLaunchFrame(stage: number, w = 14, h = 14): string[] {
  const rows: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2 + stage * 0.8;
  const t = stage / 3;
  const r = 2.6 + t * 2.2;
  const ramp: readonly (readonly [number, number])[] = [
    [r * 0.28, 22], [r * 0.5, 21], [r * 0.72, 20], [r * 0.9, 19], [r, 18],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - cx) / 0.8, (y - cy) * (y < cy ? 1.35 : 1.0));
      if (d <= r) putPixel(rows, x, y, rampAt(d, ramp));
    }
  }
  // Aufsteigende Funken.
  for (let k = 0; k < 3; k++) putPixel(rows, cx - 2 + k * 2, cy - r - 1 - k, k === 0 ? 20 : 19);
  return rows.map((r2) => r2.join(""));
}

/** Impact-Explosion in Zielgröße (64x64 ≈ Explode-Radius 34): Feuerkranz mit Zungen, 4 Frames. */
export function phoenixBoomFrame(stage: number, w = 64, h = 64): string[] {
  const rows: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  const c = (w - 1) / 2;
  const t = stage / 3;
  const ring = 8 + t * 20;
  const ramp: readonly (readonly [number, number])[] = [
    [ring * 0.3, 22], [ring * 0.52, 21], [ring * 0.72, 20], [ring * 0.9, 19], [ring, 18],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const jag = Math.sin(a * 7 + stage * 1.9) * 2.2 + Math.sin(a * 13 - stage) * 1.1;
      const edge = d - (ring + jag);
      if (edge <= 0) putPixel(rows, x, y, rampAt(d, ramp));
      else if (edge <= 1.1) putPixel(rows, x, y, 17); // warme Außenstufe, kein Ink
    }
  }
  // Zungen nach außen.
  for (let z = 0; z < 8; z++) {
    const a = (z / 8) * Math.PI * 2 + stage * 0.4;
    const tongue = Math.ceil(3 + t * 4);
    for (let k = 0; k < tongue; k++) {
      putPixel(rows, c + Math.cos(a) * (ring + 1 + k), c + Math.sin(a) * (ring + 1 + k), k < 2 ? 19 : 17);
    }
  }
  // Spät: verbrannte Glutflecken statt weiter wachsender Radius.
  if (stage >= 2) {
    for (let z = 0; z < 14; z++) {
      const a = z * 2.399;
      const rr = ring * (0.3 + (z % 5) * 0.12);
      putPixel(rows, c + Math.cos(a) * rr, c + Math.sin(a) * rr, 16);
    }
  }
  return rows.map((r) => r.join(""));
}

/** Brandfleck (Ausklang): dunkelrote Glutfläche mit Körnern, 64x64, 3 Frames, verblasst über die Lebenszeit. */
export function phoenixBurnFrame(stage: number, w = 64, h = 64): string[] {
  const rows: string[][] = Array.from({ length: h }, () => Array(w).fill("."));
  const c = (w - 1) / 2;
  const fade = 1 - stage / 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - c, y - c);
      const n = Math.sin(x * 0.9 + y * 0.4) * Math.cos(y * 0.8 - x * 0.3);
      const r = 30 * (0.75 + 0.25 * n) * (0.55 + 0.45 * fade);
      if (d <= r) {
        putPixel(rows, x, y, d < r * 0.3 ? 18 : d < r * 0.55 ? 17 : d < r * 0.8 ? 16 : 15);
      } else if (d <= r + 1.2 && (x * 7 + y * 13) % 3 === 0) {
        putPixel(rows, x, y, 14); // verstreute Glutkörner
      }
    }
  }
  // Aufflackernde Glutkerne.
  for (let z = 0; z < 6; z++) {
    const a = z * 1.05 + stage;
    const rr = 10 + ((z * 3) % 14);
    putPixel(rows, c + Math.cos(a) * rr, c + Math.sin(a) * rr, stage === 0 ? 19 : 17);
  }
  return rows.map((r) => r.join(""));
}

/**
 * Treffer-/Todes-Signatur in Zielgröße (128x128, Draw-Scale 1): fette Flammen-Scherben ohne Ink-Rand.
 * m10-evo-fx-form-polish (Dom K1/K2): die Scherben werden INVERS gemappt (Membership je Pixel
 * statt forward-rotiertem Sampling) — das alte Verfahren hinterließ systematische 1-px-Löcher
 * (Flächendither, belegt im K1-Kontaktblatt). Füllung jetzt flächig, Feuer-Rampe unverändert
 * (Kern 22 → 21 → 20 → 19 → 18), organische Taper-Form.
 */
export function phoenixSignatureFrame(kind: "hit" | "death", stage: number, size = 128): string[] {
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  const spread = death ? 1.4 : 1.0;
  const variant = 20 % 7; // phoenix palette[0] = amber
  const shards = death ? 6 : 4;
  const base = death ? 22 : 26;
  const ln = 16 + t * 18;
  for (let i = 0; i < shards; i++) {
    const a = variant * 0.37 + (i / shards) * Math.PI * 2 + stage * 0.13;
    const rr = base * spread;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cx = c + ca * rr;
    const cy = c + sa * rr;
    // Inverses Mapping: Membership je Pixel in Shard-Koordinaten (axial k, lateral s).
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const rx = x - cx;
        const ry = y - cy;
        const k = rx * ca + ry * sa;
        const ak = Math.abs(k);
        if (ak > ln) continue;
        const s = -rx * sa + ry * ca;
        // Flamme: an der Basis breit, zur Spitze geflammt (Taper).
        const wdt = Math.max(0, 11.5 * (1 - ak / ln) ** 0.8);
        const aS = Math.abs(s);
        if (aS > wdt) continue;
        const rel = ak / ln;
        const idx = rel < 0.22 && aS < wdt * 0.5 ? 22
          : rel < 0.5 && aS < wdt * 0.75 ? 21
          : rel < 0.75 ? 20
          : rel < 0.92 ? 19
          : 18;
        rows[y][x] = charOf(idx);
      }
    }
  }
  // Zentraler Glutkern.
  const coreR = death ? 6 : 5;
  for (let dy = -coreR; dy <= coreR; dy++) {
    for (let dx = -coreR; dx <= coreR; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= coreR) rows[Math.round(c + dy)][Math.round(c + dx)] = charOf(d < coreR * 0.45 ? 22 : d < coreR * 0.75 ? 21 : 20);
    }
  }
  // Überlappende Scherben können Einzelpixel-Lücken einschließen — füllen (K1).
  fillEnclosedHoles(rows, 20);
  return rows.map((r) => r.join(""));
}

// ── Zornpendel-FX (M10-evo-fx-zornpendel) ──────────────────────
// Vorlage „Eine Pixelgröße für alles" (m10-evo-fx-phoenix/-soulpyre): Ring, Glow
// und Signaturen werden in Zielgröße gebacken und mit Draw-Scale 1 gezeichnet.
// Vorher: fx_evo_death_wrath_pendulum 32x32 @ 4,33x mit 176 Ink-Pixeln (schwarzer
// Blockring), fx_halo 24x24 @ bis 10,7x am Spieler, fx_smear 44x16 @ 5,5x.
// Zorn-Farbtreppe: Kern hell-bernstein (Glow 22 / Lantern 21 / Amber 20) →
// Glut rot (FleshWarm 27 / HotRed 26 / Crimson 25), geschlossene 1-px-Kontur
// Blutnacht (23) statt Ink(0). Kein Ink, keine Grau-Stufen (1–9).

/** Zorn-Farb-Treppe (Kern → Glut → Kontur), für Generator + Tests. */
export const ZORN_RAMP = [22, 21, 20, 27, 26, 25, 23] as const;

/** Pendel-Ring in Zielgröße: Radius 96 (Zornpendel Lv 8) + 8 px Rand. */
export const WRATH_RING_SIZE = 208;
export const WRATH_RING_RADIUS = 96;

/** Treffer-/Todes-Signatur in Zielgröße (Draw-Scale 1). */
export const WRATH_SIGNATURE_SIZE = 96;

/**
 * Pendel-Ring (Schwung-Spur): wachsender Bogen um den Spieler — Aufbau
 * (kurzer Bogen, Frame 0) → Impact (Bogen bis π, Frame 2) → Ausklang macht
 * CombatSystem (Alpha-Fade + Glut-Rest). Spitze bei +x (Rotation = Winkel des
 * Kugelkopfs), Bogen schließt nach hinten an; side −1 spiegelt über Scale.
 * Kern flächig hell ohne Raster, Glut nur als radiale Treppe, organische
 * Zungen-Flicks außen; Dither nur als 1–2-px-Kantenjitter (kein Schachbrett).
 */
export function pendulumRingFrame(stage: number, size = WRATH_RING_SIZE, radius = WRATH_RING_RADIUS): string[] {
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / 2;
  const arc = Math.PI * (0.32 + 0.68 * t);
  const bandW = 2.4;
  const r0 = radius;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < size && iy < size) rows[iy][ix] = charOf(idx);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (a > 0 || a < -arc) continue;
      const v = (a + arc) / arc; // 0 = Schwungstart (Glut) → 1 = Spitze (Kugel)
      // Tail-Taper (art-director): Bogen am Schwungstart schmaler — auslaufende
      // Spur statt gleichmäßiger Röhre.
      const bandHere = bandW * (0.6 + 0.4 * v);
      if (Math.abs(d - r0) > bandHere) continue;
      const w = (d - (r0 - bandHere)) / (2 * bandHere); // 0 innen → 1 außen
      // Grenz-Jitter nur an den Band-Kanten (1–2 px), nie als Flächen-Raster.
      const flick = Math.sin(Math.abs(a) * 9 + stage * 2.1) * 0.05;
      const wEff = w + (w > 0.4 ? flick : -flick);
      let idx: number;
      if (wEff > 0.96) idx = 23;                 // äußere Kontur (1 px)
      else if (wEff > 0.86) idx = 20;            // Amber-Saum
      else if (wEff > 0.34) idx = v > 0.45 ? 22  // Kern flächig, zur Glut abdimmern
        : v > 0.18 ? 21 : 27;
      else if (wEff > 0.22) idx = v > 0.35 ? 21  // Glut nur an den Bändern zum Schwungstart
        : 26;
      else if (wEff > 0.08) idx = 26;
      else idx = 25;                             // innere dunkle Glut
      rows[y][x] = charOf(idx);
    }
  }
  // Organische Zungen-Flicks außen (unregelmäßig, mit Taper — keine Rauten).
  const zungen = 6;
  for (let i = 0; i < zungen; i++) {
    const za = -((i + 0.5) / zungen) * arc + Math.sin(i * 2.7 + stage * 1.3) * 0.14;
    const len = 2 + ((i * 3 + stage) % 3);
    for (let k = 1; k <= len; k++) {
      const rr = r0 + bandW + k;
      const idx = k >= len ? 27 : 26;
      put(c + Math.cos(za) * rr, c + Math.sin(za) * rr, idx);
      put(c + Math.cos(za) * (rr - 0.7), c + Math.sin(za) * (rr - 0.7) + 1, k === 1 ? 25 : 26);
    }
  }
  return rows.map((r) => r.join(""));
}

/** Glut-Glow am Pendel-Kopf (17x17, Draw-Scale 1 statt fx_halo @ radius/18 ≈ 5,3x). */
export function wrathGlowFrame(size = 17): string[] {
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const r = 6.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= 6.6) {
        const idx = d < 1.6 ? 22 : d < 3.0 ? 21 : d < 4.4 ? 20 : d < 5.6 ? 27 : 26;
        rows[y][x] = charOf(idx);
      } else if (d <= 7.05) {
        // Ecken-Rim (art-director): die abgeschnittenen Diagonalen mit Glut (26)
        // auffüllen — runder Rand statt quadratischer Eckstufen.
        rows[y][x] = charOf(26);
      }
    }
  }
  return rows.map((r2) => r2.join(""));
}

/**
 * Zornpendel-Signatur in Zielgröße (96x96, Draw-Scale 1): geschlossener Glutring
 * mit organischen Zungen statt 32x32-Blockring mit Ink-Rand (176 Ink-Pixel).
 * Kern flächig hell (22) ohne Sinus-Wanderung; Zungen mit Taper, unregelmäßig
 * verteilt; Dither nur als 1–2-px-Kantenjitter. Kontur 23 statt outlineAndRim.
 */
export function wrathSignatureFrame(kind: "hit" | "death", stage: number, size = WRATH_SIGNATURE_SIZE): string[] {
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  const r0 = (death ? 20 : 16) + t * 13;
  const bandW = 2.6;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && iy >= 0 && ix < size && iy < size) rows[iy][ix] = charOf(idx);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - r0) > bandW) continue;
      const w = (d - (r0 - bandW)) / (2 * bandW);
      // Kanten-Jitter (nur Band-Grenzen), Kern bleibt flächig.
      const flick = Math.sin(Math.atan2(dy, dx) * 7 + stage * 1.7) * 0.05;
      const wEff = w + (w > 0.4 ? flick : -flick);
      let idx: number;
      if (wEff > 0.94) idx = 23;
      else if (wEff > 0.8) idx = 20;
      else if (wEff > 0.42) idx = 22; // Kern flächig hell-bernstein
      else if (wEff > 0.26) idx = 21;
      else if (wEff > 0.1) idx = 26;
      else idx = 25;
      rows[y][x] = charOf(idx);
    }
  }
  // Zungen nach außen (Breiten-Taper: Wurzel 2 px, Spitze 1 px — art-director:
  // „Streichholz-Nadeln" vermeiden). Unregelmäßige Winkel, organisch statt Raster.
  const zungen = death ? 9 : 6;
  for (let i = 0; i < zungen; i++) {
    const za = (i / zungen) * Math.PI * 2 + i * 0.73 + stage * 0.11;
    const len = 3 + ((i * 5 + stage) % 3) + (death ? 1 : 0) + Math.round(t * 2);
    for (let k = 1; k <= len; k++) {
      const rr = r0 + bandW + k;
      const px = c + Math.cos(za) * rr;
      const py = c + Math.sin(za) * rr;
      put(px, py, k >= len ? 27 : 26);
      if (k === 1) {
        // Wurzel: seitlich je 1 px (26) — Zunge liest sich als Flamme, nicht als Nadel.
        put(c + Math.cos(za + 0.09) * rr, c + Math.sin(za + 0.09) * rr, 26);
        put(c + Math.cos(za - 0.09) * rr, c + Math.sin(za - 0.09) * rr, 26);
      }
    }
  }
  // Zentraler Glutkern: flächig hell, Randstufen statt Ink.
  const coreR = death ? 7 : 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d <= coreR) put(x, y, d < coreR * 0.55 ? 22 : d < coreR * 0.85 ? 21 : 20);
    }
  }
  // Death: verstreute Glutkörner (1 px, golden angle — organisch verteilt).
  if (death) {
    for (let i = 0; i < 8 + stage * 2; i++) {
      const a = i * 2.399;
      const rr = r0 + bandW + 3 + ((i * 7) % 9);
      put(c + Math.cos(a) * rr, c + Math.sin(a) * rr, i % 3 === 0 ? 26 : 25);
    }
  }
  return rows.map((r) => r.join(""));
}

/** Registriert die 12 Signatur-Texturen (6 Hit + 6 Death, je 4 Frames). */

/** Einzelne, voll umschlossene transparente Pixel füllen (K1: kein Flächendither). */
function fillEnclosedHoles(rows: string[][], idx: number): void {
  const h = rows.length;
  const w = rows[0].length;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (rows[y][x] !== ".") continue;
      if (rows[y][x - 1] !== "." && rows[y][x + 1] !== "." && rows[y - 1][x] !== "." && rows[y + 1][x] !== ".") {
        rows[y][x] = charOf(idx);
      }
    }
  }
}

/** Registriert die 12 Signatur-Texturen (6 Hit + 6 Death, je 4 Frames). */
/**
 * M10-evo-fx-winter: Treffer-/Todes-Signatur des Ewigen Winters in Zielgröße
 * 128x128 (Draw-Scale 1, siehe EvoSignature.drawScale). Eisiger Winter-Sturm
 * statt grauer Blob-Wolke: klare Kristall-Scherben mit geraden Kanten, weiße
 * Kerne, eisblaue Facetten — Farbtreppe lanternWhite(13) → candleWhite(12) →
 * boneLight(11) → paleMist(9) → mist(8) → fogBlue(6). Kein Ink/Grau-Rand.
 */
export function winterSignatureFrame(kind: "hit" | "death", stage: number): string[] {
  const size = 128;
  const rows: string[][] = Array.from({ length: size }, () => Array(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  // Deterministische Winkel-Variante (kein Math.random): Todes-Wirbel gedreht.
  const twist = death ? 0.35 : 0;

  // Zentraler Eis-Kern: hexagonal geschichtete Treppe, schrumpft im Ausklang.
  const coreR = death ? 15 + t * 7 : 11 + t * 5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - c;
    const dy = y - c;
    // Hexagon-Metrik: max über 3 Achsen (klare Kanten statt runder Blobs).
    const hex = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy) / Math.SQRT2, Math.abs(dx - dy) / Math.SQRT2);
    if (hex < coreR * 0.38) putPixel(rows, x, y, 13);
    else if (hex < coreR * 0.66) putPixel(rows, x, y, 12);
    else if (hex < coreR) putPixel(rows, x, y, death && (x + y) % 3 === 0 ? 9 : 11);
  }

  // Kristall-Scherben: gerade Diamant-Strahlen mit heller Spine und kalter Spitze.
  const shards = death ? 11 : 7;
  const baseLen = death ? 34 : 26;
  const len = baseLen + t * (death ? 38 : 30);
  const maxW = death ? 3.4 : 2.6;
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + twist + t * (death ? 0.22 : 0.1);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const r0 = coreR * 0.9;
    for (let k = r0; k <= r0 + len; k += 1) {
      const fall = 1 - (k - r0) / len;
      const w = Math.max(0, maxW * fall);
      const cx = c + ca * k;
      const cy = c + sa * k;
      for (let s = -w; s <= w; s += 1) {
        const px = cx - sa * s;
        const py = cy + ca * s;
        const rel = (k - r0) / len;
        // Spine hell, Flanken eisblau, Spitze mist/paleMist — kein Ink.
        let idx: number;
        if (Math.abs(s) < 0.6 && rel < 0.62) idx = rel < 0.25 ? 13 : 12;
        else if (rel > 0.82) idx = 9;
        else if (Math.abs(s) > w - 1.1) idx = 6;
        else idx = 11;
        putPixel(rows, px, py, idx);
      }
    }
  }

  // Eis-Splitter am Rand (kleine Diamanten) — der Sturm bleibt lesbar, nicht amorph.
  const chunks = death ? 8 : 4;
  for (let i = 0; i < chunks; i++) {
    const a = (i / chunks) * Math.PI * 2 + 0.7 + twist * 2 + stage * 0.09;
    const rr = coreR + len * (death ? 1.02 : 0.78) + ((i * 13 + stage * 7) % 9);
    const cx = c + Math.cos(a) * rr;
    const cy = c + Math.sin(a) * rr;
    putPixel(rows, cx, cy, 12);
    putPixel(rows, cx + 1, cy, 11);
    putPixel(rows, cx, cy + 1, 9);
    if (i % 2 === 0) putPixel(rows, cx - 1, cy, 6);
  }

  // Schnee-Flocken (2-px-Punkte) — dezent, in Sprite-Pixelgröße.
  const flakes = death ? 14 : 7;
  for (let i = 0; i < flakes; i++) {
    const a = (i / flakes) * Math.PI * 2 + stage * 0.31 + (death ? 0.5 : 0.2);
    const rr = 30 + ((i * 23 + stage * 17) % (death ? 32 : 22));
    const fx = Math.round(c + Math.cos(a) * rr);
    const fy = Math.round(c + Math.sin(a) * rr * 0.82); // leicht abgeflacht = Flocken-Drift
    putPixel(rows, fx, fy, i % 3 === 0 ? 9 : 11);
    if (i % 2 === 0) putPixel(rows, fx + 1, fy, 6);
  }

  return rows.map((r) => r.join(""));
}

// ── Dornensturm-FX (M10-evo-fx-dornensturm) ─────────────────────
// Vorlage „Eine Pixelgröße für alles" (m10-evo-fx-phoenix … -gewittersiegel).
// Vorher (shots/m10-evo-fx-dornensturm-before.json): projectile_thorn 7x7 @ 1,7x
// mit 12/25 Ink-Pixeln + warmer Glutrampe; fx_thorn 9x9 @ bis 2,9x (Ramp-Char
// 97+idx ergab fleshWarm/mossNight statt Glut); 16 Streak-Partikel @ scaleFrom
// 3,0 (Mixel); ring_burst 96 @ 0,45 + fx_shock 48 @ 0,28 (Matsch-Downscale).
// Dorn-Farbtreppe (grünlich-gelbe Natur-Töne, kein Ink, kein Grau 1–9):
//   Spitze boneLight(11, sparsam) → marshLight(31) → marsh(30) → mossDark(29)
//   → Kontur mossNight(28). Binäres Alpha („." statt Halbdeckung).
export const THORN_RAMP = [11, 31, 30, 29, 28] as const;

export const THORN_PROJECTILE_SIZE = 12;
export const THORN_TRAIL_SIZE = 14;
export const THORN_STREAK_SIZE = 22;
export const THORN_CROWN_SIZE = 96;

/**
 * Dornen-Projektil in Zielgröße (12x12, Draw-Scale 1 statt 7x7 @ 1,7x):
 * unregelmäßiger Dornenstern — 4 Hauptdornen mit unterschiedlicher Länge/Taper
 * + 4 kurze Diagonal-Barben, Kontur nur als 1-px-Saum (mossNight 28, kein Ink).
 */
export function thornProjectileFrame(): string[] {
  const size = THORN_PROJECTILE_SIZE;
  const rows: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));
  const c = (size - 1) / 2;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    rows[iy][ix] = charOf(idx);
  };
  // [Winkel, Länge, Basisbreite] — ungleich lang = organisch, keine Platte.
  const spokes: Array<[number, number, number]> = [
    [-Math.PI / 2, 5.2, 1.5],
    [0, 4.6, 1.7],
    [Math.PI / 2, 4.0, 1.4],
    [Math.PI, 4.6, 1.6],
    [-Math.PI / 4, 2.6, 1.2],
    [Math.PI * 0.75, 2.9, 1.2],
    [Math.PI * 0.25, 2.3, 1.1],
    [Math.PI * 1.25, 2.5, 1.1],
  ];
  for (const [a, len, baseW] of spokes) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    for (let k = 1.1; k <= len; k += 0.5) {
      const rel = k / len;
      const w = Math.max(0.45, baseW * (1 - rel) + 0.45);
      for (let s = -w; s <= w; s += 0.7) {
        const idx = rel >= 0.75 ? 31 : rel >= 0.32 ? 30 : 29;
        put(c + dx * k - dy * s, c + dy * k + dx * s, idx);
      }
      // Saum nur an den Flanken der Basis (kein geschlossener Ink-Rahmen).
      if (rel < 0.55) {
        put(c + dx * k - dy * (w + 0.8), c + dy * k + dx * (w + 0.8), 28);
        put(c + dx * k + dy * (w + 0.8), c + dy * k - dx * (w + 0.8), 28);
      }
    }
    // Dunkle Spitzenkappe hält den Dorn auch auf hellem Grund lesbar.
    put(c + dx * (len + 0.5), c + dy * (len + 0.5), 28);
  }
  // Kern flächig hell ohne Raster.
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      if (Math.abs(x) + Math.abs(y) <= 1.5) put(c + x, c + y, Math.abs(x) + Math.abs(y) < 0.5 ? 31 : 30);
    }
  }
  return rows.map((r) => r.join(""));
}

/**
 * Dornen-Trail (14x14, 3 Frames, Draw-Scale 1): verwehender Splitter-Floh —
 * Haupt-Splitter + 2 kurze Nebensplitter, die pro Frame schrumpfen. Ersetzt
 * die 9x9-Raute mit Ramp-Off-by-Char (fleshWarm/Lantern-Verfärbung).
 */
export function thornTrailFrame(stage: number): string[] {
  const size = THORN_TRAIL_SIZE;
  const rows: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));
  const c = (size - 1) / 2;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    rows[iy][ix] = charOf(idx);
  };
  const shrink = 1 - stage * 0.3;
  // Haupt-Splitter (leicht geneigt), Taper zur Spitze, Kappe 28.
  const len = 8.5 * shrink;
  for (let k = 0; k <= len; k += 0.5) {
    const rel = k / len;
    const w = Math.max(0.4, 1.3 * (1 - rel) + 0.4);
    for (let s = -w; s <= w; s += 0.7) {
      put(c - 0.8 + s * 0.4, c - len / 2 + k, rel < 0.28 ? 31 : rel < 0.65 ? 30 : 29);
    }
  }
  put(c - 0.8, c - len / 2 - 0.6, 28);
  // Zwei Nebensplitter (kurz, seitlich versetzt) — Unruhe ohne Rauschen.
  for (let k = 0; k <= 3.4 * shrink; k += 0.5) {
    put(c + 3.2 - k * 0.6, c + 2.4 - k * 0.9, k > 2.2 ? 31 : 30);
    put(c - 3.6 + k * 0.7, c + 1.8 + k * 0.8, k > 2.2 ? 31 : 29);
  }
  return rows.map((r) => r.join(""));
}

/**
 * Dornen-Streak (22x22, 3 Frames, Draw-Scale 1 statt fx_thorn @ 3,0x): Dornen-
 * Dart entlang lokal -y (Spitze oben; Rotation im CombatSystem = Flugrichtung),
 * Phase 0 = voller Dart, Phase 1 = kürzer + abgelöste Splitter, Phase 2 = nur
 * noch Splitter (Ausklang). Unregelmäßige Barben statt symmetrischer Rauten.
 */
export function thornStreakFrame(stage: number): string[] {
  const size = THORN_STREAK_SIZE;
  const rows: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));
  const c = (size - 1) / 2;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    rows[iy][ix] = charOf(idx);
  };
  if (stage <= 1) {
    const len = stage === 0 ? 17 : 12;
    const yTip = c - len / 2 - 1;
    for (let k = 0; k <= len; k += 0.5) {
      const rel = k / len;
      const w = Math.max(0.45, 1.6 * (1 - rel) + 0.45);
      for (let s = -w; s <= w; s += 0.7) {
        const idx = rel < 0.28 ? 31 : rel < 0.7 ? 30 : 29;
        put(c + s, yTip + k, idx);
      }
      // Barben einseitig versetzt (organisch, kein Spiegel-Dorn).
      if (rel > 0.3 && rel < 0.45) put(c + w + 1.1, yTip + k, 28);
      if (rel > 0.6 && rel < 0.72) put(c - w - 1.1, yTip + k, 28);
    }
    put(c, yTip - 0.6, 28); // Spitzenkappe
    put(c, yTip + len + 0.6, 28); // Fußkappe
  }
  // Abgelöste Splitter (Phase 1 hinter dem Dart, Phase 2 als Ausklang).
  const frags = stage === 0 ? 0 : stage === 1 ? 3 : 5;
  for (let i = 0; i < frags; i++) {
    const fx = c + ((i * 7) % 5) - 2.5;
    const fy = c + 3 + i * 2.3;
    put(fx, fy, i % 2 === 0 ? 30 : 29);
    put(fx + 1, fy - 1, 31);
  }
  return rows.map((r) => r.join(""));
}

/**
 * Dornenkrone am Salven-Ursprung (96x96, 3 Frames, Draw-Scale 1 statt
 * ring_burst @ 0,45 + fx_shock @ 0,28): Ring-Band mit Wobble (organisch, kein
 * platter Kreis) + 11 unregelmäßig lange Dorn-Zacken nach außen. Phase 0 =
 * Aufbau (kurze Zacken), 1 = Impact (volle Zacken), 2 = Ausklang (Zacken
 * stubben, Band bricht an 3 Stellen — Lücken als Form, nicht als Raster).
 */
export function thornCrownFrame(stage: number): string[] {
  const size = THORN_CROWN_SIZE;
  const rows: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));
  const c = (size - 1) / 2;
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    rows[iy][ix] = charOf(idx);
  };
  const r0 = 24;
  const wobble = (a: number): number => Math.sin(a * 7 + 1.3) * 1.4;
  // Band: außen 28, Mitte 30, innen 29 — Treppe statt Verwaschen.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const a = Math.atan2(dy, dx);
      if (stage === 2 && Math.cos(a * 3 + 0.7) > 0.55) continue; // 3 organische Bruchstellen
      const dd = Math.hypot(dx, dy) - (r0 + wobble(a));
      if (Math.abs(dd) > 1.6) continue;
      const w = (dd + 1.6) / 3.2;
      rows[y][x] = charOf(w > 0.72 ? 28 : w > 0.34 ? 30 : 29);
    }
  }
  // Zacken: unregelmäßige Länge (i*5 % 3), Impact am längsten, Ausklang stubbt.
  const spikes = 11;
  for (let i = 0; i < spikes; i++) {
    if (stage === 2 && i % 3 === 0) continue;
    const a = (i / spikes) * Math.PI * 2 + 0.35;
    let len = 6.5 + ((i * 5) % 3) * 2.2 + (stage === 1 ? 1.6 : 0);
    if (stage === 2) len *= 0.7;
    const rStart = r0 + wobble(a);
    for (let k = 1; k <= len; k += 0.5) {
      const rel = k / len;
      const w = Math.max(0.45, 1.6 * (1 - rel) + 0.45);
      for (let s = -w; s <= w; s += 0.7) {
        const idx = rel >= 0.7 ? 31 : 30;
        put(c + Math.cos(a) * (rStart + k) - Math.sin(a) * s, c + Math.sin(a) * (rStart + k) + Math.cos(a) * s, idx);
      }
    }
    put(c + Math.cos(a) * (rStart + len + 0.6), c + Math.sin(a) * (rStart + len + 0.6), 28);
  }
  return rows.map((r) => r.join(""));
}

/**
 * Dornensturm-Signatur am Ziel (128x128, 4 Frames, Draw-Scale 1 statt 32x32 @
 * 4,0-4,6x mit 188/354 Ink): gebogene Dornen-Splitter (Zweig-Silhouette, Taper,
 * einseitige Barben), die mit der Phase auseinanderfliegen; Kern flächig hell
 * ohne Raster; Phase 3 löst Splitter in Fragmente auf (Ausklang). Knochen-
 * helle Spitzen (11) nur an 2-3 px je Splitter (Near-White-Budget).
 */
export const THORN_SIGNATURE_SIZE = 128;

export function thornSignatureFrame(kind: "hit" | "death", stage: number, size = THORN_SIGNATURE_SIZE): string[] {
  const rows: string[][] = Array.from({ length: size }, () => Array<string>(size).fill("."));
  const c = (size - 1) / 2;
  const t = stage / (SIGNATURE_FRAME_COUNT - 1);
  const death = kind === "death";
  const put = (x: number, y: number, idx: number): void => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= size || iy >= size) return;
    rows[iy][ix] = charOf(idx);
  };
  // Splitter fliegen auseinander; Phase 3 bricht auseinander (Fragmente).
  const burst = death ? 1.35 : 1.0;
  const shards = death ? 7 : 4;
  const ln = (death ? 19 : 13) * (0.7 + 0.3 * t);
  for (let i = 0; i < shards; i++) {
    if (stage === 3 && i % 3 === 1) continue; // Ausklang: jeder dritte Splitter weg
    const a = (i / shards) * Math.PI * 2 + (death ? 0.3 : 0.75) + stage * 0.05;
    const rr = shardRadius(burst, t, i);
    const cx = c + Math.cos(a) * rr;
    const cy = c + Math.sin(a) * rr;
    const bend = (i % 2 === 0 ? 1 : -1) * 0.16; // organische Krümmung statt Gerade
    for (let k = 0; k <= Math.ceil(ln); k++) {
      const rel = Math.min(1, k / ln);
      const w = Math.max(0.45, 2.0 * (1 - rel) ** 0.85 + 0.45);
      const bendOff = Math.sin(rel * Math.PI * 0.8) * bend * ln;
      const hx = cx + Math.cos(a) * k - Math.sin(a) * bendOff;
      const hy = cy + Math.sin(a) * k + Math.cos(a) * bendOff;
      for (let s = -Math.ceil(w); s <= Math.ceil(w); s++) {
        const aS = Math.abs(s);
        if (aS > w) continue;
        // Treppe: knochenhelle Spitze (sparsam, nur jeder dritte Splitter —
        // Near-White-Gate 4,16 %) → marshLight → marsh → mossDark-Basis.
        const idx = rel < 0.15 && aS < w * 0.5 && i % 3 === 0 ? 11 : rel < 0.55 ? 31 : rel < 0.85 ? 30 : 29;
        put(hx - Math.sin(a) * s, hy + Math.cos(a) * s, idx);
      }
      // Einseitige Barbe (keine Spiegel-Symmetrie); außen 1 px mossNight-Saum
      // (art-director Minor: Grün-auf-Gras-Kontrast).
      if (rel > 0.3 && rel < 0.45) {
        put(hx - Math.sin(a) * (w + 1.1), hy + Math.cos(a) * (w + 1.1), 28);
        put(hx - Math.sin(a) * (w + 2.1), hy + Math.cos(a) * (w + 2.1), 28);
      }
    }
    // Dunkle Spitzenkappe.
    const kCap = Math.ceil(ln);
    put(cx + Math.cos(a) * (kCap + 0.6) - Math.sin(a) * bend, cy + Math.sin(a) * (kCap + 0.6) + Math.cos(a) * bend, 28);
  }
  // Zentraler Splitter-Rest: flächiger heller Kern (kein Raster, kein Ink).
  const coreR = death ? 5.5 : 4;
  for (let y = -Math.ceil(coreR); y <= Math.ceil(coreR); y++) {
    for (let x = -Math.ceil(coreR); x <= Math.ceil(coreR); x++) {
      const d = Math.hypot(x, y);
      if (d <= coreR) put(c + x, c + y, d < coreR * 0.55 ? 31 : 30);
    }
  }
  // Abgelöste Fragmente (Ausklang, Phase 2/3) — 2-px-Tupfer statt Einzelpixel.
  const frags = stage >= 2 ? (death ? 6 : 4) : 0;
  for (let i = 0; i < frags; i++) {
    const fa = (i / frags) * Math.PI * 2 + 0.9;
    const fr = 30 + ((i * 13) % 14) + t * 16;
    put(c + Math.cos(fa) * fr, c + Math.sin(fa) * fr * 0.92, i % 2 === 0 ? 30 : 29);
    put(c + Math.cos(fa) * fr + 1, c + Math.sin(fa) * fr * 0.92, 31);
  }
  return rows.map((r) => r.join(""));
}

/** Startradius der Splitter je Phase (Aufbau eng, Impact weit). */
function shardRadius(burst: number, t: number, i: number): number {
  return (20 + ((i * 7) % 5) * 1.8 + t * 10) * burst;
}

function addEvolutionSignatures(scene: Phaser.Scene): void {
  // Zielgroessen-Pfad (Mixel-Regel, m10-evo-fx-phoenix + m10-evo-fx-soulpyre):
  // Signaturen mit drawScale werden in voller Display-Groesse gebacken und mit
  // Draw-Scale 1 gezeichnet — pro Signatur eigener Frame-Generator.
  const BAKED_SIGNATURES: Readonly<Record<string, { size: number; frame: (kind: "hit" | "death", stage: number) => string[] }>> = {
    phoenix: { size: 128, frame: phoenixSignatureFrame },
    soul_beacon: { size: SOUL_SIGNATURE_SIZE, frame: soulSignatureFrame },
    eternal_winter: { size: 128, frame: winterSignatureFrame },
    wrath_pendulum: { size: WRATH_SIGNATURE_SIZE, frame: wrathSignatureFrame },
    // m10-evo-fx-dornensturm: thorn_storm registriert. thunder_seal bleibt beim
    // 64er-Pfad (main nach Revert 34e97d3) — das 128er-Upgrade war Chaos-Lane (K2)
    // und wird mit Karte #8876 neu verhandelt, hier nicht schmuggeln.
    thorn_storm: { size: THORN_SIGNATURE_SIZE, frame: thornSignatureFrame },
  };
  for (const id of EVOLUTION_SIGNATURE_IDS) {
    const sig = EVOLUTION_SIGNATURES[id];
    for (const kind of ["hit", "death"] as const) {
      const baked = sig.drawScale ? BAKED_SIGNATURES[id] : undefined;
      const def: FxDef = baked
        ? {
            w: baked.size,
            h: baked.size,
            frames: Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => baked.frame(kind, i)),
          }
        : {
            w: 32,
            h: 32,
            frames: Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => signatureFrame(sig.shape, sig.palette, i, kind)),
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
  // M10-evo-fx-gewittersiegel: Boden-Siegel in Zielgroesse (Draw-Scale 1, 4 Phasen).
  addFrames(scene, "fx_seal_thunder", { w: 64, h: 64, frames: [0, 1, 2, 3].map((i) => thunderSealFrame(i)) });
  addFrames(scene, "fx_thorn", { w: THORN_TRAIL_SIZE, h: THORN_TRAIL_SIZE, frames: [0, 1, 2].map((i) => thornTrailFrame(i)) });
  addFrames(scene, "fx_orb", { w: 11, h: 11, frames: [0, 1, 2, 3].map(orbFrame) });
  addFrames(scene, "fx_pillar", { w: 26, h: 72, frames: [0, 1, 2, 3, 4].map((i) => pillarFrame(i)) });
  addFrames(scene, "fx_shock", { w: 48, h: 48, frames: [0, 1, 2, 3, 4, 5].map((i) => shockFrame(i)) });
  // M10-evo-fx-winter: Frost-Aura-Siegel Level 1 (Mixel-Basis, siehe frostRingFrame);
  // Bake-Stufen >= 2 kommen aus mixelBakes() unten. Ersetzt die Canvas-Textur
  // aus textures.ts (gleiche Geometrie, jetzt als Row-Generator testbar).
  addFrames(scene, "ring_frost", { w: 96, h: 96, frames: [frostRingFrame(96, 1)] });
  // Todes-/Boss-Frames: eine Quelle fuer Texturen, Tests und Beleg-Skripte.
  for (const [key, def] of Object.entries(deathFrameSets())) addFrames(scene, key, def);
  // Dunkler Rauchring für Zerfall
  addFrames(scene, "fx_dusk", { w: 20, h: 20, frames: [0, 1, 2].map((i) => ring(20, 20, [5, 4, 3], 0.55 - i * 0.1, i)) });
  // Staub/Asche für Tod-Klassen (klein, normal blend)
  addFrames(scene, "fx_ash", { w: 5, h: 5, frames: [0, 1].map(() => [".ccc.", "c555c", "c505c", "c555c", ".ccc."]) });
  // Seelenflamme fuer das Seelenleuchtfeuer (3 Flacker-Frames, 22x32, Draw-Scale 1).
  addFrames(scene, "orb_soul", { w: 22, h: 32, frames: [0, 1, 2].map(orbSoulFrame) });
  // Kalter Halo fuer Seelen (blau-grau statt warmem Amber-Ring).
  addFrames(scene, "fx_halo_cold", { w: 24, h: 24, frames: [0, 1].map((i) => coldHaloFrame(i)) });
  // Mixel-Fix: Bake-Stufen der vier weichen Glow-Effekte (Level 1 = obige Keys,
  // unverändert). Jede Stufe rendert dieselbe Geometrie in L-facher Pixelgröße,
  // damit das FxSystem mit Draw-Scale <= 1 zeichnen kann (siehe FxSystem.spawn).
  for (const bake of mixelBakes()) {
    addFrames(scene, mixelTextureKey(bake.base, bake.level), {
      w: bake.w, h: bake.h, frames: bake.frames,
    });
  }
  // M10-evo-fx-phoenix: Phönixschwarm in Zielgrößen (alle Draw-Scale 1).
  addFrames(scene, "projectile_phoenix", { w: 15, h: 11, frames: [0, 1, 2].map((i) => phoenixBirdFrame(i)) });
  addFrames(scene, "fx_phoenix_launch", { w: 14, h: 14, frames: [0, 1, 2].map((i) => phoenixLaunchFrame(i)) });
  addFrames(scene, "fx_boom_phoenix", { w: 64, h: 64, frames: [0, 1, 2, 3].map((i) => phoenixBoomFrame(i)) });
  addFrames(scene, "fx_burn_phoenix", { w: 64, h: 64, frames: [0, 1, 2].map((i) => phoenixBurnFrame(i)) });
  // M10-evo-fx-zornpendel: Pendel-Ring/Glow in Zielgrößen (alle Draw-Scale 1).
  addFrames(scene, "fx_wrath_ring", { w: WRATH_RING_SIZE, h: WRATH_RING_SIZE, frames: [0, 1, 2].map((i) => pendulumRingFrame(i)) });
  addFrames(scene, "fx_wrath_glow", { w: 17, h: 17, frames: [wrathGlowFrame()] });
  // M10-evo-fx-dornensturm: Dornen-Salve in Zielgrößen (alle Draw-Scale 1);
  // projectile_thorn ist aus SPRITE_GRIDS hierher gezogen (12x12 statt 7x7 @ 1,7x).
  addFrames(scene, "projectile_thorn", { w: THORN_PROJECTILE_SIZE, h: THORN_PROJECTILE_SIZE, frames: [thornProjectileFrame()] });
  addFrames(scene, "fx_thorn_streak", { w: THORN_STREAK_SIZE, h: THORN_STREAK_SIZE, frames: [0, 1, 2].map((i) => thornStreakFrame(i)) });
  addFrames(scene, "fx_thorn_crown", { w: THORN_CROWN_SIZE, h: THORN_CROWN_SIZE, frames: [0, 1, 2].map((i) => thornCrownFrame(i)) });
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
  fx_death_bone: 4, fx_death_blob: 4, fx_death_void: 4, fx_death_dust: 4, fx_death_fire: 4,
  fx_boss_core: 6, fx_dusk: 3, fx_ash: 2, fx_halo_cold: 2, ring_frost: 1,
  fx_phoenix_launch: 3, fx_boom_phoenix: 4, fx_burn_phoenix: 3,
  fx_wrath_ring: 3, fx_wrath_glow: 1, fx_seal_thunder: 4,
  fx_thorn_streak: 3, fx_thorn_crown: 3,
  ...Object.fromEntries(EVOLUTION_SIGNATURE_IDS.flatMap((id) => [
    [signatureTextureKey(id, "hit"), SIGNATURE_FRAME_COUNT],
    [signatureTextureKey(id, "death"), SIGNATURE_FRAME_COUNT],
  ])),
};

/**
 * M10-Lesbarkeit (Karten #5219/#5220, Blocker "Boss-FX-Kontrast"): Boss-spezifische
 * Effekt-Basen. Nur Keys, die ausschliesslich von Boss-Pfaden gespawnt werden
 * (fx_boss_core: Boss-Auftritt/-Tod); geteilte Keys (fx_shock, fx_halo) bleiben
 * normale FX. Das FxSystem nutzt den Schluessel fuer Mindest-Alpha-Boden und
 * LOD-Ausnahmen — ohne Anfassung von Run.ts/BossSystem.
 */
export const BOSS_FX_BASES: readonly string[] = ["fx_boss_core"];

const bossFxKeySet = new Set<string>(BOSS_FX_BASES);

/** true, wenn Basis- oder Frame-Key ein Boss-spezifischer Effekt ist. */
export function isBossFxKey(key: string | undefined | null): boolean {
  if (!key) return false;
  if (bossFxKeySet.has(key)) return true;
  for (const base of bossFxKeySet) {
    if (key.startsWith(`${base}_`)) return true;
  }
  return false;
}

// ── M10-Overdraw-Deckel fuer additive FX ────────────────────────────────────
// Attribution (shots/m10-fx-overdraw-attribution.json): FX sind bei M25-780@3
// ~2,4 ms/frame; der dominante Rest ist Fill-Rate. Additive Glow-Sprites
// stacken pro Pixel auf 255 und sind bei dpr 3 (2340x1080 = 2,5 Mio px) der
// teuerste FX-Anteil. Der Deckel begrenzt GLOWS (gleichzeitig aktive additive
// Sprites), nicht Partikel; alles andere bleibt unveraendert.

export type FxLodLevel = "full" | "reduced" | "minimal";

/** Alpha-Faktor fuer additive FX je Geraetepixel-Verhaeltnis (dpr).
 *  dpr > 2 (z. B. 780x360@3): 0,6 — bei 2,5 Mio Device-Pixeln kostet jedes
 *  additive Sprite die volle Flaeche; 0,8 fuer dpr > 1,5, sonst 1. */
export function fxAlphaForDpr(dpr: number): number {
  if (!Number.isFinite(dpr)) return dpr === Number.POSITIVE_INFINITY ? 0.6 : 1;
  const d = dpr > 0 ? dpr : 1;
  if (d > 2) return 0.6;
  if (d > 1.5) return 0.8;
  return 1;
}

/** Max. gleichzeitig aktive additive Glow-Sprites je LOD-Stufe (lod.ts). */
export function glowCapFor(level: FxLodLevel): number {
  return level === "minimal" ? 24 : level === "reduced" ? 40 : 72;
}

/** Zaehlt aktive additive Glows und vergibt Slots unter einem harten Deckel.
 *  request() = true heisst ADD-Blend erlaubt; false faellt auf NORMAL zurueck
 *  (Form/Farbe bleiben, nur der Stack-Anteil entfaellt). Keine Tweens. */
export class GlowBudget {
  cap: number;
  private used = 0;

  constructor(cap: number) {
    this.cap = Math.max(0, Math.floor(cap));
  }

  setCap(cap: number): void {
    this.cap = Math.max(0, Math.floor(cap));
  }

  /** Slot anfordern. Invariante: current() ueberschreitet nie cap(). */
  request(): boolean {
    if (this.used >= this.cap) return false;
    this.used++;
    return true;
  }

  release(): void {
    if (this.used > 0) this.used--;
  }

  reset(): void {
    this.used = 0;
  }

  get current(): number {
    return this.used;
  }
}
