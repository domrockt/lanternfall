import { describe, expect, it } from "vitest";
import { evaluateHeapGate, GATE_PCT, SOFT_PCT } from "../scripts/m10-heap-budget-gate.mjs";

/**
 * SOFT-Fenster-Peak-Regression (Lane m10-heap-softgate-fix, F1 aus
 * docs/lanes/m10-reacceptance-d.md, Merge ddc7534):
 *
 * Das rohe SOFT-Signal (Max je 5-min-Fenster vs Post-GC-Minute-1) false-failte
 * auf reaccd (maxWindowPeak 77,7 MB = +41,5 % vs Minute 1 54,9 MB), weil rohe
 * Peaks ohne erzwungenes GC einen GC-Saegezahn abbilden. Fix (K2): robustes
 * Kriterium — je Fenster das MINIMUM (Floor ≈ Heapstand kurz nach einer
 * Collection), Referenz = Floor von Fenster 0 (RAW-vs-RAW, Boot-Spike-fest).
 *
 * Diese Datei prueft an synthetischen Fensterfolgen:
 *  - HARD-Ausgabe identisch zu vorher (Goldenwerte + unveranderte Felder);
 *  - SOFT robust plausibel: Saegezahn ohne Leak und Boot-Spike failen NICHT,
 *    echter Leak und monotone Zuwachse failen.
 * Die rohen Beobachtungsfelder (windowPeaks/maxWindowPeak/softPass/softVerdict)
 * bleiben unveraendert und zeigen den Saegezahn weiterhin.
 */

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Rohe Minuten-Peaks fuer Minute 0..29 nach Muster. */
function peaks30(f: (m: number) => number) {
  return Array.from({ length: 30 }, (_, m) => ({ minute: m, peakMB: round1(f(m)) }));
}

describe("evaluateHeapGate — HARD-Ausgabe identisch zu vorher (Goldenwerte)", () => {
  it("Konstanten unveraendert: HARD +15 %, SOFT +25 %", () => {
    expect(GATE_PCT).toBe(15);
    expect(SOFT_PCT).toBe(25);
  });

  it("HARD-Felder bitgleich auf festen Eingaben (reaccd-Werte 54,9 -> 60,8 MB)", () => {
    const gate = evaluateHeapGate({ minute1MB: 54.9, endMB: 60.8, minutePeaks: peaks30((m) => 55 + (m % 5)) });
    expect(gate.endDeltaMB).toBe(5.9);
    expect(gate.endDeltaPct).toBe(10.7);
    expect(gate.gatePct).toBe(15);
    expect(gate.hardPass).toBe(true);
    expect(gate.verdict).toBe("PASS");
    expect(gate.fallA).toBe(true);
    expect(gate.fallB).toBe(false);
  });

  it("HARD-Felder bitgleich: FAIL jenseits des Tors und UNMESSBAR ohne Minute 1", () => {
    const fail = evaluateHeapGate({ minute1MB: 32, endMB: 40, minutePeaks: [] });
    expect(fail.endDeltaPct).toBe(25);
    expect(fail.hardPass).toBe(false);
    expect(fail.verdict).toBe("FAIL");
    expect(fail.fallA).toBe(false);
    expect(fail.fallB).toBe(true);

    const unmeas = evaluateHeapGate({ minute1MB: null, endMB: 30, minutePeaks: [] });
    expect(unmeas.hardPass).toBe(false);
    expect(unmeas.verdict).toBe("UNMESSBAR");
    expect(unmeas.fallB).toBe(false);
  });

  it("definition-String unveraendert (HARD-Ausgabe bleibt bitgleich)", () => {
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks: [] });
    expect(gate.definition).toBe(
      "HARD: endMB(nach erzwungenem GC, Run-Ende) - Minute 1 <= +15 % | SOFT (Beobachtung): max Peak je 5-min-Fenster <= Minute 1 + 25 %",
    );
  });

  it("rohe Beobachtungsfelder unveraendert: windowPeaks bleibt Max je Fenster", () => {
    const minutePeaks = [
      { minute: 0, peakMB: 40 }, { minute: 4, peakMB: 42 }, { minute: 5, peakMB: 36 },
      { minute: 29, peakMB: 39 },
    ];
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks });
    expect(gate.windowPeaks.map((w) => w.peakMB)).toEqual([42, 36, 39]);
    expect(gate.maxWindowPeakMB).toBe(42);
    expect(gate.maxWindowPeakPct).toBe(31.3);
  });
});

