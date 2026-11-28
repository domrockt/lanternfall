// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WAVES, MID_GAME_MIX, MID_GAME_MIX_MINUTE, MID_GAME_MIX_LAST_MINUTE, TIER_MIXES, LATE_GAME_MIX } from "../src/data/waves";
import type { EnemyId } from "../src/data/types";

/**
 * Lane m10-mira-hp-balance-check, K4 (#12908): Suite-Guard für den Dom-Balance-
 * Korridor auf dem **Mira-HP-90-Stand** (m10-charstats-ssot af72458d) NACH dem
 * K3-Hebel dieser Lane (MID_GAME_MIX: Minute 20–24 mit halbiertem Vervielfacher-
 * Gewicht für abom/voidcaller, src/data/waves.ts).
 *
 * Muster: tests/balance-corridor.test.ts — die Suite führt KEINE Messläufe aus,
 * sie pinnt die committete Fixture shots/m10-mira-hp-corridor.json (3 mira-Seeds
 * + kael/101, volle Läufe bis Run-Ende @ setTimeScale(30), erzeugt von
 * scripts/m10-mira-hp-check.mjs; Rohbeleg mit jsErrors liegt ausserhalb des
 * Repos unter games/.evidence/m10-mira-hp-balance-check/).
 *
 * Dom-Korridor (ACCEPTANCE A5), gemessen auf HP 90 (Commit 43d2769f):
 *   - mira: alle gemessenen Boss-Dauern 20–60 s (17/17), Levelband 25–40,
 *     kein Tod vor Minute 15
 *   - 2/3 mira-Seeds erreichen Minute 30 (dawn) — pinnt den Ist-Stand: auf HP 90
 *     stirbt je nach Variant EIN Seed knapp nach dem 20:00-Golem (HP-90-Kante,
 *     siehe Lane-Doku, Suchlauf A/B/C/D); eine Abweichung hier = Rebaseline nötig
 *   - kael (unverändert, HP 130): dawn, Levelband 25–40, alle Dauern 20–60 s
 *
 * GRENZE: stochastischer Korridor über 3 Seeds — KEIN bitgenauer
 * Determinismus-Anspruch (dafür: Golden-Frame-Guard).
 */

const url = (rel: string) => new URL(rel, import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(url(rel), "utf8"));

interface BossRow {
  index: number;
  name: string;
  durationSec: number | null;
  defeated: boolean;
  inCorridor: boolean;
}
interface Fixture {
  lane: string;
  miraHpStand: number;
  parameters: { seedsMira: number[]; seedKael: number | null; scale: number; mode: string };
  corridor: { endLevel: [number, number]; bossDurationSec: [number, number]; noDeathBeforeMinute: number; kaelTolerancePct: number };
  renderer: string | null;
  rendererOk: boolean;
  runCount: number;
  completedCount: number;
  runs: Array<{ character: string; seed: number; outcome: string | null; endMinute: number | null; endLevel: number | null }>;
  bossRuns: Array<{ character: string; seed: number; bosses: BossRow[] }>;
  kaelChecks: Array<{ bossIndex: number; name: string; newSec: number; refSec: number; deltaPct: number; inTolerance: boolean }>;
  miraViolations: unknown[];
  jsErrorsCount: number;
  jsErrorsNote: string;
}

const f = readJson("../shots/m10-mira-hp-corridor.json") as Fixture;
const isComplete = (o: string | null | undefined) => o === "dawn" || o === "death";
const miraRuns = f.runs.filter((r) => r.character === "mira");
const kaelRuns = f.runs.filter((r) => r.character === "kael");
const miraBosses = f.bossRuns.filter((r) => r.character === "mira").flatMap((r) => r.bosses.map((b) => ({ ...b, seed: r.seed })));
const kaelBosses = f.bossRuns.filter((r) => r.character === "kael").flatMap((r) => r.bosses.map((b) => ({ ...b, seed: r.seed })));

const GUARD_TIMEOUT = 15_000;

