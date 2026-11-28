// M10-mobile-fps-cap: Guard-Tests für Bildraten-Regel (Frame-Cap) und
// BILDRATE-Menü-Option. Pinnt bewusst die DESKTOP-Werte (Disponent-Briefing:
// "Desktop/iGPU-Profile bleiben UNVERÄNDERT bitgleich") und den Mobile-Standard.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS, OPTION_ROWS, loadOptions, optionValueLabel,
  saveOptions, setOption, stepOption, type StorageLike,
} from "../src/audio/options";
import {
  FPS_60, FPS_AUTO, FPS_MAX, applyFpsLimit, clampFpsSetting,
  fpsSettingLabel, isDeviceNodeRenderer, probeDeviceNode, resolveFpsLimit, stepFpsSetting,
} from "../src/logic/fps-cap";

const memStorage = (initial?: string): StorageLike & { data: string | null } => {
  const box = { data: initial ?? null };
  return {
    data: box.data,
    getItem: () => box.data,
    setItem: (_k: string, v: string) => { box.data = v; },
  };
};

describe("M10-mobile-fps-cap: Frame-Cap-Regel (rein)", () => {
  it("Desktop-Standard (AUTO) löst auf MAX — bitgleich zu 60-Hz-vsync-Profilen", () => {
    expect(resolveFpsLimit(FPS_AUTO, false)).toBeNull();
  });
  it("Geräteknoten-Standard (AUTO) löst auf 60", () => {
    expect(resolveFpsLimit(FPS_AUTO, true)).toBe(60);
  });
  it("explizite Werte überschreiben den Gerätestandard auf BEIDEN Plattformen", () => {
    expect(resolveFpsLimit(FPS_60, false)).toBe(60);
    expect(resolveFpsLimit(FPS_60, true)).toBe(60);
    expect(resolveFpsLimit(FPS_MAX, false)).toBeNull();
    expect(resolveFpsLimit(FPS_MAX, true)).toBeNull();
  });
  it("clampFpsSetting: nur -1/0/60 gültig, alles Fremde fällt auf AUTO", () => {
    expect(clampFpsSetting(60)).toBe(60);
    expect(clampFpsSetting(0)).toBe(0);
    expect(clampFpsSetting(-1)).toBe(-1);
    expect(clampFpsSetting(120)).toBe(FPS_AUTO);
    expect(clampFpsSetting(Number.NaN)).toBe(FPS_AUTO);
    expect(clampFpsSetting("60")).toBe(FPS_AUTO);
    expect(clampFpsSetting(undefined)).toBe(FPS_AUTO);
  });
  it("Menü-Zyklus AUTO -> 60 -> MAX -> AUTO (beide Richtungen)", () => {
    expect(stepFpsSetting(FPS_AUTO, 1)).toBe(60);
    expect(stepFpsSetting(FPS_60, 1)).toBe(0);
    expect(stepFpsSetting(FPS_MAX, 1)).toBe(FPS_AUTO);
    expect(stepFpsSetting(FPS_AUTO, -1)).toBe(0);
    expect(stepFpsSetting(FPS_MAX, -1)).toBe(60);
  });
  it("Label zeigt den AUFGELOESTEN Wert (Briefing: 'Bildrate: 60 / max')", () => {
    expect(fpsSettingLabel(FPS_AUTO, true)).toBe("60");
    expect(fpsSettingLabel(FPS_AUTO, false)).toBe("MAX");
    expect(fpsSettingLabel(FPS_60, false)).toBe("60");
    expect(fpsSettingLabel(FPS_MAX, true)).toBe("MAX");
  });
});

describe("M10-mobile-fps-cap: Geräteknoten-Erkennung (rein + passiv)", () => {
  it("isDeviceNodeRenderer: nur Adreno 710 + dpr>=2 ist Geraet (kein SwiftShader-Fehlgriff)", () => {
    expect(isDeviceNodeRenderer("Adreno (TM) 710", 2)).toBe(true);
    expect(isDeviceNodeRenderer("Adreno (TM) 710", 1)).toBe(false);
    expect(isDeviceNodeRenderer("SwiftShader", 2)).toBe(false);
    expect(isDeviceNodeRenderer("Mesa Intel(R) Graphics (RPL-S)", 2)).toBe(false);
    expect(isDeviceNodeRenderer(null, 2)).toBe(false);
    expect(isDeviceNodeRenderer(undefined, 3)).toBe(false);
  });
  it("probeDeviceNode in Node passiv (kein document) -> Desktop-Pfad", () => {
    expect(probeDeviceNode()).toBe(false);
  });
});

describe("M10-mobile-fps-cap: BILDRATE-Zeile im Optionsmenü", () => {
  it("neue Zeile vor ZURÜCK, DEFAULT ist AUTO", () => {
    expect(OPTION_ROWS).toHaveLength(8);
    expect(OPTION_ROWS[6]).toBe("BILDRATE");
    expect(OPTION_ROWS[7]).toBe("ZURÜCK");
    expect(DEFAULT_OPTIONS.fps).toBe(FPS_AUTO);
  });
  it("stepOption Zeile 6 zyklisiert das fps-Feld; setOption clampt", () => {
    expect(stepOption(DEFAULT_OPTIONS, 6, 1).fps).toBe(60);
    expect(stepOption({ ...DEFAULT_OPTIONS, fps: 60 }, 6, 1).fps).toBe(0);
    expect(stepOption({ ...DEFAULT_OPTIONS, fps: 0 }, 6, -1).fps).toBe(60);
    expect(setOption(DEFAULT_OPTIONS, "fps", 120).fps).toBe(FPS_AUTO);
  });
  it("optionValueLabel Zeile 6: Node-Probe = Desktop -> AUTO zeigt MAX", () => {
    expect(optionValueLabel(DEFAULT_OPTIONS, 6)).toBe("MAX");
    expect(optionValueLabel({ ...DEFAULT_OPTIONS, fps: 60 }, 6)).toBe("60");
    expect(optionValueLabel({ ...DEFAULT_OPTIONS, fps: 0 }, 6)).toBe("MAX");
  });
  it("Persistenz: fps läuft über save/load rund und validiert", () => {
    const s = memStorage();
    saveOptions(s, { ...DEFAULT_OPTIONS, fps: 60 });
    expect(loadOptions(s).fps).toBe(60);
    saveOptions(s, { ...DEFAULT_OPTIONS, fps: 120 as unknown as number });
    expect(loadOptions(s).fps).toBe(FPS_AUTO);
    saveOptions(s, { ...DEFAULT_OPTIONS });
    expect(loadOptions(s).fps).toBe(FPS_AUTO);
  });
});

describe("M10-mobile-fps-cap: applyFpsLimit (Phaser-TimeStep-Laufzeitwechsel)", () => {
  it("60 aktiviert Limiter + _limitRate; MAX deaktiviert und verwirft delta-Rest", () => {
    const loop: { fpsLimit: number; hasFpsLimit: boolean; _limitRate?: number; delta?: number } = {
      fpsLimit: 0, hasFpsLimit: false, delta: 12.5,
    };
    applyFpsLimit(loop, 60);
    expect(loop.fpsLimit).toBe(60);
    expect(loop.hasFpsLimit).toBe(true);
    expect(loop._limitRate).toBeCloseTo(1000 / 60);
    applyFpsLimit(loop, null);
    expect(loop.fpsLimit).toBe(0);
    expect(loop.hasFpsLimit).toBe(false);
    expect(loop._limitRate).toBe(0);
    expect(loop.delta).toBe(0);
  });
});
