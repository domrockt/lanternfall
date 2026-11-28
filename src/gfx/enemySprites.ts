import Phaser from "phaser";
import { C, PAL } from "../palette";
import { ENEMIES, ENEMY_LIST } from "../data/enemies";
import type { Archetype, EnemyDef, EnemyId } from "../data/types";
import { BOSSES } from "../data/bosses";
import { GEN_BOSSES } from "./gen-bosses";
import { GEN_ENEMIES, GEN_ENEMY_FAMILIES } from "./gen-enemies";

/** 18x18-Raster; Frame 0 ist die Ruhepose, Frame 1 die Lauf-/Bob-Pose. */
export const ENEMY_SPRITE_SIZE = 24;
export const BOSS_SPRITE_SIZE = 40;

export type Pixel = number | null;
export type Grid = Pixel[][];

/** Wandelt eine generierte Zeilen-Maske in ein Pixel-Grid (Palette/Transparenz). */
export function gridFromRows(rows: readonly string[]): Grid {
  const g = emptyGrid(rows.length);
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      g[y][x] = ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 97 + 10;
    }
  }
  return g;
}

/**
 * Schärft eine generierte Gegner-Maske, ohne Rastergröße oder Frame-Zahl zu ändern:
 * - Randpixel der Silhouette werden auf Palettenindex 0 (ink) normalisiert
 *   → exakt 1 px dunkle Kontur außen (ART.md Regel 1).
 * - In jeder Spalte wird direkt unter der oberen Kontur genau 1 px auf den
 *   Lichtton der Gegnerfarbe gesetzt → 1 px Lichtkante oben (ART.md Regel 2).
 * Beides ist deterministisch (keine Zufallswerte, kein Dithering) und hält
 * binäres Alpha: nur gefüllte Pixel bekommen eine Palettenfarbe.
 */
/** Per-Archetyp-Tonkorrekturen (art-director-Runde 27.11.). Nur Palettenindizes. */
interface ContrastTones {
  /** Lichtkante über den gesamten oberen Bogen. */
  top: number;
  /** Aufhellung dunkler Mitteltöne (Rim-Kontrast gegen dunklen Moorboden). */
  mid: number;
  /** Schwelle, unter der ein Mitteltone-Pixel aufgehellt wird. */
  midLimit: number;
}

const CONTRAST_TONES: Record<string, ContrastTones> = {
  treant: { top: 12, mid: 17, midLimit: 62 },
  golem: { top: 12, mid: 8, midLimit: 62 },
  bog_rat: { top: 12, mid: 8, midLimit: 62 },
  // art-director-Runde 2: dunkle Flieger/Geister mit zu wenig Rim-Kontrast
  // bekommen ebenfalls eine helle Oberkante und aufgehellte Mitteltöne.
  bat: { top: 12, mid: 8, midLimit: 70 },
  reaper_bat: { top: 12, mid: 8, midLimit: 70 },
  lich: { top: 12, mid: 9, midLimit: 70 },
  imp: { top: 12, mid: 17, midLimit: 70 },
  wisp: { top: 12, mid: 13, midLimit: 70 },
  crow: { top: 12, mid: 8, midLimit: 70 },
  voidcaller: { top: 13, mid: 12, midLimit: 75 },
};

export function sharpenEnemyGrid(src: Grid, color: number, id = ""): Grid {
  const g = src.map((row) => row.slice());
  const h = g.length;
  const w = g[0]?.length ?? 0;
  const filled = (x: number, y: number): boolean =>
    x >= 0 && x < w && y >= 0 && y < h && g[y][x] !== null;
  // Ohne Spezialfall bleibt die Lichtkante farbabhängig; sehr dunkle
  // Mitteltöne (< 52) werden zusätzlich auf PAL 8 (mist) angehoben, damit
  // die Silhouette auf dunklem Moor nicht in der Fläche verschwindet.
  const tones = CONTRAST_TONES[id] ?? { top: lightEdgeIndex(color), mid: 8, midLimit: 52 };
  const light = tones.top;

  // 1) 1-px-Kontur: dunkle Randpixel werden Tinte (0); helle Highlights an
  //    Spitzen bleiben erhalten, damit die Lichtkante nicht überschrieben wird.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = g[y][x];
      if (c === null || c === 0) continue;
      const boundary = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      if (boundary && luminance(c) < 70) g[y][x] = 0;
    }
  }

  // 2) 1-px-Lichtkante über den gesamten oberen Bogen: das oberste Pixel jeder
  //    Spalte (obere Kontur) wird zum Lichttone; damit ist die Silhouette auf
  //    dunklem Moor auch dort lesbar, wo sie sich mit anderen überlappt.
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && !filled(x, y)) y++;
    if (y >= h) continue;
    const topColor = g[y][x];
    if (topColor === 13) continue; // Augen/Glow nicht überschreiben
    g[y][x] = light;
  }
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w && !filled(x, y)) x++;
    if (x >= w) continue;
    if (g[y][x] === 13) continue;
    g[y][x] = light;
  }

  // 3) Dunkle Mitteltöne aufhellen, nur bei den vom art-director benannten
  //    Problemfällen. Die Kontur (PAL 0) und Augen/Glow bleiben unangetastet.
  if (tones) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = g[y][x];
        if (c === null || c === 0 || c === 13) continue;
        const boundary = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
        if (boundary) continue;
        if (luminance(c) < tones.midLimit) g[y][x] = tones.mid;
      }
    }
  }
  return g;
}


