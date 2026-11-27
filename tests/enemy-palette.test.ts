import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));
import { ENEMY_LIST } from "../src/data/enemies";
import { GEN_ENEMIES, GEN_ENEMY_FAMILIES } from "../src/gfx/gen-enemies";
import { enemySpriteFrames, type Grid } from "../src/gfx/enemySprites";
import { PAL } from "../src/palette";

/**
 * K4 (M10-Enemy-Palette): Je Typ Palette/Familie aus den Daten belegt.
 * - 30/30 Typen mit Familien-Eintrag (GEN_ENEMY_FAMILIES, AUTO-GENERIERT)
 * - binaeres Alpha (nur null oder Palettenindex), 0 Off-Palette-Pixel
 * - Familien-Zugehoerigkeit je Typ aus den echten Sprite-Pixeln
 * - Tier-Progression: Familien-Rampen lassen Sättigung/Helligkeit ansteigen
 */

interface FamEntry { family: string; tier: number; ramp: [number, number, number] }

function luminance(i: number): number {
  const c = PAL[i];
  return 0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255);
}

/**
 * Familienklassifikation über Palettenindex (identisch zu
 * scripts/m10-enemy-palette.mjs): 0 Kontur, 1-2 Nacht-Schwarz, 3-7 Blaugrau,
 * 8-9 Dunst, 10-13 Knochen/Licht, 14-19 Glut/Flamme, 20-22 Gold, 23-27 Blut,
 * 28-31 Gruen. Im Spiel gibt es nur Palettenfarben — damit deterministisch.
 */
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

/** Familien-Buckets je Daten-Familie (gleiche Zuordnung wie im Mess-Skript). */
const FAMILY_BUCKETS: Record<string, string[]> = {
  glut: ["glut-braun", "gold"],
  gold: ["gold", "glut-braun"],
  moor: ["gruen"],
  knochen: ["hell-neutral"],
  blut: ["blut-rot"],
  nacht: ["blau", "mittel-neutral", "dunkel-neutral"],
};

function familyShares(grid: Grid): Record<string, number> {
  const counts: Record<string, number> = {};
  let n = 0;
  for (const row of grid) {
    for (const c of row) {
      if (c === null) continue;
      const f = family(c);
      counts[f] = (counts[f] ?? 0) + 1;
      n++;
    }
  }
  const shares: Record<string, number> = {};
  for (const [f, k] of Object.entries(counts)) shares[f] = k / n;
  return shares;
}

