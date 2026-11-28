/**
 * m10-boot-glow-local K3 (rev., Versuch 2) → Swap durch m10-texture-glow-swap-r2.
 *
 * Die Stufen-Implementierung (LIGHT_EDGE_STEPS/vignetteSteps, pro-Pixel-
 * Multiplikation, B2-Farb-Kern) ist seit dem Swap in src/gfx/textures.ts
 * heimisch (exportierte Creator) — die Guards dazu liegen in
 * tests/boot-light-textures-w2.test.ts. Diese Datei prueft den GEGENSEITE:
 * den Swap-Kontrakt in Boot.ts — kein Local-Duplikat mehr, Import + Aufruf
 * der exportierten Creator, keine Zeichnpfad-Reste in Boot.ts.
 *
 * Boot.ts ist eine Phaser-Szene und nicht headless importierbar; die Pruefung
 * laeuft als Quelltext-Check (Muster tests/chaos-glow-runpath.test.ts).
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BOOT_TS = readFileSync(new URL("../src/scenes/Boot.ts", import.meta.url), "utf8");
/** Quelltext ohne Kommentarzeilen (Guards zielen auf aktiven Code). */
const BOOT_CODE = BOOT_TS.split("\n")
  .filter((l: string) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

describe("Boot.ts konsumiert die exportierten Creator (Swap, m10-texture-glow-swap-r2)", () => {
  it("kein Local-Duplikat mehr in Boot.ts (createLightTextureLocal/createVignetteTextureLocal weg)", () => {
    expect(BOOT_TS).not.toContain("createLightTextureLocal");
    expect(BOOT_TS).not.toContain("createVignetteTextureLocal");
  });

  it("keine Port-Reste in Boot.ts (Tabellen/Zeichnpfad sind nach textures.ts gezogen)", () => {
    expect(BOOT_TS).not.toContain("const LIGHT_EDGE_STEPS");
    expect(BOOT_TS).not.toContain("function vignetteSteps()");
    expect(BOOT_CODE).not.toContain("getImageData");
    expect(BOOT_CODE).not.toContain("putImageData");
    expect(BOOT_CODE).not.toContain("destination-in");
    expect(BOOT_CODE).not.toContain("createRadialGradient");
    expect(BOOT_CODE).not.toContain('const key = "light_radius"');
    expect(BOOT_CODE).not.toContain('const key = "vignette"');
  });

  it("Boot.ts importiert die Creator aus src/gfx/textures.ts und ruft sie auf", () => {
    // m10-loading-screen: Boot erzeugt nur Titel-Texturen; createAllTextures
    // entfaellt (alles Weitere uebernimmt die Loading-Szene/GPU-Warmup).
    expect(BOOT_TS).toContain('import { addGridTexture, createLightTexture, createVignetteTexture } from "../gfx/textures";');
    expect(BOOT_TS).toMatch(/  createLightTexture\(scene\);\n  createVignetteTexture\(scene\);/);
  });

  it("Deckel-Doku bleibt erhalten (RUN-seitiger Alpha/Blend-Deckel, B2-Run-Anteil)", () => {
    expect(BOOT_TS).toContain("RUN_LIGHT_ALPHA_MAX");
  });
});
