// m10-evo-fx-zornpendel, Karte 3: Guards für die Mixel-/Farb-Regeln des Zornpendels.
// Rein statisch: die Frame-Generatoren in gen-fx.ts sind reine Funktionen → die
// Tests prüfen Texturgrößen (Zielgröße), Draw-Scales (kein Scale > 1 am Effekt)
// und die Zorn-Farb-Treppe (Kern hell-bernstein, Glut rot, Kontur statt Ink)
// direkt an den Grids. Vorlage: tests/evo-fx-soulpyre.test.ts.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  EVOLUTION_SIGNATURES,
  FX_FRAME_COUNTS,
  WRATH_RING_RADIUS,
  WRATH_RING_SIZE,
  WRATH_SIGNATURE_SIZE,
  ZORN_RAMP,
  pendulumRingFrame,
  signatureTextureKey,
  wrathGlowFrame,
  wrathSignatureFrame,
} from "../src/gfx/gen-fx";
import { charIndex } from "../src/gfx/textures";
import { WRATH_FX } from "../src/data/evolution-weapons";

/** Indizes aller sichtbaren Pixel eines Grids. */
function usedIndices(rows: string[]): number[] {
  const out = new Set<number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

/** Zorn-Treppe: erlaubt sind nur die Rampen-Indizes (bernstein + rot + Kontur). */
const ALLOWED = [...ZORN_RAMP];

/** Zählung aller sichtbaren Pixel je Palettenindex. */
function countIndices(rows: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) for (const ch of row) {
    const i = charIndex(ch);
    if (i >= 0) counts.set(i, (counts.get(i) ?? 0) + 1);
  }
  return counts;
}

describe("m10-evo-fx-zornpendel: Texturen in Zielgröße + Draw-Scale 1", () => {
  it("Pendel-Ring: 3 Schwung-Frames à 208x208 (Radius 96 + Rand), Register enthält alle Keys", () => {
    for (let f = 0; f < 3; f++) {
      const rows = pendulumRingFrame(f);
      expect(rows.length).toBe(WRATH_RING_SIZE);
      expect(rows.every((r) => r.length === WRATH_RING_SIZE)).toBe(true);
    }
    expect(WRATH_RING_SIZE).toBe(2 * (WRATH_RING_RADIUS + 8));
    expect(WRATH_FX.ringFrames).toEqual(["fx_wrath_ring", "fx_wrath_ring_2", "fx_wrath_ring_3"]);
    expect(FX_FRAME_COUNTS.fx_wrath_ring).toBe(3);
    expect(FX_FRAME_COUNTS.fx_wrath_glow).toBe(1);
  });

  it("Glow am Kugelkopf: 17x17 in Sprite-Pixelgröße (statt fx_halo 24x24 @ radius/18)", () => {
    const rows = wrathGlowFrame();
    expect(rows.length).toBe(17);
    expect(rows.every((r) => r.length === 17)).toBe(true);
    expect(WRATH_FX.glowTexture).toBe("fx_wrath_glow");
  });

  it("Draw-Scale-1-Guard am Quelltext: Kugel/Glow/Ring @ 1, keine >1x-Scales mehr am Zorn-Pfad", () => {
    const src = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
    // Kugel: Scale 1 für die Evolution (Basisflegel unverändert).
    expect(src).toContain(".setScale(evolved ? 1 : 1 + radius / 140)");
    // Glow: gebackene 17x17-Textur mit Scale 1.
    expect(src).toContain("makeImage(this.scene, ctx.playerX, ctx.playerY, WRATH_FX.glowTexture)");
    expect(src).toContain(".setScale(1, side)");
    // Die alten Mixel-Scales des Zorn-Pfads sind entfernt:
    expect(src).not.toContain("scaleFrom: radius / 12"); // fx_halo @ 8–10,7x am Spieler
    expect(src).not.toContain("tint: evolved ? PAL[C.fogBlue]"); // falsch getinteter Halo
    // Player-Smear (44x16 @ radius/20 ≈ 4,8x) nur noch für den Basisflegel.
    const smearIdx = src.indexOf('spawnAnim("fx_smear", ctx.playerX');
    expect(smearIdx).toBeGreaterThan(0);
    expect(src.slice(smearIdx - 120, smearIdx)).toContain("!evolved");
  });

  it("Anticipation/Impact/Ausklang: Ring wächst mit dem Schwung, Ausklang kurz", () => {
    expect(WRATH_FX.fadeStart).toBeGreaterThan(0.5);
    expect(WRATH_FX.fadeOut).toBeLessThanOrEqual(0.3);
    // Aufbau: Frame 2 (voller Bogen) hat mehr sichtbare Pixel als Frame 0.
    const total = (rows: string[]) => countIndices(rows).size > 0
      ? [...countIndices(rows).values()].reduce((a, b) => a + b, 0) : 0;
    expect(total(pendulumRingFrame(2))).toBeGreaterThan(total(pendulumRingFrame(0)));
  });

  it("Signatur: wrath_pendulum in Zielgröße 96 mit drawScale [1,1]; Alt-Signaturen unverändert", () => {
    expect(EVOLUTION_SIGNATURES.wrath_pendulum.drawScale).toEqual([1, 1]);
    for (let f = 0; f < 4; f++) {
      for (const kind of ["hit", "death"] as const) {
        const rows = wrathSignatureFrame(kind, f);
        expect(rows.length).toBe(WRATH_SIGNATURE_SIZE);
        expect(rows.every((r) => r.length === WRATH_SIGNATURE_SIZE)).toBe(true);
      }
    }
    expect(signatureTextureKey("wrath_pendulum", "death")).toBe("fx_evo_death_wrath_pendulum");
  });

  it("Signaturen-Registry: Phoenix/Soul/Zorn/Dornensturm in Zielgröße, Rest Alt-Pfad", () => {
    expect(EVOLUTION_SIGNATURES.phoenix.drawScale).toEqual([1, 1]);
    expect(EVOLUTION_SIGNATURES.soul_beacon.drawScale).toEqual([1, 1]);
    expect(EVOLUTION_SIGNATURES.eternal_winter.drawScale).toEqual([1, 1]);
    expect(EVOLUTION_SIGNATURES.thunder_seal.drawScale).toBeUndefined();
    // M10-evo-fx-dornensturm: Assertion folgt drawScale (Muster 0b3b563) —
    // Dornensturm-Signatur jetzt ebenfalls Zielgröße 128 @ [1,1].
    expect(EVOLUTION_SIGNATURES.thorn_storm.drawScale).toEqual([1, 1]);
  });
});

