// Terrain-Schwarz-Pixel-Guard (Lane m10-terrain-hole-guard, K2+K3):
// geteilte Prüffunktion für scripts/verify-terrain.mjs (Browser-Lauf) und
// tests/terrain-coverage.test.ts (Fixture-Suite). Prüft auf zusammenhängende
// reine Schwarz-Flächen (r,g,b < BLACK_RGB_MAX) im Spielfeld-Rect —
// das feste Abnahme-Kriterium „kein Pixel der Spielfläche ohne Terrain“.
// Kein Phaser-/Browser-Bezug: reine Funktionen über dekodierte Pixel.
import { inflateSync } from "node:zlib";

/** Pixel gilt als reines Schwarz, wenn r,g,b alle < 6 (HUD misst (6,7,12)+). */
export const BLACK_RGB_MAX = 6;
/**
 * Mindestfläche zusammenhängender Schwarz-Pixel, ab der ein Befund zählt.
 * Kalibrierung (docs/lanes/m10-terrain-hole-guard.md K1): größter legitimer
 * Schwarz-Cluster in echten Shots = 135 px (Prop-Schatten, late-1920) —
 * 300 px trennt mit Sicherheitsabstand, ein echter Defect (Streifen/
 * Letterbox) liegt im mehrere-Tausend-px-Bereich.
 */
export const MIN_REGION_PX = 300;
/**
 * Obere HUD-Leiste in Spiel-Pixeln (Blacklist, src/scenes/UI.ts): Leiste
 * y=0..12, XP-Zeile y=8..12, HP-Rahmen y=15..24 — +Toleranz = 34.
 */
export const HUD_GAME_PX = 34;
/** Spiel-Basisbreite (src/config.ts) für HUD-Skalierung in Bildschirm-Pixel. */
export const GAME_BASE_WIDTH = 640;

/** Obere Blacklist-Grenze in Bildschirm-Pixeln für eine Bildbreite. */
export function playfieldTopPx(width, gameWidth = GAME_BASE_WIDTH) {
  return Math.ceil((HUD_GAME_PX * width) / gameWidth);
}

// ---- Minimaler PNG-Decoder (8-bit RGB/RGBA, non-interlaced) ----
// Muster aus scripts/m10-hazard-warn.mjs (repo-eigen, keine Abhängigkeit).
export function decodePng(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error("Kein PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`PNG nicht unterstuetzt: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) cur[i] = raw[rowStart + 1 + i];
    const paeth = (a, b, c) => {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prev[i];
      const ul = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) cur[i] = (cur[i] + left) & 255;
      else if (filter === 2) cur[i] = (cur[i] + up) & 255;
      else if (filter === 3) cur[i] = (cur[i] + ((left + up) >> 1)) & 255;
      else if (filter === 4) cur[i] = (cur[i] + paeth(left, up, ul)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

/**
 * Sucht zusammenhängende reine Schwarz-Flächen (4-Nachbarn) im Spielfeld-Rect.
 * img: { width, height, data (RGBA) }. opts:
 *   blackMax    — Schwelle, Pixel ist Schwarz wenn r,g,b < blackMax (6)
 *   minArea     — Regionen < minArea px zählen nicht als Befund (300)
 *   topExcludePx — obere Blacklist-Grenze in Bildschirm-Pixeln (HUD)
 * Liefert { width, height, topExcludePx, blackPx, maxRegion, regions, ok }.
 * regions: alle Befunde ≥ 1 px (absteigend, max 20), ok: keine ≥ minArea.
 */
export function analyzeCoverage(img, opts = {}) {
  const blackMax = opts.blackMax ?? BLACK_RGB_MAX;
  const minArea = opts.minArea ?? MIN_REGION_PX;
  const top = Math.max(0, Math.min(opts.topExcludePx ?? 0, img.height));
  const { width, height } = img;
  const isBlack = (x, y) => {
    const i = (y * width + x) * 4;
    return img.data[i] < blackMax && img.data[i + 1] < blackMax && img.data[i + 2] < blackMax;
  };
  const seen = new Uint8Array(width * height);
  const regions = [];
  let blackPx = 0;
  for (let start = 0; start < width * height; start++) {
    if (seen[start]) continue;
    const sx = start % width, sy = (start / width) | 0;
    if (!isBlack(sx, sy)) continue;
    // Flood fill über den kompletten Cluster; nur Pixel im Spielfeld zählen.
    const stack = [start];
    seen[start] = 1;
    let area = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p / width) | 0;
      if (y < top) continue; // Blacklist-Anteil: nicht zählen, weiter futen
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && !seen[p - 1] && isBlack(x - 1, y)) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < width - 1 && !seen[p + 1] && isBlack(x + 1, y)) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && !seen[p - width] && isBlack(x, y - 1)) { seen[p - width] = 1; stack.push(p - width); }
      if (y < height - 1 && !seen[p + width] && isBlack(x, y + 1)) { seen[p + width] = 1; stack.push(p + width); }
    }
    blackPx += area;
    if (area > 0) {
      regions.push({ area, minX, minY, maxX, maxY });
    }
  }
  regions.sort((a, b) => b.area - a.area);
  const findings = regions.filter((r) => r.area >= minArea);
  return {
    width,
    height,
    topExcludePx: top,
    blackPx,
    maxRegion: regions.length ? regions[0].area : 0,
    regions: regions.slice(0, 20),
    ok: findings.length === 0,
    findings,
  };
}

/** Convenience für einen Screenshot-Buffer: dekodieren + analysieren. */
export function checkScreenshot(buf, opts = {}) {
  const img = decodePng(buf);
  if (opts.topExcludePx === undefined) {
    return analyzeCoverage(img, { ...opts, topExcludePx: playfieldTopPx(img.width) });
  }
  return analyzeCoverage(img, opts);
}