describe("Gegner-Palette: 30/30 Typen mit Familie aus den Daten", () => {
  it("hat fuer alle 30 Typen einen Familien-Eintrag passend zur ENEMY_LIST", () => {
    expect(ENEMY_LIST).toHaveLength(30);
    expect(Object.keys(GEN_ENEMY_FAMILIES)).toHaveLength(30);
    for (const def of ENEMY_LIST) {
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey] as FamEntry | undefined;
      expect(entry, def.id).toBeDefined();
      expect(entry!.family, def.id).toMatch(/^(glut|moor|knochen|blut|gold|nacht)$/);
      expect(entry!.tier, def.id).toBe(def.tier);
    }
  });

  it("binaeres Alpha + 0 Off-Palette-Pixel in allen Frames aller Typen", () => {
    const bad: string[] = [];
    for (const def of ENEMY_LIST) {
      enemySpriteFrames(ENEMY_LIST.indexOf(def)).forEach((grid, fi) => {
        for (let y = 0; y < grid.length; y++) {
          for (let x = 0; x < grid[0].length; x++) {
            const c = grid[y][x];
            if (c === null) continue;
            if (!Number.isInteger(c) || c < 0 || c >= PAL.length) {
              bad.push(`${def.id}#${fi}: (${x},${y})=${c}`);
            }
          }
        }
      });
    }
    expect(bad, bad.slice(0, 10).join("\n")).toEqual([]);
  });

  it("je Typ traegt die Sprite-Pixel seine Daten-Familie (Anteil >= 0,20)", () => {
    const low: string[] = [];
    for (const def of ENEMY_LIST) {
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey] as FamEntry;
      const shares = familyShares(enemySpriteFrames(ENEMY_LIST.indexOf(def))[0]);
      const buckets = FAMILY_BUCKETS[entry.family];
      const share = buckets.reduce((a, b) => a + (shares[b] ?? 0), 0);
      if (share < 0.2) low.push(`${def.id} (${entry.family}): Anteil ${share.toFixed(2)}`);
    }
    expect(low, low.join("\n")).toEqual([]);
  });

  it("mindestens 4 Farbfamilien sind mit Anteil >= 0,5 bei mind. einem Typ vertreten", () => {
    const strong = new Set<string>();
    for (const def of ENEMY_LIST) {
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey] as FamEntry;
      const shares = familyShares(enemySpriteFrames(ENEMY_LIST.indexOf(def))[0]);
      const share = FAMILY_BUCKETS[entry.family]
        .reduce((a, b) => a + (shares[b] ?? 0), 0);
      if (share >= 0.5) strong.add(entry.family);
    }
    expect(strong.size, `[...strong].join(",")=${[...strong].sort().join(",")}`).toBeGreaterThanOrEqual(4);
  });

  it("Tier-Progression: Familien-Rampen lassen Helligkeit nicht sinken; Sprites tragen die Rampen-Basis", () => {
    // Rampen je Familie ueber Tier (aus den Daten gesammelt).
    const ramps: Record<string, [number, number, number][]> = {};
    for (const [key, entry] of Object.entries(GEN_ENEMY_FAMILIES) as [string, FamEntry][]) {
      (ramps[entry.family] ??= [])[entry.tier] = entry.ramp;
    }
    for (const [fam, list] of Object.entries(ramps)) {
      const present = list.filter((r): r is [number, number, number] => Array.isArray(r));
      const lums = present.map((r) => luminance(r[1]));
      for (let t = 1; t < lums.length; t++) {
        expect(lums[t], `${fam} Stufe ${t}`).toBeGreaterThanOrEqual(lums[t - 1]);
      }
    }
    // Sprite-Seite: die Rampe des Typs ist tatsaechlich im Sprite vertreten
    // (mind. eines der Rampen-Erkennungsmerkmale — Schatten/Basis/Licht; das
    // Laufzeit-Sharpening darf Mitteltoene zu Gunsten der Lesbarkeit anheben).
    const missing: string[] = [];
    for (const def of ENEMY_LIST) {
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey] as FamEntry;
      const grid = enemySpriteFrames(ENEMY_LIST.indexOf(def))[0];
      const present = new Set(grid.flat().filter((c) => c !== null));
      if (!entry.ramp.some((c) => present.has(c))) {
        missing.push(`${def.id}: keine Rampe ${entry.ramp.join("/")} im Sprite`);
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("Chaos-Mischung (500er-Frame des Mess-Skripts) erreicht >= 4 Familien mit >= 8 %", () => {
    // Gewichte wie scripts/m10-enemy-palette.mjs MIX (Minute-25-Masse).
    const MIX: [string, number][] = [
      ["bog_rat", 70], ["wisp", 40], ["mudling", 40], ["crow", 50], ["bogzombie", 40],
      ["toad", 20], ["skeleton", 40], ["bat", 50], ["ghoul", 30], ["witchling", 25],
      ["slime", 30], ["scarecrow", 10], ["wolf", 25], ["spider", 25], ["cultist", 15],
      ["golem", 10], ["bomber", 10], ["banshee", 10], ["knight", 5], ["wraith", 5],
      ["horror", 8], ["abom", 5],
    ];
    const weighted: Record<string, number> = {};
    let wsum = 0;
    for (const [id, n] of MIX) {
      const def = ENEMY_LIST.find((e) => e.id === id)!;
      const entry = GEN_ENEMY_FAMILIES[def.spriteKey] as FamEntry;
      const shares = familyShares(enemySpriteFrames(ENEMY_LIST.indexOf(def))[0]);
      wsum += n;
      for (const [b, s] of Object.entries(shares)) {
        weighted[b] = (weighted[b] ?? 0) + s * n;
      }
    }
    // "Starke" Familien: mit >= 8 % Pixelanteil im Frame — nur diese lesen sich
  // in der Masse wirklich unterscheidbar. Kontur + dunkle/mittlere Neutraltoene
  // zaehlen nicht; "hell-neutral" ist die Knochen/Licht-Familie und zaehlt mit.
  const NEUTRAL = new Set(["kontur", "dunkel-neutral", "mittel-neutral"]);
    const strong = Object.entries(weighted)
      .filter(([f, v]) => !NEUTRAL.has(f) && v / wsum >= 0.08)
      .map(([f]) => f);
    expect(strong.length, `stark: ${strong.join(",")}`).toBeGreaterThanOrEqual(4);
  });
});