/** Generierte Frames eines Gegners (Index = Position in ENEMY_LIST), geschärft. */
export function enemySpriteFrames(index: number): Grid[] {
  const def = ENEMY_LIST[index];
  const gen = GEN_ENEMIES[def.spriteKey];
  return gen.frames.map((rows) => sharpenEnemyGrid(gridFromRows(rows), def.color, def.id));
}

/* ── M10-crowd-variety: zweite Ton-/Detail-Variante je Gegnertyp ──
 *
 * Befund (Dom 21:45Z): die Gegnermasse in Minute 30 wirkt wie geklont — alle
 * Instanzen eines Typs tragen denselben Ton. Hier entsteht eine zweite
 * Variante pro Typ:
 * - gleiche Silhouette (dieselben generierten Masken, nur umgefärbt),
 * - gleiche Palette: die Variantenfarbe ist die Rampe-Stufe der
 *   Daten-Familie (GEN_ENEMY_FAMILIES) mit dem grössten Luminanz-Abstand
 *   zur Basisfarbe — "Tonstufe im selben Palette-Raster",
 * - binäres Alpha bleibt erhalten (nur gefüllte Pixel bekommen Paletten-
 *   indizes, schärfen/Elite-Rim-Mechanik unangetastet).
 * Die Instanz-Auswahl läuft ohne Run.ts-/EnemyPool-Änderung über die
 * bestehenden Keys: framesForDef liefert 4 Frames, die Lauf-Phase streut
 * die Instanzen über [Basis, Basis, Variante, Variante] (Index 2/3 tragen
 * den Variantenton, siehe enemyFrameGrids).
 */

/** Variantenfarbe eines Typs: deutlichste Rampe-Stufe zur Basisfarbe. */
export function enemyVariantColor(index: number): number {
  const def = ENEMY_LIST[index];
  const ramp = GEN_ENEMY_FAMILIES[def.spriteKey]?.ramp;
  if (ramp) {
    let best = -1;
    let bestDist = 0;
    for (const c of ramp) {
      const d = Math.abs(luminance(c) - luminance(def.color));
      if (d > bestDist) { bestDist = d; best = c; }
    }
    if (best >= 0 && bestDist > 0) return best;
  }
  // Fallback (Rampe fehlt/identisch): nächsthellere Palette-Stufe.
  return shadeIndex(def.color, 1.25);
}

/** Die 4 Frames der Variante (gleiche Posen wie enemySpriteFrames, anderer Ton).
 *
 * Nicht über sharpenEnemyGrid(color) — der Farb-Parameter greift nur bei Typen
 * ohne CONTRAST_TONES-Eintrag. Stattdessen werden nach dem Schärfen alle
 * Körperpixel deterministisch Richtung Variantenton gemischt (55 % Varianten-
 * farbe) und auf den nächsten Palette-Index gerundet. Unangetastet bleiben:
 * Kontur (0), Augen/Glow (13) und die 1-px-Lichtkante (tones.top) — daraus
 * folgt: gleiche Silhouette, binäres Alpha, nur Palettenfarben.
 */
export function enemyVariantFrames(index: number): Grid[] {
  const def = ENEMY_LIST[index];
  const target = PAL[enemyVariantColor(index)];
  const top = CONTRAST_TONES[def.id]?.top ?? lightEdgeIndex(def.color);
  return enemySpriteFrames(index).map((g) => {
    const out = g.map((row) => row.slice());
    for (let y = 0; y < out.length; y++) {
      for (let x = 0; x < out[0].length; x++) {
        const c = out[y][x];
        if (c === null || c === 0 || c === 13 || c === top) continue;
        const p = PAL[c];
        const mix = [
          Math.round(((p >> 16) & 255) * 0.45 + ((target >> 16) & 255) * 0.55),
          Math.round(((p >> 8) & 255) * 0.45 + ((target >> 8) & 255) * 0.55),
          Math.round((p & 255) * 0.45 + (target & 255) * 0.55),
        ];
        out[y][x] = nearestPaletteIndex(mix);
      }
    }
    return out;
  });
}

