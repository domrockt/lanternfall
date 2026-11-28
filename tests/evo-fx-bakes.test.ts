import { describe, expect, it } from "vitest";
import {
  EVOLUTION_SIGNATURES,
  deathFrameSets,
  evolutionSignatureTextureDef,
  isBossFxKey,
  mixelBakes,
  mixelBaseFor,
  mixelFrameKey,
  mixelLevelFor,
  mixelLevel1Frames,
  mixelMaxLevel,
  signatureTextureKey,
} from "../src/gfx/gen-fx";

/**
 * M10-fx-bakes-evo-r2 (K2): thunder_seal bleibt beim 32x32-Signatur-Pfad
 * (Revert 34e97d3, Karte #8876), wird aber in spawnEvolution mit Draw-Scale
 * 3,2–4,6 gezeichnet. Fix: Mixel-Bake-Stufen nach MIXEL_BAKE_DEFS-Muster —
 * identische normierte Geometrie in L-facher Pixelgroesse, Draw-Scales
 * unveraendert (Optik am Schirm identisch, Quelle schaerfer: ein Textur-Pixel
 * deckt <= 1 Spielpixel ab statt 3,2–4,6).
 */

const THUNDER_BASES = ["fx_evo_hit_thunder_seal", "fx_evo_death_thunder_seal"] as const;

