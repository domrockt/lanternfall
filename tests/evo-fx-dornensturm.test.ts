// m10-evo-fx-dornensturm, Karte 4: Guards für die Mixel-/Farb-Regeln des Dornensturms.
// Muster: tests/evo-fx-winter.test.ts. Rein statisch: die Frame-Generatoren in
// gen-fx.ts sind reine Funktionen → die Tests prüfen Zielgrößen („eine Pixelgröße
// für alles", kein Scale > 1 am Effekt), binäres Alpha, Determinismus und die
// Dorn-Farbtreppe (grünlich-gelbe Natur-Töne, kein Ink, kein Grau) direkt an den Grids.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  EVOLUTION_SIGNATURES,
  FX_FRAME_COUNTS,
  SIGNATURE_FRAME_COUNT,
  THORN_CROWN_SIZE,
  THORN_RAMP,
  THORN_PROJECTILE_SIZE,
  THORN_SIGNATURE_SIZE,
  THORN_STREAK_SIZE,
  THORN_TRAIL_SIZE,
  signatureTextureKey,
  thornCrownFrame,
  thornProjectileFrame,
  thornSignatureFrame,
  thornStreakFrame,
  thornTrailFrame,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Verboten: Ink, Nacht-/Grau-Töne (1–9 außer 11? nein: 11 ist boneLight) — hier
 *  konkret Ink(0), Grau(5–9), warme Glut-/Feuer-Fremdfarben (14–27) und Knochen. */
const THORN_FORBIDDEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

describe("m10-evo-fx-dornensturm: Signatur in Zielgröße 128x128 @ Draw-Scale 1", () => {
  const sig = EVOLUTION_SIGNATURES.thorn_storm;

  it("drawScale [1,1] gesetzt — Signatur rendert in Zielgröße, nicht 32x32 @ 4,0-4,6", () => {
    expect(sig.drawScale).toEqual([1, 1]);
    // Guard am Quelltext: spawnEvolution folgt sig.drawScale (Mixel-Regel).
    const src = readFileSync(new URL("../src/systems/FxSystem.ts", import.meta.url), "utf8");
    expect(src).toContain("sig.drawScale");
    expect(src).toContain("drawScale?.[0]");
    expect(src).toContain("drawScale?.[1]");
  });

  it("4 Frames à 128x128 (THORN_SIGNATURE_SIZE), Hit und Death verschieden", () => {
    for (const kind of ["hit", "death"] as const) {
      const frames = Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => thornSignatureFrame(kind, i));
      for (const rows of frames) {
        expect(rows.length).toBe(THORN_SIGNATURE_SIZE);
        expect(rows.every((r) => r.length === THORN_SIGNATURE_SIZE)).toBe(true);
      }
      expect(FX_FRAME_COUNTS[signatureTextureKey("thorn_storm", kind)]).toBe(SIGNATURE_FRAME_COUNT);
      // Frames verschieden (Animation, keine eingefrorene Textur).
      expect(new Set(frames).size).toBe(SIGNATURE_FRAME_COUNT);
    }
    expect(thornSignatureFrame("hit", 0)).not.toEqual(thornSignatureFrame("death", 0));
  });

  it("Dorn-Farbtreppe ohne Ink/Grau/warm: nur THORN_RAMP, Kern flächig hell, Spitzen hell", () => {
    const all: number[] = [];
    for (const kind of ["hit", "death"] as const) {
      for (let stage = 0; stage < SIGNATURE_FRAME_COUNT; stage++) {
        const rows = thornSignatureFrame(kind, stage);
        const used = usedIndices(rows);
        expect(used.filter((i) => THORN_FORBIDDEN.includes(i))).toEqual([]);
        expect(used.every((i) => THORN_RAMP.includes(i as (typeof THORN_RAMP)[number]))).toBe(true);
        all.push(...used);
      }
    }
    // Treppe über die Familie ausgenutzt: helle Spitzen (11), marshLight-Kern (31),
    // marsh (30), mossDark (29), Kontur mossNight (28).
    for (const i of THORN_RAMP) expect(all).toContain(i);
  });

  it("Timing unverändert (kein Balance-Eingriff): hit 0,18 / death 0,42", () => {
    expect(sig.hitLifetime).toBe(0.18);
    expect(sig.deathLifetime).toBe(0.42);
  });
});

