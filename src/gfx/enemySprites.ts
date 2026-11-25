import Phaser from "phaser";
import { PAL } from "../palette";
import { ENEMIES, ENEMY_LIST } from "../data/enemies";
import type { Archetype, EnemyId } from "../data/types";
import { BOSSES } from "../data/bosses";

/** 18x18-Raster; Frame 0 ist die Ruhepose, Frame 1 die Lauf-/Bob-Pose. */
export const ENEMY_SPRITE_SIZE = 18;
export const BOSS_SPRITE_SIZE = 40;

type Pixel = number | null;
type Grid = Pixel[][];

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
  const bw = 5 + (index % 5);          // 5..9
  const bh = 5 + Math.floor(index / 5); // 5..10
  const rx = Math.max(2, Math.floor(bw / 2));
  const ry = Math.max(2, Math.floor(bh / 2));
  const cx = 9;
  const bottom = 15;
  const cy = bottom - ry - (frame === 1 ? 1 : 0);
  const dark = shadeIndex(color, 0.55);
  const light = shadeIndex(color, 1.34);

  // Körper.
  ellipse(g, cx, cy, rx, ry, color);
  // Unterbauch dunkler, Lichtkante oben-links.
  ellipse(g, cx + 1, cy + Math.max(1, ry - 2), Math.max(1, rx - 2), 1, dark);
  put(g, cx - rx + 1, cy - ry + 1, light);
  put(g, cx - rx + 2, cy - ry + 1, light);
  put(g, cx - rx + 1, cy - ry + 2, light);

  const humanoid = archetype === "chaser" || archetype === "tank" || archetype === "ranged"
    || archetype === "summoner" || archetype === "exploder";
  const quad = archetype === "charger" || archetype === "swarm";
  const eyeCount = 1 + (index % 3);

  if (humanoid && archetype !== "exploder") {
    const hr = Math.max(2, Math.min(4, Math.floor(bw / 2)));
    const hy = cy - ry - 1;
    ellipse(g, cx, hy, hr, hr - 1, color);
    // Kapuze/Krone/Hörner je Archetyp.
    if (archetype === "summoner" || index % 4 === 0) {
      rect(g, cx - hr, hy - 2, hr * 2 + 1, 2, dark);
      put(g, cx, hy - 3, light);
    }
    if (archetype === "tank" || archetype === "summoner") {
      put(g, cx - hr - 1, hy - 1, light);
      put(g, cx + hr + 1, hy - 1, light);
    }
    // Augen.
    const eyeStart = eyeCount === 1 ? 0 : -(eyeCount - 1);
    for (let e = 0; e < eyeCount; e++) {
      put(g, cx + eyeStart + e * 2, hy, 13);
      put(g, cx + eyeStart + e * 2 + (frame === 1 ? 1 : 0), hy + 1, 12);
    }
    if (archetype === "tank") rect(g, cx - rx, cy - 2, rx * 2 + 1, 2, dark);
  } else if (archetype === "splitter" || archetype === "exploder") {
    // Blob: mehrere Augen + Zündschnur/Spalt.
    for (let e = 0; e < eyeCount; e++) {
      put(g, cx - 2 + e * 2, cy - 1, 13);
      put(g, cx - 2 + e * 2, cy, 12);
    }
    if (archetype === "exploder") {
      rect(g, cx, cy - ry - 2, 1, 3, light);
      put(g, cx + (frame === 1 ? 1 : 0), cy - ry - 3, 18);
    } else {
      rect(g, cx, cy + 1, 1, Math.max(1, ry - 1), dark);
      put(g, cx - 1, cy + ry, dark);
      put(g, cx + 1, cy + ry, dark);
    }
  } else if (archetype === "phaser") {
    // Geister-Schwanz statt Beine, Kopf mit Augen.
    const hr = Math.max(2, Math.min(4, Math.floor(bw / 2)));
    const hy = cy - ry - 1;
    ellipse(g, cx, hy, hr, hr - 1, color);
    for (let e = 0; e < Math.min(3, eyeCount); e++) put(g, cx - 2 + e * 2, hy, 13);
    for (let i = 0; i < 4; i++) {
      for (let x = -2 + (i % 2); x <= 2 - (i % 2); x++) put(g, cx + x, bottom - 2 + i, i % 2 === 0 ? color : dark);
    }
  } else {
    // Tierkopf mit Schnauze/Ohren.
    ellipse(g, cx, cy - ry + 1, Math.max(2, rx - 1), Math.max(2, ry - 2), color);
    for (let e = 0; e < Math.min(3, eyeCount); e++) put(g, cx - 2 + e * 2, cy - ry + 1, 13);
    put(g, cx + rx, cy - 1, dark);
    if (archetype === "swarm" || index % 3 === 0) {
      put(g, cx - 2, cy - ry - 1, light);
      put(g, cx + 2, cy - ry - 1, light);
    }
  }

  if (flying) {
    // Flügel links/rechts; Frame 1 klappt sie nach oben.
    const wingY = frame === 1 ? cy - ry - 1 : cy - 1;
    for (let i = 0; i < 4; i++) {
      put(g, cx - rx - 1 - i, wingY + (i % 2), i === 3 ? light : color);
      put(g, cx + rx + 1 + i, wingY + (i % 2), i === 3 ? light : color);
    }
  }

  if (quad) {
    // Beine/Spinnenbeine (alternieren pro Frame).
    const pairs = archetype === "swarm" ? 2 + (index % 3) : 2;
    for (let p = 0; p < pairs; p++) {
      const px = cx - rx + 1 + p * Math.max(1, Math.floor((rx * 2 - 2) / Math.max(1, pairs - 1)));
      const off = (frame + p) % 2;
      rect(g, px + off, bottom - 1, 1, 2, dark);
      rect(g, px + 2 - off, bottom - 2, 1, 2, dark);
    }
    // Schwanz.
    if (archetype === "swarm") {
      for (let i = 0; i < 3; i++) put(g, cx + rx + i, cy + 1 - (i % 2), i === 2 ? light : dark);
    }
  } else if (humanoid) {
    const off = frame === 1 ? 1 : 0;
    rect(g, cx - 2, bottom - 1, 1, 2, dark);
    rect(g, cx + 1 + off, bottom - 1, 1, 2, dark);
  }

  outline(g);

  // Schattierung: obere linke Kanten heller, untere rechte dunkler.
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      if (c === null || c === 0) continue;
      const leftLit = x + 1 < g[0].length && g[y][x + 1] === null;
      const topLit = y + 1 < g.length && g[y + 1][x] === null;
      const rightDark = x > 0 && g[y][x - 1] === null;
      const bottomDark = y > 0 && g[y - 1][x] === null;
      if ((leftLit && y < cy) || (topLit && x < cx)) g[y][x] = light;
      else if (rightDark || bottomDark) g[y][x] = dark;
    }
  }
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
 * Bosse: größere, eigene Silhouetten (Krone/Hörner/Sichel/Stab), ebenfalls
 * ausschließlich in Palettenfarben.
 */