describe("m10-evo-fx-zornpendel: Zorn-Farb-Treppe ohne Ink/Grau", () => {
  const grids: Array<[string, string[]]> = [
    ["ring0", pendulumRingFrame(0)],
    ["ring1", pendulumRingFrame(1)],
    ["ring2", pendulumRingFrame(2)],
    ["glow0", wrathGlowFrame()],
    ["sigHit0", wrathSignatureFrame("hit", 0)],
    ["sigHit2", wrathSignatureFrame("hit", 2)],
    ["sigDeath0", wrathSignatureFrame("death", 0)],
    ["sigDeath3", wrathSignatureFrame("death", 3)],
  ];

  it("kein Pixel außerhalb der Zorn-Treppe (kein Ink(0), keine Grau-/Nacht-Stufen 1–9, kein Fremdfarb-Mix)", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      const bad = used.filter((i) => !(ALLOWED as readonly number[]).includes(i));
      expect(bad, `${name} verwendet verbotene Indizes ${bad.join(",")}`).toEqual([]);
    }
  });

  it("jede Textur liest sich als Zorn: hell-bernsteiner Kern (22) UND rote Glut (26/25) vorhanden", () => {
    for (const [name, rows] of grids) {
      const used = usedIndices(rows);
      expect(used.some((i) => i === 22), `${name} ohne hellen Kern 22`).toBe(true);
      expect(used.some((i) => i === 26 || i === 25), `${name} ohne rote Glut`).toBe(true);
    }
  });

  it("Kern flächig hell: 22 ist die größte Einzel-Stufe in Ring und Signatur (art-director Kriterium 2)", () => {
    for (const [name, rows] of grids.filter(([n]) => n !== "glow0")) {
      const counts = countIndices(rows);
      const core = counts.get(22) ?? 0;
      for (const other of ALLOWED.filter((i) => i !== 22)) {
        expect(core, `${name}: Kern 22 (${core}) > ${other} (${counts.get(other) ?? 0})`).toBeGreaterThan(counts.get(other) ?? 0);
      }
    }
  });

  it("Kontur als warme Dunkelstufe: dunkles Blutrot (23) am Außenrand statt Ink, Innensaum dunkelrot (25)", () => {
    // Statisch über die Rampen-Definition: 23 ist Teil der Treppe (Kontur), 0 nicht.
    expect(ALLOWED.includes(23 as (typeof ZORN_RAMP)[number])).toBe(true);
    expect(ALLOWED.includes(0 as (typeof ZORN_RAMP)[number])).toBe(false);
    // Glow (additiv) ist die Ausnahme ohne Kontur — nur Kern/Glut-Stufen.
    expect(usedIndices(wrathGlowFrame()).every((i) => i >= 20)).toBe(true);
  });

  it("Schwung-Frames unterscheiden sich (Anim statt statischer Blockring)", () => {
    const a = pendulumRingFrame(0).join("|");
    const b = pendulumRingFrame(1).join("|");
    const c = pendulumRingFrame(2).join("|");
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
    for (const kind of ["hit", "death"] as const) {
      const s0 = wrathSignatureFrame(kind, 0).join("|");
      const s3 = wrathSignatureFrame(kind, 3).join("|");
      expect(s0).not.toBe(s3);
    }
  });

  it("Death-Signatur: mehr Zungen/Körner als Hit (deutlicher Todes-Puff)", () => {
    const total = (rows: string[]) => [...countIndices(rows).values()].reduce((a, b) => a + b, 0);
    expect(total(wrathSignatureFrame("death", 0))).toBeGreaterThan(total(wrathSignatureFrame("hit", 0)));
  });
});
