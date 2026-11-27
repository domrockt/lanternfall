import { describe, expect, it } from "vitest";
import { evaluateHeapGate, GATE_PCT, SOFT_PCT } from "../scripts/m10-heap-budget-gate.mjs";

/**
 * Heap-Tor (Lane m10-heap-budget, Karte #6240):
 * Das Tor (Karte #6239, GC-Saegezahn-fest) wird deterministisch an
 * synthetischen Heap-Verlaeufen getestet:
 *  - ein GC-Saegezahn mit stabilen Enden (Post-GC endMB ≈ Minute 1) besteht
 *    das Tor, obwohl die rohen Peaks weit ueber Minute 1 liegen;
 *  - ein monotoner Zuwachs (endMB > Minute 1 + Tor) failt das Tor;
 *  - der weiche Rand (Peak je 5-min-Fenster <= Minute 1 + 25 %) ist nur
 *    Beobachtungswert und aendert das Urteil nicht.
 */

const round1 = (x: number) => Math.round(x * 10) / 10;

// Synthetischer 30-Minuten-Lauf: Post-GC-Wert je Minute (timeline) und roher
// Peak je Minute (minutePeaks). mode "sawtooth": Post-GC stabil um base,
// Peaks schwanken stark (GC-Phase-Jitter, wie reacceptance-c K7: Minute 1
// 31,9 MB, Minute 29 38,6 MB, endMB 27,1 MB). mode "leak": Post-GC waechst
// monoton um driftPerMinute.
function syntheticRun(mode: "sawtooth" | "leak", base = 32) {
  const minutePeaks: Array<{ minute: number; peakMB: number }> = [];
  const timeline: Array<{ minute: number; jsMB: number }> = [];
  const driftPerMinute = 0.4; // Leak: ~ +12 MB ueber 30 min
  for (let m = 0; m < 30; m++) {
    // Roher Peak: Saegezahn-Amplitude +/- 9 MB um base (ohne erzwungenes GC),
    // Maximum an jedem 5. Minute — wie der Jitter in reacceptance-c K7.
    const amp = mode === "sawtooth" ? 9 : 3;
    const peak = base + (m % 5 === 0 ? amp : amp / 3) + (mode === "leak" ? driftPerMinute * m : 0);
    minutePeaks.push({ minute: m, peakMB: round1(peak) });
    // Post-GC (nach erzwungenem GC): Saegezahn gezogen.
    const retained = mode === "sawtooth" ? base + 0.2 * Math.sin(m) : base + driftPerMinute * m;
    timeline.push({ minute: m, jsMB: round1(retained) });
  }
  return { timeline, minutePeaks };
}

describe("evaluateHeapGate — Tor-Definition (HARD endMB vs Minute 1, SOFT Fenster-Peak)", () => {
  it("Konstanten: hartes Tor +15 %, weicher Rand +25 % (Beobachtung)", () => {
    expect(GATE_PCT).toBe(15);
    expect(SOFT_PCT).toBe(25);
  });

  it("Fall A: GC-Saegezahn mit stabilen Enden besteht das harte Tor", () => {
    const run = syntheticRun("sawtooth", 32);
    const minute1 = run.timeline[0].jsMB; // 32,0
    const end = run.timeline[run.timeline.length - 1].jsMB; // ~31,9
    const gate = evaluateHeapGate({ minute1MB: minute1, endMB: end, minutePeaks: run.minutePeaks });
    expect(gate.endDeltaPct).not.toBeNull();
    expect(Math.abs(gate.endDeltaPct!)).toBeLessThan(1);
    expect(gate.hardPass).toBe(true);
    expect(gate.verdict).toBe("PASS");
    expect(gate.fallA).toBe(true);
    expect(gate.fallB).toBe(false);
  });

  it("Saegezahn-Jitter in den Peaks failt NICHT das harte Tor (soft bleibt Beobachtung)", () => {
    const run = syntheticRun("sawtooth", 32);
    const gate = evaluateHeapGate({
      minute1MB: run.timeline[0].jsMB,
      endMB: run.timeline[run.timeline.length - 1].jsMB,
      minutePeaks: run.minutePeaks,
    });
    // Peaks liegen deutlich ueber Minute 1 (+25 % weicher Rand), aber das
    // harte Tor endMB-vs-Minute-1 ist unberuehrt.
    expect(gate.maxWindowPeakPct!).toBeGreaterThan(SOFT_PCT);
    expect(gate.softPass).toBe(false);
    expect(gate.verdict).toBe("PASS");
  });

  it("Fall B: monotoner Zuwachs ueber dem Tor failt (+12 MB auf 32 MB ≈ +38 %)", () => {
    const run = syntheticRun("leak", 32);
    const minute1 = run.timeline[0].jsMB;
    const end = run.timeline[run.timeline.length - 1].jsMB;
    const gate = evaluateHeapGate({ minute1MB: minute1, endMB: end, minutePeaks: run.minutePeaks });
    expect(gate.endDeltaPct!).toBeGreaterThan(GATE_PCT);
    expect(gate.hardPass).toBe(false);
    expect(gate.verdict).toBe("FAIL");
    expect(gate.fallB).toBe(true);
    expect(gate.fallA).toBe(false);
  });

  it("Randfall: genau +15 % besteht, +15,1 % failt", () => {
    const m1 = 32;
    expect(evaluateHeapGate({ minute1MB: m1, endMB: 36.8, minutePeaks: [] }).hardPass).toBe(true); // exakt +15 %
    expect(evaluateHeapGate({ minute1MB: m1, endMB: 36.9, minutePeaks: [] }).hardPass).toBe(false); // +15,6 %
  });

  it("Weicher Rand: max Peak je 5-min-Fenster aus den rohen Minuten-Peaks", () => {
    const minutePeaks = [
      { minute: 0, peakMB: 40 }, { minute: 4, peakMB: 42 }, { minute: 5, peakMB: 36 },
      { minute: 29, peakMB: 39 },
    ];
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks });
    // Fenster 0 (Min 0-4): max 42; Fenster 1 (Min 5-9): 36; Fenster 5
    // (Min 25-29): 39. Liste ist kompakt (nur vorhandene Fenster, sortiert).
    expect(gate.windowPeaks.map((w) => w.window)).toEqual([0, 1, 5]);
    expect(gate.windowPeaks.find((w) => w.window === 0)?.peakMB).toBe(42);
    expect(gate.windowPeaks.find((w) => w.window === 1)?.peakMB).toBe(36);
    expect(gate.windowPeaks.find((w) => w.window === 5)?.peakMB).toBe(39);
    expect(gate.maxWindowPeakMB).toBe(42);
    expect(gate.maxWindowPeakPct).toBe(31.3); // (42-32)/32 = +31,25 % -> gerundet
    expect(gate.softPass).toBe(false);
  });

  it("endMB unter Minute 1 (negativ) ist PASS — kein Leak, wie reacceptance-c endMB 27,1 < 31,9", () => {
    const gate = evaluateHeapGate({ minute1MB: 31.9, endMB: 27.1, minutePeaks: [] });
    expect(gate.endDeltaPct).toBeLessThan(0);
    expect(gate.hardPass).toBe(true);
    expect(gate.verdict).toBe("PASS");
  });

  it("unmessbarer Lauf (Minute 1 fehlt) liefert kein Fake-PASS", () => {
    const gate = evaluateHeapGate({ minute1MB: null, endMB: 30, minutePeaks: [] });
    expect(gate.hardPass).toBe(false);
    expect(gate.verdict).toBe("UNMESSBAR");
    expect(gate.fallB).toBe(false); // kein Fall-B-Befund ohne Messung
  });
});
