import { describe, expect, it } from "vitest";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS } from "../src/gfx/textures";
import {
  analyzeCapturedFx,
  analyzeGrid,
  analyzePixelGrid,
  collectStaticSources,
  makeFakeDocument,
  summarize,
} from "../scripts/art/palette-check.mjs";
import { GEN_ENEMIES } from "../src/gfx/gen-enemies";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { GEN_CHARS } from "../src/gfx/gen-chars";
import { GEN_ICONS } from "../src/gfx/gen-icons";
import { GEN_PROPS } from "../src/gfx/gen-props";
import { GEN_TITLE } from "../src/gfx/gen-title";
import { GEN_UI } from "../src/gfx/gen-ui";
import { createFxTextures } from "../src/gfx/gen-fx";
import { bossSpriteFrames, enemySpriteFrames } from "../src/gfx/enemySprites";
import { BOSSES, ENEMY_LIST } from "../src/data";

/**
 * M10 palette-guard: harte Pixel-Invariante fuer jede Lane.
 *
 * Jedes Sprite-/Effekt-Pixel muss entweder transparent (`.`) oder ein Index in
 * `src/palette.ts` (0..31) sein. Es gibt in den Zeichen-Grids keine Alpha-Felder
 * (nur `.` oder Index), deshalb sind Halbtransparenz-Kanten per Konstruktion
 * ausgeschlossen. Der Guard prueft zusaetzlich numerische Pixel-Grids
 * (`enemySprites.ts`) und alle vom Canvas erzeugten FX-Farben.
 */

type Asset = ReturnType<typeof analyzeGrid>; // strukturell gleich fuer Pixel-/FX-Grids

function formatViolations(assets: Asset[], limit = 20): string {
  const bad = assets.filter((a) => a.offPalette + a.alphaViolations > 0);
  const lines: string[] = [];
  for (const a of bad.slice(0, limit)) {
    const first = a.violations[0];
    const where = first
      ? ` erster Verstoss: pixel ${first.index} @(${first.x},${first.y}) char="${"char" in first ? first.char : ""}" color="${"color" in first ? first.color : ""}"`
      : "";
    lines.push(`  ${a.file} :: ${a.name} (${a.w}x${a.h}) — off-palette ${a.offPalette}, alpha ${a.alphaViolations}${where}`);
  }
  const rest = bad.length - Math.min(limit, bad.length);
  if (rest > 0) lines.push(`  … und ${rest} weitere Assets`);
  return lines.join("\n");
}

function expectPaletteClean(assets: Asset[]): void {
  const summary = summarize(assets);
  expect(
    summary.offPalette + summary.alphaViolations,
    `Pixel ausserhalb der 32-Palette oder mit Alpha ∉ {0,255}:\n${formatViolations(assets)}`,
  ).toBe(0);
}

/** Alle statischen Zeichen-Grids aus textures.ts + gen-*.ts. */
function staticAssets(): Asset[] {
  return collectStaticSources({
    textures: { SPRITE_GRIDS },
    genEnemies: { GEN_ENEMIES },
    genBosses: { GEN_BOSSES },
    genChars: { GEN_CHARS },
    genIcons: { GEN_ICONS },
    genProps: { GEN_PROPS },
    genTitle: { GEN_TITLE },
    genUi: { GEN_UI },
  }).map((g) => analyzeGrid(g.name, g.file, g.rows, g.w, g.h, PAL));
}

/** Numerische Pixel-Grids, aus denen die Laufzeit-Gegner-/Boss-Texturen entstehen. */
function numericAssets(): Asset[] {
  const out: Asset[] = [];
  ENEMY_LIST.forEach((def, i) => {
    enemySpriteFrames(i).forEach((grid, f) => {
      out.push(analyzePixelGrid(`${def.spriteKey}#${f}`, "src/gfx/enemySprites.ts", grid, PAL));
    });
  });
  BOSSES.forEach((boss, i) => {
    bossSpriteFrames(i).forEach((grid, f) => {
      out.push(analyzePixelGrid(`boss_${boss.id}#${f}`, "src/gfx/enemySprites.ts", grid, PAL));
    });
  });
  return out;
}

/** FX-Texturen: echte Canvas-Farben gegen die Palette-HEX-Werte pruefen. */
function fxAssets(): Asset[] {
  const captured = new Map<string, { width: number; height: number; px: Map<number, { color: number; alpha: number }> }>();
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = makeFakeDocument(captured);
  try {
    createFxTextures({
      textures: { exists: () => false, addCanvas: (key: string, canvas: unknown) => captured.set(key, canvas as never) },
    } as never);
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
  }
  return analyzeCapturedFx(captured, PAL);
}

describe("M10 palette-guard: Pixel-Compliance", () => {
  it("alle Sprite-/Effekt-Grids nutzen nur Palettenfarben (0..31) oder Transparenz", () => {
    const assets = [...staticAssets(), ...numericAssets(), ...fxAssets()];
    // Der Guard darf nicht stillschweigend leer laufen.
    expect(assets.length).toBeGreaterThan(250);
    expectPaletteClean(assets);
  });

  it("Guard deckt alle Quellen ab (textures, gen-*, enemySprites, FX)", () => {
    const statics = staticAssets();
    const numeric = numericAssets();
    const fx = fxAssets();
    expect(statics.some((a) => a.file === "src/gfx/textures.ts")).toBe(true);
    for (const file of [
      "src/gfx/gen-enemies.ts", "src/gfx/gen-bosses.ts", "src/gfx/gen-chars.ts",
      "src/gfx/gen-icons.ts", "src/gfx/gen-props.ts", "src/gfx/gen-title.ts", "src/gfx/gen-ui.ts",
    ]) expect(statics.some((a) => a.file === file), `Quelle fehlt: ${file}`).toBe(true);
    expect(numeric.length).toBeGreaterThanOrEqual(ENEMY_LIST.length + BOSSES.length);
    expect(fx.length).toBeGreaterThan(70);
    const s = summarize([...statics, ...numeric, ...fx]);
    expect(s.opaque).toBeGreaterThan(200000);
    expect(s.transparentPct).toBeGreaterThan(0);
  });
});
