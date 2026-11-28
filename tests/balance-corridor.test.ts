// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Lane m10-balance-corridor-guard, K2 (#11873): Suite-Guard für das Dom-Balance-
 * Kriterium (ACCEPTANCE A5, Dom-Zustimmung 2026-11-28 06:00Z):
 *
 *   - Endlevel 25–40 (6/6 Läufe, 30-min-Referenz)
 *   - Boss-Dauer 20–60 s (jeder Boss mit messbarer Dauer)
 *   - kein Tod vor Minute 15
 *
 * Muster: tests/golden-frame.test.ts — die Suite führt KEINE Messläufe aus,
 * sie pinnt die committeten Marken (Muster shots/m10-golden-frame-*):
 *
 *   shots/m10-balance-corridor-short.json — Kurz-Matrix (3 Seeds x mira/kael
 *     bis Boss 3, ~47 s Wandzeit/Lauf, erzeugt von scripts/m10-balance-corridor.mjs)
 *   shots/m10-balance-corridor-full.json  — 30-min-Referenz (6/6 Läufe bis
 *     Run-Ende; nur bei Rebaseline/Balance-Merges neu erzeugen)
 *
 * Der Test bewertet die Marken UNABHÄNGIG vom Skript gegen den Dom-Korridor
 * (streng) und verlangt, dass jede Abweichung in der committeten
 * knownViolations-Liste MIT Grund abgedeckt ist. Unbekannte Abweichungen = FAIL.
 *
 * UPDATE-PROZEDUR (Baseline neu erzeugen): siehe
 * docs/lanes/m10-balance-corridor-guard.md — NIE stillschweigend rebaseln.
 *
 * GRENZE: stochastischer Korridor über 3 Seeds x 2 Charaktere — KEIN
 * bitgenauer Determinismus-Anspruch (dafür: Golden-Frame-Guard).
 */

const url = (rel: string) => new URL(rel, import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(url(rel), "utf8"));

const SEEDS = [101, 202, 404] as const;
const CHARACTERS = ["mira", "kael"] as const;

/** Dom-Korridor (verbindlich, ACCEPTANCE A5). */
const CORRIDOR = {
  endLevel: [25, 40] as const,
  bossDurationSec: [20, 60] as const,
  noDeathBeforeMinute: 15,
};

interface CorridorSummary {
  mode: "short" | "full";
  parameters: { seeds: number[]; characters: string[]; scale: number };
  corridor: typeof CORRIDOR;
  renderer: string | null;
  rendererOk: boolean;
  runCount: number;
  completedCount: number;
  runs: Array<{
    character: string;
    seed: number;
    outcome: "boss3" | "dawn" | "death" | "giveup" | "timeout" | null;
    endSecond: number | null;
    endMinute: number | null;
    endLevel: number | null;
  }>;
  bossRuns: Array<{
    character: string;
    seed: number;
    bosses: Array<{ index: number; name: string; durationSec: number | null; defeated: boolean; inCorridor: boolean }>;
  }>;
  violations: unknown[];
  knownViolations: Array<{ type: string; character: string; seed?: number; bossIndex?: number; reason?: string }>;
  unknownViolations: unknown[];
  accepted: boolean;
  jsErrors: string[];
}

/** Vollständiger Lauf (Endlevel-Kriterium nur da anwendbar, wo der Run zu Ende ist). */
const isComplete = (outcome: string | null | undefined) => outcome === "dawn" || outcome === "death";

interface Violation {
  type: "endLevel" | "bossDuration" | "deathBefore15" | "incomplete";
  character?: string;
  seed?: number;
  bossIndex?: number;
}

/**
 * Unabhängige, strenge Auswertung der Marken gegen den Dom-Korridor.
 * Bewusst NICHT der Skript-Code — der Guard soll den Skript-Output prüfen,
 * nicht wiederkäuen.
 */
