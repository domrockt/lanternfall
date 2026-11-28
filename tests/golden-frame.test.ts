// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";

/**
 * Lane m10-golden-frame-guard, K2 (#10312): Suite-Guard für den Golden-Frame-
 * Regressionsschutz.
 *
 * ZWECK: Gleicher Seed = bitgleiche Simulation ist seit m10-run-determinism /
 * m10-pause-freeze / m10-ai-stream-cadence-r2 ein haltbarer Vertrag. Der Guard
 * friert den simulierten Spielstand nach 600 Ticks pro Seed als SHA-256-Hash
 * über sim-exakte Marken ein (elapsed/kills/level/xp/hp, Gegner-UIDs + auf
 * 0,1 px gerundete Positionen, UID-Allokationszähler, events, final). Jede
 * verhaltensändernde Merge-Welle fällt beim ersten Guard-Lauf auf:
 *
 *   node scripts/m10-golden-frame.mjs
 *
 * GRENZE (dokumentiert, siehe Briefing-Fallback): Der Sim-Kern (src/scenes/
 * Run.ts) importiert Phaser und instanziiert Textures/Tilemap/Camera — ein
 * Tick-Lauf im Suite-Kontext (Node, kein Browser) ist mit vertretbarem Aufwand
 * NICHT möglich (deshalb hier nicht einmal 60 Ticks, sondern 0: die Suite
 * führt KEINE Simulation aus). Die Skript-Grenze liegt bei 600 Ticks (30
 * Sim-Sekunden), gelaufnet wird sie ausschließlich im Skript-Gate
 * (scripts/m10-golden-frame.mjs, ~23 s, kein flock). Dieser Test pinnt die
 * committeten Belege (Muster tests/run-determinism.test.ts):
 *
 *   shots/m10-golden-frame-baseline.json — Hashes je Seed (3 Seeds)
 *   shots/m10-golden-frame-verdict.json  — Urteil des letzten Guard-Laufs
 *
 * REBASELINE (GEWOLLTE Verhaltensänderung, z. B. Balance-Merge): NIE
 * stillschweigend neu schreiben — siehe Anleitung in
 * docs/lanes/m10-golden-frame-guard.md (--write-baseline + Begruendung im
 * Commit). Divergenz durch laufende Lane-Merges: Befund in der Lane-Doku
 * dokumentieren, nicht rebaseln.
 */

const url = (rel: string) => new URL(rel, import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(url(rel), "utf8"));

const SEEDS = [101, 202, 404] as const;
const TICKS = 600;

interface Baseline {
  seeds: number[];
  ticks: number;
  tickSeconds: number;
  hashAlgorithm: string;
  perSeed: Record<string, { hash: string; marks: number; final: { kills: number; level: number } }>;
}
interface Verdict {
  seeds?: number[];
  deterministic: boolean;
  baselinePresent: boolean;
  matchesBaseline: boolean;
  jsErrorCount: number;
  renderer: string | null;
  rendererOk: boolean | null;
  passed: boolean;
  perSeed: Array<{ seed: number; identical: boolean; matchesBaseline: boolean | null }>;
}

describe("m10-golden-frame-guard: Golden-Frame-Regressionsschutz (Suite-Guard über committete Belege)", () => {
  it("Baseline: 3 Seeds mit Hash dokumentiert, 600-Ticks-Vertrag konfiguriert", () => {
    const b = readJson("../shots/m10-golden-frame-baseline.json") as Baseline;
    expect(b.seeds).toEqual([...SEEDS]);
    expect(b.ticks).toBe(TICKS);
    // 1 Sim-Tick = SIM_MAX_STEP = 1/20 s (src/config.ts) => 600 Ticks = 30 s.
    expect(b.tickSeconds).toBeCloseTo(1 / 20, 12);
    expect(b.hashAlgorithm).toContain("sha256");
    for (const seed of SEEDS) {
      const entry = b.perSeed[String(seed)];
      expect(entry, `seed ${seed} fehlt in Baseline`).toBeDefined();
      expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.marks).toBeGreaterThan(0);
      expect(entry.final.kills).toBeGreaterThanOrEqual(0);
    }
  });

  it("Verdict des letzten Guard-Laufs: 2 Laeufe je Seed bitgleich + Baseline-Deckung + 0 JS-Fehler", () => {
    const v = readJson("../shots/m10-golden-frame-verdict.json") as Verdict;
    expect(v.seeds ?? [101, 202, 404]).toEqual([...SEEDS]);
    expect(v.baselinePresent).toBe(true);
    expect(v.deterministic, "gleicher Seed, 2 Laeufe müssen bitgleiche Hashes liefern").toBe(true);
    expect(v.matchesBaseline, "Guard-Hashes müssen zur committeten Baseline passen").toBe(true);
    expect(v.jsErrorCount).toBe(0);
    expect(v.renderer, "Renderer-String muss im JSON stehen (iGPU-Pflicht)").toBeTruthy();
    expect(v.rendererOk, "Belege mit SwiftShader/Software-Renderer sind ungültig").toBe(true);
    for (const p of v.perSeed) {
      expect(p.identical, `seed ${p.seed}: 2 Laeufe bitgleich`).toBe(true);
      expect(p.matchesBaseline, `seed ${p.seed}: Baseline-Deckung`).toBe(true);
    }
    expect(v.passed).toBe(true);
  });

  it("Verdict-Hashes decken sich mit der Baseline (keine abweichenden Dateien)", () => {
    const b = readJson("../shots/m10-golden-frame-baseline.json") as Baseline;
    const v = readJson("../shots/m10-golden-frame-verdict.json") as Verdict & {
      perSeed: Array<{ seed: number; hash: string }>;
    };
    for (const p of v.perSeed) {
      expect(p.hash, `seed ${p.seed}: Verdict-Hash != Baseline-Hash`).toBe(b.perSeed[String(p.seed)].hash);
    }
  });

  it("Gegenprobe: reine Logik (mulberry32) ist deterministisch — die Hash-Methode ist tauglich", () => {
    const seq = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 1000 }, () => r());
    };
    expect(seq(101)).toEqual(seq(101));
    expect(seq(101)).not.toEqual(seq(202));
  });
});
