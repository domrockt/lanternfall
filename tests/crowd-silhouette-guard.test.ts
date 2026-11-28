import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

/**
 * Crowd-Silhouette-Guard (#10332): pinnt die hart erkämpften Chaos-Lesbarkeits-
 * Werte aus den gemergten Lanes als Suite-Schranke — BEVOR die Evo-FX-/Merge-
 * Welle (gen-fx/textures/FxSystem/CombatSystem/Run.ts) main umschreibt. Restpunkt
 * A10: "im Chaos verschwimmen einzelne Typen" / "Horde überlagert sich stark".
 *
 * Alle Schranken sind IST-Werte (keine Wunschwerte), verifiziert per
 * scripts/m10-silhouette-guard.mjs gegen den gemergten Stand
 * (Commit 8bc02b33, Vorher-JSON: ~/games/.evidence/m10-crowd-silhouette-guard/
 * m10-silhouette-guard-before.json). Browserfrei: nur Sprite-Grids.
 * Rebaseline bei GEWOLLTER Änderung: Skript laufen lassen, Werte + Beleg
 * aktualisieren, Schranken anheben — siehe docs/lanes/m10-crowd-silhouette-guard.md.
 *
 * Gepinnte Metriken (Quelle → Lane-Doku):
 *  M1 Kontur       (m10-chaos-silhouettes)  Rim-Band-Kontrast je Archetyp-Cluster
 *  M2 Elite-Rim    (m10-elite-rim)          Amber-Vollumrandung, beide Posen
 *  M3 Familien     (m10-enemy-palette)      strongFamilies >= 5 in der Chaos-Mischung
 *  M4 Varianten    (m10-crowd-variety + crowd-variant-tone)  Ton-Variante je Typ
 *  M5 Idle-Frames  (m10-enemy-idle-anim-r2) 4 Basis-/2 Rim-Frames, 0 Duplikate
 *  M6 Tier-Dyes    (m10-elite-tier-families) Faerbe-Klassen + Zentroid-Distanz
 */
import { ENEMY_LIST } from "../src/data/enemies";
import {
  enemyFrameGrids,
  enemySpriteFrames,
  eliteRimFrame,
  ELITE_RIM_COLOR,
  ELITE_TIER_DYES,
  type Grid,
} from "../src/gfx/enemySprites";
import { PAL } from "../src/palette";

// ── Metric-Helfer (identisch zu scripts/m10-silhouette-guard.mjs) ──
const lum = (i: number): number => {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
};
const LUM_DARK = lum(28); // dunkles Moor
const THRESHOLD = 40;

const isEdge = (g: Grid, x: number, y: number): boolean => {
  const h = g.length;
  const w = g[0].length;
  const filled = (a: number, b: number) => a >= 0 && a < w && b >= 0 && b < h && g[b][a] !== null;
  return filled(x, y) && (!filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1));
};

/** Rim-Band: Randpixel + 1 px innen (m10-chaos-silhouettes K1). */
function rimBand(g: Grid): number[] {
  const h = g.length;
  const w = g[0].length;
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (g[y][x] === null) continue;
      const nearEdge =
        isEdge(g, x, y) ||
        (x > 0 && g[y][x - 1] !== null && isEdge(g, x - 1, y)) ||
        (x < w - 1 && g[y][x + 1] !== null && isEdge(g, x + 1, y)) ||
        (y > 0 && g[y - 1][x] !== null && isEdge(g, x, y - 1)) ||
        (y < h - 1 && g[y + 1][x] !== null && isEdge(g, x, y + 1));
      if (nearEdge) out.push(g[y][x] as number);
    }
  }
  return out;
}