describe("M10-fx-bakes-evo-r2: Mixel-Bakes fuer fx_evo_*_thunder_seal", () => {
  it("thunder_seal ist Mixel-Basis mit Bake bis ceil(max Draw-Scale)", () => {
    expect(mixelMaxLevel("fx_evo_hit_thunder_seal")).toBe(4);
    expect(mixelMaxLevel("fx_evo_death_thunder_seal")).toBe(5);
    for (const base of THUNDER_BASES) {
      expect(mixelBaseFor(base)).toBe(base);
      expect(mixelBaseFor(`${base}_2`)).toBe(base);
      // Stufen-Keys werden erkannt und umgekeyt (FxSystem-Rewrite in spawn).
      expect(mixelFrameKey(`${base}_2`, 4)).toBe(`${base}@4_2`);
    }
  });

  it("Draw-Scale-Coverage: Scale/Level <= 1 fuer den ganzen realen Bereich", () => {
    // Hit 3,2 -> 3,6 (maxLevel 4), Death 4,0 -> 4,6 (maxLevel 5) — je Key der
    // reale spawnEvolution-Bereich, kein gemeinsamer Sweep.
    for (let s = 32; s <= 36; s++) {
      const scale = s / 10;
      const level = mixelLevelFor("fx_evo_hit_thunder_seal", scale);
      expect(level).toBeGreaterThanOrEqual(Math.ceil(scale));
      expect(scale / level, `effektiver Draw-Scale hit @ ${scale}`).toBeLessThanOrEqual(1);
    }
    for (let s = 40; s <= 46; s++) {
      const scale = s / 10;
      const level = mixelLevelFor("fx_evo_death_thunder_seal", scale);
      expect(level).toBeGreaterThanOrEqual(Math.ceil(scale));
      expect(scale / level, `effektiver Draw-Scale death @ ${scale}`).toBeLessThanOrEqual(1);
    }
  });

  it("Bake-Stufen existieren in Zielgroesse 32*L und decken alle Stufen >= 2 ab", () => {
    for (const [base, maxLevel] of [
      ["fx_evo_hit_thunder_seal", 4],
      ["fx_evo_death_thunder_seal", 5],
    ] as const) {
      for (let level = 2; level <= maxLevel; level++) {
        const bake = mixelBakes().find((b) => b.base === base && b.level === level);
        expect(bake, `Bake ${base}@${level} fehlt`).toBeDefined();
        expect(bake!.w).toBe(32 * level);
        expect(bake!.h).toBe(32 * level);
        expect(bake!.frames.length).toBe(4);
      }
    }
  });

  it("Level-1 bleibt bitidentisch: Signatur-Pfad == Mixel-Basis-Quelle (Optik identisch)", () => {
    const level1 = mixelLevel1Frames();
    for (const id of ["thunder_seal"] as const) {
      for (const kind of ["hit", "death"] as const) {
        const def = evolutionSignatureTextureDef(id, kind);
        const l1 = level1[signatureTextureKey(id, kind)];
        expect(l1.w).toBe(def.w);
        expect(l1.h).toBe(def.h);
        expect(l1.frames.map((r) => r.join("\n"))).toEqual(def.frames.map((r) => r.join("\n")));
      }
    }
  });

  it("jede Stufe rendert dieselbe normierte Geometrie (Farbrampe + Flachenskalierung)", () => {
    const level1 = mixelLevel1Frames();
    for (const base of THUNDER_BASES) {
      const l1 = level1[base];
      const count = (rows: string[]): Record<string, number> => {
        const m: Record<string, number> = {};
        for (const row of rows) for (const ch of row) if (ch !== ".") m[ch] = (m[ch] ?? 0) + 1;
        return m;
      };
      const c1 = count(l1.frames[0]);
      const l1Colors = Object.keys(c1).sort();
      for (const bake of mixelBakes().filter((b) => b.base === base)) {
        const L = bake.level;
        for (let fi = 0; fi < bake.frames.length; fi++) {
          const cb = count(bake.frames[fi]);
          // Keine ausgebrannten/neuen Stufen: dieselbe Palette-Rampe wie Level 1.
          expect(Object.keys(cb).sort(), `${base}@${L}#${fi} Farben`).toEqual(l1Colors);
          // Flachenskalierung: Farbe n1 (L1, Draw L) hat in Stufe L ~L^2 Pixel.
          // Untergrenze 0,5*n1*L^2, Obergrenze 2*n1*L^2 — Faktor 2 = empirisches
          // Maximum der Wobble-Quantisierung an steilen Flanken (1,75) + Marge.
          // Fand frueher den Bug "Seitenband 1 Texel".
          for (const [ch, n1] of Object.entries(c1)) {
            const nL = cb[ch] ?? 0;
            // Flachenfarben skalieren mit L^2 (Draw-L-Flaeche): Untergrenze
            // 0,5*n1*L^2 fing frueher den Bug "Beam-Seitenband 1 Texel statt L"
            // (ratio ~1 statt ~L^2). Rim (11) = 1-Texel-Ecken-Schmuecke entlang
            // der Kontur: skaliert bewusst NICHT mit L^2 (bleibt feine Kante),
            // nur Verblass-Schutz. Obergrenze + Quantisierungsslack (Wobble).
            const L2 = L * L;
            if (ch === "b") {
              expect(nL, `${base}@${L}#${fi} Rim verblassen`).toBeGreaterThanOrEqual(Math.max(4, Math.round(n1 * 0.5)));
            } else {
              expect(nL, `${base}@${L}#${fi} Farbe '${ch}' kollabiert`).toBeGreaterThanOrEqual(0.5 * n1 * L2);
            }
            expect(nL, `${base}@${L}#${fi} Farbe '${ch}' blaeht`).toBeLessThanOrEqual(2 * n1 * L2);
          }
        }
      }
    }
  });

  it("nur thunder_seal ist neu Mixel-Basis — bestehende Basen unveraendert", () => {
    for (const base of ["fx_fire", "fx_halo", "fx_halo_cold", "fx_shock", "ring_frost"] as const) {
      expect(mixelBaseFor(base)).toBe(base);
    }
    expect(EVOLUTION_SIGNATURES.thunder_seal.drawScale).toBeUndefined();
  });
});

