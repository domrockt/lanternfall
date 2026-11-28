import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt zlib bereit.
import { deflateSync } from "node:zlib";
import {
  analyzeCoverage,
  checkScreenshot,
  decodePng,
  playfieldTopPx,
  MIN_REGION_PX,
} from "../scripts/terrain-coverage.mjs";

// Lane m10-terrain-hole-guard, Karte #8938: Fixture-Suite fuer den Terrain-
// Schwarz-Pixel-Guard (Kriterium „kein Pixel der Spielflaeche ohne Terrain“).
// Fixtures werden im Speicher als echte PNGs gebaut (minimaler Encoder unten,
// keine Binaerdateien im Repo) und durch denselben decodePng->analyzeCoverage-
// Pfad geschickt, den scripts/verify-terrain.mjs benutzt. Bekannt-gut -> ok,
// bekannt-lochig -> FAIL mit korrekter Region, HUD-Ausnahme und
// Mindestflaeche als dokumentierte Toleranzen.

// ---- Minimaler PNG-Encoder (8-bit RGB, non-interlaced, Filter 0). ----
const CRC_TABLE: number[] = (() => {
  const t = new Array(256).fill(0);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32be(v: number): Uint8Array {
  return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([...type].map((ch) => ch.charCodeAt(0)));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32be(data.length), 0);
  out.set(body, 4);
  out.set(u32be(crc32(body)), 4 + body.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  ihdr.set(u32be(width), 0);
  ihdr.set(u32be(height), 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const ro = y * (1 + width * 3);
    raw[ro] = 0; // Filter 0
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 3, di = ro + 1 + x * 3;
      raw[di] = rgb[si]; raw[di + 1] = rgb[si + 1]; raw[di + 2] = rgb[si + 2];
    }
  }
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}

/** Welt-Fixture: Dunkelgruen mit Vignette-artig abgedunkelter Ecke (aber >= 6)
 *  und reiner Schwarz-Leiste oben (HUD-Bereich, Blacklist). */
function worldFixture(width: number, height: number, paintHudBlack: boolean): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (paintHudBlack && y < 34) {
        rgb[i] = 0; rgb[i + 1] = 0; rgb[i + 2] = 0; // HUD-Leiste: reines Schwarz
        continue;
      }
      // Grundgruen mit dunkler Ecke unten links (Vignette, aber >= Schwelle).
      const corner = Math.max(0, 1 - Math.hypot(x, y - height) / 220);
      const base = 40 - corner * 30; // >= 10
      rgb[i] = Math.round(base * 0.75);
      rgb[i + 1] = Math.round(base);
      rgb[i + 2] = Math.round(base * 0.6);
    }
  }
  return encodePng(width, height, rgb);
}

function paintRect(png: Uint8Array, x0: number, y0: number, w: number, h: number): Uint8Array {
  const img = decodePng(png);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
    }
  }
  const rgb = new Uint8Array(img.width * img.height * 3);
  for (let p = 0; p < img.width * img.height; p++) {
    rgb[p * 3] = img.data[p * 4];
    rgb[p * 3 + 1] = img.data[p * 4 + 1];
    rgb[p * 3 + 2] = img.data[p * 4 + 2];
  }
  return encodePng(img.width, img.height, rgb);
}

const GOOD = worldFixture(640, 360, true);

describe("terrain-coverage: kein Pixel der Spielflaeche ohne Terrain", () => {
  it("playfieldTopPx skaliert die HUD-Blacklist (34 Spiel-px) auf die Bildbreite", () => {
    expect(playfieldTopPx(960)).toBe(51);
    expect(playfieldTopPx(1280)).toBe(68);
    expect(playfieldTopPx(1920)).toBe(102);
  });

  it("bekannt-gute Fixture (Weltgruen + Vignette + schwarzes HUD oben) ist ok", () => {
    const r = checkScreenshot(GOOD);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.maxRegion).toBe(0); // HUD-Schwarz zaehlt nicht (Blacklist)
    expect(r.blackPx).toBe(0);
  });

  it("bekannt-lochige Fixture (60x40 schwarzes Rect im Spielfeld) ist FAIL mit korrekter Region", () => {
    const hole = paintRect(GOOD, 300, 200, 60, 40);
    const r = checkScreenshot(hole);
    expect(r.ok).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ area: 2400, minX: 300, minY: 200, maxX: 359, maxY: 239 });
  });

  it("gleiches Loch in der HUD-Blacklist ist ok (dokumentierte Ausnahme)", () => {
    const hudHole = paintRect(GOOD, 100, 4, 60, 20); // y 4..24 < topExclude 34
    const r = checkScreenshot(hudHole);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it(`Loch unter der Mindestflaeche (${MIN_REGION_PX} px) ist ok, wird aber als Region gemeldet`, () => {
    const small = paintRect(GOOD, 400, 250, 12, 12); // 144 px < 300
    const r = checkScreenshot(small);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.regions[0].area).toBe(144);
  });

  it("Schwellen-Edgecase: (5,5,5) zaehlt als Schwarz, (6,7,12) (HUD-nah) und (6,6,6) nicht", () => {
    const r = analyzeCoverage({
      width: 4, height: 2,
      data: new Uint8Array([
        5, 5, 5, 255, 6, 7, 12, 255,
        5, 6, 5, 255, 6, 6, 6, 255,
      ]),
    }, { topExcludePx: 0 });
    expect(r.blackPx).toBe(1); // nur (5,5,5) — Schwelle ist strikt r,g,b < 6
    expect(r.regions[0].area).toBe(1);
  });

  it("Loch, das die HUD-Grenze schneidet, zaehlt nur den Spielfeld-Anteil", () => {
    // y 28..48 bei topExclude 34: 6 HUD-Reihen unzaehlig, 15 Spielfeld-Reihen
    // bleiben zusammenhaengend (4-Nachbarn) und bilden den Befund.
    const straddle = paintRect(GOOD, 300, 28, 60, 21);
    const r = checkScreenshot(straddle);
    expect(r.ok).toBe(false);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ area: 15 * 60, minX: 300, minY: 34, maxX: 359, maxY: 48 });
  });

  it("zwei getrennte Loecher erzeugen zwei Befunde (4-Nachbarn-Zusammenhang)", () => {
    let two = paintRect(GOOD, 60, 60, 30, 30);
    two = paintRect(two, 500, 100, 20, 20);
    const r = checkScreenshot(two);
    expect(r.ok).toBe(false);
    expect(r.findings.map((f) => f.area).sort((a, b) => b - a)).toEqual([900, 400]);
  });
});
