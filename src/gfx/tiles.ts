import { PAL } from "../palette";
import { TILE } from "../config";
import { blobMask, cornerMask, missingSides, normalizeBlob } from "../logic/autotile";

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

/** Weiches Value-Noise (0..1). */
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

/** Zwei Oktaven: grobe Form + leichte Auflockerung, ohne 1-px-Rauschen. */
export function fbm(x: number, y: number, scale: number, seed: number): number {
  return valueNoise(x, y, scale, seed) * 0.7 + valueNoise(x + 137, y - 91, scale * 0.47, seed + 19) * 0.3;
}

export interface TerrainSample {
  kind: TileKind;
  /** 0 = dunkel, 1 = Basis, 2 = hell (Gras-/Moorschattierung). */
  shade: 0 | 1 | 2;
  /** Gehört zu einer hellen Grasinsel (feine Aufhellung + Büschel). */
  light: boolean;
  /** Seetiefe (nur bei Wasser sinnvoll, 0 = Ufer, kleiner = tiefer). */
  depth: number;
  /** Alternativer Nachbarton an einer Bandkante (Painter dithert per Hash). */
  alt?: 0 | 1 | 2;
}

/**
 * Animationsstufen des prozeduralen Tile-Pfads: Wasser-Wellen driften,
 * Ufer-Schaum und Tiefen-Glisser wechseln ihre Stellen. Der Chunk-Maler
 * (terrainWorker) malt alle Stufen; der GroundRenderer zyklisiert sie.
 * Jede Stufe ist deterministisch aus tileHash abgeleitet — kein Zustand,
 * keine Abhängigkeit von der Mal-Reihenfolge.
 */
export const WATER_ANIM_STEPS = 3;

/**
 * Enthält der Bereich Wasser (grobe 4-px-Abtastung)? Der Worker malt nur
 * dann alle Animationsstufen; reine Land-Chunks bleiben Einzel-Frame
 * (Speicher: eine 256-px-Stufe statt dreien).
 */
export function areaHasWater(ox: number, oy: number, w: number, h: number, seed: number, worldSize: number): boolean {
  for (let y = oy; y < oy + h; y += 4) {
    for (let x = ox; x < ox + w; x += 4) {
      if (terrainSampleAt(x, y, seed, worldSize).kind === "water") return true;
    }
  }
  return false;
}

/**
 * Terrain-Art an einer Weltposition. Regionen entstehen aus domain-warpten
 * Noise-Feldern (keine Rechtecke/Kacheln); Wege sind schmale, ausgefranste
 * Pfade. Die Klassifikation ist weltverankert und chunk-unabhängig.
 */