/** Nächster Palette-Index zu einem RGB-Tripel (nur Palette, deterministisch). */
function nearestPaletteIndex([r, g, b]: readonly number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < PAL.length; i++) {
    const p = PAL[i];
    const dr = ((p >> 16) & 255) - r;
    const dg = ((p >> 8) & 255) - g;
    const db = (p & 255) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Frame-Grids in Key-Reihenfolge (enemyFrameKeys): Frames 0/1 Basis-Ton,
 * Frames 2/3 Varianten-Ton. Reine Funktion — createEnemyTextures registriert
 * genau diese Grids, tests/crowd-variety.test.ts prüft sie ohne Phaser.
 */
export function enemyFrameGrids(index: number): Grid[] {
  const base = enemySpriteFrames(index);
  const variant = enemyVariantFrames(index);
  // Guard: GEN_ENEMIES liefert heute 4 Frames je Typ. Ohne Guard würde ein
  // künftiger 2-Frame-Eintrag hier undefined in gridToCanvas schieben.
  if (base.length < 4 || variant.length < 4) return base;
  return [base[0], base[1], variant[2], variant[3]];
}

/* ── Elite-Rim-Light (A10-Restpunkt "Chaos-Rim-Light fuer Elites") ──
 *
 * Elites tragen eine 1-px-Kante in der Elite-Akzentfarbe (Amber, PAL 20),
 * die in den Sprite selbst gebrannt ist — nicht wie die Aura dahinter
 * skaliert wurde. Dadurch ist die Kante exakt 1 px breit, folgt der
 * Silhouette (auch bei Ueberlappungen im 500er-Schwarm) und bleibt
 * richtungs- und frameunabhaengig: Vollumrandung → keine Laufrichtungs-
 * oder Frame-Duplikate noetig. Binaeres Alpha: nur gefuellte Pixel
 * bekommen die Akzentfarbe, es wird nichts expandiert oder gedithert.
 */

/* ── M10-elite-tier-families: Faerbe-Klassen je Tier (K2) ──
 *
 * Befund (Vorher-Messung, shots/m10-elite-tier-before.json): unter Elites
 * der Tiers 2-4 dominiert "mittel-neutral" (Grau) — die Tier-Familie eines
 * Elites ist im 300-500er-Chaos nicht ablesbar (Karte #6322: wolf, banshee,
 * knight, lich, wraith, gargoyle bleiben blaugrau/weiss dominiert).
 *
 * Fix: der Koerper (Innenraum) des Elite-Rim-Frames wird deterministisch
 * Richtung einer Tier-Faerbe-Klasse gemischt (70 % Klasse — staerker als die
 * crowd-variety-Variante, weil helle Koerper die Klasse sonst ueberstrahlen;
 * nach der after-Messung mit dominanter Klasse je Tier festgelegt) — je
 * Tier 0-4 genau eine Klasse:
 *   T0 glut-braun (emberBrown) · T1 dunst (mist) · T2 flamme (flame)
 *   T3 blut-rot (crimson)      · T4 gruen (marsh)
 * Unangetastet bleiben:
 * - der Amber-Rand (PAL 20, 100 % der Randpixel — A10-Elite-Signal und
 *   Rim-Kontrast ungebrochen),
 * - Kontur (0) und Augen/Glow (13),
 * - Silhouette, Key-Satz ("<spriteKey>_rim"), Framezahl (1) und alle
 *   Nicht-Elite-Frames (crowd-variety-Stand bytegleich).
 * Die Warm-Ton-Klassen T2/T3 heben die betroffenen Elite-Typen (wolf,
 * banshee, knight, lich, wraith) aus dem Blaugrau, T4 (gargoyle,
 * voidcaller) ins Gruen — genau die art-director-Luecke aus #6322.
 */

/**
 * Tier-Faerbe-Klasse je Tier 0-4 (nur Palettenindizes).
 *
 * m10-elite-tier-refine (#7523, art-director-Nachbesserung 1): T4 auf
 * marshLight (31) statt marsh (30) — 30 ist haeufige Grasrampe im Terrain
 * (tiles.ts), T4-Elites waren auf hellem Moorgras nur ueber Kontur+Rim
 * lesbar. 31 liegt als Flaechenfarbe ausserhalb der haeufigen Grasrampe
 * (28/29/30). Min. Paar-Distanz 55,6 (T1 mist 8 vs T4 marshLight 31);
 * Zentroid-Metrik bleibt >= 30 (gemessen 43,8).
 */
export const ELITE_TIER_DYES: readonly [number, number, number, number, number] = [16, 8, 18, 25, 31];

/** Faerbe-Klasse eines Tiers (clamp auf 0-4, deterministisch). */
export function eliteTierDye(tier: number): number {
  return ELITE_TIER_DYES[Math.min(4, Math.max(0, Math.round(tier)))];
}

/**
 * Ein Elite-Koerperpixel in der Tier-Faerbe-Klasse: 70 % Klassenfarbe,
 * 30 % Basispixel, gerundet auf den naechsten Palettenindex (deterministisch,
 * nur Palette). Kontur (0) und Augen/Glow (13) bleiben unangetastet.
 */
const ELITE_TIER_MIX = 0.7;

export function eliteTierPixel(pixel: Pixel, tier: number): Pixel {
  if (pixel === null || pixel === 0 || pixel === 13) return pixel;
  const target = PAL[eliteTierDye(tier)];
  const p = PAL[pixel];
  const body = 1 - ELITE_TIER_MIX;
  return nearestPaletteIndex([
    Math.round(((p >> 16) & 255) * body + ((target >> 16) & 255) * ELITE_TIER_MIX),
    Math.round(((p >> 8) & 255) * body + ((target >> 8) & 255) * ELITE_TIER_MIX),
    Math.round((p & 255) * body + (target & 255) * ELITE_TIER_MIX),
  ]);
}

/** Palettenindex der Elite-Akzentfarbe (identisch zur Elite-Aura, C.amber). */
export const ELITE_RIM_COLOR = C.amber;

/** 1-px-Kante: alle Randpixel der Maske werden zur Akzentfarbe. */
export function eliteRimGrid(src: Grid): Grid {
  const g = src.map((row) => row.slice());
  const h = g.length;
  const w = g[0]?.length ?? 0;
  const filled = (x: number, y: number): boolean =>
    x >= 0 && x < w && y >= 0 && y < h && g[y][x] !== null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x] === null) continue;
      const boundary = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1);
      if (boundary) g[y][x] = ELITE_RIM_COLOR;
    }
  }
  return g;
}

/**
 * Der eine Elite-Rim-Frame je Typ: Rim-Variante der Ruhepose (Frame 0),
 * Koerper in der Tier-Faerbe-Klasse (eliteTierPixel, siehe oben), Randpixel
 * voll in der Elite-Akzentfarbe (Amber). Als einziges zusaetzliches Frame im
 * Bestand vorgehalten; die Vollumrandung macht ihn fuer alle 4 Laufrichtungen
 * und Frames gueltig (keine Duplikate).
 */
