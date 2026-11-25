import { PAL } from "../palette";
import { TILE } from "../config";

export type TileKind = "grass" | "path" | "water" | "mud";

function hex(i: number): string {
  return "#" + PAL[i].toString(16).padStart(6, "0");
}

/** Deterministischer 0..1-Hash pro Weltkachel. */
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

/** Malt eine 16x16-Kachel (Basis + Detail) in den Chunk-Canvas. */
export function paintTile(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  kind: TileKind,
  tx: number,
  ty: number,
  seed: number,
): void {
  const rnd = tileHash(tx, ty, seed + 77);
  const rnd2 = tileHash(tx + 13, ty - 7, seed + 91);

  if (kind === "water") {
    ctx.fillStyle = hex(4);
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = hex(3);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(px + Math.floor(tileHash(tx + i * 5, ty, seed) * 12), py + Math.floor(tileHash(tx, ty + i * 7, seed) * 12), 3, 2);
    }
    ctx.fillStyle = hex(5);
    for (let i = 0; i < 3; i++) {
      const wx = px + Math.floor(rnd * 12) + 2;
      const wy = py + Math.floor(rnd2 * 12) + 2;
      ctx.fillRect(wx, wy, 3, 1);
    }
    return;
  }
  if (kind === "mud") {
    ctx.fillStyle = hex(28);
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = hex(29);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(px + Math.floor(tileHash(tx + i, ty, seed) * 13), py + Math.floor(tileHash(tx, ty + i, seed) * 13), 3, 2);
    }
    ctx.fillStyle = hex(30);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(px + 2 + Math.floor(tileHash(tx + i, ty, seed) * 11), py + 2 + Math.floor(tileHash(tx, ty + i, seed) * 11), 2, 2);
    }
    return;
  }
  if (kind === "path") {
    ctx.fillStyle = hex(15);
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = hex(14);
    for (let i = 0; i < 5; i++) {
      const dx = Math.floor(tileHash(tx + i * 3, ty, seed) * 14);
      const dy = Math.floor(tileHash(tx, ty + i * 5, seed) * 14);
      ctx.fillRect(px + dx, py + dy, 2, 1);
    }
    ctx.fillStyle = hex(16);
    for (let i = 0; i < 2; i++) {
      ctx.fillRect(px + Math.floor(tileHash(tx, ty + i * 9, seed) * 13), py + Math.floor(tileHash(tx + i, ty, seed) * 13), 2, 1);
    }
    return;
  }

  // Moorgras: ruhige, gleichmäßige Fläche (keine Kachel-Rauschflecken).
  ctx.fillStyle = hex(29);
  ctx.fillRect(px, py, TILE, TILE);
  // Grasbüschel in 2x2-Blöcken gruppiert: eine Stelle pro Block, nicht pro Kachel.
  const blockX = Math.floor(tx / 2);
  const blockY = Math.floor(ty / 2);
  const tuft = tileHash(blockX, blockY, seed + 911);
  if (tx % 2 === 0 && ty % 2 === 0 && tuft > 0.62) {
    const bx = px + 4 + Math.floor(tileHash(blockX, blockY, seed + 17) * 6);
    const by = py + 6 + Math.floor(tileHash(blockY, blockX, seed + 29) * 5);
    ctx.fillStyle = hex(30);
    ctx.fillRect(bx, by, 1, 3);
    ctx.fillRect(bx + 2, by + 1, 1, 2);
    ctx.fillRect(bx + 4, by, 1, 3);
    ctx.fillStyle = hex(28);
    ctx.fillRect(bx - 1, by + 2, 6, 1);
  }
  // Seltene Lichtblüte, ebenfalls blockgebunden.
  if (tx % 2 === 1 && ty % 2 === 1 && tuft > 0.95) {
    ctx.fillStyle = hex(31);
    ctx.fillRect(px + 5 + Math.floor(rnd2 * 6), py + 4 + Math.floor(rnd * 7), 1, 1);
  }
}

export type DecorKind = "tree" | "grave" | "stone" | "ruin" | "post";

/**
 * Weiche, unregelmäßige Übergänge an Wasser-/Moor-/Wegrändern (Mini-Autotiling
 * ohne Tileset-Randtiles): Graspixel knabbern die harte Kachelkante an.
 */
