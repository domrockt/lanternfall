import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS, ENEMY_PROJECTILES } from "../src/gfx/textures";
import {
  analyzeCapturedFx,
  analyzeFxGuard,
  analyzeGrid,
  analyzePixelGrid,
  collectChestKeys,
  collectEvolutionSources,
  collectStaticSources,
  ditherMetrics,
  makeFakeDocument,
  scaleCoverage,
  summarize,
  violationsPerKey,
} from "../scripts/art/palette-check.mjs";
import { GEN_ENEMIES } from "../src/gfx/gen-enemies";
import { GEN_BOSSES } from "../src/gfx/gen-bosses";
import { GEN_CHARS } from "../src/gfx/gen-chars";
import { GEN_ICONS } from "../src/gfx/gen-icons";
import { GEN_PROPS } from "../src/gfx/gen-props";
import { GEN_TITLE } from "../src/gfx/gen-title";
import { GEN_UI } from "../src/gfx/gen-ui";
import { createFxTextures, deathFrameSets, EVOLUTION_SIGNATURES, EVOLUTION_SIGNATURE_IDS, mixelBakes, mixelLevel1Frames, mixelLevelFor, mixelMaxLevel, SIGNATURE_FRAME_COUNT, signatureFrame, signatureTextureKey, SOUL_SIGNATURE_SIZE } from "../src/gfx/gen-fx";
import * as genFxMod from "../src/gfx/gen-fx";
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
  // M10-palette-guard-evo: Hebel-Pointer je Basis-Key (wo drehen, welcher Job).
  for (const g of violationsPerKey(assets as never).slice(0, limit)) {
    lines.push(`  Hebel: ${g.lever} — betroffener Job: ${g.job} (${g.file} :: ${g.key}, ${g.frames} Frame(s))`);
  }
  return lines.join("\n");
}

function expectPaletteClean(assets: Asset[]): void {
  const summary = summarize(assets);
  expect(
    summary.offPalette + summary.alphaViolations,
    `Pixel ausserhalb der 32-Palette oder mit Alpha ∉ {0,255}:\n${formatViolations(assets)}`,
  ).toBe(0);
}

/** Alle statischen Zeichen-Grids aus textures.ts + gen-*.ts. (Ergebnis wird
 *  geteilt: die Grids sind reine Daten, K2-Grün-Schnitt haelt die Suite < 3 s.) */
let staticsCache: Asset[] | null = null;
function staticAssets(): Asset[] {
  if (staticsCache) return staticsCache;
  staticsCache = collectStaticSources({
    textures: { SPRITE_GRIDS, ENEMY_PROJECTILES },
    genEnemies: { GEN_ENEMIES },
    genBosses: { GEN_BOSSES },
    genChars: { GEN_CHARS },
    genIcons: { GEN_ICONS },
    genProps: { GEN_PROPS },
    genTitle: { GEN_TITLE },
    genUi: { GEN_UI },
  }).map((g) => analyzeGrid(g.name, g.file, g.rows, g.w, g.h, PAL));
  return staticsCache;
}

/** Numerische Pixel-Grids, aus denen die Laufzeit-Gegner-/Boss-Texturen entstehen. */
let numericCache: Asset[] | null = null;
function numericAssets(): Asset[] {
  if (numericCache) return numericCache;
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
  numericCache = out;
  return out;
}

/** FX-Texturen: echte Canvas-Farben gegen die Palette-HEX-Werte pruefen. */
let fxCaptureCache: Asset[] | null = null;
function fxAssets(): Asset[] {
  if (fxCaptureCache) return fxCaptureCache;
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
  fxCaptureCache = analyzeCapturedFx(captured, PAL);
  return fxCaptureCache;
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

  // Karte 3: Regressionsprobe. Der Guard darf nicht stillschweigend leer laufen.
  it("Negativprobe: 1 absichtlich falscher Farbwert macht den Guard rot", () => {
    // 'z' ist kein Palettenzeichen (nur 0-9, a-v). Das Grid muss auffallen.
    const bad = analyzeGrid("negativ-probe", "tests/palette-compliance.test.ts", ["0z0"], 3, 1, PAL);
    expect(bad.offPalette).toBe(1);
    expect(bad.violations[0]).toMatchObject({ x: 1, y: 0, index: 1, char: "z", reason: "off-palette" });
    expect(summarize([bad]).offPalette).toBe(1);

    // Auch ein numerischer Index ausserhalb 0..31 ist ein Verstoss.
    const badNum = analyzePixelGrid("negativ-index", "tests/palette-compliance.test.ts", [[32, 0, PAL.length]], PAL);
    expect(badNum.offPalette).toBe(2);

    // Und der echte Guard-Assert waere rot, nicht still gruen.
    expect(() => expectPaletteClean([bad]), "Guard muss bei Off-Palette werfen").toThrow(/off-palette|Palette/);
  });

  it("Laufzeit der Compliance-Pruefung < 2 s", () => {
    const t0 = performance.now();
    const assets = [...staticAssets(), ...numericAssets(), ...fxAssets()];
    expectPaletteClean(assets);
    const ms = performance.now() - t0;
    expect(ms, `Guard-Laufzeit ${ms.toFixed(1)} ms`).toBeLessThan(2000);
    console.log(`[palette-guard] ${assets.length} Grids/Frames geprueft in ${ms.toFixed(1)} ms`);
  });
});