export function eliteRimFrame(index: number): Grid {
  const tier = ENEMY_LIST[index].tier;
  const body = enemySpriteFrames(index)[0].map((row) => row.map((p) => eliteTierPixel(p, tier)));
  return eliteRimGrid(body);
}

/** Textur-Key des Elite-Rim-Frames ("<spriteKey>_rim"). */
export function eliteRimFrameKey(index: number): string {
  return `${ENEMY_LIST[index].spriteKey}_rim`;
}

/** Lauf-ID des Elite-Rim-Framesets ("<id>_rim") fuer framesForDef/SPRITE_FRAMES. */
export type EliteFrameId = `${EnemyId}_rim`;

const ELITE_RIM_SUFFIX = "_rim";

export function eliteFrameId(id: EnemyId): EliteFrameId {
  return `${id}${ELITE_RIM_SUFFIX}`;
}

/**
 * Elite-Lauf-Def: gleiche Werte, aber die ID zeigt auf das Rim-Frameset.
 * Run.ts animiert ueber framesForDef(e.def) → SPRITE_FRAMES[def.id]; mit der
 * Rim-ID zeigt der zyklische Frame-Abruf fuer Elites stabil auf den einen
 * Rim-Frame, ohne dass Run.ts ihn pro Frame ueberschreibt.
 */
export function eliteRimDef(def: EnemyDef): EnemyDef {
  return { ...def, id: eliteFrameId(def.id) as unknown as EnemyId };
}

/** Basis-Def zu einer Rim-Def (fuer Nicht-Elite-Spawns, z. B. Splitter-Kinder). */
export function baseEnemyDef(def: EnemyDef): EnemyDef | undefined {
  const id = def.id as string;
  if (!id.endsWith(ELITE_RIM_SUFFIX)) return undefined;
  const baseId = id.slice(0, id.length - ELITE_RIM_SUFFIX.length) as EnemyId;
  return ENEMIES[baseId] ?? undefined;
}

/** Rim-Frame-Keys je Elite-Lauf-ID ("<id>_rim" → ["enemy_<id>_rim"]). */
export const ELITE_RIM_FRAMES: Record<EliteFrameId, string[]> = Object.fromEntries(
  ENEMY_LIST.map((def, index) => [eliteFrameId(def.id), [eliteRimFrameKey(index)]]),
) as Record<EliteFrameId, string[]>;

/** Textur-Keys aller generierten Frames (Basis + _2.._4). */
export function enemyFrameKeys(index: number): string[] {
  const def = ENEMY_LIST[index];
  const count = GEN_ENEMIES[def.spriteKey].frames.length;
  return Array.from({ length: count }, (_, i) => (i === 0 ? def.spriteKey : `${def.spriteKey}_${i + 1}`));
}

function emptyGrid(size: number): Grid {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null));
}

function put(g: Grid, x: number, y: number, c: number): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (iy < 0 || iy >= g.length || ix < 0 || ix >= g[0].length) return;
  g[iy][ix] = c;
}

function ellipse(g: Grid, cx: number, cy: number, rx: number, ry: number, c: number): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1.02) put(g, cx + x, cy + y, c);
    }
  }
}

function rect(g: Grid, x: number, y: number, w: number, h: number, c: number): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(g, xx, yy, c);
}

function luminance(i: number): number {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
}