describe("m10-evo-fx-dornensturm: Salven-Effekte in Zielgröße (eine Pixelgröße für alles)", () => {
  it("projectile_thorn: 12x12 (statt 7x7 @ 1,7x), 0 Ink, Natur-Treppe", () => {
    const rows = thornProjectileFrame();
    expect(rows.length).toBe(THORN_PROJECTILE_SIZE);
    expect(rows.every((r) => r.length === THORN_PROJECTILE_SIZE)).toBe(true);
    const used = usedIndices(rows);
    expect(used).not.toContain(0);
    expect(used.every((i) => THORN_RAMP.slice(1).includes(i as (typeof THORN_RAMP)[number]))).toBe(true);
    expect(used).toContain(31); // flächig heller Kern
    expect(used).toContain(28); // Kontur-Saum statt Ink-Rahmen
  });

  it("fx_thorn-Trail: 14x14, 3 Frames, Treppe ohne Warm-Färbung (Ramp-Char-Regression)", () => {
    for (let stage = 0; stage < 3; stage++) {
      const rows = thornTrailFrame(stage);
      expect(rows.length).toBe(THORN_TRAIL_SIZE);
      expect(rows.every((r) => r.length === THORN_TRAIL_SIZE)).toBe(true);
      const used = usedIndices(rows);
      expect(used.filter((i) => THORN_FORBIDDEN.includes(i))).toEqual([]);
      expect(used.every((i) => THORN_RAMP.includes(i as (typeof THORN_RAMP)[number]))).toBe(true);
    }
  });

  it("fx_thorn_streak: 22x22, 3 Phasen (Dart → kürzer + Splitter → nur Splitter)", () => {
    const frames = [0, 1, 2].map(thornStreakFrame);
    for (const rows of frames) {
      expect(rows.length).toBe(THORN_STREAK_SIZE);
      expect(rows.every((r) => r.length === THORN_STREAK_SIZE)).toBe(true);
      const used = usedIndices(rows);
      expect(used.filter((i) => THORN_FORBIDDEN.includes(i))).toEqual([]);
      expect(used.every((i) => THORN_RAMP.includes(i as (typeof THORN_RAMP)[number]))).toBe(true);
    }
    expect(new Set(frames).size).toBe(3);
    // Ausklang: Phase 2 hat keinen Dart mehr (nur Fragmente) — deutlich weniger Masse.
    const mass = (rows: string[]): number => rows.join("").split("").filter((c) => c !== ".").length;
    expect(mass(frames[2])).toBeLessThan(mass(frames[0]) / 2);
  });

  it("fx_thorn_crown: 96x96, 3 Phasen (Aufbau → Impact → Ausklang mit Band-Bruch)", () => {
    const frames = [0, 1, 2].map(thornCrownFrame);
    for (const rows of frames) {
      expect(rows.length).toBe(THORN_CROWN_SIZE);
      expect(rows.every((r) => r.length === THORN_CROWN_SIZE)).toBe(true);
      const used = usedIndices(rows);
      expect(used.filter((i) => THORN_FORBIDDEN.includes(i))).toEqual([]);
      expect(used.every((i) => THORN_RAMP.includes(i as (typeof THORN_RAMP)[number]))).toBe(true);
    }
    expect(new Set(frames).size).toBe(3);
    expect(FX_FRAME_COUNTS.fx_thorn_crown).toBe(3);
    expect(FX_FRAME_COUNTS.fx_thorn_streak).toBe(3);
  });

  it("Kein Mixel am Quelltext: CombatSystem nutzt Krone/Streaks @ Scale 1, keine 3,0x-Streaks", () => {
    const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
    expect(src).toContain("fx_thorn_crown");
    expect(src).toContain("fx_thorn_streak");
    expect(src).not.toContain("scaleFrom: 3.0");
    // Krone ohne Up- oder Downscale gezeichnet (Draw-Scale 1).
    const crownBlock = src.slice(src.indexOf("fx_thorn_crown") - 200, src.indexOf("fx_thorn_crown") + 400);
    expect(crownBlock).toContain("scaleFrom: 1");
    expect(crownBlock).toContain("scaleTo: 1");
    // Dornen-Trail verliert den warmen Ember-Tint (Natur-Grün bleibt sichtbar).
    expect(src).toContain('p.weaponId === "thorn" || p.weaponId === "thorn_storm"');
  });
});

describe("m10-evo-fx-dornensturm: Determinismus + binäres Alpha", () => {
  it("Generatoren sind rein: zweimal gerufen → byte-identische Grids", () => {
    expect(thornProjectileFrame()).toEqual(thornProjectileFrame());
    expect(thornSignatureFrame("death", 2)).toEqual(thornSignatureFrame("death", 2));
    expect(thornCrownFrame(1)).toEqual(thornCrownFrame(1));
    expect(thornStreakFrame(0)).toEqual(thornStreakFrame(0));
    expect(thornTrailFrame(2)).toEqual(thornTrailFrame(2));
  });

  it("Binäres Alpha: nur Paletten-Chars oder '.' — keine Halbdeckung im Grid-Format", () => {
    const grids = [
      thornProjectileFrame(),
      ...[0, 1, 2].map(thornTrailFrame),
      ...[0, 1, 2].map(thornStreakFrame),
      ...[0, 1, 2].map(thornCrownFrame),
      ...Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => thornSignatureFrame("death", i)),
    ];
    for (const rows of grids) {
      for (const row of rows) {
        for (const ch of row) {
          if (ch === ".") continue;
          expect(charIndex(ch)).toBeGreaterThanOrEqual(0);
          expect(charIndex(ch)).toBeLessThanOrEqual(31);
        }
      }
    }
  });
});