describe("evaluateHeapGate — SOFT robust: GC-Saegezahn ohne Leak", () => {
  // Saegezahn um Basis 32: Peak am Fensteranfang 41, sonst 35 (Churn zwischen
  // Collections). Gehaltener Heap (Post-GC) stabil — kein Leak.
  const minutePeaks = peaks30((m) => 32 + (m % 5 === 0 ? 9 : 3));
  const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks });

  it("Floor je Fenster flach am gehaltenen Niveau", () => {
    expect(gate.windowFloors.map((w) => w.floorMB)).toEqual([35, 35, 35, 35, 35, 35]);
    expect(gate.softReferenceMB).toBe(35);
    expect(gate.maxWindowFloorMB).toBe(35);
    expect(gate.maxWindowFloorPct).toBe(0);
  });

  it("SOFT robust kein False-Fail: PASS", () => {
    expect(gate.softFloorPass).toBe(true);
    expect(gate.softFloorVerdict).toBe("PASS (Beobachtung, robust)");
  });

  it("rohes SOFT zeigt den Saegezahn weiterhin (Beobachtung, kein Tor)", () => {
    expect(gate.maxWindowPeakMB).toBe(41);
    expect(gate.softPass).toBe(false);
    expect(gate.softVerdict).toBe("FAIL (Beobachtung)");
    expect(gate.verdict).toBe("PASS"); // HARD unberuehrt
  });
});

describe("evaluateHeapGate — SOFT robust: Boot-Spike (reaccd-Form, F1)", () => {
  // Boot-Warmup auf Minute 0+1 (77,7/73,5 MB wie reaccd), danach stabiler
  // Saegezahn um 32. Gehaltener Heap stabil.
  const minutePeaks = peaks30((m) => (m === 0 ? 77.7 : m === 1 ? 73.5 : 32 + (m % 5 === 0 ? 9 : 3)));
  const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks });

  it("Floor von Fenster 0 unberuehrt vom Boot-Spike", () => {
    expect(gate.windowFloors[0].floorMB).toBe(35); // min(77,7; 73,5; Saegezahn) 
    expect(gate.softReferenceMB).toBe(35);
  });

  it("SOFT robust kein False-Fail: PASS trotz Boot-Spike", () => {
    expect(gate.softFloorPass).toBe(true);
    expect(gate.softFloorVerdict).toBe("PASS (Beobachtung, robust)");
  });

  it("rohes SOFT sieht den Spike weiterhin (maxWindowPeak 77,7 wie reaccd)", () => {
    expect(gate.maxWindowPeakMB).toBe(77.7);
    expect(gate.softPass).toBe(false);
  });
});

describe("evaluateHeapGate — SOFT robust: monoton steigende rohe Peaks", () => {
  it("mild (+0,2 MB/min, innerhalb des Bands): PASS", () => {
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks: peaks30((m) => 32 + 0.2 * m) });
    expect(gate.softReferenceMB).toBe(32);
    expect(gate.maxWindowFloorMB).toBe(37); // Floor Fenster 5 = 32 + 0,2*25
    expect(gate.maxWindowFloorPct).toBe(15.6);
    expect(gate.softFloorPass).toBe(true);
  });

  it("stark (+0,9 MB/min, keine GC-Resets sichtbar): FAIL als Beobachtung", () => {
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks: peaks30((m) => 32 + 0.9 * m) });
    expect(gate.maxWindowFloorMB).toBe(54.5); // 32 + 0,9*25
    expect(gate.maxWindowFloorPct).toBe(70.3);
    expect(gate.softFloorPass).toBe(false);
    expect(gate.softFloorVerdict).toBe("FAIL (Beobachtung, robust)");
    // HARD bleibt trotzdem PASS (gehaltener Heap stabil) — SOFT ist kein Tor.
    expect(gate.hardPass).toBe(true);
  });
});

