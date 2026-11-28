/**
 * M10-thermal-wiring K3: Verdrahtung des thermischen Guards (config.ts ↔
 * logic/quality). Pinnt Konfig-Konsistenz (Monotonie, Grenzen), die reinen
 * Verdrahtungs-Helfer (pushFpsSample, effectiveQuality) und die Import-Route
 * (eine einzige evaluateThermalStep-Stelle in config.ts, KEINE Duplikate der
 * THERMAL-Konstanten — die Werte liegen ausschließlich in src/logic/quality.ts).
 */
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  QUALITY_BUDGETS,
  QUALITY_LOW_FPS,
  THERMAL_BUDGET,
  THERMAL_FPS,
  THERMAL_HOLD_MS,
  THERMAL_RECOVERY_FPS,
  THERMAL_RECOVERY_MS,
  THERMAL_WINDOW_MS,
  evaluateThermalStep,
  initialThermalState,
  qualityBudgetFor,
  type ThermalState,
} from "../src/logic/quality";
import { effectiveQuality, pushFpsSample, type FpsSampleState } from "../src/config";

const WINDOW_SAMPLES = Math.round(THERMAL_WINDOW_MS / 1000); // 8 @ 1 Hz

const configSrc = (): string => readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");

describe("K3a: Konfig-Konsistenz — Monotonie und Grenzen (Werte aus src/logic/quality.ts)", () => {
  it("Absturz-Schwelle liegt strikt unter der low-Stufen-Schwelle (thermal ist die letzte Stufe)", () => {
    expect(THERMAL_FPS).toBeLessThan(QUALITY_LOW_FPS);
    expect(THERMAL_RECOVERY_FPS).toBe(QUALITY_LOW_FPS); // Rueckweg endet auf "low", nicht hoeher
  });

  it("Zeitfenster sind monoton: Median-Fenster < Haltefenster < Erholungszeit", () => {
    expect(THERMAL_WINDOW_MS).toBeLessThan(THERMAL_HOLD_MS);
    expect(THERMAL_HOLD_MS).toBeLessThan(THERMAL_RECOVERY_MS);
  });

  it("Das Median-Fenster ergibt ganze 1-Hz-Samples (Aufrufer-Kontrakt, hier config.ts)", () => {
    expect(WINDOW_SAMPLES).toBeGreaterThanOrEqual(2);
    expect(Math.abs(THERMAL_WINDOW_MS / 1000 - WINDOW_SAMPLES)).toBeLessThan(1e-9);
  });

  it("THERMAL_BUDGET liegt in JEDER Komponente strikt unter dem low-Budget, Glow aus", () => {
    const low = QUALITY_BUDGETS.low;
    expect(THERMAL_BUDGET.maxFxSprites).toBeLessThan(low.maxFxSprites);
    expect(THERMAL_BUDGET.maxAddArea).toBeLessThan(low.maxAddArea);
    expect(THERMAL_BUDGET.particlesPerHit).toBeLessThan(low.particlesPerHit);
    expect(THERMAL_BUDGET.damageNumbersPerSec).toBeLessThan(low.damageNumbersPerSec);
    expect(THERMAL_BUDGET.maxDamageLabels).toBeLessThan(low.maxDamageLabels);
    expect(low.glow).toBe(false); // Glow ist schon auf low aus …
    expect(THERMAL_BUDGET.glow).toBe(false); // … und bleibt auf thermal aus
  });

  it("qualityBudgetFor loest 'thermal' auf das Thermal-Budget auf (Wirkweg der Verdrahtung)", () => {
    expect(qualityBudgetFor("thermal")).toBe(THERMAL_BUDGET);
  });
});

describe("K3b: pushFpsSample — 1-Hz-Ringfenster (Aufrufer-Seite des Guards)", () => {
  it("samplet 1 Hz und kappat das Fenster auf round(THERMAL_WINDOW_MS/1000) Samples", () => {
    let s: FpsSampleState = { serie: [], acc: 0 };
    for (let i = 0; i < WINDOW_SAMPLES + 4; i++) {
      s = pushFpsSample(s.serie, s.acc, 1000, 55);
    }
    expect(s.serie.length).toBe(WINDOW_SAMPLES);
    expect(s.serie.every((f) => f === 55)).toBe(true);
  });

  it("fuerht Teilsekunden zusammen: 61 Frames à ~16,7 ms ergeben genau ein Sample", () => {
    let s: FpsSampleState = { serie: [], acc: 0 };
    for (let i = 0; i < 61; i++) s = pushFpsSample(s.serie, s.acc, 1000 / 60, 42);
    expect(s.serie).toEqual([42]);
    expect(s.acc).toBeLessThan(1000);
  });

  it("kein Sample ohne gueltiges dt; ein Riesen-Delta ergibt genau EIN Sample", () => {
    expect(pushFpsSample([50], 0, 0, 55)).toEqual({ serie: [50], acc: 0 });
    expect(pushFpsSample([50], 0, NaN, 55)).toEqual({ serie: [50], acc: 0 });
    const huge = pushFpsSample([], 0, 5000, 55);
    expect(huge.serie).toEqual([55]);
    expect(huge.acc).toBe(0); // sauber neu beginnen
  });

  it("ungueltige FPS-Werte landen als 0 in der Serie (medianOf behandelt das als kein Signal)", () => {
    const s = pushFpsSample([], 0, 1000, NaN);
    expect(s.serie).toEqual([0]);
    const state = evaluateThermalStep(s.serie, { ...initialThermalState(), tier: "low" }, 1000);
    expect(state.active).toBe(false); // kein Signal: Timer eingefroren
  });
});

