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
 * Fuenfte Schichte (aus main uebernommen, Job m10-spawn-budget-dt):
 *   5. Spawn-Allowance auf dt-Akkumulator (src/systems/Spawner.ts) — die alte
 *      frame-basierte Zuteilung (SPAWN_FRAME_BUDGET je Echtzeit-Frame) liess
 *      Seed 202 ab Sim-Sekunde 48 in kills/enemies divergieren.
 *
 * IST nach dem kompletten Fix: ALLE drei Seeds (101/202/404) liefern BITGLEICHE
 * Marken + Events + Final, Urteil deterministic:true
 * (shots/m10-run-det-verdict.json; before: shots/m10-run-det-verdict-before.json,
 * deterministic:false, 120/120 Marken divergent je Seed).
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

describe("m10-run-determinism-fix: Determinismus nach Komplett-Fix (Run.ts + Spawner-Dt, Regressionsschranke)", () => {
  it("Verdict: 3 Seeds x 2 Laeufe, 120 Marken je Lauf", () => {
    const v = readJson("../shots/m10-run-det-verdict.json") as Verdict;
    expect(v.seeds).toEqual([...SEEDS]);
    expect(v.reps).toBe(2);
    expect(v.maxSeconds).toBe(MARKS);
    // Gesamt-Urteil: alle drei Seeds bitgleich => deterministic:true.
    expect(v.deterministic).toBe(true);
    expect(v.perSeed.map((p) => p.seed)).toEqual([...SEEDS]);
    for (const p of v.perSeed) {
      expect(p.identical, `seed ${p.seed} sollte bitgleich sein`).toBe(true);
      expect(p.divergingMarks).toBe(0);
    }
  });

  for (const seed of SEEDS) {
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

  it(`seed 202: ehemaliger Rest-Leak (frame-basierte Spawn-Allowance) geschlossen — jetzt wie 101/404 bitgleich ab Marke 1`, () => {
    // Vor dem Spawner-Dt-Fix (m10-spawn-budget-dt) divergierte Seed 202 ab
    // Sim-Sekunde 48 in kills/enemies bei identischem px. Diese Schranke
    // stellt sicher, dass er komplett bitgleich bleibt.
    const a = readJson(`../shots/m10-run-det-202-r0.json`) as Rep;
    const b = readJson(`../shots/m10-run-det-202-r1.json`) as Rep;
    expect(a.marks).toEqual(b.marks);
    expect(a.events).toEqual(b.events);
    expect(a.final).toEqual(b.final);
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

/**
 * m10-det-e2e-guard K2: Suite-Teil des E2E-Determinismus-Guards ueber die
 * komplette worldView-Anker-Kette — die drei Sim-Anker-Teile muessen
 * zusammenhalten, ohne dass ein stochastischer Rest in den Sim greift:
 *   1. ProjectilePool.ts/EnemyProjectiles.ts -> m10-worldview-anchor-pools
 *   2. Spawner.ts outsideView                -> m10-spawn-view-anchor
 *   3. Boss-Sim-View (Rezept aus m10-boss-dur-determinism K2:
 *      Anker mid = scroll + width/2 statt camera.worldView)
 *
 * E2E-Methode (LANGE Browser-Laeufe, NICHT Teil der Suite): Skript
 * scripts/m10-det-e2e.mjs — 3 Seeds x 2 identische Laeufe, timeScale 30,
 * 700 Sim-Sekunden, sim-exakte Marken via prototype-Patch von Run.simulate
 * (gleiches Verfahren wie oben). Dokumentierter Aufruf:
 * `node scripts/m10-det-e2e.mjs` — exit 0 <=> deterministisch.
 *
 * Der Suite-Check schraenkt die von diesem Skript committeten JSONs:
 *   shots/m10-det-e2e-<seed>-r<rep>.json + shots/m10-det-e2e-verdict.json.
 * Nach einer Sim-Aenderung: Skript-Lauf erneuern, JSONs neu committen. Ist
 * das Urteil NICHT deterministisch (oder fehlen die JSONs), schlaegt der
 * Test hier mit der ersten Divergenz an — so regressiert die
 * Determinismus-Kette nicht still.
 */
const E2E_SEEDS = [101, 202, 404] as const;
const E2E_MARKS = 700;

interface E2eMark {
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
interface E2eRep {
  seed: number;
  rep: number;
  marks: E2eMark[];
  events: Array<{ kind: string; index: number; at: number }>;
  bossDurations: Array<{ index: number; spawnAt: number; defeatAt: number; duration: number }>;
  pageErrors: string[];
}
interface E2eVerdict {
  script: string;
  seeds: number[];
  reps: number;
  limitSeconds: number;
  deterministic: boolean;
  perSeed: Array<{ seed: number; identical: boolean; marks: number; divergingMarks: number }>;
}

const readE2e = (rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8")) as E2eRep;

describe("m10-det-e2e-guard: E2E-Anker-Kette (Pools + Spawner + Boss-Sim-View) bitgleich", () => {
  it("Verdict: 3 Seeds x 2 Laeufe, 700 Marken je Lauf, Urteil deterministic:true", () => {
    const v = readJson("../shots/m10-det-e2e-verdict.json") as E2eVerdict;
    expect(v.script).toBe("scripts/m10-det-e2e.mjs");
    expect(v.seeds).toEqual([...E2E_SEEDS]);
    expect(v.reps).toBe(2);
    expect(v.limitSeconds).toBe(E2E_MARKS);
    expect(v.deterministic).toBe(true);
    for (const p of v.perSeed) {
      expect(p.identical, `seed ${p.seed} sollte bitgleich sein`).toBe(true);
      expect(p.divergingMarks).toBe(0);
      expect(p.marks).toBe(E2E_MARKS);
    }
  });

  for (const seed of E2E_SEEDS) {
    it(`seed ${seed}: beide E2E-Laeufe bitgleich — 700 Marken + Events + Boss-Dauern, 0 JS-Fehler`, () => {
      const a = readE2e(`../shots/m10-det-e2e-${seed}-r0.json`);
      const b = readE2e(`../shots/m10-det-e2e-${seed}-r1.json`);
      expect(a.seed).toBe(seed);
      expect(b.seed).toBe(seed);
      expect(a.marks.length).toBe(E2E_MARKS);
      expect(b.marks.length).toBe(E2E_MARKS);
      // Marken inkl. Position (px/py) — hier schlagen die Anker-Teile an.
      expect(a.marks).toEqual(b.marks);
      // Kompletter Event-Strom (bossWarn/bossDefeated, sim-exakt).
      expect(a.events).toEqual(b.events);
      // Boss-Dauern je Index (Defeat.at - Spawn.at) — das K2-Leck-Feld.
      expect(a.bossDurations).toEqual(b.bossDurations);
      expect(a.pageErrors).toEqual([]);
      expect(b.pageErrors).toEqual([]);
    });
  }
});