function evaluateCorridor(summary: CorridorSummary, corridor = CORRIDOR): Violation[] {
  const violations: Violation[] = [];
  for (const r of summary.runs) {
    if (isComplete(r.outcome)) {
      if (r.endLevel == null || r.endLevel < corridor.endLevel[0] || r.endLevel > corridor.endLevel[1]) {
        violations.push({ type: "endLevel", character: r.character, seed: r.seed });
      }
      if ((r.endSecond ?? Infinity) < corridor.noDeathBeforeMinute * 60) {
        violations.push({ type: "deathBefore15", character: r.character, seed: r.seed });
      }
    }
  }
  for (const row of summary.bossRuns) {
    for (const b of row.bosses) {
      if (b.durationSec != null && (b.durationSec < corridor.bossDurationSec[0] || b.durationSec > corridor.bossDurationSec[1])) {
        violations.push({ type: "bossDuration", character: row.character, seed: row.seed, bossIndex: b.index });
      }
    }
  }
  if (summary.completedCount !== summary.runCount) {
    violations.push({ type: "incomplete" });
  }
  return violations;
}

const violationKey = (v: Violation) => `${v.type}:${v.character ?? "*"}:${v.seed ?? "*"}:${v.bossIndex ?? "*"}`;

/** Jede strenge Abweichung muss in den committeten knownViolations MIT Grund stehen. */
function unknownOf(summary: CorridorSummary, corridor = CORRIDOR): Violation[] {
  const known = new Set(summary.knownViolations.filter((k) => (k.reason ?? "").length > 0).map((k) => `${k.type}:${k.character ?? "*"}:${k.seed ?? "*"}:${k.bossIndex ?? "*"}`));
  return evaluateCorridor(summary, corridor).filter((v) => !known.has(violationKey(v)));
}

// Explizites Zeitbudget: Fixture-Reads + Auswertung sind schnell, aber der
// Suite-Default (5 s) soll hier nie die Fehlerursache sein (kein Timeout-Flake).
const GUARD_TIMEOUT = 15_000;