export function paintEdges(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  kind: TileKind,
  neighbors: { up: TileKind; down: TileKind; left: TileKind; right: TileKind },
  tx: number,
  ty: number,
  seed: number,
): void {
  if (kind === "grass") return;
  const edges: { side: keyof typeof neighbors; dx: number; dy: number }[] = [
    { side: "up", dx: 0, dy: 1 },
    { side: "down", dx: 0, dy: -1 },
    { side: "left", dx: 1, dy: 0 },
    { side: "right", dx: -1, dy: 0 },
  ];
  for (const edge of edges) {
    if (neighbors[edge.side] === kind) continue;
    for (let i = 0; i < TILE; i++) {
      const h = tileHash(tx * 3 + i, ty * 5 + edge.dx + edge.dy, seed + 555);
      if (h < 0.45) continue;
      const depth = 1 + Math.floor(h * 3);
      const color = h > 0.8 ? 28 : h > 0.6 ? 30 : 29;
      ctx.fillStyle = hex(color);
      if (edge.side === "up") ctx.fillRect(px + i, py, 1, depth);
      else if (edge.side === "down") ctx.fillRect(px + i, py + TILE - depth, 1, depth);
      else if (edge.side === "left") ctx.fillRect(px, py + i, depth, 1);
      else ctx.fillRect(px + TILE - depth, py + i, depth, 1);
    }
  }
}

/** Dekoration, direkt in die Chunk-Kachel gemalt. */
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
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 6, py + 8, 4, 7);
    ctx.fillStyle = hex(16);
    ctx.fillRect(px + 7, py + 9, 2, 6);
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 2, py + 2, 12, 9);
    ctx.fillStyle = hex(29);
    ctx.fillRect(px + 3, py + 3, 10, 7);
    ctx.fillStyle = hex(28);
    ctx.fillRect(px + 3, py + 7, 9, 3);
    ctx.fillStyle = hex(30);
    ctx.fillRect(px + 4, py + 3, 5, 2);
    ctx.fillRect(px + 10, py + 5, 2, 2);
    if (rnd > 0.5) { ctx.fillStyle = hex(0); ctx.fillRect(px + 4, py + 1, 2, 3); }
  } else if (kind === "grave") {
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 5, py + 4, 7, 10);
    ctx.fillStyle = hex(6);
    ctx.fillRect(px + 6, py + 5, 5, 8);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 7, py + 5, 2, 6);
    ctx.fillStyle = hex(10);
    ctx.fillRect(px + 8, py + 7, 1, 3);
    ctx.fillRect(px + 7, py + 8, 3, 1);
    ctx.fillStyle = hex(29);
    ctx.fillRect(px + 4, py + 13, 9, 2);
  } else if (kind === "stone") {
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 4, py + 7, 9, 6);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 5, py + 8, 7, 4);
    ctx.fillStyle = hex(8);
    ctx.fillRect(px + 6, py + 8, 4, 2);
    ctx.fillStyle = hex(28);
    ctx.fillRect(px + 3, py + 13, 11, 1);
  } else if (kind === "ruin") {
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 3, py + 5, 3, 10);
    ctx.fillRect(px + 10, py + 7, 3, 8);
    ctx.fillStyle = hex(5);
    ctx.fillRect(px + 4, py + 6, 1, 8);
    ctx.fillRect(px + 11, py + 8, 1, 6);
    ctx.fillStyle = hex(7);
    ctx.fillRect(px + 3, py + 5, 3, 1);
    ctx.fillRect(px + 10, py + 7, 3, 1);
  } else {
    // Laternenpfahl
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 7, py + 3, 3, 12);
    ctx.fillStyle = hex(16);
    ctx.fillRect(px + 8, py + 4, 1, 10);
    ctx.fillStyle = hex(0);
    ctx.fillRect(px + 5, py + 1, 7, 5);
    ctx.fillStyle = hex(20);
    ctx.fillRect(px + 6, py + 2, 5, 3);
    ctx.fillStyle = hex(21);
    ctx.fillRect(px + 7, py + 2, 3, 2);
    ctx.fillStyle = hex(13);
    ctx.fillRect(px + 8, py + 3, 1, 1);
  }
}