describe("m10-mira-hp-corridor-guard: Dom-Korridor auf Mira-HP-90-Stand (Fixture-Guard)", () => {
  it(
    "Fixture-Provenienz: HP-90-Stand, vollständige Matrix, gültiger Renderer",
    () => {
      expect(f.lane).toBe("m10-mira-hp-balance-check");
      expect(f.miraHpStand).toBe(90);
      expect(f.parameters.scale).toBe(30);
      expect(f.parameters.mode).toBe("full");
      expect(f.parameters.seedsMira).toEqual([101, 202, 404]);
      expect(f.parameters.seedKael).toBe(101);
      expect(f.runCount).toBe(4);
      expect(f.completedCount).toBe(f.runCount);
      for (const r of f.runs) expect(isComplete(r.outcome), `${r.character}/${r.seed} outcome=${r.outcome}`).toBe(true);
      expect(f.renderer, "Renderer-String muss im JSON stehen").toBeTruthy();
      expect(f.rendererOk, "Belege mit SwiftShader/Software-Renderer sind ungültig").toBe(true);
      // Bekanntes GroundRenderer-Chunk-Spam ist dokumentiert und nicht korridorrelevant.
      expect(f.jsErrorsNote).toContain("Texture key already in use");
    },
    GUARD_TIMEOUT,
  );

  it(
    "mira: alle Boss-Dauern 20–60 s, Levelband 25–40, kein Tod vor Minute 15",
    () => {
      expect(miraRuns.length).toBe(3);
      for (const b of miraBosses) {
        expect(b.durationSec, `${b.seed} ${b.name}`).not.toBeNull();
        expect(b.durationSec, `${b.seed} ${b.name} muss im Boss-Korridor liegen`).toBeGreaterThanOrEqual(f.corridor.bossDurationSec[0]);
        expect(b.durationSec, `${b.seed} ${b.name} muss im Boss-Korridor liegen`).toBeLessThanOrEqual(f.corridor.bossDurationSec[1]);
      }
      for (const r of miraRuns) {
        expect(r.endLevel ?? 0, `mira/${r.seed} Endlevel`).toBeGreaterThanOrEqual(f.corridor.endLevel[0]);
        expect(r.endLevel ?? 0, `mira/${r.seed} Endlevel`).toBeLessThanOrEqual(f.corridor.endLevel[1]);
        expect(r.endMinute ?? 0, `mira/${r.seed} kein Tod vor Minute 15`).toBeGreaterThanOrEqual(f.corridor.noDeathBeforeMinute);
      }
      expect(f.miraViolations).toEqual([]);
    },
    GUARD_TIMEOUT,
  );

  it(
    "mira: 2/3 Seeds erreichen Minute 30 (dawn) — HP-90-Kante ist gepinnt",
    () => {
      const dawns = miraRuns.filter((r) => r.outcome === "dawn");
      expect(dawns.length, `dawn-Seeds: ${dawns.map((r) => r.seed).join(",")}`).toBe(2);
      // Level der Dawn-Läufe im Band (Referenz auf HP 250: 35/38).
      for (const r of dawns) {
        expect(r.endLevel ?? 0, `mira/${r.seed} Dawn-Level`).toBeGreaterThanOrEqual(f.corridor.endLevel[0]);
        expect(r.endLevel ?? 0, `mira/${r.seed} Dawn-Level`).toBeLessThanOrEqual(f.corridor.endLevel[1]);
      }
    },
    GUARD_TIMEOUT,
  );

  it(
    "K3-Hebel ist gepinnt: WAVES nutzen MID_GAME_MIX genau in Minute 20–24 (Halbierung abom/voidcaller)",
    () => {
      // Ein stiller Revert des waves.ts-Hebels muss diesen Guard FAILen lassen
      // (die Fixture allein sieht einen Revert nicht).
      expect(MID_GAME_MIX.abom).toBe(0.5);
      expect(MID_GAME_MIX.voidcaller).toBe(0.5);
      // Sonstige Gewichte = TIER_MIXES[4] (reine Gewichts-Halbierung, keine Subtraktion).
      const tier4 = TIER_MIXES[4];
      for (const [id, weight] of Object.entries(MID_GAME_MIX)) {
        expect(weight, `${id}`).toBe(id === "abom" || id === "voidcaller" ? 0.5 : tier4[id as EnemyId]);
      }
      for (const id of Object.keys(tier4) as EnemyId[]) expect(MID_GAME_MIX[id]).toBeDefined();
      for (let minute = 0; minute < WAVES.length; minute++) {
        const expected = minute >= MID_GAME_MIX_MINUTE && minute <= MID_GAME_MIX_LAST_MINUTE
          ? MID_GAME_MIX
          : minute >= 25 ? LATE_GAME_MIX : TIER_MIXES[Math.min(4, Math.floor(minute / 5))];
        expect(WAVES[minute].mix, `Minute ${minute}`).toBe(expected);
      }
    },
    GUARD_TIMEOUT,
  );

  it(
    "kael (unverändert, HP 130): dawn, Levelband, alle Dauern im Korridor",
    () => {
      expect(kaelRuns.length).toBe(1);
      const k = kaelRuns[0];
      expect(k.outcome).toBe("dawn");
      expect(k.endLevel ?? 0).toBeGreaterThanOrEqual(f.corridor.endLevel[0]);
      expect(k.endLevel ?? 0).toBeLessThanOrEqual(f.corridor.endLevel[1]);
      for (const b of kaelBosses) {
        expect(b.durationSec, `${b.name}`).not.toBeNull();
        expect(b.durationSec, `${b.name} muss im Boss-Korridor liegen`).toBeGreaterThanOrEqual(f.corridor.bossDurationSec[0]);
        expect(b.durationSec, `${b.name} muss im Boss-Korridor liegen`).toBeLessThanOrEqual(f.corridor.bossDurationSec[1]);
      }
      // Nebenwirkungs-Protokoll: gegen die AELTERE HP-250-Referenz (13:52Z,
      // aelterer Code-Stand) sind genau die dokumentierten Deltas ausserhalb
      // der ±10-%-Toleranz (Knochenfürst, Fahler Hirte, Hexenzirkel — Drift aus
      // den Perf-Merges, bestand schon in K1 OHNE Fix, siehe kaelNote). Eine
      // ANDERE Verteilung heisst: Rebaseline mit Begruendung in der Lane-Doku.
      expect(f.kaelChecks.length).toBe(6);
      expect(
        f.kaelChecks.filter((c) => !c.inTolerance).map((c) => c.bossIndex).sort(),
        "kael-Deltas >10 % muessen genau die dokumentierten Bosse sein",
      ).toEqual([1, 2, 4]);
    },
    GUARD_TIMEOUT,
  );
});