export function terrainSampleAt(wx: number, wy: number, seed: number, worldSize: number): TerrainSample {
  // Float-Queries snappen auf das Tile, das den Punkt enthält (Tile-Mitte via
  // Math.floor): Spiel-Logik-Queries (Wasser-Slow, Spawns, Debug, Kanten-Scan
  // über Subpixel-Offsets) und die gemalten Pixel-Zellen des Painters liefern
  // dann dieselbe Klassifikation — keine fraktionalen Mischzellen an Kanten.
  // Ganzzahlige Aufrufe (paintTerrain, terrainMaskAt, areaHasWater, Wasser-Pfad)
  // bleiben bitgleich: Math.floor ist dort die Identität. terrainKindAt()
  // delegiert hierher und erbt den Snap.
  wx = Math.floor(wx);
  wy = Math.floor(wy);
  // Domain-Warp: verzerrt die Felder zu unregelmäßigen, weichen Formen.
  const warpX = (valueNoise(wx, wy, 104, seed + 21) - 0.5) * 66;
  const warpY = (valueNoise(wx + 517, wy - 311, 97, seed + 22) - 0.5) * 66;
  const fx = wx + warpX;
  const fy = wy + warpY;

  // Seen: große weiche Flächen, plus seltene kleine Moorlöcher.
  const lake = fbm(fx, fy, 168, seed + 3);
  const pool = fbm(fx + 71, fy - 23, 58, seed + 13);
  const water = lake < 0.245 || (pool < 0.115 && lake < 0.36);

  if (water) {
    const shade = fbm(wx, wy, 36, seed + 17) < 0.42 ? 0 : 1;
    return { kind: "water", shade, light: false, depth: lake };
  }

  // Schlammmulden bleiben, aber kein geschlossener Braunring um jeden See:
  // die Uferbank wird stattdessen im Painter als 1 px Torf + Moos 28/29 gesetzt.
  const mudField = fbm(fx - 83, fy + 47, 61, seed + 5);
  const mud = mudField < 0.17;

  // Gewundene Pfade: zwei schmale, ausgefranste Spuren.
  const c = worldSize / 2;
  // Breite variiert alle 8–12 px um ±2 px (grosse + feine Okt-Oktave),
  // damit der Weg nicht als gleichs Band mit konstanter Breite läuft.
  const edge = (valueNoise(wx, wy, 13, seed + 7) - 0.5) * 10
    + (valueNoise(wx + 41, wy - 17, 4.5, seed + 131) - 0.5) * 4;
  const pathY = c + Math.sin(wx * 0.0031 + 0.4) * 302 + Math.sin(wx * 0.0007) * 96;
  const pathX = c + Math.sin(wy * 0.0026 - 0.9) * 246;
  const halfA = 7 + edge;
  const halfB = 5.5 + edge * 0.7;
  const onPath = Math.abs(wy - pathY) < halfA || Math.abs(wx - pathX) < halfB;
  if (onPath) {
    const shade: 0 | 1 | 2 = 1;
    return { kind: "path", shade, light: false, depth: lake };
  }

  if (mud) {
    const shade = fbm(wx + 211, wy - 87, 29, seed + 29) < 0.4 ? 0 : 1;
    return { kind: "mud", shade, light: false, depth: lake };
  }

  // Gras: weiche Schattierung + helle Inseln. Die Bandgrenzen werden
  // pro Pixel gedithert statt hart geschnitten (keine Tarnflecken).
  const g = fbm(wx, wy, 43, seed + 911);
  const shade: 0 | 1 | 2 = g < 0.33 ? 0 : g > 0.67 ? 2 : 1;
  const light = fbm(fx + 33, fy - 63, 76, seed + 33) > 0.60;
  // Band-Kanten: der Painter waehlt per Hash zwischen shade und alt.
  let alt: 0 | 1 | 2 | undefined;
  if (Math.abs(g - 0.33) < 0.035) alt = g < 0.33 ? 1 : 0;
  else if (Math.abs(g - 0.67) < 0.035) alt = g < 0.67 ? 2 : 1;
  return { kind: "grass", shade, light, depth: lake, alt };
}

/** Nur die Art (für Wasser-Slow/Spritzer). */
export function terrainKindAt(wx: number, wy: number, seed: number, worldSize: number): TileKind {
  return terrainSampleAt(wx, wy, seed, worldSize).kind;
}

/**
 * Terrain-Pixel: Grundflächen, Wang-Autotiling (Blob-47-Normalform pro Pixel)
 * zwischen Gras/Schlamm/Weg/Wasser und gruppierte Details.
 *
 * `patch` ist die helle Grasinsel (wird intern wie Gras behandelt).
 */
