/**
 * M10-device-tier-schedule (K2/K3): Geräte-Tier-Scheduling im stepQuality.
 *
 * Beweise:
 *  1. Desktop-Pfad bitgleich (Referenzwerte pinnt der Test; Geraeteknoten
 *     dort nie erkannt -> Tier-Pfad unberuehrt, AE=0 belegt).
 *  2. Am Geraeteknoten (Adreno 710, DPR 2): Stufen-Cap medium, Start-"high"
 *     wird sofort geklemmt, Tier-Grenze = Zeitbudget-Soll 16,7 ms.
 *  3. Hysterese bei 120 Hz: 60 s bei 109–112 FPS -> 0 Stufenwechsel (kein
 *     Flapping zwischen high/medium), Totzone 60–100 FPS friert Timer ein.
 */
import { describe, expect, it } from "vitest";
import {
  QUALITY_HIGH_MS,
  QUALITY_LOW_MS,
  classifyDeviceClass,
  initialQualityState,
  probeDeviceClass,
  resetDeviceClassProbe,
  stepQuality,
  type QualityDeviceClass,
  type QualityState,
} from "../src/logic/quality";

/** Der echte Geräteknoten (Redmi Pad Pro, 120-Hz-Panel). */
const DEV: QualityDeviceClass = {
  node: "adreno710-120hz",
  panelDeadlineMs: 1000 / 120,
  tierBudgetMs: 1000 / 60,
  recoverFps: 100,
  tierCap: "medium",
};

/** N Schritte mit festem FPS + dt (ms); liefert Zustandsfolge der Tiers. */
function run(
  start: QualityState,
  fps: number,
  dtMs: number,
  steps: number,
  device?: QualityDeviceClass | null,
): { states: QualityState[]; changes: number } {
  let s = start;
  const states: QualityState[] = [s];
  let changes = 0;
  for (let i = 0; i < steps; i++) {
    const next = stepQuality(s, fps, dtMs, device);
    if (next.tier !== s.tier) changes++;
    states.push(next);
    s = next;
  }
  return { states, changes };
}

describe("classifyDeviceClass (Renderer-String-Pfad wie config.isDeviceNode)", () => {
  it("erkennt den Adreno-710-Knoten bei DPR 2", () => {
    const d = classifyDeviceClass(
      "ANGLE (Qualcomm, Adreno (TM) 710, OpenGL ES 3.2)", 2,
    );
    expect(d).not.toBeNull();
    expect(d!.node).toBe("adreno710-120hz");
    expect(d!.tierCap).toBe("medium");
    expect(d!.panelDeadlineMs).toBeCloseTo(8.33, 2);
    expect(d!.tierBudgetMs).toBeCloseTo(16.67, 2);
  });

  it("lehnt Desktop-/iGPU-/SwiftShader-Profile und DPR < 2 ab", () => {
    expect(classifyDeviceClass("ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)", 2)).toBeNull();
    expect(classifyDeviceClass("SwiftShader", 3)).toBeNull();
    expect(classifyDeviceClass("ANGLE (Qualcomm, Adreno (TM) 710, OpenGL ES 3.2)", 1)).toBeNull();
    expect(classifyDeviceClass(null, 2)).toBeNull();
    expect(classifyDeviceClass(undefined, 2)).toBeNull();
  });

  it("Probe ohne window ist passiv (null) und cachebar", () => {
    resetDeviceClassProbe();
    expect(probeDeviceClass()).toBeNull();
    expect(probeDeviceClass()).toBeNull();
  });
});

describe("Desktop-Pfad bitgleich (AE=0)", () => {
  it("pinnt die Referenzwerte des bisherigen Reglers (3-Arg-Aufruf)", () => {
    let s = initialQualityState();
    // Abstieg: 45 FPS unterschritten, 3 s kumulativ -> medium, Timer reset.
    for (let i = 0; i < 2; i++) s = stepQuality(s, 40, 1000);
    expect(s).toEqual({ tier: "high", belowMs: 2000, aboveMs: 0 });
    s = stepQuality(s, 40, 1000);
    expect(s).toEqual({ tier: "medium", belowMs: 0, aboveMs: 0 });
    // Totzone: 50 FPS friert beide Timer ein.
    s = stepQuality(s, 50, 5000);
    expect(s).toEqual({ tier: "medium", belowMs: 0, aboveMs: 0 });
    // Aufstieg: 60 FPS, 12 s am Stueck -> high.
    for (let i = 0; i < 12; i++) s = stepQuality(s, 60, 1000);
    expect(s).toEqual({ tier: "high", belowMs: 0, aboveMs: 0 });
  });

  it("explizites device=null ist identisch zum 3-Arg-Aufruf", () => {
    for (const fps of [30, 45.5, 50, 57, 60, 120]) {
      let a = initialQualityState();
      let b = initialQualityState();
      for (let i = 0; i < 40; i++) {
        a = stepQuality(a, fps, 16.67);
        b = stepQuality(b, fps, 16.67, null);
        expect(b).toEqual(a);
      }
    }
  });
});

