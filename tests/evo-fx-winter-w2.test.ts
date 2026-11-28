// m10-evo-fx-winter-w2, K1: Tint-/Alpha-Invariante des Aura-Siegels (ring_frost).
// Hintergrund (docs/lanes/m10-evo-fx-winter.md, art-director Runde 2): ein multiplikativer
// fogBlue-Tint am FX-Spawn drückte paleMist (#8fa0a6) auf ≈ #2c3540 — Aura-Siegel 3.5/5 FAIL
// auf hellem Moor-Grund. Der Fix (Tint streichen) ist mit Winter-Versuch 3 in main (4787abc);
// dieser Guard sichert den Pfad dauerhaft: CombatSystem.ts darf an den Winter-FX-Spawns
// keinen fogBlue-Tint setzen, und die Aura-Alpha-Werte bleiben unverändert.
// Muster: tests/evo-fx-winter.test.ts (Quelltext-Guard).
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

const combatSrc = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");

/** Block eines fx.spawn/spawnAnim-Aufrufs (Textur bis schließender Klammer). */
function spawnBlock(src: string, texture: string, fromIndex = 0): string {
  const at = src.indexOf(`texture: "${texture}"`, fromIndex);
  expect(at).toBeGreaterThanOrEqual(0);
  const end = src.indexOf("});", at);
  return src.slice(at, end);
}

describe("m10-evo-fx-winter-w2: Aura-Siegel-Tint-Invariante (art-director Runde 2 FAIL)", () => {
  it("CombatSystem.ts setzt nirgends den fogBlue-Tint an FX-Spawns (paleMist bleibt paleMist)", () => {
    // Der multiplikative Tint drückte die Pale-Töne der Textur-Treppe auf ~#2c3540.
    // Erlaubt ist fogBlue nur in Kommentaren — als Tint-Argument nie.
    expect(combatSrc).not.toContain("tint: PAL[C.fogBlue]");
  });

  it("Aura-Siegel-Spawn (updateWinter, ring_frost): alpha 0.55→0.2, NORMAL-Blend, tintfrei", () => {
    // Aura-Spawn = das ring_frost-fx.spawn innerhalb updateWinter (nach "private updateWinter").
    const updateWinterAt = combatSrc.indexOf("private updateWinter");
    expect(updateWinterAt).toBeGreaterThan(0);
    const aura = spawnBlock(combatSrc, "ring_frost", updateWinterAt);
    expect(aura).toContain("alphaFrom: 0.55");
    expect(aura).toContain("alphaTo: 0.2");
    expect(aura).toContain("additive: false");
    expect(aura).not.toContain("tint:");
  });

  it("Frostnova-ring_frost unverändert: alpha 1→0 (Trefferverhalten/FX-Signatur stabil)", () => {
    const nova = spawnBlock(combatSrc, "ring_frost");
    expect(nova).toContain("alphaFrom: 1, alphaTo: 0");
    expect(nova).toContain("additive: false");
    expect(nova).not.toContain("tint:");
  });
});
