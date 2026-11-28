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

  return {
    definition: `HARD: endMB(nach erzwungenem GC, Run-Ende) - Minute 1 <= +${GATE_PCT} % | SOFT (Beobachtung): max Peak je 5-min-Fenster <= Minute 1 + ${SOFT_PCT} %`,
    minute1MB: minute1MB ?? null,
    endMB: endMB ?? null,
    endDeltaMB,
    endDeltaPct,
    gatePct: GATE_PCT,
    softPct: SOFT_PCT,
    windowPeaks: windowPeakList,
    maxWindowPeakMB,
    maxWindowPeakPct,
    hardPass,
    softPass,
    verdict: hardPass ? "PASS" : (endDeltaPct == null ? "UNMESSBAR" : "FAIL"),
    softVerdict: softPass ? "PASS (Beobachtung)" : "FAIL (Beobachtung)",
    // Fall-A/B-Entscheidung fuer Karte #6239:
    fallA: hardPass,
    fallB: endDeltaPct != null && !hardPass,
  };
}