/** Heller Lichtkanten-Ton zur Gegnerfarbe (nur Palette, Luminanz >= 85). */
function lightEdgeIndex(base: number): number {
  const c = PAL[base];
  const target = [
    Math.min(255, Math.round(((c >> 16) & 255) * 1.35)),
    Math.min(255, Math.round(((c >> 8) & 255) * 1.35)),
    Math.min(255, Math.round((c & 255) * 1.35)),
  ];
  let best = base;
  let bestDist = Infinity;
  for (let i = 1; i < PAL.length; i++) {
    if (luminance(i) < 85) continue;
    const p = PAL[i];
    const dr = ((p >> 16) & 255) - target[0];
    const dg = ((p >> 8) & 255) - target[1];
    const db = (p & 255) - target[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Nächster Palettenindex zu einer skalierte Grundfarbe (nur Palette!). */
function shadeIndex(base: number, factor: number): number {
  const c = PAL[base];
  const target = [
    Math.min(255, Math.round(((c >> 16) & 255) * factor)),
    Math.min(255, Math.round(((c >> 8) & 255) * factor)),
    Math.min(255, Math.round((c & 255) * factor)),
  ];
  let best = base;
  let bestDist = Infinity;
  for (let i = 1; i < PAL.length; i++) {
    if (i === base) continue;
    const p = PAL[i];
    const dr = ((p >> 16) & 255) - target[0];
    const dg = ((p >> 8) & 255) - target[1];
    const db = (p & 255) - target[2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/**
 * Zeichnet die Platzhalter-Silhouette eines Gegners als Pixelraster.
 * Körperbreite/-höhe sind pro Gegnerindex eindeutig (5..9 × 5..10), dazu
 * Archetyp-Merkmale (Flügel, Beine, Kapuze, Zündschnur, Augen).
 */
export function buildEnemySprite(
  index: number,
  archetype: Archetype,
  color: number,
  flying: boolean,
  frame = 0,
): Grid {
  const g = emptyGrid(ENEMY_SPRITE_SIZE);
  const cx = 12;
  const bottom = 22;
  const dark = shadeIndex(color, 0.5);
  const light = shadeIndex(color, 1.35);
  const eye = 13;
  const bob = frame === 1 ? 1 : 0;

  /** Kontur (schwarz) + Füllung, damit jede Silhouette klar lesbar ist. */
  const shellEllipse = (ex: number, ey: number, rx: number, ry: number, fill: number): void => {
    ellipse(g, ex, ey, rx + 1, ry + 1, 0);
    ellipse(g, ex, ey, rx, ry, fill);
  };
  const shellRect = (x: number, y: number, w: number, h: number, fill: number): void => {
    rect(g, x - 1, y - 1, w + 2, h + 2, 0);
    rect(g, x, y, w, h, fill);
  };

  const eyes = (ex: number, ey: number, count: number, gap = 2, ry = 1): void => {
    const start = ex - Math.floor(((count - 1) * gap) / 2);
    for (let e = 0; e < count; e++) put(g, start + e * gap, ey, eye);
    if (ry > 1) for (let e = 0; e < count; e++) put(g, start + e * gap, ey + 1, 0);
  };

  if (archetype === "swarm" || archetype === "charger") {
    // Vierbeiner: breiter Rumpf, Kopf mit Ohren/Hörnern, Schwanz, vier Beine.
    const rx = archetype === "charger" ? 8 : 6 + (index % 2);
    const ry = archetype === "charger" ? 5 : 4;
    const cy = bottom - 6 - bob;
    shellEllipse(cx, cy, rx, ry, color);
    // Kopf vorn (rechts).
    const hx = cx + rx - 2;
    const hy = cy - ry + 1;
    shellEllipse(hx, hy, 3, 3, color);
    eyes(hx, hy, archetype === "charger" ? 2 : 1 + (index % 3), 2);
    // Schnauze.
    put(g, hx + 3, hy + 1, dark);
    put(g, hx + 3, hy + 2, dark);
    // Ohren/Hörner je Variante.
    if (archetype === "charger") {
      put(g, hx - 2, hy - 4, light);
      put(g, hx - 1, hy - 3, dark);
      put(g, hx + 2, hy - 4, light);
      put(g, hx + 1, hy - 3, dark);
      // Rückenstacheln.
      for (let i = 0; i < 3; i++) put(g, cx - 2 + i * 3, cy - ry - 2, i === 1 ? light : dark);
    } else {
      put(g, hx - 2, hy - 3, dark);
      put(g, hx + 2, hy - 3, dark);
      put(g, hx - 2 + (index % 2), hy - 4, light);
    }
    // Schwanz links, Variante nach Index.
    const tailLen = 3 + (index % 3);
    for (let i = 0; i < tailLen; i++) {
      put(g, cx - rx - 1 - i, cy - (i % 2) + (index % 2), i === tailLen - 1 ? light : dark);
    }
    // Beine (Frame alterniert).
    for (let p = 0; p < 4; p++) {
      const lx = cx - rx + 2 + p * Math.max(2, Math.floor((rx * 2 - 5) / 3));
      const off = (frame + p) % 2;
      rect(g, lx + off, bottom - 2, 1, 3, dark);
    }
  } else if (archetype === "tank") {
    // Massiger Panzer mit Schultern und Turmhelm.
    const cy = bottom - 7 - bob;
    shellEllipse(cx, cy, 8, 6, color);
    shellRect(cx - 8, cy - 5, 3, 4, dark);
    shellRect(cx + 6, cy - 5, 3, 4, dark);
    eyes(cx, cy - 4, 2, 3);
    // Kopf klein, Helm.
    shellEllipse(cx, cy - 6, 3, 2, color);
    rect(g, cx - 3, cy - 9, 7, 2, dark);
    rect(g, cx - 1, cy - 11, 3, 2, light);
    // Rippen/Panzerbänder.
    for (let i = 0; i < 3; i++) rect(g, cx - 5, cy + 1 + i * 2, 11, 1, dark);
    // Beine.
    rect(g, cx - 5, bottom - 3, 3, 3, dark);
    rect(g, cx + 2, bottom - 3, 3, 3, dark);
  } else if (archetype === "ranged") {
    // Kapuzenmagier mit Stab und Orb.
    const cy = bottom - 8 - bob;
    shellEllipse(cx, cy + 1, 5, 5, color);
    // Kapuze.
    rect(g, cx - 4, cy - 5, 9, 2, dark);
    rect(g, cx - 3, cy - 7, 7, 2, dark);
    put(g, cx, cy - 8, dark);
    eyes(cx - 1, cy - 4, 1 + (index % 2), 2);
    // Robe.
    rect(g, cx - 5, cy + 4, 11, 3, dark);
    rect(g, cx - 4, cy + 7, 9, 2, color);
    // Stab rechts mit leuchtendem Orb.
    rect(g, cx + 6, cy - 4, 1, 11, dark);
    put(g, cx + 6, cy - 5, light);
    put(g, cx + 5, cy - 5, light);
    put(g, cx + 7, cy - 5, light);
    // Arme.
    rect(g, cx - 7, cy, 2, 2, dark);
    rect(g, cx + 4, cy, 2, 2, dark);
  } else if (archetype === "splitter" || archetype === "exploder") {
    // Blob mit vielen Augen; Exploder mit Zündschnur, Splitter mit Spalt.
    const cy = bottom - 6 - bob;
    const r = archetype === "exploder" ? 6 : 5 + (index % 2);
    shellEllipse(cx, cy, r, r, color);
    // Tropfen unten.
    for (let i = -2; i <= 2; i++) put(g, cx + i, cy + r + 1, dark);
    eyes(cx - 2, cy - 2, 2 + (index % 3), 2);
    if (archetype === "exploder") {
      rect(g, cx, cy - r - 2, 1, 3, light);
      put(g, cx + (frame === 1 ? 1 : 0), cy - r - 4, 18);
      put(g, cx + (frame === 1 ? 1 : 0), cy - r - 5, 19);
      // Bomben-Rippen.
      rect(g, cx - 4, cy - r + 2, 9, 1, dark);
    } else {
      // Sichtbarer Spalt + kleine Knospen, die sich teilen.
      rect(g, cx, cy + 1, 1, r - 1, dark);
      put(g, cx - 1, cy + r, dark);
      put(g, cx + 1, cy + r, dark);
      put(g, cx - r - 1, cy, dark);
      put(g, cx + r + 1, cy - 1, dark);
    }
  } else if (archetype === "phaser") {
    // Geist: Schwebe-Rumpf, Zipfel-Schwanz, Augen.
    const cy = bottom - 8 - bob;
    shellEllipse(cx, cy, 5, 5, color);
    eyes(cx, cy - 2, 2 + (index % 2), 3);
    for (let i = 0; i < 4; i++) {
      for (let x = -3 + (i % 2); x <= 3 - (i % 2); x++) {
        put(g, cx + x, cy + 6 + i, i % 2 === 0 ? dark : color);
      }
    }
    // Arme schweben seitlich.
    put(g, cx - 6, cy, dark);
    put(g, cx + 6, cy + 1, dark);
  } else if (archetype === "orbiter") {
    // Flügel-Rundling mit Hörnern.
    const cy = bottom - 8 - bob;
    shellEllipse(cx, cy, 5, 5, color);
    eyes(cx, cy - 1, 2, 2);
    const wingY = frame === 1 ? cy - 4 : cy - 1;
    for (let i = 2; i <= 6; i++) {
      put(g, cx - i - 1, wingY - (i % 2), i === 6 ? light : dark);
      put(g, cx + i + 1, wingY - (i % 2), i === 6 ? light : dark);
    }
    put(g, cx - 2, cy - 6, light);
    put(g, cx + 2, cy - 6, light);
    // Peitschenschwanz.
    for (let i = 0; i < 3; i++) put(g, cx + (i % 2) * 2, cy + 5 + i, dark);
  } else if (archetype === "summoner") {
    // Robenträger mit erhobenen Armen und Beschwörungskreis.
    const cy = bottom - 8 - bob;
    shellRect(cx - 5, cy - 2, 11, 9, color);
    // Spitzkapuze.
    rect(g, cx - 4, cy - 5, 9, 2, dark);
    rect(g, cx - 2, cy - 7, 5, 2, dark);
    put(g, cx, cy - 8, light);
    eyes(cx, cy - 3, 2 + (index % 2), 3);
    // Arme hoch + Orb.
    rect(g, cx - 7, cy - 3, 2, 3, dark);
    rect(g, cx + 5, cy - 3, 2, 3, dark);
    put(g, cx - 7, cy - 4, light);
    put(g, cx + 6, cy - 4, light);
    // Robe unten breiter mit Fransen.
    rect(g, cx - 6, cy + 7, 13, 2, dark);
    for (let i = -5; i <= 5; i += 3) put(g, cx + i, cy + 9, dark);
  } else {
    // Chaser: humanoider Läufer mit Kopf, Armen und Beinen.
    const cy = bottom - 8 - bob;
    shellRect(cx - 4, cy, 8, 8, color);
    shellEllipse(cx, cy - 5, 4, 4, color);
    eyes(cx - 1, cy - 6, 2, 2);
    // Haare/Hörner je Index.
    if (index % 3 === 0) {
      rect(g, cx - 4, cy - 9, 9, 2, dark);
      put(g, cx, cy - 10, light);
    } else if (index % 3 === 1) {
      put(g, cx - 4, cy - 9, light);
      put(g, cx + 4, cy - 9, light);
      put(g, cx - 3, cy - 9, dark);
      put(g, cx + 3, cy - 9, dark);
    } else {
      put(g, cx, cy - 10, light);
      put(g, cx, cy - 11, light);
    }
    // Arme.
    rect(g, cx - 6, cy + 1, 2, 4, dark);
    rect(g, cx + 5, cy + 1, 2, 4, dark);
    // Beine (Frame wechselt).
    const off = frame === 1 ? 1 : 0;
    rect(g, cx - 3, cy + 8, 2, 4 - off, dark);
    rect(g, cx + 2 + off, cy + 8, 2, 3 + off, dark);
  }

  // Schattierung: Lichtkante oben-links, dunkle Kante unten-rechts.
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      if (c === null || c === 0) continue;
      const hasBelow = y + 1 < g.length && g[y + 1][x] !== null && g[y + 1][x] !== 0;
      const hasAbove = y > 0 && g[y - 1][x] !== null && g[y - 1][x] !== 0;
      const hasRight = x + 1 < g[0].length && g[y][x + 1] !== null && g[y][x + 1] !== 0;
      const hasLeft = x > 0 && g[y][x - 1] !== null && g[y][x - 1] !== 0;
      if (!hasAbove && hasLeft) g[y][x] = light;
      else if (!hasBelow || !hasRight) g[y][x] = dark;
    }
  }
  // Flying: sichtbare Flügel, die im zweiten Frame nach oben klappen.
  if (flying) {
    const wingY = frame === 1 ? 5 : 9;
    for (let i = 3; i <= 8; i++) {
      put(g, cx - i, wingY + (i % 2), i >= 7 ? light : color);
      put(g, cx + i, wingY + (i % 2), i >= 7 ? light : color);
    }
    put(g, cx - 8, wingY, dark);
    put(g, cx + 8, wingY, dark);
  }

  // Eindeutige Signatur: kleiner Auswuchs, der Silhouetten sicher trennt.
  const sigX = cx - 9 + (index % 10);
  const sigY = 3 + Math.floor(index / 10);
  put(g, sigX, sigY, index % 2 === 0 ? light : dark);
  put(g, sigX + 1, sigY, color);
  return g;
}

/** 1-px dunkle Kontur um alle gefüllten Pixel. */
function outline(g: Grid): void {
  const filled: [number, number][] = [];
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) if (g[y][x] !== null) filled.push([x, y]);
  }
  for (const [x, y] of filled) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (ny >= 0 && ny < g.length && nx >= 0 && nx < g[0].length && g[ny][nx] === null) {
        g[ny][nx] = 0;
      }
    }
  }
}