// ── M10 FX-Frame-Guard (Lane m10-palette-fx-guard, Karten #7401/#7402) ──────
// Repraesentative FX-Menge (Evo-Signaturen, Boss-FX, ADD-Glows/Mixel-Basen)
// gegen die Mixel-Regeln pruefen: Palette-Index-Gueltigkeit, binaeres Alpha,
// Dither nur an Uebergangskanten (<= 2 px Band), Draw-Scale > 1 nur mit
// Mixel-Bake >= Scale. Baseline: tests/fixtures/palette-fx-guard.json (K1).

interface FxGuardFixture {
  meta: { sets: number; frames: number };
  frames: Record<string, { w: number; h: number; rows: string[] }>;
  metrics: Record<string, { w: number; h: number; frames: Array<{ frame: number; offPalette: number; alphaViolations: number; ditherPixels: number; ditherBandPx: number }> }>;
  scaleCoverage: Array<{ key: string; maxScale: number; source: string; covered: boolean; effectiveScale: number }>;
  knownFindings: Array<{ key: string; maxScale: number; effectiveScale: number; reason: string }>;
  ditherFindings: Array<{ key: string; bandPx: number }>;
}

const fxGuardFixture = JSON.parse(
  readFileSync(new URL("./fixtures/palette-fx-guard.json", import.meta.url), "utf8"),
) as FxGuardFixture;

/** Mixel-Regel als harte Assertion: kein FX-Frame darf ein Dither-Band > 2 px
 *  haben (Dom 21:45Z: Dither nur an Uebergangskanten 1-2 px, Kerne flae). */
function expectFxMixelClean(assets: Array<Asset & { dither?: { bandPx: number } }>): void {
  const bad = assets.filter((a) => (a.dither?.bandPx ?? 0) > 2);
  expect(
    bad.length,
    `Dither-Band > 2 px in: ${bad.map((a) => `${a.name} (bandPx ${a.dither?.bandPx})`).join(", ")}`,
  ).toBe(0);
}

/** Repraesentative FX-Menge live aus den public exports von gen-fx.ts
 *  (Spiegel von collectRepresentative in scripts/m10-palette-fx-guard.mjs). */
function representativeFxSets(): Array<{ key: string; w: number; h: number; frames: string[][] }> {
  const sets: Array<{ key: string; w: number; h: number; frames: string[][] }> = [];
  for (const id of EVOLUTION_SIGNATURE_IDS) {
    const sig = EVOLUTION_SIGNATURES[id];
    for (const kind of ["hit", "death"] as const) {
      sets.push({
        key: signatureTextureKey(id, kind), w: 32, h: 32,
        frames: Array.from({ length: SIGNATURE_FRAME_COUNT }, (_, i) => signatureFrame(sig.shape, sig.palette, i, kind)),
      });
    }
  }
  for (const [key, def] of Object.entries(deathFrameSets())) {
    sets.push({ key, w: def.w, h: def.h, frames: def.frames });
  }
  for (const [base, def] of Object.entries(mixelLevel1Frames())) {
    sets.push({ key: base, w: def.w, h: def.h, frames: def.frames });
  }
  for (const bake of mixelBakes()) {
    sets.push({ key: `${bake.base}@${bake.level}`, w: bake.w, h: bake.h, frames: bake.frames });
  }
  return sets;
}

