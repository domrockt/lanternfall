#!/usr/bin/env node
/**
 * M10 FX-Frame-Guard — Sammler (Lane m10-palette-fx-guard, Karte K1).
 *
 * Extrahiert die repraesentative FX-Menge ueber die ÖFFENTLICHEN Exporte von
 * `src/gfx/gen-fx.ts` (KEINE Aenderung an gen-fx.ts/textures.ts/FxSystem.ts —
 * Evo-Kette) und sichert sie als JSON-Fixture nach
 * `tests/fixtures/palette-fx-guard.json`:
 *
 *   - 12 Evo-Signaturen (hit/death je 4 Frames) via evolutionSignatureTextureDef
 *     in der realen Laufzeit-Groesse (5 baked 128/96, thunder_seal 32x32)
 *   - Boss-FX fx_boss_core (6 Frames, 32x32) via deathFrameSets()
 *   - 4 Mixel-Basen Level-1 via mixelLevel1Frames() + alle Bakes >= 2 via
 *     mixelBakes() (Metrik + erster Frame)
 *   - Scale-Manifest: kuratierte max. Laufzeit-Draw-Scales MIT Quellenangabe,
 *     Mixel-Coverage via mixelMaxLevel/mixelLevelFor; nicht gedeckte Keys landen
 *     in knownFindings und werden im Test als Ratchet gepinnt.
 *
 * Ergebnis: Fixture + Report `shots/m10-palette-fx-guard-report.json` (Beleg).
 * Aufruf: node scripts/m10-palette-fx-guard.mjs
 */
import { createServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { analyzeFxGuard, ditherMetrics, scaleCoverage } from "./art/palette-check.mjs";

/**
 * Kuratierte max. Laufzeit-Draw-Scales der repraesentativen FX mit Quellen.
 * M10-fx-bakes-evo-r2 (K1): auf Ist der Evo-Kette gehoben — 5 Signaturen sind
 * in Zielgroesse gebacken (drawScale [1,1], Draw-Scale 1) und gelten damit als
 * gedeckt; thunder_seal bleibt 32x32 @ 3,2-4,6 (spawnEvolution-Fallback).
 * Bei Aenderungen der Spawn-Sites hier nachziehen — der Test pinnt
 * effectiveScale gegen die Fixture.
 */
const SCALE_MANIFEST = [
  // Baked-Signaturen: Textur in Zielgroesse, Draw-Scale 1 (Mixel-Regel erfuellt).
  ...["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "soul_beacon"].flatMap((id) => [
    { key: `fx_evo_hit_${id}`, maxScale: 1, source: `src/gfx/gen-fx.ts EVOLUTION_SIGNATURES.${id}.drawScale [1,1] — baked in Zielgroesse (evolutionSignatureTextureDef)` },
    { key: `fx_evo_death_${id}`, maxScale: 1, source: `src/gfx/gen-fx.ts EVOLUTION_SIGNATURES.${id}.drawScale [1,1] — baked in Zielgroesse (evolutionSignatureTextureDef)` },
  ]),
  // thunder_seal: noch 32x32-Quelle, spawnEvolution-Fallback Hit 3,2->3,6 / Death 4,0->4,6.
  { key: "fx_evo_hit_thunder_seal", maxScale: 3.6, source: "src/systems/FxSystem.ts spawnEvolution: Hit 3,2 -> 3,6 (ohne drawScale)" },
  { key: "fx_evo_death_thunder_seal", maxScale: 4.6, source: "src/systems/FxSystem.ts spawnEvolution: Death 4,0 -> 4,6 (ohne drawScale)" },
  { key: "fx_boss_core", maxScale: 3.6, source: "src/scenes/Run.ts spawnAnim 1,6 -> 3,6; src/logic/death.ts rimScale 1,2-1,25" },
  { key: "fx_halo", maxScale: 4.6, source: "src/gfx/gen-fx.ts MIXEL_BAKE_DEFS-Kommentar: fx_halo bis 4,6 (Boss-Tod)" },
  { key: "fx_shock", maxScale: 3.3, source: "src/gfx/gen-fx.ts MIXEL_BAKE_DEFS-Kommentar: shock bis 3,3" },
  { key: "fx_fire", maxScale: 1.9, source: "src/gfx/gen-fx.ts MIXEL_BAKE_DEFS-Kommentar: fire < 2 + Reserve" },
  { key: "fx_halo_cold", maxScale: 1.9, source: "src/gfx/gen-fx.ts MIXEL_BAKE_DEFS-Kommentar: cold < 2 + Reserve" },
];