function contourMetrics(g: Grid) {
  const h = g.length;
  const w = g[0].length;
  const rim = rimBand(g);
  let rimLight = 0;
  let below = 0;
  let contrastSum = 0;
  for (const c of rim) {
    const l = lum(c);
    if (l >= 70) rimLight++;
    const contrast = l - LUM_DARK;
    contrastSum += contrast;
    if (contrast < THRESHOLD) below++;
  }
  let topPixels = 0;
  let topLight = 0;
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && g[y][x] === null) y++;
    if (y >= h) continue;
    topPixels++;
    if (lum(g[y][x] as number) >= 85) topLight++;
  }
  return {
    rimLightPct: (100 * rimLight) / rim.length,
    topLightPct: (100 * topLight) / topPixels,
    edgeContrastDark: contrastSum / rim.length,
    belowThresholdDarkPct: (100 * below) / rim.length,
  };
}

function amberEdgeShare(g: Grid): number {
  const h = g.length;
  const w = g[0].length;
  let edge = 0;
  let amber = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isEdge(g, x, y)) {
        edge++;
        if (g[y][x] === ELITE_RIM_COLOR) amber++;
      }
    }
  }
  return amber / edge;
}

const gridSig = (g: Grid): string => JSON.stringify(g);
const px = (g: Grid): number => g.flat().filter((c) => c !== null).length;
const diffPixels = (a: Grid, b: Grid): number => {
  const fa = a.flat();
  const fb = b.flat();
  let d = 0;
  for (let k = 0; k < fa.length; k++) if (fa[k] !== fb[k]) d++;
  return d;
};
const rgbDist = (a: readonly number[], b: readonly number[]): number =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const bodyMean = (g: Grid): [number, number, number] => {
  const s = [0, 0, 0];
  let n = 0;
  for (const row of g) {
    for (const c of row) {
      if (c === null || c === 0 || c === 13) continue;
      s[0] += (PAL[c] >> 16) & 255;
      s[1] += (PAL[c] >> 8) & 255;
      s[2] += PAL[c] & 255;
      n++;
    }
  }
  return [s[0] / n, s[1] / n, s[2] / n];
};
const silhouette = (g: Grid): string => g.map((row) => row.map((p) => (p === null ? "." : "#")).join("")).join("\n");

function family(c: number): string {
  if (c <= 0) return "kontur";
  if (c <= 2) return "dunkel-neutral";
  if (c <= 7) return "blau";
  if (c <= 9) return "mittel-neutral";
  if (c <= 13) return "hell-neutral";
  if (c <= 19) return "glut-braun";
  if (c <= 22) return "gold";
  if (c <= 27) return "blut-rot";
  return "gruen";
}

/** 500er-Chaos-Mischung aus docs/lanes/m10-enemy-palette.md (identisch zum Mess-Skript). */
const CHAOS_MIX: [string, number][] = [
  ["bog_rat", 70], ["wisp", 40], ["mudling", 40], ["crow", 50], ["bogzombie", 40],
  ["toad", 20], ["skeleton", 40], ["bat", 50], ["ghoul", 30], ["witchling", 25],
  ["slime", 30], ["scarecrow", 10], ["wolf", 25], ["spider", 25], ["cultist", 15],
  ["golem", 10], ["bomber", 10], ["banshee", 10], ["knight", 5], ["wraith", 5],
  ["horror", 8], ["abom", 5],
];

// ── Vorab-Berechnung (einmal pro Suite-Lauf, < 2 s) ──
const contour = ENEMY_LIST.map((def, i) => ({ id: def.id, ...contourMetrics(enemySpriteFrames(i)[0]) }));
const meanOf = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

const eliteRim = ENEMY_LIST.map((def, i) => {
  const r0 = eliteRimFrame(i, 0);
  const r1 = eliteRimFrame(i, 1);
  return {
    id: def.id,
    amber0: amberEdgeShare(r0),
    amber1: amberEdgeShare(r1),
    poseDiff: diffPixels(r0, r1),
  };
});

const tierCentroids = ENEMY_LIST.map((def, i) => ({ tier: def.tier, mean: bodyMean(eliteRimFrame(i, 0)) }))
  .reduce<Record<number, [number, number, number] & { n?: number }>>((acc, e) => {
    const cur = acc[e.tier] ?? [0, 0, 0];
    const prevN = (acc[e.tier]?.n as number | undefined) ?? 0;
    acc[e.tier] = [
      cur[0] * prevN + e.mean[0],
      cur[1] * prevN + e.mean[1],
      cur[2] * prevN + e.mean[2],
    ] as [number, number, number] & { n?: number };
    acc[e.tier].n = prevN + 1;
    return acc;
  }, {});