describe("M10 FX-Frame-Guard: gerenderte FX-Frames (repraesentative Menge)", () => {
  const live = representativeFxSets();

  it("Fixture ist aktuell (Sammler nach gen-fx-Aenderung neu laufen lassen)", () => {
    const liveKeys = live.map((s) => s.key).sort();
    const baseKeys = Object.keys(fxGuardFixture.metrics).sort();
    expect(liveKeys, "Fixture veraltet: node scripts/m10-palette-fx-guard.mjs ausfuehren").toEqual(baseKeys);
  });

  it("Palette-Index-Gueltigkeit + binaeres Alpha fuer alle FX-Frames", () => {
    const bad: string[] = [];
    for (const s of live) {
      for (let i = 0; i < s.frames.length; i++) {
        const a = analyzeFxGuard(`${s.key}#${i}`, "src/gfx/gen-fx.ts (live)", s.frames[i], s.w, s.h, PAL);
        if (a.offPalette > 0) bad.push(`${s.key}#${i} off-palette ${a.offPalette}`);
        // Char-Grids haben per Konstruktion binaeres Alpha; jede Verletzung
        // waere hier ein Decode-Fehler und zaehlt als off-palette.
        if (a.alphaViolations > 0) bad.push(`${s.key}#${i} alpha ${a.alphaViolations}`);
      }
    }
    expect(bad, `FX-Frames verletzen die Pixel-Invariante:\n  ${bad.join("\n  ")}`).toEqual([]);
    expect(live.length).toBeGreaterThanOrEqual(34);
  });

  it("Mixel-Heuristik: Dither-Band wachst nicht ueber die Fixture-Baseline", () => {
    const worse: string[] = [];
    const findings: string[] = [];
    for (const s of live) {
      const base = fxGuardFixture.metrics[s.key];
      expect(base, `Set fehlt in Fixture: ${s.key}`).toBeDefined();
      expect(base.frames.length, `Framezahl geaendert: ${s.key} (Sammler neu laufen lassen)`).toBe(s.frames.length);
      for (let i = 0; i < s.frames.length; i++) {
        const liveBand = ditherMetrics(s.frames[i]).bandPx;
        const baseBand = base.frames[i].ditherBandPx;
        if (liveBand > baseBand) worse.push(`${s.key}#${i} live ${liveBand} > baseline ${baseBand}`);
        if (liveBand > 2) findings.push(`${s.key}#${i}`);
      }
    }
    expect(worse, "Dither-Regression gegen Fixture-Baseline:\n  " + worse.join("\n  ")).toEqual([]);
    // Bekannte Befunde duerfen nur schrumpfen, nie neu entstehen: die Menge der
    // Frames mit bandPx > 2 muss exakt der gepinnten ditherFindings entsprechen
    // (der per-Frame-Vergleich oben erfaesst Verschlechterung, dieser die Menge).
    const pinnedKeys = (fxGuardFixture.ditherFindings ?? []).map((f: { key: string }) => f.key).sort();
    expect(
      findings.sort(),
      "Neue Dither-Befunde > 2 px (nicht gepinnt):\n  " + findings.join("\n  "),
    ).toEqual(pinnedKeys);
    console.log(`[fx-guard] Dither-Befunde > 2 px (gepinnt): ${pinnedKeys.length} Frames`);
  });

  it("Draw-Scale-Coverage: ungedeckte Keys == gepinnte knownFindings", () => {
    const liveUncovered = fxGuardFixture.scaleCoverage
      .map((m) => scaleCoverage(m.key, m.maxScale, { mixelMaxLevel, mixelLevelFor }))
      .filter((c) => !c.covered);
    const expand = (key: string): string[] =>
      key.includes("*") ? EVOLUTION_SIGNATURE_IDS.map((id) => key.replace("*", id)) : [key];
    const liveKeys = liveUncovered.flatMap((c) => expand(c.key)).sort();
    const pinnedKeys = fxGuardFixture.knownFindings.map((f) => f.key).sort();
    expect(
      liveKeys,
      `Neue ungedeckte Draw-Scales (Mixel-Bake fehlt):\n  ${liveKeys.join("\n  ")}`,
    ).toEqual(pinnedKeys);
    expect(pinnedKeys.length).toBeGreaterThanOrEqual(13);
  });

  // ── Negative Fixtures: bekannte Mixel-Befunde schlagen nachweislich an ──

  it("Negativprobe Phoenix-Dither: flaechiges Schachbrett schlaegt an, 2-px-Kante bleibt gruen", () => {
    // Befund "Phoenix-Dither": Halftone-Kern statt flaechig hellem Kern.
    const dither = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => ((x + y) % 2 === 0 ? "c" : "6")).join(""),
    );
    const m = ditherMetrics(dither);
    expect(m.bandPx, "Schachbrett-Kern muss als Dither > 2 px auffallen").toBeGreaterThan(2);
    const asset = analyzeFxGuard("negativ-phoenix-dither", "tests/palette-compliance.test.ts", dither, 16, 16, PAL);
    // Rot: die Mixel-Regel schlaegt beim Halftone-Kern nachweislich an.
    expect(() => expectFxMixelClean([asset]), "Guard muss bei Halftone-Kern werfen")
      .toThrow(/Dither-Band > 2 px/);
    // Gruen-Gegenprobe: Dither nur als 2-px-Uebergangskante am flachen Kern.
    const green = Array.from({ length: 16 }, (_, y) =>
      Array.from({ length: 16 }, (_, x) => {
        if (y < 7) return "c"; // flaechig heller Kern
        if (y < 9) return (x + y) % 2 === 0 ? "c" : "6"; // 2-px-Kante
        return "6"; // Flaeche
      }).join(""),
    );
    expect(ditherMetrics(green).bandPx, "2-px-Uebergangskante ist erlaubt").toBeLessThanOrEqual(2);
    expectFxMixelClean([analyzeFxGuard("gruen-2px-kante", "tests/palette-compliance.test.ts", green, 16, 16, PAL)]);
  });

  it("Negativprobe Winter-fogBlue + hazard-disc milky: Haze-Band und fraktionale Alpha schlagen an", () => {
    // Befund "Winter-fogBlue": milchiges fogBlue-Haze-Band ueber > 2 px.
    const haze = Array.from({ length: 20 }, (_, y) =>
      Array.from({ length: 20 }, (_, x) => {
        const d = Math.hypot(x - 9.5, y - 9.5);
        if (d > 8) return ".";
        if (d > 5) return (x + y) % 2 === 0 ? "6" : "9"; // fogBlue/paleMist-Haze
        return "9"; // Kern
      }).join(""),
    );
    expect(ditherMetrics(haze).bandPx, "Haze-Band muss als Dither > 2 px auffallen").toBeGreaterThan(2);

    // Befund "hazard-disc milky": fraktionale Alpha-Werte im Canvas-FX.
    const captured = new Map<string, { width: number; height: number; px: Map<number, { color: number; alpha: number }> }>();
    const canvas = {
      width: 4, height: 4,
      px: new Map<number, { color: number; alpha: number }>([
        [0, { color: PAL[6], alpha: 0.5 }], // milky
        [1, { color: PAL[9], alpha: 1 }],
        [5, { color: PAL[6], alpha: 0.25 }],
        [6, { color: PAL[6], alpha: 1 }],
      ]),
    };
    captured.set("fx_negativ_milky", canvas as never);
    const assets = analyzeCapturedFx(captured as never, PAL);
    expect(assets[0].alphaViolations, "fraktionale Alpha muss als Verstoss zaehlen").toBe(2);
    expect(() => expectPaletteClean(assets as never), "Guard muss bei milky-Alpha werfen").toThrow(/Alpha|alpha/i);

    // Gruen-Gegenprobe: binaeres Alpha (0/1) ist sauber.
    const ok = new Map<string, unknown>();
    ok.set("fx_ok", {
      width: 2, height: 1,
      px: new Map<number, { color: number; alpha: number }>([[0, { color: PAL[6], alpha: 1 }]]),
    });
    expect(analyzeCapturedFx(ok as never, PAL)[0].alphaViolations).toBe(0);
  });

  it("Laufzeit des FX-Frame-Guards < 3 s", () => {
    const t0 = performance.now();
    for (const s of live) {
      for (const rows of s.frames) {
        analyzeFxGuard(s.key, "src/gfx/gen-fx.ts (live)", rows, s.w, s.h, PAL);
      }
    }
    const ms = performance.now() - t0;
    expect(ms, `FX-Guard-Laufzeit ${ms.toFixed(1)} ms`).toBeLessThan(3000);
    console.log(`[fx-guard] ${live.length} Sets in ${ms.toFixed(1)} ms geprueft`);
  });
});