/** Frame-0-Maske für Eindeutigkeitstests (nur Silhouette, keine Farben). */
export function silhouette(grid: Grid): string {
  return grid.map((row) => row.map((p) => (p === null ? "." : "#")).join("")).join("\n");
}

/**
 * Bosse: deutlich größere, eigene Silhouetten (Krone/Hörner/Sichel/Stab),
 * ebenfalls ausschließlich in Palettenfarben und mit schwarzer Kontur.
 */
export function buildBossSprite(index: number, frame = 0): Grid {
  const g = emptyGrid(BOSS_SPRITE_SIZE);
  const cx = 20;
  const bottom = 36;
  const color = [30, 10, 8, 5, 25, 14][index] ?? 9;
  const dark = shadeIndex(color, 0.5);
  const light = shadeIndex(color, 1.35);
  const bob = frame === 1 ? 1 : 0;

  const shellEllipse = (ex: number, ey: number, rx: number, ry: number, fill: number): void => {
    ellipse(g, ex, ey, rx + 1, ry + 1, 0);
    ellipse(g, ex, ey, rx, ry, fill);
  };
  const shellRect = (x: number, y: number, w: number, h: number, fill: number): void => {
    rect(g, x - 1, y - 1, w + 2, h + 2, 0);
    rect(g, x, y, w, h, fill);
  };
  const eyes = (ex: number, ey: number): void => {
    put(g, ex - 2, ey, 13);
    put(g, ex + 2, ey, 13);
    put(g, ex - 2, ey + 1, 0);
    put(g, ex + 2, ey + 1, 0);
  };

  const bw = [26, 15, 18, 24, 18, 22][index] ?? 18;
  const bh = [20, 26, 28, 28, 24, 30][index] ?? 24;
  const rx = Math.floor(bw / 2);
  const ry = Math.floor(bh / 2);
  const cy = bottom - ry - bob;

  // Rumpf.
  shellEllipse(cx, cy, rx, ry, color);
  // Schattierung nur an den Rändern.
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      if (c === null || c === 0) continue;
      const openAbove = g[y - 1]?.[x] === null;
      const openLeft = g[y]?.[x - 1] === null;
      const openBelow = g[y + 1]?.[x] === null;
      const openRight = g[y]?.[x + 1] === null;
      if (openAbove && openLeft) g[y][x] = light;
      else if (openBelow || openRight) g[y][x] = dark;
    }
  }

  // Kopf mit Augen (bei allen).
  const hr = Math.max(4, Math.floor(rx / 2));
  const hy = cy - ry - 2;
  shellEllipse(cx, hy, hr, Math.max(4, hr - 1), color);
  eyes(cx, hy);

  switch (index) {
    case 0: { // Moorkönigin: Krone, Giftblasen am Saum.
      for (let i = -1; i <= 1; i++) {
        const hx = cx + i * 5;
        put(g, hx, hy - hr - 1, 20);
        put(g, hx - 1, hy - hr, 20);
        put(g, hx + 1, hy - hr, 20);
        put(g, hx - 2, hy - hr + 1, 19);
        put(g, hx + 2, hy - hr + 1, 19);
      }
      for (let i = 0; i < 4; i++) {
        put(g, cx - 9 + i * 6, cy + ry - 2, 31);
        put(g, cx - 9 + i * 6, cy + ry - 1, dark);
      }
      rect(g, cx - rx + 4, cy + 2, rx * 2 - 8, 2, dark);
      break;
    }
    case 1: { // Knochenfürst: Rippen, Schulterknochen, Dornenkrone.
      for (let i = 0; i < 5; i++) rect(g, cx - 5, cy - 3 + i * 3, 11, 1, dark);
      rect(g, cx - rx - 2, cy - ry + 5, 5, 3, light);
      rect(g, cx + rx - 3, cy - ry + 5, 5, 3, light);
      for (let i = -2; i <= 2; i++) {
        const h = 3 + (i % 2 === 0 ? 2 : 0);
        rect(g, cx + i * 3 - 1, hy - hr - h, 2, h, i === 0 ? light : color);
      }
      break;
    }
    case 2: { // Fahler Hirte: Kapuze + Sichel.
      rect(g, cx - hr - 2, hy - 2, hr * 2 + 5, 3, dark);
      put(g, cx, hy - 5, light);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        put(g, cx + rx + 2 + Math.round(Math.cos(a) * 7), cy - 2 - Math.round(Math.sin(a) * 10), light);
      }
      rect(g, cx + rx + 1, cy - 4, 1, 14, dark);
      break;
    }
    case 3: { // Glockenturm-Golem: Turmhelm + Blockarme + Steinbänder.
      rect(g, cx - 5, hy - hr - 7, 11, 8, color);
      rect(g, cx - 6, hy - hr - 8, 13, 2, light);
      put(g, cx, hy - hr - 9, dark);
      rect(g, cx - rx - 3, cy - 3, 4, ry * 2 - 4, dark);
      rect(g, cx + rx, cy - 3, 4, ry * 2 - 4, dark);
      for (let i = 0; i < 4; i++) rect(g, cx - 5, cy + 2 + i * 3, 11, 1, dark);
      break;
    }
    case 4: { // Hexenzirkel: drei Spitzhüte + Feuerorb in der Mitte.
      for (let i = -1; i <= 1; i++) {
        const hx = cx + i * 9;
        put(g, hx, hy - 7, light);
        put(g, hx - 1, hy - 6, color);
        put(g, hx + 1, hy - 6, color);
        put(g, hx - 2, hy - 5, color);
        put(g, hx + 2, hy - 5, color);
        put(g, hx - 3, hy - 4, dark);
        put(g, hx + 3, hy - 4, dark);
      }
      ellipse(g, cx, cy + 3, 5, 5, 18);
      ellipse(g, cx, cy + 3, 3, 3, 22);
      put(g, cx, cy + 3, 13);
      break;
    }
    default: { // Hohler König: große Dornenkrone + Rippenmantel.
      for (let i = -4; i <= 4; i++) {
        const h = 4 + (i % 2 === 0 ? 3 : 0);
        rect(g, cx + i * 3 - 1, hy - hr - h, 2, h, i === 0 ? 26 : 25);
      }
      rect(g, cx - hr - 2, hy - hr - 1, hr * 2 + 5, 2, 25);
      for (let i = 0; i < 6; i++) rect(g, cx - 7, cy - 4 + i * 3, 15, 1, dark);
      rect(g, cx - rx - 2, cy - 4, 3, ry + 8, dark);
      rect(g, cx + rx, cy - 4, 3, ry + 8, dark);
      break;
    }
  }

  outline(g);
  return g;
}