export function buildBossSprite(index: number, frame = 0): Grid {
  const g = emptyGrid(BOSS_SPRITE_SIZE);
  const cx = 20;
  const bottom = 34;
  const color = [21, 10, 9, 8, 25, 12][index] ?? 9;
  const dark = shadeIndex(color, 0.5);
  const light = shadeIndex(color, 1.3);
  const bw = [18, 10, 12, 16, 12, 14][index] ?? 12;
  const bh = [14, 18, 20, 20, 18, 22][index] ?? 16;
  const rx = Math.floor(bw / 2);
  const ry = Math.floor(bh / 2);
  const cy = bottom - ry - (frame === 1 ? 1 : 0);
  ellipse(g, cx, cy, rx, ry, color);
  ellipse(g, cx + 2, cy + Math.max(2, ry - 4), Math.max(2, rx - 3), 2, dark);
  rect(g, cx - rx + 2, cy - ry + 2, 3, 2, light);

  // Alle Bosse haben einen Kopf mit Augen.
  const hr = Math.max(3, Math.floor(rx / 2));
  const hy = cy - ry - 1;
  ellipse(g, cx, hy, hr, Math.max(3, hr - 1), color);
  for (let e = 0; e < 2; e++) {
    put(g, cx - 2 + e * 4, hy, 13);
    put(g, cx - 2 + e * 4, hy + 1, 0);
  }

  switch (index) {
    case 0: { // Moorkönigin: breiter Krötenkopf + Giftblasen
      ellipse(g, cx, cy - ry + 3, rx, 4, color);
      put(g, cx - 5, hy - 3, light);
      put(g, cx + 5, hy - 3, light);
      for (let i = 0; i < 3; i++) put(g, cx - 4 + i * 4, cy + 3, 31);
      break;
    }
    case 1: { // Knochenfürst: Rippen + Schulterknochen
      for (let i = 0; i < 4; i++) rect(g, cx - rx + 3, cy - 2 + i * 3, rx * 2 - 6, 1, dark);
      rect(g, cx - rx - 2, cy - ry + 5, 4, 2, light);
      rect(g, cx + rx - 2, cy - ry + 5, 4, 2, light);
      put(g, cx, hy - hr - 1, light);
      put(g, cx, hy - hr - 2, light);
      break;
    }
    case 2: { // Fahler Hirte: Kapuze + Sichel
      rect(g, cx - hr - 2, hy - 2, hr * 2 + 5, 3, dark);
      put(g, cx, hy - 4, light);
      for (let i = 0; i < 8; i++) put(g, cx + rx + 1 + Math.round(Math.cos(i / 8 * Math.PI) * 5), cy - 4 - i, light);
      break;
    }
    case 3: { // Glockenturm-Golem: Turmhelm + Blockarme
      rect(g, cx - 4, hy - hr - 5, 9, 6, color);
      rect(g, cx - 5, hy - hr - 6, 11, 2, light);
      rect(g, cx - rx - 3, cy - 2, 3, ry * 2 - 2, dark);
      rect(g, cx + rx + 1, cy - 2, 3, ry * 2 - 2, dark);
      for (let i = 0; i < 3; i++) rect(g, cx - rx + 3, cy + 2 + i * 3, rx * 2 - 5, 1, dark);
      break;
    }
    case 4: { // Hexenzirkel: drei Spitzhüte + Feuerorb
      for (let i = -1; i <= 1; i++) {
        const hx = cx + i * 8;
        put(g, hx, hy - 4, light);
        put(g, hx - 1, hy - 3, color);
        put(g, hx + 1, hy - 3, color);
        put(g, hx - 2, hy - 2, color);
        put(g, hx + 2, hy - 2, color);
      }
      ellipse(g, cx, cy + 2, 4, 4, 18);
      ellipse(g, cx, cy + 2, 2, 2, 22);
      break;
    }
    default: { // Hohler König: große Dornenkrone + Rippenmantel
      for (let i = -3; i <= 3; i++) {
        const h = 3 + (i % 2 === 0 ? 2 : 0);
        rect(g, cx + i * 3 - 1, hy - hr - h, 2, h, i === 0 ? light : color);
      }
      rect(g, cx - hr - 1, hy - hr - 1, hr * 2 + 3, 2, dark);
      for (let i = 0; i < 5; i++) rect(g, cx - rx + 3, cy - 3 + i * 3, rx * 2 - 6, 1, dark);
      break;
    }
  }

  outline(g);
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const c = g[y][x];
      if (c === null || c === 0) continue;
      if (x < cx && y < cy) g[y][x] = light;
      else if (x > cx && y > cy) g[y][x] = dark;
    }
  }
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