describe("K3c: effectiveQuality + Verdrahtung mit evaluateThermalStep", () => {
  const crashFrames = (frames: number, fps = THERMAL_FPS - 4): ThermalState => {
    let s: ThermalState = { ...initialThermalState(), tier: "low" };
    const serie = Array.from({ length: WINDOW_SAMPLES }, () => fps);
    for (let i = 0; i < frames; i++) s = evaluateThermalStep(serie, s, 1000);
    return s;
  };

  it("inaktiv → Basis-Stufe, aktiv → 'thermal' (QUALITY-Übersteuerung im tick())", () => {
    expect(effectiveQuality("medium", initialThermalState())).toBe("medium");
    expect(effectiveQuality("low", crashFrames(THERMAL_HOLD_MS / 1000))).toBe("thermal");
  });

  it("engage nur ab Basis-Stufe 'low' — der tick()-Pfad mit tier aus stepQuality", () => {
    const serie = Array.from({ length: WINDOW_SAMPLES }, () => THERMAL_FPS - 10);
    let s: ThermalState = { ...initialThermalState(), tier: "medium" };
    for (let ms = 0; ms < THERMAL_HOLD_MS * 2; ms += 1000) {
      s = evaluateThermalStep(serie, { ...s, tier: "medium" }, 1000);
    }
    expect(s.active).toBe(false);
    expect(effectiveQuality("medium", s)).toBe("medium");
  });

  it("voller Zyklus wie im tick(): engage nach Haltefenster, Rueckkehr auf 'low' nach Erholung", () => {
    // engage: 8 Samples Crash-Serie + THERMAL_HOLD_MS anhalten
    let s = crashFrames(THERMAL_HOLD_MS / 1000);
    expect(effectiveQuality("low", s)).toBe("thermal");
    // Rueckweg: Erholung AM STUECK ab THERMAL_RECOVERY_FPS
    const stable = Array.from({ length: WINDOW_SAMPLES }, () => 55);
    for (let ms = 0; ms < THERMAL_RECOVERY_MS; ms += 1000) {
      s = evaluateThermalStep(stable, s, 1000);
    }
    expect(s.active).toBe(false);
    expect(effectiveQuality("low", s)).toBe("low");
  });
});

describe("K3d: Verdrahtungs-Pin — config.ts importiert, ruft 1x, dupliziert nichts", () => {
  const src = configSrc();

  it("Import-Route: evaluateThermalStep kommt aus './logic/quality' (eine Quelle, keine Kopie)", () => {
    expect(src).toMatch(/from "\.\/logic\/quality"/);
    expect(src).not.toMatch(/export const THERMAL_/); // keine THERMAL-Konstanten-Duplikate
    expect(src).not.toMatch(/function evaluateThermalStep/);
  });

  it("genau EIN evaluateThermalStep-Aufruf im tick() (Import + Aufruf, kein zweiter Hebel)", () => {
    const occurrences = src.split("evaluateThermalStep").length - 1;
    expect(occurrences).toBe(2); // 1x Import, 1x Aufruf
    expect(src).toMatch(/evaluateThermalStep\(fpsSerie, \{ \.\.\.thermalState, tier: qState\.tier \}, dt\)/);
  });

  it("QUALITY wird über effectiveQuality gesetzt (Engage → 'thermal'), nicht mehr direkt", () => {
    // M10-device-janky-node: Basis-Stufe kann am Geraeteknoten auf
    // DEVICE_TIER_CAP geklemmt sein (baseTier); der Writer bleibt effectiveQuality.
    const tierArg = src.includes("baseTier") ? "baseTier" : "qState.tier";
    expect(src).toMatch(new RegExp(`QUALITY = effectiveQuality\\(${tierArg}, thermalState\\)`));
    expect(src).not.toMatch(/QUALITY = qState\.tier;/);
  });

  it("Telemetrie: __rbDbg fuehrt thermalState", () => {
    expect(src).toMatch(/d2\.thermalState = thermalState/);
  });
});