const centroidList = [0, 1, 2, 3, 4].map((t) => {
  const [r, g, b] = tierCentroids[t];
  const n = tierCentroids[t].n as number;
  return [r / n, g / n, b / n];
});
let minTierDist = Infinity;
for (let a = 0; a < 5; a++) {
  for (let b = a + 1; b < 5; b++) minTierDist = Math.min(minTierDist, rgbDist(centroidList[a], centroidList[b]));
}

const familyCounts: Record<string, number> = {};
let mixTotal = 0;
for (const [id, count] of CHAOS_MIX) {
  const i = ENEMY_LIST.findIndex((d) => d.id === id);
  for (const g of enemyFrameGrids(i)) {
    for (const row of g) {
      for (const c of row) {
        if (c === null) continue;
        familyCounts[family(c)] = (familyCounts[family(c)] ?? 0) + count;
        mixTotal += count;
      }
    }
  }
}
const strongFamilies = Object.entries(familyCounts)
  .filter(([f, n]) => (100 * n) / mixTotal >= 8 && f !== "kontur" && f !== "dunkel-neutral" && f !== "mittel-neutral")
  .map(([f]) => f)
  .sort();

// bog_rat/wisp/bogzombie: textures.ts rendert handgezeichnete 2-Frame-Sets,
// deren generierte Varianten-Frames nie gezeigt werden (wie in
// tests/crowd-variant-tone.test.ts ausgespart).
const HAND_DRAWN = new Set(["bog_rat", "wisp", "bogzombie"]);
const variants = ENEMY_LIST.filter((d) => !HAND_DRAWN.has(d.id)).map((def, k) => {
  const i = ENEMY_LIST.indexOf(def);
  const grids = enemyFrameGrids(i);
  const gen2 = enemySpriteFrames(i)[2];
  const gen3 = enemySpriteFrames(i)[3];
  return {
    id: def.id,
    frames: grids.length,
    silhouette2: silhouette(grids[2]) === silhouette(gen2),
    silhouette3: silhouette(grids[3]) === silhouette(gen3),
    diff2: diffPixels(gen2, grids[2]),
    diff3: diffPixels(gen3, grids[3]),
    bodyRgbDist: rgbDist(bodyMean(grids[0]), bodyMean(grids[2])),
  };
});

const idle = ENEMY_LIST.map((def, i) => {
  const base = enemySpriteFrames(i);
  const sigs = base.map(gridSig);
  let dupPairs = 0;
  for (let a = 0; a < sigs.length; a++) {
    for (let b = a + 1; b < sigs.length; b++) if (sigs[a] === sigs[b]) dupPairs++;
  }
  const rim0 = eliteRimFrame(i, 0);
  const rim1 = eliteRimFrame(i, 1);
  return {
    id: def.id,
    baseFrames: base.length,
    dupPairs,
    basePoseDiff: diffPixels(base[0], base[1]),
    rimDiff: diffPixels(rim0, rim1),
    rimPixels: px(rim0),
  };
});

const mean = (xs: number[]): number => meanOf(xs);