function gridToCanvas(g: Grid): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = g[0].length;
  canvas.height = g.length;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      if (c === null) continue;
      ctx.fillStyle = "#" + PAL[c].toString(16).padStart(6, "0");
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Erzeugt für alle 30 Gegner die Textur-Frames (0/1 Basis-Ton, 2/3 Varianten-
 *  ton, siehe enemyFrameGrids) + den einen Elite-Rim-Frame. */
export function createEnemyTextures(scene: Phaser.Scene): void {
  ENEMY_LIST.forEach((def, index) => {
    const keys = enemyFrameKeys(index);
    enemyFrameGrids(index).forEach((grid, i) => {
      if (scene.textures.exists(keys[i])) return;
      scene.textures.addCanvas(keys[i], gridToCanvas(grid));
    });
    const rimKey = eliteRimFrameKey(index);
    if (!scene.textures.exists(rimKey)) {
      scene.textures.addCanvas(rimKey, gridToCanvas(eliteRimFrame(index)));
    }
  });
}

export function bossSpriteFrames(index: number): Grid[] {
  const boss = BOSSES[index];
  return GEN_BOSSES[`boss_${boss.id}`].frames.map(gridFromRows);
}

export function bossFrameKeys(index: number): string[] {
  const count = GEN_BOSSES[`boss_${BOSSES[index].id}`].frames.length;
  return Array.from({ length: count }, (_, i) => (i === 0 ? `boss_${BOSSES[index].id}` : `boss_${BOSSES[index].id}_${i + 1}`));
}

