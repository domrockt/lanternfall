// Heap-Tor-Definition (Lane m10-heap-budget, Karte #6239) — reine Funktion,
// getestet in tests/heap-budget.test.ts und benutzt von
// scripts/m10-heap-budget.mjs.
//
// Hintergrund (reacceptance-c K7, PIN 43fd9eb): das alte Tor verglich den
// Post-GC-Heap von Minute 1 mit Minute 29 im Lauf (+21 %). endMB lag mit
// 27,1 MB UNTER Minute 1 (31,9 MB) → klassischer GC-Saegezahn/Peak-Jitter,
// kein monotoner Leak. Das Tor bleibt hart (Dom 19:05Z), wird aber
// messrausch-fest definiert:
//
//   HARD:  endMB (nach erzwungenem GC im Run-Ende) - Minute 1 <= +15 %
//          Nach Scene-Teardown + GC gehaltener Heap ist der Leak-Signalgeber;
//          ein Vergleich "Minute 29 im Lauf vs. Minute 1" ist mit legitimer
//          Spielstaerke (Level 38, Gegnerwellen) konfundiert.
//   SOFT (Beobachtungswert, kein Gate):
//          max Peak je 5-min-Fenster <= Minute 1 + 25 %
//          Rohe JS-Heap-Peaks ohne erzwungenes GC zeigen, dass innerhalb der
//          Fenster nichts aus dem Ruder laeuft (GC-Saegezahn sichtbar machen).
//
// Fall A: hardPass === true  → kein monotoner Leak, Tor-Messung gueltig.
// Fall B: hardPass === false → echter Zuwachs, Snapshot-Diff + Top-Holder.
//
// Fix-Job F1 (Lane m10-heap-softgate-fix, docs/lanes/m10-reacceptance-d.md, Merge
// ddc7534): das rohe SOFT-Signal (Max je 5-min-Fenster vs Post-GC-Minute-1)
// false-failt — reaccd: maxWindowPeak 77,7 MB = +41,5 % vs Minute 1 (54,9 MB),
// obwohl das HARD-Tor bei +10,7 % PASS ist (Timeline Minute 28-29 platt bei
// 55,8/55,9 MB). Zwei Messartefakte, nicht ein Leak:
//   1. RAW-vs-POSTGC: rohe Peaks ohne erzwungenes GC liegen systematisch ueber
//      dem Post-GC-Niveau — der Vergleich misst den GC-Phasen-Abstand, keinen
//      retention.
//   2. MAX je Fenster: das Fenster-Maximum ist der Saegezahn-Kamm; Fenster 0
//      zusaetzlich Boot-Warmup (77,7 MB). Fenster 0 auszunehmen allein reicht
//      NICHT (Fenster 3-5: 71,1-76,7 MB, ebenfalls ueber +25 %).
// Robustes SOFT-Signal (neu, neben dem rohen Beobachtungswert):
//   - Je 5-min-Fenster das MINIMUM der rohen Minuten-Peaks ("Floor"): das ist
//     der Heapstand kurz nach einer Collection ≈ gehaltener Heap. Allocation-
//     Churn und Boot-Spikes zwischen Collections bewegen den Floor nicht, ein
//     echter Leak hebt ihn monotone ueber alle Fenster. Minimum statt Perzentil,
//     weil es die konservativste robuste Statistik ist: FAIL bleibt ein starkes
//     Signal, PASS maskiert weniger.
//   - Referenz = Floor von Fenster 0 (RAW-vs-RAW, gleiche Statistik wie alle
//     Fenster): der Boot-Spike sitzt in reaccd auf Minute 0 UND 1 (77,7/73,5 MB),
//     also ist auch der rohe Minute-1-Peak verunreinigt; das Fenster-Minimum
//     ist davon unberuehrt.
// Die rohen Felder (windowPeaks/maxWindowPeak*/softPass/softVerdict) bleiben
// unveraendert — der GC-Saegezahn soll sichtbar bleiben (Beobachtungswert);
// das robuste Urteil heisst softFloorVerdict.

export const GATE_PCT = 15;
export const SOFT_PCT = 25;

export const round1 = (x) => Math.round(x * 10) / 10;

/**
 * @param {number|null} minute1MB Post-GC-Heap bei Sim-Minute 1 (Tor-Referenz)
 * @param {number|null} endMB     Post-GC-Heap im Run-Ende (nach erzwungenem GC)
 * @param {Array<{minute:number, peakMB:number}>} minutePeaks rohe Peaks je Sim-Minute
 */