describe("crowd-silhouette-guard: gepinnte Chaos-Lesbarkeits-Werte (A10)", () => {
  it("M1 Kontur: Rim-Band-Kontrast der 30 Archetypen bleibt auf gemergtem Stand", () => {
    // Ist (Vorher-JSON): 69.8 / 100 / 78.0 / 31.6 — Schranken mit Sicherheitsabstand.
    expect(mean(contour.map((c) => c.rimLightPct)), "Mittel Rim-Light %").toBeGreaterThanOrEqual(60);
    expect(mean(contour.map((c) => c.topLightPct)), "Mittel Top-Light %").toBeGreaterThanOrEqual(95);
    expect(mean(contour.map((c) => c.edgeContrastDark)), "Mittel Randkontrast dunkel (L)").toBeGreaterThanOrEqual(70);
    expect(mean(contour.map((c) => c.belowThresholdDarkPct)), "Mittel unter Schwelle dunkel %").toBeLessThanOrEqual(40);
    // Lane-Vertrag: ALLE 30 Typen klar vom dunklen Moor getrennt (ist 41.6).
    for (const c of contour) {
      expect(c.edgeContrastDark, `${c.id}: Randkontrast dunkel`).toBeGreaterThan(40);
    }
  });

  it("M2 Elite-Rim: Amber-Vollumrandung (PAL 20) in beiden Posen, 30/30 Typen", () => {
    // Ist: min Amber-Edge-Share 1.0 (A10-Vertrag aus m10-elite-rim, art-director 4/5).
    expect(ELITE_RIM_COLOR).toBe(20);
    for (const e of eliteRim) {
      expect(e.amber0, `${e.id}: Pose 0 Amber-Rand`).toBe(1);
      expect(e.amber1, `${e.id}: Pose 1 Amber-Rand`).toBe(1);
      expect(e.poseDiff, `${e.id}: Rim-Idle (Ruhe vs. Bob)`).toBeGreaterThan(0);
    }
  });

  it("M3 Familien: 500er-Chaos-Mischung liest sich in >= 5 starken Farbfamilien", () => {
    // Ist: 5 starke Familien (m10-enemy-palette Nachher-Stand, art-director PASS 4/5).
    expect(strongFamilies.length, `strongFamilies: ${strongFamilies.join(",")}`).toBeGreaterThanOrEqual(5);
    for (const f of ["blau", "blut-rot", "glut-braun", "gruen", "hell-neutral"]) {
      expect(strongFamilies, `${f} fehlt in der Mischung`).toContain(f);
    }
  });

  it("M4 Varianten: 27 gerenderte Typen mit getrennter Ton-Variante (Frames 2/3)", () => {
    expect(variants, "27 gerenderte Typen (3 handgezeichnete ausgespart)").toHaveLength(27);
    for (const v of variants) {
      expect(v.frames, `${v.id}: Framezahl`).toBe(4);
      expect(v.silhouette2 && v.silhouette3, `${v.id}: Silhouette unveraendert`).toBe(true);
      expect(v.diff2, `${v.id}: Frame 2 umgefaerbt`).toBeGreaterThan(0);
      expect(v.diff3, `${v.id}: Frame 3 umgefaerbt`).toBeGreaterThan(0);
      expect(v.bodyRgbDist, `${v.id}: Basis vs. Variante RGB-Distanz`).toBeGreaterThanOrEqual(60);
    }
  });

  it("M5 Idle-Frames: 30 Basis-Framesets (4 Frames) + 30 Rim-Framesets (2 Frames), 0 Duplikate", () => {
    // Ist (m10-enemy-idle-anim-r2): Basis 4/4/4, Rim 2/2, 0 byte-identische Paare.
    for (const e of idle) {
      expect(e.baseFrames, `${e.id}: Basis-Frames`).toBe(4);
      expect(e.dupPairs, `${e.id}: byte-identische Basis-Frames`).toBe(0);
      expect(e.basePoseDiff, `${e.id}: Basis-Idle/Bob-Diff`).toBeGreaterThan(0);
      expect(e.rimPixels, `${e.id}: Rim-Frame hat Pixel`).toBeGreaterThan(0);
      expect(e.rimDiff, `${e.id}: Rim-Idle (rim vs. rim2)`).toBeGreaterThan(0);
    }
  });

  it("M6 Tier-Dyes: Faerbe-Klassen [16,8,19,25,31] mit Zentroid-Distanz >= 30", () => {
    // Ist (m10-elite-tier-families + -refine): Dyes fixiert, min Zentroid-Distanz 42.5.
    expect([...ELITE_TIER_DYES]).toEqual([16, 8, 19, 25, 31]);
    expect(minTierDist, `min Tier-Zentroid-Distanz ${minTierDist.toFixed(1)}`).toBeGreaterThanOrEqual(30);
  });
});