/** Erzeugt für alle 30 Gegner zwei Textur-Frames (vorhandene bleiben erhalten). */
export function createEnemyTextures(scene: Phaser.Scene): void {
  ENEMY_LIST.forEach((def, index) => {
    for (let frame = 0; frame < 2; frame++) {
      const key = frame === 0 ? def.spriteKey : `${def.spriteKey}_2`;
      if (scene.textures.exists(key)) continue;
      const grid = buildEnemySprite(index, def.archetype, def.color, Boolean(def.flying), frame);
      scene.textures.addCanvas(key, gridToCanvas(grid));
    }
  });
}

export function createBossTextures(scene: Phaser.Scene): void {
  BOSSES.forEach((boss) => {
    for (let frame = 0; frame < 2; frame++) {
      const key = frame === 0 ? `boss_${boss.id}` : `boss_${boss.id}_2`;
      if (scene.textures.exists(key)) continue;
      scene.textures.addCanvas(key, gridToCanvas(buildBossSprite(boss.index, frame)));
    }
  });
}

/** Alle Frame-Keys für den Pool (statisch, ohne Browser-Canvas). */
export const ALL_ENEMY_FRAMES: Record<EnemyId, string[]> = Object.fromEntries(
  ENEMY_LIST.map((def) => [def.id, [def.spriteKey, `${def.spriteKey}_2`]]),
) as Record<EnemyId, string[]>;

export const ALL_BOSS_FRAMES: Record<string, string[]> = Object.fromEntries(
  BOSSES.map((boss) => [boss.id, [`boss_${boss.id}`, `boss_${boss.id}_2`]]),
);
