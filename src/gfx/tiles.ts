import { PAL } from "../palette";
import { TILE } from "../config";

export type TileKind = "grass" | "path" | "water" | "mud";

function hex(i: number): string {
  return "#" + PAL[i].toString(16).padStart(6, "0");
}

/** Deterministischer 0..1-Hash pro Weltkoordinate. */
export function tileHash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Weiches Value-Noise (0..1) für Moorflächen. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);
  const h00 = tileHash(x0, y0, seed);
  const h10 = tileHash(x0 + 1, y0, seed);
  const h01 = tileHash(x0, y0 + 1, seed);
  const h11 = tileHash(x0 + 1, y0 + 1, seed);
  const a = h00 * (1 - tx) + h10 * tx;
  const b = h01 * (1 - tx) + h11 * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * Terrain-Art an einer Weltposition – pixelgenau, nicht kachelweise.
 * Wasser/Moor/Wege sind weiche Felder mit ausgefransten Rändern, damit im
 * Spiel keine 16-px-Kachelstufen sichtbar werden.
 */
export function terrainKindAt(wx: number, wy: number, seed: number, worldSize: number): TileKind {
  // Große Wasserflächen (Zellen ~112 px) mit feinem 9-px-Wobble am Ufer.
  const lake = valueNoise(wx, wy, 190, seed + 3);
  const wobble = valueNoise(wx + 41, wy - 17, 12, seed + 4);
  if (lake * 0.88 + wobble * 0.12 < 0.21) return "water";

  // Schlammmulden (Zellen ~64 px) mit 12-px-Randunruhe.
  const mud = valueNoise(wx + 100, wy - 40, 64, seed + 5);
  const mudWob = valueNoise(wx - 23, wy + 31, 12, seed + 6);
  if (mud * 0.87 + mudWob * 0.13 < 0.19) return "mud";

  // Gewundener Pfad: Distanz zum Kurvenzug in Pixeln, Rand +-5 px ausgefranst.
  const c = worldSize / 2;
  const edge = (valueNoise(wx, wy, 14, seed + 7) - 0.5) * 10;
  const pathY = c + Math.sin(wx * 0.0034) * 288 + Math.sin(wx * 0.0008) * 112;
  if (Math.abs(wy - pathY) < 30 + edge) return "path";
  const pathX = c + Math.sin(wy * 0.0028) * 224;
  if (Math.abs(wx - pathX) < 22 + edge) return "path";
  return "grass";
}

/** Grundfarbe eines Terrain-Pixels (Palette 3-17 fuer Wasser/Weg/Moor, 28-31 Gras). */
function pixelColor(kind: TileKind, wx: number, wy: number, seed: number): number {
  // Nur grobe Noise-Oktaven: grosse ruhige Flaechen, kein 1-px-Rauschen.
  if (kind === "water") {
    const n = valueNoise(wx, wy, 34, seed + 17);
    return n < 0.42 ? 3 : n > 0.72 ? 5 : 4;
  }
  if (kind === "mud") {
    const n = valueNoise(wx + 300, wy - 90, 28, seed + 5);
    // Moor-Schlamm: dunkler und gruener als der Weg (3/14/15).
    if (n < 0.34) return 3;
    if (n < 0.52) return 14;
    return 15;
  }
  if (kind === "path") {
    const n = valueNoise(wx + 130, wy + 60, 30, seed + 41);
    // Weg: warme Erdrampe, klar heller als Gras (15/16/17).
    return n < 0.3 ? 15 : n > 0.82 ? 17 : 16;
  }
  const n = valueNoise(wx, wy, 26, seed + 911);
  // Ruhige Flaeche: nur 28/29/30 in breiten Flecken, 31 nur fuer Bueschel.
  if (n < 0.4) return 28;
  if (n > 0.66) return 30;
  return 29;
}

/**
 * Malt einen Terrain-Ausschnitt (Chunk) pixelgenau: Grundfarben, gruppierte
 * Details (Grasbüschel, Kiesel, Wellen, Schlammblasen) und eine 1-2-px
 * Ufer-/Wegnaht. Alles weltverankert, daher ohne Kachelnähte.
 */