export function evaluateHeapGate({ minute1MB, endMB, minutePeaks }) {
  const measurable = minute1MB != null && minute1MB > 0 && endMB != null;
  const endDeltaMB = measurable ? round1(endMB - minute1MB) : null;
  const endDeltaPct = measurable ? round1(((endMB - minute1MB) / minute1MB) * 100) : null;

  // Peak je 5-min-Fenster aus den rohen Minuten-Peaks (Map gegen Loecher).
  const winMax = new Map();
  if (Array.isArray(minutePeaks)) {
    for (const p of minutePeaks) {
      if (p == null || !Number.isFinite(p.minute) || !Number.isFinite(p.peakMB)) continue;
      const w = Math.floor(p.minute / 5);
      winMax.set(w, Math.max(winMax.get(w) ?? 0, p.peakMB));
    }
  }
  const windowPeakList = [...winMax.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, peakMB]) => ({ window: w, fromMin: w * 5, toMin: (w + 1) * 5, peakMB: round1(peakMB) }));
  const maxWindowPeakMB = windowPeakList.length ? round1(Math.max(...windowPeakList.map((x) => x.peakMB))) : null;
  const maxWindowPeakPct = measurable && maxWindowPeakMB != null
    ? round1(((maxWindowPeakMB - minute1MB) / minute1MB) * 100)
    : null;

  const hardPass = endDeltaPct != null && endDeltaPct <= GATE_PCT;
  const softPass = maxWindowPeakPct != null && maxWindowPeakPct <= SOFT_PCT;

  // --- Robustes SOFT-Signal (Fix F1, siehe Header-Kommentar) ---
  // Je 5-min-Fenster das Minimum (Floor) statt das Maximum.
  const winMin = new Map();
  if (Array.isArray(minutePeaks)) {
    for (const p of minutePeaks) {
      if (p == null || !Number.isFinite(p.minute) || !Number.isFinite(p.peakMB)) continue;
      const w = Math.floor(p.minute / 5);
      winMin.set(w, Math.min(winMin.get(w) ?? Infinity, p.peakMB));
    }
  }
  const windowFloors = [...winMin.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, floorMB]) => ({ window: w, fromMin: w * 5, toMin: (w + 1) * 5, floorMB: round1(floorMB) }));
  const maxWindowFloorMB = windowFloors.length ? round1(Math.max(...windowFloors.map((x) => x.floorMB))) : null;
  // Referenz RAW-vs-RAW: Floor von Fenster 0 (Boot-Spike-fest, siehe Header).
  const softReferenceMB = windowFloors[0]?.floorMB ?? null;
  const maxWindowFloorPct = softReferenceMB != null && softReferenceMB > 0 && maxWindowFloorMB != null
    ? round1(((maxWindowFloorMB - softReferenceMB) / softReferenceMB) * 100)
    : null;
  const softFloorPass = maxWindowFloorPct != null && maxWindowFloorPct <= SOFT_PCT;

  return {
    definition: `HARD: endMB(nach erzwungenem GC, Run-Ende) - Minute 1 <= +${GATE_PCT} % | SOFT (Beobachtung): max Peak je 5-min-Fenster <= Minute 1 + ${SOFT_PCT} %`,
    softDefinition: `SOFT robust (F1-Fix): max Floor (Min je 5-min-Fenster, rohe Peaks) <= Floor Fenster 0 + ${SOFT_PCT} %`,
    minute1MB: minute1MB ?? null,
    endMB: endMB ?? null,
    endDeltaMB,
    endDeltaPct,
    gatePct: GATE_PCT,
    softPct: SOFT_PCT,
    windowPeaks: windowPeakList,
    maxWindowPeakMB,
    maxWindowPeakPct,
    windowFloors,
    maxWindowFloorMB,
    maxWindowFloorPct,
    softReferenceMB,
    softFloorPass,
    hardPass,
    softPass,
    verdict: hardPass ? "PASS" : (endDeltaPct == null ? "UNMESSBAR" : "FAIL"),
    softVerdict: softPass ? "PASS (Beobachtung)" : "FAIL (Beobachtung)",
    softFloorVerdict: softFloorPass ? "PASS (Beobachtung, robust)" : (maxWindowFloorPct == null ? "UNMESSBAR (Beobachtung, robust)" : "FAIL (Beobachtung, robust)"),
    // Fall-A/B-Entscheidung fuer Karte #6239:
    fallA: hardPass,
    fallB: endDeltaPct != null && !hardPass,
  };
}