// ── M10-palette-guard-evo (K2, Grün-Schnitt, 2026-11-28) ────────────────────
// Alles hier besteht auf aktuellem main und ist ab jetzt Harte Schranke. Die
// Evo-FX-Kette (zornpendel, gewittersiegel, dornensturm, winter-w2, form-polish)
// und die wartenden Merges (chest-reveal, evo-fx-winter) koennen neue Texturen
// nur noch ueber bewusste Pflege dieser Assertions einschleppen; ein Verstoß
// faellt mit Datei+Key+Hebel auf (siehe violationsPerKey/leverFor).
describe("M10 palette-guard-evo: Evo-FX-, Boss- und Truhen-Keys (Grün-Schnitt)", () => {
  const statics = staticAssets();
  const numeric = numericAssets();
  const fx = fxAssets();

  it("Gegner-Geschosse (ENEMY_PROJECTILES) sind erfasst und palette-clean", () => {
    const shots = statics.filter((a) => a.file === "src/gfx/textures.ts" && a.name.startsWith("enemy_shot"));
    expect(shots.map((a) => a.name).sort(), "ENEMY_PROJECTILES unvollstaendig erfasst").toEqual(
      Object.keys(ENEMY_PROJECTILES).sort(),
    );
    expect(shots.length).toBeGreaterThanOrEqual(5);
    expectPaletteClean(shots);
  });

  it("Evo-Signaturen: hit+death je Evolution, gebackene Zielgroesse, palette-clean", () => {
    const sets = collectEvolutionSources(genFxMod);
    expect(sets.map((s) => s.key).sort()).toEqual(
      EVOLUTION_SIGNATURE_IDS.flatMap((id) => [signatureTextureKey(id, "death"), signatureTextureKey(id, "hit")]).sort(),
    );
    expect(sets.length, "Evo-Signatur-Sets (hit+death je Evolution)").toBeGreaterThanOrEqual(12);
    for (const s of sets) {
      expect(s.frames.length).toBe(SIGNATURE_FRAME_COUNT);
      const expected = s.baked ? (s.id === "phoenix" ? 128 : SOUL_SIGNATURE_SIZE) : 32;
      expect(s.w, `${s.key}: gebackene Zielgroesse`).toBe(expected);
      s.frames.forEach((rows, i) => {
        const a = analyzeFxGuard(`${s.key}#${i}`, "src/gfx/gen-fx.ts (evo)", rows, s.w, s.h, PAL);
        expect(a.offPalette + a.alphaViolations, `Evo-Signatur ${s.key}#${i} verletzt die Pixel-Invariante`).toBe(0);
      });
      // Die LAUFZEIT-Textur kommt aus derselben Quelle (Canvas-Erfassung).
      expect(
        fx.some((a) => a.name === s.key || a.name.startsWith(`${s.key}_`)),
        `Evo-Signatur fehlt in der Canvas-Erfassung: ${s.key}`,
      ).toBe(true);
    }
  });

  it("Truhen-Grids (chest_*) sind erfasst und palette-clean", () => {
    // Ratchet: chest-reveal-Merge erweitert diese Liste bewusst.
    expect(collectChestKeys(statics).sort()).toEqual(["chest_closed", "chest_open"]);
    expectPaletteClean(statics.filter((a) => a.name.startsWith("chest")));
  });

  it("Boss-Quellen (gen-bosses, bossSpriteFrames, fx_boss_core) sind erfasst und palette-clean", () => {
    expect(statics.some((a) => a.file === "src/gfx/gen-bosses.ts"), "gen-bosses fehlt in der Compliance").toBe(true);
    const bossFrames = numeric.filter((a) => a.name.startsWith("boss_"));
    expect(bossFrames.length, "Boss-Frames").toBeGreaterThanOrEqual(BOSSES.length);
    expect(
      fx.some((a) => a.name === "fx_boss_core" || a.name.startsWith("fx_boss_core_")),
      "fx_boss_core fehlt in der FX-Erfassung",
    ).toBe(true);
    expectPaletteClean(bossFrames);
  });

  it("Grün-Schnitt: violationsPerKey liefert 0 Gruppen (Hebel-Pointer greifen im roten Fall)", () => {
    const groups = violationsPerKey([...statics, ...numeric, ...fx] as never);
    expect(
      groups,
      "Off-Palette-Keys mit Hebel:\n" + groups.map((g) => `  ${g.file} :: ${g.key} — ${g.lever} (${g.job})`).join("\n"),
    ).toEqual([]);
  });
});