describe("m10-balance-corridor-guard: Dom-Balance-Korridor (Suite-Guard über committete Marken)", () => {
  it(
    "Kurz-Baseline: Dom-Matrix (3 Seeds x mira/kael), 6/6 Läufe bis Boss 3, 0 JS-Fehler, gültiger Renderer",
    () => {
      const s = readJson("../shots/m10-balance-corridor-short.json") as CorridorSummary;
      expect(s.mode).toBe("short");
      expect(s.parameters.seeds).toEqual([...SEEDS]);
      expect(s.parameters.characters).toEqual([...CHARACTERS]);
      expect(s.parameters.scale).toBe(30);
      expect(s.runCount).toBe(6);
      expect(s.completedCount).toBe(6);
      // Kurzmodus: jeder Lauf erreicht Boss 3 (Index 2) lebend — kein Tod vor Minute 15.
      for (const r of s.runs) {
        expect(r.outcome, `${r.character}/${r.seed}`).toBe("boss3");
        expect(r.endMinute ?? 0, `${r.character}/${r.seed} endMinute`).toBeGreaterThanOrEqual(CORRIDOR.noDeathBeforeMinute);
        expect(r.endLevel ?? 0, `${r.character}/${r.seed} Level @Boss 3`).toBeGreaterThanOrEqual(1);
      }
      expect(s.jsErrors).toEqual([]);
      expect(s.renderer, "Renderer-String muss im JSON stehen").toBeTruthy();
      expect(s.rendererOk, "Belege mit SwiftShader/Software-Renderer sind ungültig").toBe(true);
    },
    GUARD_TIMEOUT,
  );

  it(
    "Kurz-Baseline: strenge Korridorauswertung hat keine UNBEKANNTE Abweichung (Guard grün)",
    () => {
      const s = readJson("../shots/m10-balance-corridor-short.json") as CorridorSummary;
      expect(s.accepted).toBe(true);
      expect(s.unknownViolations).toEqual([]);
      expect(unknownOf(s)).toEqual([]);
      // Die bekannte Abweichung (mira/101 Boss 1 < 20 s) muss dokumentiert sein.
      expect(s.knownViolations.length, "knownViolations nicht leer — jede muss einen Grund haben").toBeGreaterThan(0);
      for (const k of s.knownViolations) expect(k.reason?.length ?? 0, `Grund fuer ${k.type}:${k.character}/${k.seed}`).toBeGreaterThan(20);
    },
    GUARD_TIMEOUT,
  );

  it(
    "30-min-Referenz: 6/6 Läufe zu Ende (Dawn/Tod ab Minute 15), Endlevel 25–40, Boss-Dauern 20–60 s",
    () => {
      const s = readJson("../shots/m10-balance-corridor-full.json") as CorridorSummary;
      expect(s.mode).toBe("full");
      expect(s.parameters.seeds).toEqual([...SEEDS]);
      expect(s.parameters.characters).toEqual([...CHARACTERS]);
      expect(s.runCount).toBe(6);
      expect(s.completedCount).toBe(6);
      for (const r of s.runs) {
        expect(isComplete(r.outcome), `${r.character}/${r.seed} outcome=${r.outcome}`).toBe(true);
        expect(r.endLevel ?? 0, `${r.character}/${r.seed} Endlevel`).toBeGreaterThanOrEqual(CORRIDOR.endLevel[0]);
        expect(r.endLevel ?? 0, `${r.character}/${r.seed} Endlevel`).toBeLessThanOrEqual(CORRIDOR.endLevel[1]);
        expect(r.endMinute ?? 0, `${r.character}/${r.seed} kein Tod vor Minute 15`).toBeGreaterThanOrEqual(CORRIDOR.noDeathBeforeMinute);
      }
      expect(unknownOf(s)).toEqual([]);
      expect(s.accepted).toBe(true);
      expect(s.jsErrors).toEqual([]);
    },
    GUARD_TIMEOUT,
  );

  it(
    "Gegenprobe (Dry-Run): der Guard erkennt absichtliche Verstöße — synthetische Marken und angehobene Schwelle FAILen",
    () => {
      const s = readJson("../shots/m10-balance-corridor-short.json") as CorridorSummary;
      // (a) Synthetischer Verstoss-Entwurf: Endlevel 41, Boss 90 s, Tod in Minute 10
      //     (kael/202 — NICHT whitelistgedeckt, sonst wuerde der Guard ihn schlucken).
      const broken: CorridorSummary = {
        ...s,
        runs: [
          { character: "kael", seed: 202, outcome: "dawn", endSecond: 600, endMinute: 10, endLevel: 41 },
        ],
        bossRuns: [
          { character: "kael", seed: 202, bosses: [{ index: 0, name: "Moorkönigin", durationSec: 90, defeated: true, inCorridor: false }] },
        ],
        completedCount: 1,
        runCount: 1,
      };
      const found = evaluateCorridor(broken);
      expect(found.map((v) => v.type).sort()).toEqual(["bossDuration", "deathBefore15", "endLevel"]);
      // Nicht in der Whitelist -> der Guard muss FAILen (unknown nicht leer).
      expect(unknownOf(broken).length).toBe(3);

      // (b) Angehobene Schwelle gegen die reale Baseline: Boss-Korridor [30,60] s
      //     statt [20,60] -> reale Baseline-Boss-Dauern fallen durch -> FAIL
      //     (siehe Lane-Doku, Dry-Run-Beleg).
      const tightened = unknownOf(s, { ...CORRIDOR, bossDurationSec: [30, 60] as unknown as typeof CORRIDOR.bossDurationSec });
      expect(tightened.length, "angehobene Boss-Schwelle muss die Baseline treffen").toBeGreaterThan(0);
    },
    GUARD_TIMEOUT,
  );
});