export function paintTerrain(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  seed: number,
  worldSize: number,
  animStep = 0,
  destY = 0,
): void {
  const pad = 3;
  const bw = w + pad * 2;
  const bh = h + pad * 2;
  const kinds = new Uint8Array(bw * bh);
  const shade = new Uint8Array(bw * bh);
  const light = new Uint8Array(bw * bh);
  const depth = new Float32Array(bw * bh);
  const altShade = new Int8Array(bw * bh).fill(-1);

  const code = (k: TileKind): number =>
    k === "water" ? 3 : k === "mud" ? 2 : k === "path" ? 1 : 0;
  const codeAt = (x: number, y: number): number => kinds[(y + pad) * bw + (x + pad)];

  // 1) Klassifikation inkl. 3-px-Rand (für 2-px-Ränder + Ecken).
  for (let y = -pad; y < h + pad; y++) {
    for (let x = -pad; x < w + pad; x++) {
      const wx = ox + x;
      const wy = oy + y;
      const s = terrainSampleAt(wx, wy, seed, worldSize);
      const i = (y + pad) * bw + (x + pad);
      kinds[i] = code(s.kind);
      shade[i] = s.shade;
      light[i] = s.light ? 1 : 0;
      depth[i] = s.depth;
      altShade[i] = s.alt ?? -1;
    }
  }

  const grassColor = (i: number, wx: number, wy: number): number => {
    let sh = shade[i];
    const alt = altShade[i];
    if (alt >= 0 && tileHash(wx, wy, seed + 925) > 0.45) sh = alt;
    if (light[i]) return sh === 0 ? 29 : 30;
    return sh === 0 ? 28 : sh === 2 ? 30 : 29;
  };

  // 2) Grundfarben in einen Pixelpuffer (ein putImageData statt 65k fillRect).
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const rgb = (i: number): [number, number, number] => [
    (PAL[i] >> 16) & 255, (PAL[i] >> 8) & 255, PAL[i] & 255,
  ];
  const colorCache = new Map<number, [number, number, number]>();
  const colOf = (i: number): [number, number, number] => {
    let c = colorCache.get(i);
    if (!c) {
      c = rgb(i);
      colorCache.set(i, c);
    }
    return c;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + pad) * bw + (x + pad);
      const k = codeAt(x, y);
      const wx = ox + x;
      const wy = oy + y;
      let col: number;
      if (k === 3) {
        // Water: Mittellage blueGrey(5), tiefe Becken night(2); die
        // Bandgrenze wird pro Pixel gedithert.
        const dn = (tileHash(wx, wy, seed + 923) - 0.5) * 0.03;
        const dv = depth[i] + dn;
        col = dv < 0.095 ? 2 : dv < 0.15 ? 4 : 5;
        // Tiefen-Glisser: sparsame 2-px-Funken in offenem Wasser, die pro
        // Stufe ihren Platz wechseln (Paar-Hash, kein 1-px-Pfeffer).
        if (dv >= 0.15) {
          const g = tileHash(Math.floor(wx / 2) + animStep * 53, wy, seed + 931);
          if (g > 0.986) col = 6;
        }
      } else if (k === 2) {
        // Schlamm: dunkles, nasses Moor (3/14/15), kein großer Glutbraun-Block.
        const n = fbm(wx + 300, wy - 90, 26, seed + 5);
        col = n < 0.5 ? 3 : n < 0.78 ? 14 : 15;
      } else if (k === 1) {
        const n = fbm(wx + 130, wy + 60, 28, seed + 41);
        // Erdweg: dunkler, matter Pfad (15), 16 nur als Flecken.
        col = n < 0.3 ? 14 : n > 0.82 ? 16 : 15;
      } else {
        col = grassColor(i, wx, wy);
      }
      const [r, g, b] = colOf(col);
      const o = (y * w + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  // putImageData ignoriert die Canvas-Transform: der Sync-Fallback verschiebt
  // fillRect per translate und die Basis per destY — beide Faktoren gehoeren
  // zusammen (jeweils f * CHUNK_SIZE) und muessen synced bleiben.
  ctx.putImageData(img, 0, destY);

  // 3) Autotiling-Kanten. Reihenfolge: Weg-, Schlamm-, Grasinsel-Kanten,
  //    dann Wasserbank (landseitig) und Wasserufer (wasserseitig).
  const setPx = (x: number, y: number, col: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    ctx.fillStyle = hex(col);
    ctx.fillRect(x, y, 1, 1);
  };
  const maskAt = (x: number, y: number, k: number): number =>
    normalizeBlob(blobMask((dx, dy) => codeAt(x + dx, y + dy) === k));
  const atDist = (x: number, y: number, dist: number, k: number): boolean => {
    for (let dy = -dist; dy <= dist; dy++) {
      for (let dx = -dist; dx <= dist; dx++) {
        if (Math.abs(dx) !== dist && Math.abs(dy) !== dist) continue;
        if (codeAt(x + dx, y + dy) === k) return true;
      }
    }
    return false;
  };

  // Wegkanten: 1 px dunkler Saum, 2 px Übergangston; Ecken über cornerMask.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (codeAt(x, y) !== 1) continue;
      const m = maskAt(x, y, 1);
      if (m === 0xff) continue;
      const miss = missingSides(m);
      // Grasiger Saum als 2-px-Bloecke (kein 1-px-Pfeffer): helle
      // Moosspitzen oben-links, dunkles Moos unten-rechts, dazw Erd.
      const bx = tileHash(Math.floor((ox + x) / 2), Math.floor((oy + y) / 2), seed + 191);
      const cluster = tileHash(Math.floor((ox + x) / 6), Math.floor((oy + y) / 6), seed + 193);
      if (cluster > 0.55) {
        setPx(x, y, bx > 0.5 ? 30 : 29);
      } else if ((miss.n || miss.w) && bx > 0.42) {
        setPx(x, y, 29);
      } else if (bx > 0.62) {
        setPx(x, y, 28);
      } else {
        setPx(x, y, 14);
      }
    }
  }

  // Weg-Ausfransung: per-Pixel kriecht Erde 1 px ins Gras,
  // oben-links punktuell 16 als Lichtkante, sonst 15 und 14.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (codeAt(x, y) !== 0) continue;
      if (!atDist(x, y, 1, 1)) continue;
      if (tileHash(ox + x, oy + y, seed + 197) < 0.52) continue;
      const e = tileHash(ox + x, oy + y, seed + 199);
      setPx(x, y, e > 0.72 ? 14 : e > 0.34 ? 15 : 16);
    }
  }

  // Weg-Innenkante: Licht oben-links (16), Schatten unten-rechts (14),
  // nur auf dem zweiten Ring, damit der Saum weich bleibt.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (codeAt(x, y) !== 1) continue;
      if (atDist(x, y, 2, 1)) continue;
      const north = codeAt(x, y - 1) !== 1 || codeAt(x - 1, y) !== 1;
      const south = codeAt(x, y + 1) !== 1 || codeAt(x + 1, y) !== 1;
      if (north && tileHash(ox + x, oy + y, seed + 201) > 0.35) setPx(x, y, 16);
      else if (south && tileHash(ox + x, oy + y, seed + 203) > 0.35) setPx(x, y, 14);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (codeAt(x, y) !== 2) continue;
      const m = maskAt(x, y, 2);
      if (m === 0xff) continue;
      const miss = missingSides(m);
      const cor = cornerMask(m);
      if (miss.n || miss.w || cor & 9) setPx(x, y, 15);
      else if (miss.s || miss.e || cor & 6) setPx(x, y, 14);
      else if (atDist(x, y, 2, 2) === false) setPx(x, y, 14);
    }
  }

  // Helle Grasinseln: 1-px-Übergang 29 an der Kante, innen ruhig 30/31.
  const lightAt = (x: number, y: number): boolean => light[(y + pad) * bw + (x + pad)] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + pad) * bw + (x + pad);
      if (codeAt(x, y) !== 0 || !light[i]) continue;
      const edge = !lightAt(x - 1, y) || !lightAt(x + 1, y) || !lightAt(x, y - 1) || !lightAt(x, y + 1);
      if (edge) setPx(x, y, 29);
    }
  }

  // Wasserbank (Land): schmaler feuchter Torf/Moos-Saum von 1-2 px.
  // Per-Pixel-Koernung statt 4-px-Bloecken, damit das Ufer ausgefranst wirkt.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = codeAt(x, y);
      if (k === 3) continue;
      const hsh = tileHash(ox + x, oy + y, seed + 211);
      const wet = valueNoise(ox + x, oy + y, 11, seed + 213);
      if (atDist(x, y, 1, 3)) {
        setPx(x, y, hsh > 0.55 ? 30 : hsh > 0.24 ? 29 : 28);
      } else if (atDist(x, y, 2, 3) && wet > 0.52) {
        setPx(x, y, hsh > 0.5 ? 29 : 28);
      } else if (atDist(x, y, 3, 3) && wet > 0.72) {
        setPx(x, y, 28);
      }
    }
  }

  // Wasserufer (Wasser): saubere Tiefen-Staffel ohne Rauschpixel.
  // Oben-links 1-px-Highlight paleMist(9), darunter mist(8);
  // unten-rechts 2-px-Schatten nightDeep(1)/night(2), Mittellage 5.
  // Schaum-Puls: gehashte Stellen der Uferkante wechseln pro Stufe zwischen
  // paleMist(9) und mist(8) — die Kante schimmert, statt stillzustehen.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (codeAt(x, y) !== 3) continue;
      const n1 = codeAt(x, y - 1) !== 3;
      const e1 = codeAt(x + 1, y) !== 3;
      const s1 = codeAt(x, y + 1) !== 3;
      const w1 = codeAt(x - 1, y) !== 3;
      const n2 = codeAt(x, y - 2) !== 3;
      const e2 = codeAt(x + 2, y) !== 3;
      const s2 = codeAt(x, y + 2) !== 3;
      const w2 = codeAt(x - 2, y) !== 3;
      if (n1 || w1) {
        // Weiche 1-px-Schale statt geschlossener Leuchtlinie: die Kante wird
        // gehasht aufgeloekert (9/7) und pulsiert je Stufe zwischen 9 und 8 —
        // Land->Wasser wirkt gesoftet, nicht hart abgeschnitten.
        const h = tileHash(ox + x, oy + y, seed + 929);
        if ((animStep + Math.floor(h * WATER_ANIM_STEPS)) % WATER_ANIM_STEPS === 0) setPx(x, y, 8);
        else setPx(x, y, h > 0.85 ? 7 : 9);
      } else if (n2 || w2) setPx(x, y, 8);
      else if (s1 || e1) setPx(x, y, tileHash(ox + x, oy + y, seed + 933) > 0.3 ? 1 : 2);
      else if (s2 || e2) setPx(x, y, tileHash(ox + x, oy + y, seed + 935) > 0.45 ? 2 : 5);
    }
  }

  // 4) Gruppierte Details pro 16-px-Zelle, weltverankert.
  const startTx = Math.floor(ox / TILE);
  const startTy = Math.floor(oy / TILE);
  const cellsW = Math.ceil(w / TILE) + 1;
  const cellsH = Math.ceil(h / TILE) + 1;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tx = startTx + cx;
      const ty = startTy + cy;
      const px = tx * TILE - ox;
      const py = ty * TILE - oy;
      const gx = tx * TILE + 8 - ox + pad;
      const gy = ty * TILE + 8 - oy + pad;
      // Die Extra-Zelle am Chunkrand darf nicht in die naechste Zeile zeigen.
      if (gx < 0 || gx >= bw || gy < 0 || gy >= bh) continue;
      const i = gy * bw + gx;
      const k = kinds[i];
      const r = tileHash(tx, ty, seed + 77);

      if (k === 0) {
        // Grasbueschel nur in 2x2-Tile-Clustern; zwischen den bleibt Ruhe.
        const tuft = valueNoise(Math.floor(tx / 2) * 0.85 + 11, Math.floor(ty / 2) * 0.85 - 5, 2.6, seed + 413);
        if (tuft > 0.56 && r > 0.40) {
          const bx = px + 3 + Math.floor(tileHash(tx, ty, seed + 47) * 7);
          const by = py + 5 + Math.floor(tileHash(ty, tx, seed + 53) * 5);
          const stem = light[i] ? 31 : 30;
          const tip = light[i] ? 30 : 31;
          ctx.fillStyle = hex(stem);
          ctx.fillRect(bx, by, 2, 5);
          ctx.fillRect(bx + 4, by + 2, 2, 3);
          ctx.fillStyle = hex(tip);
          ctx.fillRect(bx, by, 2, 2);
          ctx.fillRect(bx + 4, by + 2, 2, 2);
          ctx.fillStyle = hex(28);
          ctx.fillRect(bx - 1, by + 5, 3, 1);
          ctx.fillRect(bx + 3, by + 5, 3, 1);
        }
        // Ruhige 2×2-Flecken in derselben Rampe (kein Einzelpixel).
        if (r > 0.74) {
          const sx = px + 2 + Math.floor(tileHash(tx, ty, seed + 401) * 11);
          const sy = py + 2 + Math.floor(tileHash(ty, tx, seed + 403) * 11);
          ctx.fillStyle = hex(light[i] ? (tileHash(tx + 1, ty + 1, seed + 405) > 0.5 ? 31 : 29) : (tileHash(tx + 1, ty + 1, seed + 405) > 0.5 ? 30 : 28));
          ctx.fillRect(sx, sy, 2, 2);
        }
        // Moosinseln: 3×2-Cluster aus einer zweiten, kleineren Noise-Oktave,
        // damit auch große hellen Flächen alle paar Kacheln Struktur bekommen.
        const moss = valueNoise(tx * 0.42 + 7, ty * 0.42 - 3, 1.9, seed + 421);
        if (moss > 0.66 && r > 0.36) {
          const mx = px + 2 + Math.floor(tileHash(tx + 5, ty + 9, seed + 423) * 10);
          const my = py + 3 + Math.floor(tileHash(ty + 7, tx + 2, seed + 427) * 9);
          ctx.fillStyle = hex(light[i] ? 29 : 28);
          ctx.fillRect(mx, my, 3, 2);
          ctx.fillStyle = hex(light[i] ? 31 : 30);
          ctx.fillRect(mx, my, 2, 1);
        }
        // Seltener kleiner Findling mit Schatten (3×2, gruppiert).
        if (valueNoise(Math.floor(tx / 3), Math.floor(ty / 3), 1.4, seed + 21) > 0.78 && r > 0.55) {
          ctx.fillStyle = hex(1);
          ctx.fillRect(px + 3, py + 11, 6, 2);
          ctx.fillStyle = hex(6);
          ctx.fillRect(px + 3, py + 9, 5, 3);
          ctx.fillStyle = hex(8);
          ctx.fillRect(px + 4, py + 9, 3, 1);
          ctx.fillStyle = hex(5);
          ctx.fillRect(px + 7, py + 11, 1, 1);
          ctx.fillStyle = hex(29);
          ctx.fillRect(px + 9, py + 12, 3, 2);
          ctx.fillStyle = hex(30);
          ctx.fillRect(px + 9, py + 12, 2, 1);
        }
      } else if (k === 3) {
        // Statische Wellen (Animation läuft als Sprite-Overlay):
        // 3–5-px-Segmente in 2 Tönen, pro Gruppe 4 px versetzt.
        // Kamm mist(8)/paleMist(9), Schattenseite fogBlue(6)/fog(7).
        // Nur ruhige Wasserflächen (≥4 px vom Ufer) bekommen Wellen.
        const cx0 = gx - pad;
        const cy0 = gy - pad;
        if (r > 0.42 && !atDist(cx0, cy0, 4, 3)) {
          const groups = r > 0.75 ? 3 : 2;
          for (let wv = 0; wv < groups; wv++) {
            // Wellen-Drift: jede Gruppe kriecht pro Stufe 1 px in ihre
            // Richtung (Richtung pro Gruppe gehasht) — Wellenzuege wandern.
            const dir = tileHash(tx + wv * 7, ty - wv * 3, seed + 901) > 0.5 ? 1 : -1;
            const drift = (((animStep * dir) % WATER_ANIM_STEPS) + WATER_ANIM_STEPS) % WATER_ANIM_STEPS - 1;
            const wx = px + 1 + drift + wv * 4 + Math.floor(tileHash(tx + wv, ty + 2, seed + 301) * 2);
            const wy = py + 2 + wv * 4 + Math.floor(tileHash(tx + 1, ty + wv, seed + 307) * 2);
            const wlen = 3 + Math.floor(tileHash(tx + wv, ty + 9, seed + 311) * 3);
            if (wv % 2 === 0) {
              ctx.fillStyle = hex(9);
              ctx.fillRect(wx, wy, wlen, 1);
              ctx.fillStyle = hex(8);
              ctx.fillRect(wx + 1, wy + 1, Math.max(2, wlen - 1), 1);
            } else {
              ctx.fillStyle = hex(7);
              ctx.fillRect(wx, wy, wlen, 1);
              ctx.fillStyle = hex(6);
              ctx.fillRect(wx + 1, wy + 1, Math.max(2, wlen - 1), 1);
            }
          }
        }
      } else if (k === 1) {
        // Kies: 3–4 kühle Steine als geschlossene 2×2-Gruppen mit
        // Lichtkante oben-links (5/6/8), keine 1-px-Sprenkel (kein Glutbraun).
        if (tileHash(Math.floor(tx / 2), Math.floor(ty / 2), seed + 61) > 0.62) {
          const stones = 3 + (tileHash(tx, ty, seed + 63) > 0.5 ? 1 : 0);
          for (let s = 0; s < stones; s++) {
            const sx = px + 2 + Math.floor(tileHash(tx + s, ty, seed + 67) * 10);
            const sy = py + 3 + Math.floor(tileHash(ty, tx + s, seed + 69) * 8);
            // Kiesel als geschlossene 2x2-Gruppe: 6-Koerper, 8-Licht, 5-Schatten.
            ctx.fillStyle = hex(6);
            ctx.fillRect(sx, sy, 2, 2);
            ctx.fillStyle = hex(8);
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillStyle = hex(5);
            ctx.fillRect(sx, sy + 1, 1, 1);
          }
          // Helle Erd 16/17 als 2x2-Inselflecken in der Wegmitte (2-3 px).
          if (r > 0.60) {
            const ix = px + 3 + Math.floor(tileHash(tx + 3, ty + 8, seed + 71) * 9);
            const iy = py + 4 + Math.floor(tileHash(ty + 8, tx + 3, seed + 73) * 7);
            ctx.fillStyle = hex(16);
            ctx.fillRect(ix, iy, 2, 2);
            ctx.fillStyle = hex(17);
            ctx.fillRect(ix, iy, 2, 1);
          }
        }
      } else if (k === 2) {
        // Feuchte Schlammklumpen: dunkler Torf statt Glut-Punkte.
        if (r > 0.55) {
          for (let b = 0; b < 3; b++) {
            const bx = px + 2 + Math.floor(tileHash(tx + 3, ty + b, seed + 63) * 10);
            const by = py + 3 + Math.floor(tileHash(ty + 5, tx + b, seed + 65) * 9);
            ctx.fillStyle = hex(1);
            ctx.fillRect(bx, by, 2, 2);
            ctx.fillStyle = hex(3);
            ctx.fillRect(bx, by, 1, 1);
            ctx.fillStyle = hex(28);
            ctx.fillRect(bx + 1, by, 1, 1);
          }
        }
      }
    }
  }
}

/** Nur für Tests/Debug: Kantenmaske einer Weltposition. */
export function terrainMaskAt(
  wx: number, wy: number, seed: number, worldSize: number, radius = 1,
): number {
  const own = terrainKindAt(wx, wy, seed, worldSize);
  return normalizeBlob(blobMask((dx, dy) =>
    terrainKindAt(wx + dx * radius, wy + dy * radius, seed, worldSize) === own));
}

export { normalizeBlob };