export function paintTerrain(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  seed: number,
  worldSize: number,
): void {
  // 1) Art pro Pixel einmal bestimmen (Puffer), dann Grundfarbe setzen.
  //    Der Ufer-Pass liest die Nachbararten aus demselben Puffer statt sie
  //    neu zu berechnen (spart ~80 % der Noise-Aufrufe pro Chunk).
  const kinds = new Uint8Array(w * h);
  const kindIndex = (k: TileKind) => (k === "water" ? 1 : k === "mud" ? 2 : k === "path" ? 3 : 0);
  const kindFrom = (i: number): TileKind => (i === 1 ? "water" : i === 2 ? "mud" : i === 3 ? "path" : "grass");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = ox + x;
      const wy = oy + y;
      const kind = terrainKindAt(wx, wy, seed, worldSize);
      kinds[y * w + x] = kindIndex(kind);
      ctx.fillStyle = hex(pixelColor(kind, wx, wy, seed));
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // 2) Ufer: 2-px-Schaum nur wasserseitig, landseitig Schlammband + Schilf.
  const kindIn = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : kinds[y * w + x];
  const isWater = (x: number, y: number) => kindIn(x, y) === 1;
  const isLand = (x: number, y: number) => kindIn(x, y) !== 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = kindIn(x, y);
      const wx = ox + x;
      const wy = oy + y;
      if (k === 1) {
        // Schaum: nur in den ersten 2 px zur Landkante, nicht als 7-px-Band.
        const d1 = !isWater(x - 1, y) || !isWater(x + 1, y) || !isWater(x, y - 1) || !isWater(x, y + 1);
        const d2 = !isWater(x - 2, y) || !isWater(x + 2, y) || !isWater(x, y - 2) || !isWater(x, y + 2);
        if (d1) {
          ctx.fillStyle = hex(8);
          ctx.fillRect(x, y, 1, 1);
        } else if (d2) {
          ctx.fillStyle = hex(7);
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (k === 0) {
        const bank = !isLand(x - 2, y) || !isLand(x + 2, y) || !isLand(x, y - 2) || !isLand(x, y + 2);
        if (bank) {
          // Schlamm-/Schilf-Uebergang statt harter Grasnarbe.
          ctx.fillStyle = hex(14);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  // 3) Gruppierte Details pro 16-px-Zelle, weltverankert.
  const startTx = Math.floor(ox / TILE);
  const startTy = Math.floor(oy / TILE);
  const cellsW = Math.ceil(w / TILE);
  const cellsH = Math.ceil(h / TILE);
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tx = startTx + cx;
      const ty = startTy + cy;
      const px = tx * TILE - ox;
      const py = ty * TILE - oy;
      const kind = terrainKindAt(tx * TILE + 8, ty * TILE + 8, seed, worldSize);
      const r = tileHash(tx, ty, seed + 77);
      if (kind === "grass") {
        const tuft = valueNoise(tx * 0.9 + 11, ty * 0.9 - 5, 2.4, seed + 413);
        if (r > 0.72) {
          // Sparsame 2x2-Flecken in dunklerem/hellerem Gras (kein 1-px-Rauschen).
          const sx = px + 2 + Math.floor(tileHash(tx, ty, seed + 401) * 10);
          const sy = py + 2 + Math.floor(tileHash(ty, tx, seed + 403) * 10);
          ctx.fillStyle = hex(tileHash(tx + 1, ty + 1, seed + 405) > 0.5 ? 30 : 29);
          ctx.fillRect(sx, sy, 2, 2);
        }
        if (tuft > 0.66 && r > 0.45) {
          const bx = px + 3 + Math.floor(tileHash(tx, ty, seed + 47) * 6);
          const by = py + 6 + Math.floor(tileHash(ty, tx, seed + 53) * 4);
          ctx.fillStyle = hex(30);
          ctx.fillRect(bx, by, 2, 5);
          ctx.fillRect(bx + 4, by + 2, 2, 3);
          ctx.fillStyle = hex(31);
          ctx.fillRect(bx, by, 2, 2);
          ctx.fillRect(bx + 4, by + 2, 2, 2);
          ctx.fillStyle = hex(28);
          ctx.fillRect(bx - 1, by + 5, 3, 1);
          ctx.fillRect(bx + 3, by + 5, 3, 1);
        }
        if (valueNoise(Math.floor(tx / 3), Math.floor(ty / 3), 1.4, seed + 21) > 0.74 && r > 0.6) {
          ctx.fillStyle = hex(6);
          ctx.fillRect(px + 3, py + 10, 5, 3);
          ctx.fillStyle = hex(8);
          ctx.fillRect(px + 3, py + 10, 3, 1);
          ctx.fillStyle = hex(5);
          ctx.fillRect(px + 3, py + 12, 5, 1);
          ctx.fillStyle = hex(30);
          ctx.fillRect(px + 8, py + 11, 1, 2);
        }
      } else if (kind === "water") {
        if (r > 0.66) {
          for (let i = 0; i < 2; i++) {
            const wx = px + 1 + Math.floor(tileHash(tx + i, ty + 2, seed + 301) * 7);
            const wy = py + 3 + i * 6 + Math.floor(tileHash(tx + 1, ty + i, seed + 307) * 3);
            ctx.fillStyle = hex(6);
            ctx.fillRect(wx, wy, 11, 2);
            ctx.fillStyle = hex(7);
            ctx.fillRect(wx + 1, wy, 9, 1);
            ctx.fillStyle = hex(8);
            ctx.fillRect(wx + 3, wy, 4, 1);
          }
        }
      } else if (kind === "path") {
        if (r > 0.62) {
          // Kies in 2x2-Clustern (3-4 Steinchen), nicht als Einzelpixel.
          for (let i = 0; i < 3; i++) {
            const sx = px + 2 + Math.floor(tileHash(tx + i, ty, seed + 67) * 11);
            const sy = py + 3 + Math.floor(tileHash(ty, tx + i, seed + 69) * 9);
            ctx.fillStyle = hex(15);
            ctx.fillRect(sx, sy, 2, 2);
            ctx.fillStyle = hex(16);
            ctx.fillRect(sx, sy, 1, 1);
          }
        }
      } else if (kind === "mud") {
        if (r > 0.55) {
          // Schlammblasen: 2x2 mit dunklem Rand, in kleinen Gruppen.
          for (let i = 0; i < 3; i++) {
            const bx = px + 2 + Math.floor(tileHash(tx + 3, ty + i, seed + 63) * 10);
            const by = py + 3 + Math.floor(tileHash(ty + 5, tx + i, seed + 65) * 9);
            ctx.fillStyle = hex(16);
            ctx.fillRect(bx, by, 2, 2);
            ctx.fillStyle = hex(15);
            ctx.fillRect(bx + 1, by + 1, 1, 1);
          }
        }
      }
    }
  }
}

export type DecorKind = "tree" | "grave" | "stone" | "ruin" | "post";

export function paintDecor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  kind: DecorKind,
  tx: number,
  ty: number,
  seed: number,
): void {
  const rnd = tileHash(tx, ty, seed + 1234);
  if (kind === "tree") {
    // Toter Baum: konischer 3-px-Stamm mit Rindenstreifen, knorrige 2-px-Aeste.
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 5, py + 2, 6, 14);
    ctx.fillStyle = hex(15);
    ctx.fillRect(px + 6, py + 4, 4, 12);
    ctx.fillRect(px + 3, py + 10, 3, 3);
    ctx.fillRect(px + 10, py + 10, 3, 3);
    ctx.fillStyle = hex(14);
    ctx.fillRect(px + 6, py + 4, 1, 12);
    ctx.fillRect(px + 8, py + 6, 1, 10);
    ctx.fillStyle = hex(16);
    ctx.fillRect(px + 9, py + 4, 1, 6);
    ctx.fillStyle = hex(4);
    ctx.fillRect(px + 3, py + 11, 3, 2);
    ctx.fillRect(px + 10, py + 11, 3, 2);
    // Aeste: 2 px breit, oben-links Licht.
    ctx.fillStyle = hex(15);
    ctx.fillRect(px + 2, py + 5, 5, 2);
    ctx.fillRect(px + 9, py + 2, 5, 2);
    ctx.fillStyle = hex(14);
    ctx.fillRect(px + 2, py + 6, 4, 1);
    ctx.fillRect(px + 9, py + 3, 4, 1);
    // Krone: gruppierte dunkle Blattflaechen 3x2.
    ctx.fillStyle = hex(3);
    ctx.fillRect(px + 1, py + 3, 4, 3);
    ctx.fillRect(px + 12, py + 1, 3, 3);
    ctx.fillStyle = hex(4);
    ctx.fillRect(px + 2, py + 3, 2, 1);
    ctx.fillRect(px + 12, py + 1, 2, 1);
    if (rnd > 0.5) {
      ctx.fillStyle = hex(3);
      ctx.fillRect(px + 8, py, 3, 2);
      ctx.fillStyle = hex(5);
      ctx.fillRect(px + 8, py, 1, 1);
    }
  } else if (kind === "grave") {
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 4, py + 3, 8, 11);
    ctx.fillStyle = hex(6);
    ctx.fillRect(px + 5, py + 4, 6, 9);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 5, py + 4, 2, 7);
    ctx.fillStyle = hex(8);
    ctx.fillRect(px + 8, py + 7, 1, 4);
    ctx.fillRect(px + 7, py + 8, 3, 1);
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 3, py + 12, 10, 2);
    ctx.fillStyle = hex(30);
    ctx.fillRect(px + 3, py + 13, 3, 1);
    ctx.fillRect(px + 10, py + 13, 3, 1);
    // Kleiner schiefer Begleitgrabstein rechts + Gras davor.
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 12, py + 8, 4, 7);
    ctx.fillStyle = hex(6);
    ctx.fillRect(px + 12, py + 9, 3, 5);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 12, py + 9, 1, 3);
    ctx.fillStyle = hex(30);
    ctx.fillRect(px + 11, py + 14, 4, 2);
    ctx.fillStyle = hex(31);
    ctx.fillRect(px + 12, py + 14, 2, 1);
  } else if (kind === "stone") {
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 3, py + 6, 10, 7);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 4, py + 7, 8, 5);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 4, py + 7, 4, 2);
    ctx.fillStyle = hex(8);
    ctx.fillRect(px + 5, py + 7, 2, 1);
    ctx.fillStyle = hex(28);
    ctx.fillRect(px + 3, py + 12, 3, 1);
    ctx.fillStyle = hex(31);
    ctx.fillRect(px + 10, py + 11, 2, 1);
    // Begleitsteine + Grasbueschel: Steingruppe statt Einzelstein.
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 12, py + 9, 4, 4);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 13, py + 10, 3, 2);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 13, py + 10, 2, 1);
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 1, py + 11, 3, 3);
    ctx.fillStyle = hex(4);
    ctx.fillRect(px + 1, py + 12, 2, 2);
    ctx.fillStyle = hex(30);
    ctx.fillRect(px + 1, py + 14, 2, 2);
    ctx.fillStyle = hex(31);
    ctx.fillRect(px + 1, py + 14, 2, 1);
  } else if (kind === "ruin") {
    // Gebrochene Mauer aus massiven 5x4-Steinbloecken (5/7/8), 1-px-Kontur.
    const blocks = [
      [1, 6, 6, 5], [8, 7, 6, 4], [2, 11, 5, 3], [10, 11, 4, 3], [5, 2, 6, 4],
    ];
    ctx.fillStyle = hex(0);
    for (const [x, y, w, h] of blocks) ctx.fillRect(px + x - 1, py + y - 1, w + 2, h + 2);
    for (const [x, y, w, h] of blocks) {
      ctx.fillStyle = hex(5);
      ctx.fillRect(px + x, py + y, w, h);
      ctx.fillStyle = hex(7);
      ctx.fillRect(px + x, py + y, w, 1);
      ctx.fillRect(px + x, py + y, 1, h);
      ctx.fillStyle = hex(6);
      ctx.fillRect(px + x + w - 2, py + y + h - 2, 2, 2);
    }
    ctx.fillStyle = hex(29);
    ctx.fillRect(px + 6, py + 6, 2, 2);
    ctx.fillRect(px + 9, py + 10, 2, 2);
    ctx.fillStyle = hex(28);
    ctx.fillRect(px + 6, py + 7, 1, 1);
    ctx.fillRect(px + 9, py + 11, 1, 1);
  } else {
    // Laternenpfahl mit Lichtpool und Lichtkegel.
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 2, py + 13, 12, 3);
    ctx.fillRect(px + 3, py + 2, 9, 11);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 3, py + 13, 10, 2);
    ctx.fillStyle = hex(6);
    ctx.fillRect(px + 3, py + 13, 10, 1);
    ctx.fillStyle = hex(4);
    ctx.fillRect(px + 7, py + 8, 3, 5);
    ctx.fillRect(px + 4, py + 2, 8, 2);
    ctx.fillRect(px + 10, py + 4, 2, 4);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 7, py + 8, 1, 5);
    ctx.fillRect(px + 4, py + 2, 8, 1);
    ctx.fillStyle = hex(20);
    ctx.fillRect(px + 5, py + 4, 5, 3);
    ctx.fillStyle = hex(21);
    ctx.fillRect(px + 6, py + 4, 3, 3);
    ctx.fillStyle = hex(13);
    ctx.fillRect(px + 6, py + 4, 2, 2);
    // Lichtpool: weicher 3-stufiger Verlauf (19/18/17), kein harter 13-Kern.
    const pool: Array<[number, number, number]> = [[6, 19, 2], [5, 18, 2], [3, 17, 2]];
    for (const [hw, col, rows] of pool) {
      ctx.fillStyle = hex(col);
      for (let iy = 0; iy < rows; iy++) {
        ctx.fillRect(px + 8 - hw, py + 14 + iy, hw * 2 + 1, 1);
      }
    }
    ctx.fillStyle = hex(18);
    ctx.fillRect(px + 6, py + 14, 5, 1);
    ctx.fillStyle = hex(22);
    ctx.fillRect(px + 8, py + 14, 1, 1);
    for (let i = 0; i < 4; i++) {
      const w = 3 + i * 2;
      ctx.fillStyle = hex(i < 2 ? 19 : 20);
      ctx.fillRect(px + 8 - Math.floor(w / 2), py + 7 + i, w, 1);
    }
    // Kleine Stein-/Grasgruppe am Sockel (Laterne steht nicht allein).
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 12, py + 11, 3, 3);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 12, py + 12, 2, 2);
    ctx.fillStyle = hex(30);
    ctx.fillRect(px + 1, py + 14, 3, 2);
    ctx.fillStyle = hex(31);
    ctx.fillRect(px + 1, py + 14, 2, 1);
  }
}