describe("Geräteknoten: Stufen-Cap + Zeitbudget-Grenze (K2)", () => {
  it("klemmt den Startzustand high sofort auf medium", () => {
    const s = stepQuality(initialQualityState(), 112, 8.33, DEV);
    expect(s.tier).toBe("medium");
    expect(s.belowMs).toBe(0);
    // aboveMs darf im Cap-Fall weiterlaufen (blockiert eh: idx < capIdx false).
    expect(s.aboveMs).toBeCloseTo(8.33, 2);
  });

  it("blockiert den Aufstieg auf high dauerhaft (109–112 FPS)", () => {
    // states[0] = Startzustand "high" (vor dem ersten Schritt).
    const { states } = run(initialQualityState(), 110, 1000 / 110, 1200, DEV);
    expect(states.slice(1).every((s) => s.tier === "medium")).toBe(true);
  });

  it("steigt NICHT auf high, auch nicht nach 60 s bei 120 FPS", () => {
    const { states } = run(initialQualityState(), 120, 1000 / 120, 7400, DEV);
    expect(states.slice(1).every((s) => s.tier === "medium")).toBe(true);
  });

  it("faehrt ab, wenn das 16,7-ms-Zeitbudget gerissen wird (fpsEwma < ~59,9)", () => {
    // Frame-Zeit 20 ms = 50 FPS: nach QUALITY_LOW_MS (3 s) -> low.
    const { states } = run(initialQualityState(), 50, 20, 151, DEV);
    expect(states[150].tier).toBe("low");
    expect(states[149].tier).toBe("medium");
  });

  it("greift naeher an der Kante NICHT: 60 FPS (16,6 ms) bleibt in der Totzone", () => {
    const { states } = run(initialQualityState(), 60, 16.6, 400, DEV);
    expect(states.slice(1).every((s) => s.tier === "medium")).toBe(true);
    expect(states.slice(1).every((s) => s.belowMs === 0 && s.aboveMs === 0)).toBe(true);
  });
});
describe("Hysterese bei 120 Hz ohne Flapping (K3)", () => {
  /** Startzustand nach dem Cap (medium, Timer 0) — der anfaengliche
   *  high->medium-Klemmschritt zaehlt nicht als Wechsel. */
  const clamped = (): QualityState =>
    stepQuality(initialQualityState(), 110, 1000 / 110, DEV);

  it("60 s bei 109–112 FPS -> 0 Stufenwechsel", () => {
    let changes = 0;
    for (const fps of [109, 110, 111, 112]) {
      const r = run(clamped(), fps, 1000 / fps, Math.round(60 * fps), DEV);
      changes += r.changes;
      expect(r.states.every((s) => s.tier === "medium")).toBe(true);
    }
    expect(changes).toBe(0);
  });

  it("Last-Jitter um die Tier-Grenze (55–65 FPS) loest keine Kaskade aus", () => {
    let s = clamped();
    let changes = 0;
    // 90 s alternating 55/65 FPS (beide nahe der 59,9-Kante).
    for (let i = 0; i < 5400; i++) {
      const fps = i % 2 === 0 ? 55 : 65;
      const next = stepQuality(s, fps, 1000 / fps, DEV);
      if (next.tier !== s.tier) changes++;
      s = next;
    }
    expect(changes).toBeLessThanOrEqual(1);
  });

  it("Erholung von low braucht 12 s am Stueck ab 100 FPS (Muster Desktop)", () => {
    let s = initialQualityState();
    // Abstieg nach low: 20 ms Frames, 3 s.
    for (let i = 0; i < 150; i++) s = stepQuality(s, 50, 20, DEV);
    expect(s.tier).toBe("low");
    // 90 FPS (11 ms, unter recoverFps 100): kein Aufstieg, Timer eingefroren.
    for (let i = 0; i < 600; i++) s = stepQuality(s, 90, 1000 / 90, DEV);
    expect(s.tier).toBe("low");
    expect(s.aboveMs).toBe(0);
    // 110 FPS: nach QUALITY_HIGH_MS (12 s) zurueck auf medium (Cap blockt high).
    // 1400 Schritte: 12 s / (1000/110) = 1320 exakt — Puffer gegen FP-Runden.
    for (let i = 0; i < 1400; i++) s = stepQuality(s, 110, 1000 / 110, DEV);
    expect(s.tier).toBe("medium");
  });

  it("Haltezeiten bleiben die Desktop-Konstanten", () => {
    expect(QUALITY_LOW_MS).toBe(3000);
    expect(QUALITY_HIGH_MS).toBe(12000);
  });
});