export function createBossTextures(scene: Phaser.Scene): void {
  BOSSES.forEach((boss, index) => {
    const frames = bossSpriteFrames(index);
    const keys = bossFrameKeys(index);
    frames.forEach((grid, i) => {
      if (scene.textures.exists(keys[i])) return;
      scene.textures.addCanvas(keys[i], gridToCanvas(grid));
    });
  });
}

/** Alle Frame-Keys fuer den Pool (statisch, ohne Browser-Canvas), inkl. der
 *  Elite-Rim-Framesets ("<id>_rim") — der Spread in textures.ts macht sie
 *  damit automatisch atlas- und framesForDef-faehig. */
type EnemyFrameKey = EnemyId | EliteFrameId;

export const ALL_ENEMY_FRAMES: Record<EnemyFrameKey, string[]> = Object.fromEntries([
  ...ENEMY_LIST.map((def, index) => [def.id, enemyFrameKeys(index)]),
  ...ENEMY_LIST.map((def, index) => [eliteFrameId(def.id), [eliteRimFrameKey(index)]]),
]) as Record<EnemyFrameKey, string[]>;

export const ALL_BOSS_FRAMES: Record<string, string[]> = Object.fromEntries(
  BOSSES.map((boss, index) => [boss.id, bossFrameKeys(index)]),
);
