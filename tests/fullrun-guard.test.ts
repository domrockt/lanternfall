import { describe, expect, it } from "vitest";
import {
  BOSS_SECONDS,
  CHEST_TARGET,
  HEAP_TARGET_PCT,
  bossSpawnReport,
  evaluateGuardGates,
  heapDeltaPct,
  // @ts-expect-error – reine JS-Tor-Definitionen aus dem Guard-Skript, keine d.ts vorhanden
} from "../scripts/m10-fullrun-guard.mjs";

// Lane m10-fullrun-guard, Karte #3: Die Tor-Definitionen des Abnahme-Wächters
// (6/6 Bosse ±2 s, 6 Truhen, Sieg dawn, 0 JS-Fehler, Heap ≤ +15 %) sind reine
// Funktionen in scripts/m10-fullrun-guard.mjs und werden hier deterministisch
// geprüft — inkl. negativer Fälle (Torverletzung -> FAIL). Kein echter
// 30-min-Lauf im Unit-Test.

/** Fixture: konsistenter Sieger-Lauf (alle Tore grün). */
function winningRun() {
  return {
    bossesSpawned: BOSS_SECONDS.map((expected: number, index: number) => ({ index, at: expected })),
    bossesDefeated: 6,
    chestsDropped: 6,
    resultReason: "dawn",
    jsErrors: [],
    heap: { minute1MB: 30, endMB: 31.5 }, // +5 % -> im Tor
  };
}

describe("fullrun-guard Tor-Definitionen", () => {
  it("Sollwerte sind die ACCEPTANCE-Inhalte", () => {
    expect(BOSS_SECONDS).toEqual([300, 600, 900, 1200, 1500, 1800]);
    expect(CHEST_TARGET).toBe(6);
    expect(HEAP_TARGET_PCT).toBe(15);
  });

  it("konsistenter Sieger-Lauf besteht alle 6 Tore", () => {
    const verdict = evaluateGuardGates(winningRun());
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.gates).toHaveLength(6);
  });

  it("Boss-Spawn ±2 s ist ok, ±3 s ist eine Torverletzung", () => {
    const inTime = bossSpawnReport(BOSS_SECONDS.map((expected: number, index: number) => ({ index, at: expected + 2 })));
    expect(inTime.every((b: { ok: boolean }) => b.ok)).toBe(true);
    const late = bossSpawnReport(BOSS_SECONDS.map((expected: number, index: number) => ({ index, at: expected + 3 })));
    expect(late.every((b: { ok: boolean }) => !b.ok)).toBe(true);
  });

  it("fehlende oder verschobene Boss-Welle failt das Timing-Tor", () => {
    // Welle 2 (index 1) fehlt komplett.
    const missing = evaluateGuardGates({ ...winningRun(), bossesSpawned: winningRun().bossesSpawned.filter((b: { index: number; at: number }) => b.index !== 1) });
    expect(missing.passed).toBe(false);
    expect(missing.failures).toContain("bosses-6-timing");
    // Welle 4 um 3 s zu spät.
    const shifted = winningRun().bossesSpawned.map((b: { index: number; at: number }) => (b.index === 3 ? { ...b, at: b.at + 3 } : b));
    const verdict = evaluateGuardGates({ ...winningRun(), bossesSpawned: shifted });
    expect(verdict.failures).toContain("bosses-6-timing");
    expect(verdict.failures).not.toContain("bosses-defeated");
  });

  it("zu wenige Truhen oder besiegte Bosse failen die jeweiligen Tore", () => {
    const fewChests = evaluateGuardGates({ ...winningRun(), chestsDropped: 5 });
    expect(fewChests.passed).toBe(false);
    expect(fewChests.failures).toContain("chests-6");
    const fewBosses = evaluateGuardGates({ ...winningRun(), bossesDefeated: 5 });
    expect(fewBosses.passed).toBe(false);
    expect(fewBosses.failures).toContain("bosses-defeated");
  });

  it("Sieg muss resultReason=dawn haben — jeder andere Grund failt", () => {
    const death = evaluateGuardGates({ ...winningRun(), resultReason: "death" });
    expect(death.passed).toBe(false);
    expect(death.failures).toContain("victory-dawn");
    const noReason = evaluateGuardGates({ ...winningRun(), resultReason: null });
    expect(noReason.failures).toContain("victory-dawn");
  });

  it("JS-Fehler und nicht messbarer/zu grosser Heap failen", () => {
    const noisy = evaluateGuardGates({ ...winningRun(), jsErrors: ["TypeError: x is not a function"] });
    expect(noisy.passed).toBe(false);
    expect(noisy.failures).toContain("js-errors-0");

    // Heap +21 % über dem Tor (Messrausch-Wert aus reacceptance-c).
    const growing = evaluateGuardGates({ ...winningRun(), heap: { minute1MB: 30, endMB: 36.3 } });
    expect(growing.heapDeltaPct).toBeGreaterThan(HEAP_TARGET_PCT);
    expect(growing.failures).toContain("heap-growth");

    // Heap nicht messbar (null/0) -> Tor failt, nicht schweigend passieren.
    const unmeasured = evaluateGuardGates({ ...winningRun(), heap: { minute1MB: 0, endMB: 0 } });
    expect(unmeasured.heapDeltaPct).toBeNull();
    expect(unmeasured.failures).toContain("heap-growth");
  });

  it("heapDeltaPct rundet auf 0,1 % und behandelt fehlende Werte", () => {
    expect(heapDeltaPct(30, 31.5)).toBe(5);
    expect(heapDeltaPct(30, 36.3)).toBe(21);
    expect(heapDeltaPct(null, 30)).toBeNull();
    expect(heapDeltaPct(30, undefined)).toBeNull();
  });
});