describe("M10-fx-bakes-evo-r2 K3: Mixel-Bake fx_boss_core (Entscheidung: Bake)", () => {
  // Entscheidung (Beleg docs/lanes/m10-fx-bakes-evo-r2.md): BAKE statt Scale<=1 —
  // der gewuenschte Screen-Radius (Boss-Auftritt/Tod bis Scale 3,6) ist Optik-
  // Kernscharfe-Kritisch (#5219-Tintenkontur + Offset-Outline); ein Bake haelt
  // die Kontur bei Draw-Scale 0,9 scharf, waehrend Scale<=1 den Effekt auf 32 px
  // schrumpfen wuerde (Optik-Verschlechterung). Run.ts bleibt unangetastet —
  // FxSystem.spawn waehlt die Stufe (bewusst NACH dem Area-Cap, siehe dort).

  it("fx_boss_core ist Mixel-Basis mit Bake bis Level 4 (ceil 3,6)", () => {
    expect(mixelMaxLevel("fx_boss_core")).toBe(4);
    expect(mixelBaseFor("fx_boss_core")).toBe("fx_boss_core");
    expect(mixelBaseFor("fx_boss_core_2")).toBe("fx_boss_core");
    expect(mixelFrameKey("fx_boss_core_2", 4)).toBe("fx_boss_core@4_2");
    // Frame-Keys mit Stufen-Suffix bleiben Boss-FX (Alpha-Boden/LOD-Ausnahme).
    expect(isBossFxKey("fx_boss_core@4")).toBe(true);
    expect(isBossFxKey("fx_boss_core@4_2")).toBe(true);
    expect(isBossFxKey("fx_boss_core")).toBe(true);
    expect(isBossFxKey("fx_shock@4")).toBe(false);
  });

  it("Draw-Scale-Coverage: Auftritt 0,6-2,4, Tod 1,6-3,6, rim 1,2-1,25 — immer Scale/Level <= 1", () => {
    const ranges: Array<[number, number]> = [[0.6, 2.4], [1.6, 3.6], [1.2, 1.25]];
    for (const [lo, hi] of ranges) {
      for (const scale of [lo, hi]) {
        const level = mixelLevelFor("fx_boss_core", scale);
        expect(scale / level, `effektiver Draw-Scale @ ${scale}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("Bake-Stufen 2-4 existieren in Zielgroesse 32*L mit 6 Frames", () => {
    for (let level = 2; level <= 4; level++) {
      const bake = mixelBakes().find((b) => b.base === "fx_boss_core" && b.level === level);
      expect(bake, `Bake fx_boss_core@${level} fehlt`).toBeDefined();
      expect(bake!.w).toBe(32 * level);
      expect(bake!.frames.length).toBe(6);
    }
  });

  it("Level-1 bleibt bitidentisch (deathFrameSets == Mixel-Basis-Quelle)", () => {
    const l1 = mixelLevel1Frames()["fx_boss_core"];
    expect(l1.w).toBe(32);
    expect(l1.frames.map((r) => r.join("\n"))).toEqual(
      deathFrameSets()["fx_boss_core"].frames.map((r) => r.join("\n")),
    );
  });

  it("Stufen skalieren die #5219-Kontur proportional (Ink-Flaeche ~L, Kern ~L^2)", () => {
    const count = (rows: string[], ch: string): number =>
      rows.reduce((n, row) => n + [...row].filter((c) => c === ch).length, 0);
    const l1 = mixelLevel1Frames()["fx_boss_core"];
    const ink1 = count(l1.frames[0], "0");
    expect(ink1).toBeGreaterThan(0);
    for (const bake of mixelBakes().filter((b) => b.base === "fx_boss_core")) {
      const L = bake.level;
      const inkL = count(bake.frames[0], "0");
      // Kontur ~ L dick × ~L lang: Flaeche ~L^2 (Toleranz fuer Rundung/Dilatation).
      expect(inkL, `Ink-Kontur fx_boss_core@${L}`).toBeGreaterThanOrEqual(ink1 * L * L * 0.6);
      expect(inkL, `Ink-Kontur fx_boss_core@${L}`).toBeLessThanOrEqual(ink1 * L * L * 2);
    }
  });
});
