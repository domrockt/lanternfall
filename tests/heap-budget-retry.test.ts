// Guard-Test für die Mess-Retry-Logik in scripts/m10-heap-budget.mjs
// (diese Lane, K2/K3 — Befund Nachabnahme F: das Tor-Skript crashte mittendrin
// mit "Target page, context or browser has been closed" → gate=UNMESSBAR,
// siehe docs/lanes/m10-heap-gate-retry.md).
//
// Getestet wird NUR die Retry-Schicht: Fehlerklassen, Retry-Grenze (1 + 2
// Retries), UNMESSBAR-Ursachenfeld. Die Tor-Mathematik gehört dem bestehenden
// Tor-Test tests/heap-budget.test.ts und wird hier NICHT doppelt getestet.
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error – reines JS-Messskript, keine d.ts vorhanden; der Import
// selbst ist Teil der Abnahme: er darf KEINE Nebeneffekte haben (main-guard,
// kein Browser/Server beim Testen).
import { buildCause, classifyError, isRetryable, MEASUREMENT_ATTEMPTS, withRetry } from "../scripts/m10-heap-budget.mjs";

// Beleg aus ~/games/.evidence/m10-acceptance-refresh-f/k4-heap-budget-partial.json
const FATAL_REFRESH_F = "Error: page.waitForTimeout: Target page, context or browser has been closed";
// Beleg aus ~/games/.evidence/m10-heap-gate-recovery/k1-run2.json
const FATAL_GATE_RECOVERY = "Error: page.evaluate: Target page, context or browser has been closed";

describe("classifyError (Fehlerklassen, K1-Tabelle)", () => {
  test("Target-Tod der beiden historischen Crashes -> target-closed", () => {
    expect(classifyError(FATAL_REFRESH_F)).toBe("target-closed");
    expect(classifyError(FATAL_GATE_RECOVERY)).toBe("target-closed");
  });

  test("weitere Target-/Session-Varianten -> target-closed", () => {
    expect(classifyError("Target closed")).toBe("target-closed");
    expect(classifyError("Protocol error: Session closed. Most likely the page has been closed.")).toBe("target-closed");
  });

  test("CDP-/Detach- und Timeout-Fehler -> eigene Klassen", () => {
    expect(classifyError("CDP session detached: page closed")).toBe("cdp-detached");
    expect(classifyError("Timeout 30000ms exceeded while waiting for the page")).toBe("timeout");
  });

  test("Port-Konflikt (bereits von harness.mjs B5 geloest) -> other, nicht retryable hier", () => {
    const msg = "Statischer Server konnte nicht gestartet werden: Port-Konflikt auch nach 3 Versuchen (Ports 5400-5402)";
    expect(classifyError(msg)).toBe("other");
    expect(isRetryable(msg)).toBe(false);
  });

  test("unbekannter Fehler -> other, nicht retryable", () => {
    expect(classifyError("irgendein unerwarteter Fehler")).toBe("other");
    expect(isRetryable("irgendein unerwarteter Fehler")).toBe(false);
  });
});

describe("withRetry (begrenzte Versuche, K2)", () => {
  test("retryable Fehler: Retry bis Erfolg (2 Fehlversuche, dann ok)", async () => {
    const onRetry = vi.fn();
    let calls = 0;
    const result = await withRetry(
      async (attempt: number) => {
        calls = attempt;
        if (attempt < 3) throw new Error(FATAL_GATE_RECOVERY);
        return `ok-${attempt}`;
      },
      { onRetry },
    );
    expect(result).toBe("ok-3");
    expect(calls).toBe(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe("target-closed");
  });

  test("Retry-Grenze: nach MEASUREMENT_ATTEMPTS Gesamtversuchen wird der letzte Fehler geworfen", async () => {
    const fn = vi.fn(async () => { throw new Error(FATAL_REFRESH_F); });
    await expect(withRetry(fn)).rejects.toThrow(/Target page, context or browser has been closed/);
    expect(fn).toHaveBeenCalledTimes(MEASUREMENT_ATTEMPTS);
    expect(MEASUREMENT_ATTEMPTS).toBe(3); // 1 Versuch + 2 Retries (Briefing K2)
  });

  test("nicht-retryable Fehler: kein Retry, sofortiger Abbruch", async () => {
    const fn = vi.fn(async () => { throw new Error("Port-Konflikt auch nach 3 Versuchen"); });
    await expect(withRetry(fn)).rejects.toThrow(/Port-Konflikt/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("UNMESSBAR-Pfad (K2: eindeutiges Urteil statt Halbsatz)", () => {
  test("buildCause nennt Klasse, Versuchsprotokoll und Ursache", () => {
    const cause = buildCause(
      FATAL_REFRESH_F,
      [{ attempt: 1, errorClass: "target-closed", message: FATAL_REFRESH_F.slice(0, 200) },
       { attempt: 2, errorClass: "timeout", message: "Timeout 30000ms exceeded" }],
    );
    expect(cause).toContain("UNMESSBAR");
    expect(cause).toContain("target-closed");
    expect(cause).toContain("#1:target-closed");
    expect(cause).toContain("#2:timeout");
    expect(cause).toContain("waitForTimeout");
  });

  test("Tor bleibt UNMESSBAR, wenn kein valider Versuch uebrig bleibt (keine Gate-Mathematik dupliziert)", async () => {
    const { evaluateHeapGate } = await import("../scripts/m10-heap-budget-gate.mjs");
    // Nach Erschoepfung aller Versuche liegen keine gueltigen Messwerte vor:
    const gate = evaluateHeapGate({ minute1MB: null, endMB: null, minutePeaks: [] });
    expect(gate.verdict).toBe("UNMESSBAR");
    // Das Skript haengt nur das Ursachefeld an (gate.cause), aendert das Urteil nicht:
    const cause = buildCause(FATAL_GATE_RECOVERY, [{ attempt: 3, errorClass: "target-closed", message: FATAL_GATE_RECOVERY }]);
    expect(cause.startsWith("UNMESSBAR")).toBe(true);
  });
});