/** Signsatur-/Boss-/Mixel-Frames einsammeln und Guard-Metriken je Set berechnen. */
function collectRepresentative(genFx, pal) {
  const sets = []; // { key, file, w, h, frames: string[][], framesFull: boolean }

  // Evo-Signaturen: 12 Sets (6 Evolutionen x hit/death) je 4 Frames, in der
  // REALEN Laufzeit-Groesse (M10-fx-bakes-evo-r2 K1): 5 Signaturen baked in
  // Zielgroesse (128/96 @ drawScale [1,1]), thunder_seal 32x32.
  for (const id of genFx.EVOLUTION_SIGNATURE_IDS) {
    for (const kind of ["hit", "death"]) {
      const def = genFx.evolutionSignatureTextureDef(id, kind);
      sets.push({
        key: genFx.signatureTextureKey(id, kind),
        file: "src/gfx/gen-fx.ts evolutionSignatureTextureDef",
        w: def.w, h: def.h,
        frames: def.frames,
        framesFull: true,
      });
    }
  }

  // Boss-FX + Todes-Frames: exportierte Frame-Sets (Rows direkt).
  const deaths = genFx.deathFrameSets();
  for (const [key, def] of Object.entries(deaths)) {
    sets.push({
      key, file: "src/gfx/gen-fx.ts deathFrameSets",
      w: def.w, h: def.h, frames: def.frames, framesFull: true,
    });
  }

  // Mixel-Basen Level-1 (Quelle der normalen Texturen).
  const level1 = genFx.mixelLevel1Frames();
  for (const [base, def] of Object.entries(level1)) {
    sets.push({
      key: base, file: "src/gfx/gen-fx.ts mixelLevel1Frames",
      w: def.w, h: def.h, frames: def.frames, framesFull: true,
    });
  }

  // Bakes >= 2: Metrik fuer alle Frames, Rows nur fuer Frame 0 (Umfang).
  for (const bake of genFx.mixelBakes()) {
    sets.push({
      key: `${bake.base}@${bake.level}`,
      file: "src/gfx/gen-fx.ts mixelBakes",
      w: bake.w, h: bake.h,
      frames: bake.frames, framesFull: false,
    });
  }
  return sets;
}

