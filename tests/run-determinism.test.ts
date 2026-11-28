// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";

/**
 * m10-run-determinism K2: Guard-Test zum Determinismus-Befund.
 *
 * Der Lane-Lauf (scripts/m10-run-determinism.mjs, 3 Seeds x 2 identische
 * Browser-Laeufe, sim-exakte Marken) hat NICHTDETERMINISMUS belegt: zwei
 * Laeufe mit gleichem Seed + autoPlay liefern KEINE bitgleichen Marken —
 * erste Divergenz bei Sim-Sekunde 1 in elapsed/px, Kills/Level weichen ab
 * Sim-Sekunde ~36-86. Verdachts-Datei: src/scenes/Run.ts (Partial-Schritte
 * aus Echtzeit-delta); Bedarfsmeldung in ~/.dispatch/requests.md.
 *
 * Dieser Test verankert den COMMITTED Befund (shots/m10-run-det-*.json) als
 * Regressionsschranke: Veraendert sich das Divergenz-Muster (z. B. weil der
 * Sim-Loop deterministisch wird), schlaegt der Test mit Diff an und der
 * Befund in docs/lanes/m10-run-determinism.md muss aktualisiert werden.
 * Die erwarteten Werte sind hard-coded aus dem belegten Lane-Lauf.
 */

const url = (rel: string) => new URL(rel, import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(url(rel), "utf8"));

interface Mark {
  s: number;
  elapsed: number;
  kills: number;
  level: number;
  xp: number;
  hp: number;
  enemies: number;
  px: number;
  py: number;
}
interface Rep {
  seed: number;
  rep: number;
  marks: Mark[];
  events: unknown[];
}
interface Verdict {
  deterministic: boolean;
  seeds: number[];
  reps: number;
  maxSeconds: number;
  perSeed: Array<{ seed: number; identical: boolean; divergingMarks: number; totalMarks: number }>;
}

const SEEDS = [101, 202, 404] as const;
// Hard-coded aus dem belegten Lane-Lauf (docs/lanes/m10-run-determinism.md).
const FIRST_KILLS_DIFF: Record<number, number> = { 101: 50, 202: 45, 404: 51 };
const FIRST_LEVEL_DIFF: Record<number, number> = { 101: 86, 202: 36, 404: 56 };
const MARKS = 120;

describe("m10-run-determinism: belegter Befund (Regressionsschranke)", () => {
  it("Verdict: 3 Seeds x 2 Laeufe, nichtdeterministisch", () => {
    const v = readJson("../shots/m10-run-det-verdict.json") as Verdict;
    expect(v.seeds).toEqual([...SEEDS]);
    expect(v.reps).toBe(2);
    expect(v.maxSeconds).toBe(MARKS);
    expect(v.deterministic).toBe(false);
    expect(v.perSeed.map((p) => p.seed)).toEqual([...SEEDS]);
    for (const p of v.perSeed) {
      expect(p.identical, `seed ${p.seed} laut Verdict identisch — Befund aktualisieren!`).toBe(false);
      expect(p.divergingMarks).toBe(MARKS);
      expect(p.totalMarks).toBe(MARKS);
    }
  });

  for (const seed of SEEDS) {
    it(`seed ${seed}: beide Laeufe divergieren, erster Diff bei Sim-Sekunde 1 in elapsed/px`, () => {
      const a = readJson(`../shots/m10-run-det-${seed}-r0.json`) as Rep;
      const b = readJson(`../shots/m10-run-det-${seed}-r1.json`) as Rep;
      expect(a.seed).toBe(seed);
      expect(b.seed).toBe(seed);
      expect(a.marks.length).toBe(MARKS);
      expect(b.marks.length).toBe(MARKS);

      // Es gibt eine Divergenz (sonst waere der Befund hinfällig → Test aktualisieren).
      const firstDiff = a.marks.findIndex((m, i) => JSON.stringify(m) !== JSON.stringify(b.marks[i]!));
      expect(firstDiff).toBeGreaterThanOrEqual(0);

      // Erste Divergenz exakt bei Sim-Sekunde 1, Felder elapsed + px.
      const ma = a.marks[firstDiff]!;
      const mb = b.marks[firstDiff]!;
      expect(ma.s).toBe(1);
      expect(mb.s).toBe(1);
      expect(ma.elapsed, "elapsed bei s=1 bitgleich? → Befund aktualisieren").not.toBe(mb.elapsed);
      expect(ma.px).not.toBe(mb.px);
      expect(ma.kills).toBe(mb.kills);

      // Erster Kills-/Level-Diff an den dokumentierten Momenten.
      const killsDiff = a.marks.findIndex((m, i) => m.kills !== b.marks[i]!.kills);
      const levelDiff = a.marks.findIndex((m, i) => m.level !== b.marks[i]!.level);
      expect(killsDiff + 1).toBe(FIRST_KILLS_DIFF[seed]);
      expect(levelDiff + 1).toBe(FIRST_LEVEL_DIFF[seed]);
    });
  }

  it("Gegenprobe: reine Logik (mulberry32) ist deterministisch — die Vergleichsmethode ist tauglich", () => {
    const seq = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 1000 }, () => r());
    };
    expect(seq(101)).toEqual(seq(101));
    expect(seq(202)).not.toEqual(seq(101));
  });
});
