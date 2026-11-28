// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";

/**
 * m10-run-determinism-fix: Guard-Test zum Determinismus-Befund (Stand nach Fix).
 *
 * Die Mess-Lane (scripts/m10-run-determinism.mjs, 3 Seeds x 2 identische
 * Browser-Laeufe, sim-exakte Marken) hatte NICHTDETERMINISMUS belegt: erste
 * Divergenz bei Sim-Sekunde 1 in elapsed/px (Beleg before:
 * shots/m10-run-det-verdict-before.json, deterministic:false, 120/120 Marken
 * divergent je Seed).
 *
 * Der Fix in src/scenes/Run.ts (diese Lane) hat VIER Schichten geschlossen:
 *   1. Carry-over-Akkumulator: nur volle SIM_MAX_STEP-Schritte statt variabler
 *      Partial-Schritte (Tick-Phase deterministisch — Marke s=1 jetzt bitgleich),
 *   2. KI-RNG aus dem Run-Seed abgeleitet (statt Math.random-Default des EnemyPool),
 *   3. Start-Gate ?detstart=1 (Run startet pausiert; Harness setzt autoPlay/
 *      timeScale, BEVOR Schritt 1 laeuft — sonst Wall-Clock-Rennen),
 *   4. Kamera-Anker pro Sim-Schritt aus posX/posY (spawnOne anchort am
 *      Kamera-Zentrum; der Lerp-Follow machte scrollX frame-abhaengig).
 *
 * IST nach dem Fix: Seeds 101 und 404 liefern BITGLEICHE Marken/Events/Final.
 * Seed 202 divergiert ab Sim-Sekunde 48 in kills/enemies — Rest-Leak ist die
 * frame-basierte Spawn-Allowance in src/systems/Spawner.ts (SPAWN_FRAME_BUDGET
 * wird pro Echtzeit-Frame zurueckgesetzt; bei 30x und rauen Frame-Zeiten
 * verschiebt sich die Spawn-Phase). Fremd-Datei — behoben vom vergebenen Job
 * m10-spawn-budget-dt (dt-basierte Zuteilung). Dieser Test schlaegt an, sobald
 * auch Seed 202 bitgleich ist (=> Befund + docs/lanes aktualisieren).
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
  final: unknown;
}
interface Verdict {
  deterministic: boolean;
  seeds: number[];
  reps: number;
  maxSeconds: number;
  perSeed: Array<{ seed: number; identical: boolean; divergingMarks: number; totalMarks: number }>;
}

const SEEDS = [101, 202, 404] as const;
const MARKS = 120;
const IDENTICAL_SEEDS = [101, 404] as const;
const REMAINING_DIVERGENT_SEED = 202;
const FIRST_DIFF_MARK_202 = 48; // Sim-Sekunde: kills 24 vs 23, enemies 4 vs 3

describe("m10-run-determinism-fix: Befund nach Run.ts-Fix (Regressionsschranke)", () => {
  it("Verdict: 3 Seeds x 2 Laeufe, 120 Marken je Lauf", () => {
    const v = readJson("../shots/m10-run-det-verdict.json") as Verdict;
    expect(v.seeds).toEqual([...SEEDS]);
    expect(v.reps).toBe(2);
    expect(v.maxSeconds).toBe(MARKS);
    // Gesamt-Urteil: solange Seed 202 divergiert, ist der Lauf noch nicht
    // deterministic:true — nach dem Merge von m10-spawn-budget-dt schlägt
    // dieser Test hier an und der Befund wird zu deterministic:true geändert.
    expect(v.deterministic).toBe(false);
    expect(v.perSeed.map((p) => p.seed)).toEqual([...SEEDS]);
  });

  for (const seed of IDENTICAL_SEEDS) {
    it(`seed ${seed}: beide Laeufe bitgleich — alle 120 Marken + Events + Final`, () => {
      const a = readJson(`../shots/m10-run-det-${seed}-r0.json`) as Rep;
      const b = readJson(`../shots/m10-run-det-${seed}-r1.json`) as Rep;
      expect(a.seed).toBe(seed);
      expect(b.seed).toBe(seed);
      expect(a.marks.length).toBe(MARKS);
      expect(b.marks.length).toBe(MARKS);
      expect(a.marks).toEqual(b.marks);
      expect(a.events).toEqual(b.events);
      expect(a.final).toEqual(b.final);
    });
  }

  it("Tick-Phase deterministisch: Marke s=1 ist bei ALLEN Seeds bitgleich (vor dem Fix: elapsed/px-Divergenz bei s=1)", () => {
    for (const seed of SEEDS) {
      const a = readJson(`../shots/m10-run-det-${seed}-r0.json`) as Rep;
      const b = readJson(`../shots/m10-run-det-${seed}-r1.json`) as Rep;
      expect(a.marks[0]).toEqual(b.marks[0]);
    }
  });

  it(`seed ${REMAINING_DIVERGENT_SEED}: Rest-Leak — erster Diff bei Sim-Sekunde ${FIRST_DIFF_MARK_202} in kills/enemies`, () => {
    const a = readJson(`../shots/m10-run-det-${REMAINING_DIVERGENT_SEED}-r0.json`) as Rep;
    const b = readJson(`../shots/m10-run-det-${REMAINING_DIVERGENT_SEED}-r1.json`) as Rep;
    expect(a.marks.length).toBe(MARKS);
    expect(b.marks.length).toBe(MARKS);
    // Marken vor dem ersten Diff sind bitgleich (Tick-Phase + Spawns bis s=47).
    for (let i = 0; i < FIRST_DIFF_MARK_202 - 1; i++) {
      expect(a.marks[i], `Marke s=${i + 1} sollte bitgleich sein`).toEqual(b.marks[i]);
    }
    // Erste Divergenz: Spawn-Zahlungsebene (kills/enemies), Spielerposition noch identisch.
    const ma = a.marks[FIRST_DIFF_MARK_202 - 1]!;
    const mb = b.marks[FIRST_DIFF_MARK_202 - 1]!;
    expect(ma.s).toBe(FIRST_DIFF_MARK_202);
    expect(ma.kills).not.toBe(mb.kills);
    expect(ma.enemies).not.toBe(mb.enemies);
    expect(ma.px).toBe(mb.px);
    // Sobald auch dieser Seed bitgleich ist (m10-spawn-budget-dt), schlägt
    // dieser Test an: expect(a.marks).toEqual(b.marks) ergänzen und Verdict
    // auf deterministic:true heben.
  });

  it("Gegenprobe: reine Logik (mulberry32) ist deterministisch — die Vergleichsmethode ist tauglich", () => {
    const seq = (seed: number) => {
      const r = mulberry32(seed);
      return Array.from({ length: 1000 }, () => r());
    };
    expect(seq(101)).toEqual(seq(101));
    expect(seq(202)).not.toEqual(seq(101));
  });
});