async function main() {
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const palette = await server.ssrLoadModule("/src/palette.ts");
    const genFx = await server.ssrLoadModule("/src/gfx/gen-fx.ts");
    const pal = palette.PAL;
    const hexToIdx = new Map(pal.map((c, i) => [c, i]));

    const sets = collectRepresentative(genFx, pal);

    // Guard-Metriken je Set (Index-Gueltigkeit + binaeres Alpha + Dither-Band).
    const analyzed = sets.map((s) => ({
      ...s,
      metrics: s.frames.map((rows, i) => {
        const a = analyzeFxGuard(`${s.key}#${i}`, s.file, rows, s.w, s.h, pal);
        return {
          frame: i,
          offPalette: a.offPalette,
          alphaViolations: a.alphaViolations,
          ditherPixels: a.dither.ditherPixels,
          ditherBandPx: a.dither.bandPx,
        };
      }),
    }));

    // Scale-Coverage (Mixel-Heuristik: Draw-Scale > 1 nur mit Bake >= Scale).
    const scales = SCALE_MANIFEST.map((m) => ({
      ...m,
      coverage: scaleCoverage(m.key, m.maxScale, {
        mixelMaxLevel: genFx.mixelMaxLevel,
        mixelLevelFor: genFx.mixelLevelFor,
      }),
    }));
    // Dither-Befunde > 2 px: der Test pinnt diese Menge als Ratchet (schreiben
    // nur die Evo-Kette; schrumpfen erlaubt, neu entstehen schlaegt an).
    const ditherFindings = analyzed.flatMap((s) => s.metrics
      .filter((m) => m.ditherBandPx > 2)
      .map((m) => ({ key: `${s.key}#${m.frame}`, bandPx: m.ditherBandPx })));
    // Wildcard-Manifest-Einträge auf konkrete Keys aufloesen (evo_* je Evolution).
    const knownFindings = [];
    for (const s of scales) {
      if (s.coverage.covered) continue;
      if (s.key.includes("*")) {
        for (const id of genFx.EVOLUTION_SIGNATURE_IDS) {
          knownFindings.push({
            key: s.key.replace("*", id),
            maxScale: s.maxScale,
            effectiveScale: s.coverage.effectiveScale,
            reason: `kein Mixel-Bake (bakeMaxLevel ${s.coverage.bakeMaxLevel}); Quelle: ${s.source}`,
          });
        }
      } else {
        knownFindings.push({
          key: s.key,
          maxScale: s.maxScale,
          effectiveScale: s.coverage.effectiveScale,
          reason: `kein Mixel-Bake (bakeMaxLevel ${s.coverage.bakeMaxLevel}); Quelle: ${s.source}`,
        });
      }
    }

    const fixture = {
      meta: {
        lane: "m10-palette-fx-guard",
        generatedAt: new Date().toISOString(),
        source: "src/gfx/gen-fx.ts (nur gelesen, public exports)",
        paletteSize: pal.length,
        sets: analyzed.length,
        frames: analyzed.reduce((n, s) => n + s.metrics.length, 0),
        rowsPolicy: "framesFull=true: alle Frames als \\n-joinierte Rows; Bakes: nur Frame 0",
        scaleManifestSource: SCALE_MANIFEST.map((m) => `${m.key}: ${m.source}`),
      },
      frames: Object.fromEntries(analyzed.filter((s) => s.framesFull).map((s) => [
        s.key, { w: s.w, h: s.h, rows: s.frames.map((r) => r.join("\n")) },
      ])),
      bakeFrames: Object.fromEntries(analyzed.filter((s) => !s.framesFull).map((s) => [
        s.key, { w: s.w, h: s.h, rows: [s.frames[0].join("\n")] },
      ])),
      metrics: Object.fromEntries(analyzed.map((s) => [
        s.key, { w: s.w, h: s.h, frames: s.metrics },
      ])),
      scaleCoverage: scales.map((s) => ({ key: s.key, maxScale: s.maxScale, source: s.source, ...s.coverage })),
      knownFindings,
      ditherFindings,
    };

    fs.mkdirSync("tests/fixtures", { recursive: true });
    fs.writeFileSync("tests/fixtures/palette-fx-guard.json", JSON.stringify(fixture, null, 1));

    // Report (Beleg) nach shots/.
    const worst = { bandPx: 0, key: "" };
    for (const s of analyzed) {
      for (const m of s.metrics) {
        if (m.ditherBandPx > worst.bandPx) { worst.bandPx = m.ditherBandPx; worst.key = `${s.key}#${m.frame}`; }
      }
    }
    const violations = analyzed.flatMap((s) => s.metrics.filter((m) => m.offPalette + m.alphaViolations > 0)
      .map((m) => `${s.key}#${m.frame} off=${m.offPalette} alpha=${m.alphaViolations}`));
    const report = {
      milestone: "M10", lane: "m10-palette-fx-guard", generatedAt: new Date().toISOString(),
      sets: analyzed.length,
      frames: analyzed.reduce((n, s) => n + s.metrics.length, 0),
      offPaletteTotal: analyzed.reduce((n, s) => n + s.metrics.reduce((m, x) => m + x.offPalette, 0), 0),
      alphaViolationsTotal: analyzed.reduce((n, s) => n + s.metrics.reduce((m, x) => m + x.alphaViolations, 0), 0),
      maxDitherBandPx: worst.bandPx, maxDitherBandKey: worst.key,
      ditherFindings,
      scaleCoverage: fixture.scaleCoverage,
      knownFindings,
      violations,
      fixture: "tests/fixtures/palette-fx-guard.json",
      fixtureBytes: fs.statSync("tests/fixtures/palette-fx-guard.json").size,
    };
    fs.mkdirSync("shots", { recursive: true });
    fs.writeFileSync("shots/m10-palette-fx-guard-report.json", JSON.stringify(report, null, 2));

    console.log(`FX-Guard-Fixture: ${report.sets} Sets, ${report.frames} Frames, ` +
      `off-palette ${report.offPaletteTotal}, alpha ${report.alphaViolationsTotal}, ` +
      `maxDitherBandPx ${report.maxDitherBandPx} (${report.maxDitherBandKey})`);
    console.log(`Scale-Coverage: ${scales.filter((s) => s.coverage.covered).length}/${scales.length} gedeckt; ` +
      `knownFindings ${knownFindings.length} Keys`);
    console.log(`Fixture: tests/fixtures/palette-fx-guard.json (${(report.fixtureBytes / 1024).toFixed(0)} KB)`);
    process.exitCode = violations.length === 0 ? 0 : 1;
  } finally {
    await server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