describe("evaluateHeapGate — SOFT robust: echter Leak", () => {
  // Leak: +0,4 MB/min auf Basis 32 (~+12 MB ueber 30 min), Saegezahn obendrauf.
  const minutePeaks = peaks30((m) => 32 + (m % 5 === 0 ? 9 : 3) + 0.4 * m);
  const gate = evaluateHeapGate({
    minute1MB: 32,
    endMB: 43.6, // 32 + 0,4*29
    minutePeaks,
  });

  it("SOFT robust FAIL: Floor steigt monotone ueber die Fenster", () => {
    expect(gate.windowFloors[0].floorMB).toBe(35.4);
    expect(gate.windowFloors[5].floorMB).toBe(45.4); // 35 + 0,4*26
    expect(gate.maxWindowFloorMB).toBe(45.4);
    expect(gate.maxWindowFloorPct).toBe(28.2);
    expect(gate.softFloorPass).toBe(false);
    expect(gate.softFloorVerdict).toBe("FAIL (Beobachtung, robust)");
  });

  it("HARD failt den Leak weiterhin identisch", () => {
    expect(gate.endDeltaPct).toBe(36.3);
    expect(gate.hardPass).toBe(false);
    expect(gate.verdict).toBe("FAIL");
  });
});

describe("evaluateHeapGate — SOFT robust: Randfaelle", () => {
  it("ohne minutePeaks: UNMESSBAR, kein Fake-PASS", () => {
    const gate = evaluateHeapGate({ minute1MB: 32, endMB: 32, minutePeaks: [] });
    expect(gate.windowFloors).toEqual([]);
    expect(gate.softReferenceMB).toBeNull();
    expect(gate.maxWindowFloorMB).toBeNull();
    expect(gate.maxWindowFloorPct).toBeNull();
    expect(gate.softFloorPass).toBe(false);
    expect(gate.softFloorVerdict).toBe("UNMESSBAR (Beobachtung, robust)");
  });

  it("genau +25 % besteht, +25,1 % failt", () => {
    // Floor 0 = 32, Floor 5 = 40 → exakt +25 %.
    const at = evaluateHeapGate({
      minute1MB: 32, endMB: 32,
      minutePeaks: [...Array.from({ length: 5 }, (_, m) => ({ minute: m, peakMB: 32 })),
        ...Array.from({ length: 25 }, (_, i) => ({ minute: i + 5, peakMB: 40 }))],
    });
    expect(at.maxWindowFloorPct).toBe(25);
    expect(at.softFloorPass).toBe(true);

    const over = evaluateHeapGate({
      minute1MB: 32, endMB: 32,
      minutePeaks: [...Array.from({ length: 5 }, (_, m) => ({ minute: m, peakMB: 32 })),
        ...Array.from({ length: 25 }, (_, i) => ({ minute: i + 5, peakMB: 40.1 }))],
    });
    expect(over.softFloorPass).toBe(false);
  });

  it("Loecher in minutePeaks (fehlende Minuten) brechen nichts", () => {
    const gate = evaluateHeapGate({
      minute1MB: 32, endMB: 32,
      minutePeaks: [{ minute: 0, peakMB: 32 }, { minute: 27, peakMB: 36 }, { minute: 99, peakMB: 40 }],
    });
    // Fenster 0 (Floor 32, Referenz) und Fenster 5 (Floor 36); Minute 99 →
    // Fenster 0 (Floor 32, Referenz), Fenster 5 (Floor 36) und Fenster 19
    // (Floor 40) werden mitgefuehrt (Map gegen Loecher, wie im rohen Pfad).
    expect(gate.windowFloors.map((w) => w.window)).toEqual([0, 5, 19]);
    expect(gate.maxWindowFloorPct).toBe(25); // Fenster 19: (40-32)/32
    expect(gate.softFloorPass).toBe(true); // genau +25 % = am Band
  });
});
