/**
 * M10-panel-hz-pref (#13768): Panel-Hz-Präferenz-Flag für die APK-Bridge.
 * Prüft, dass BILDRATE=MAX die "hz=max"-Präferenz schreibt und 60/AUTO sie
 * zurücksetzt — ohne dass die Options-Persistenz (meta-persist) sich ändert.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  loadOptions,
  saveOptions,
  setOption,
  stepOption,
  OPTIONS_KEY,
} from "../src/audio/options";
import { FPS_AUTO, FPS_MAX } from "../src/logic/fps-cap";
import {
  PANEL_HZ_KEY,
  PANEL_HZ_VALUE_MAX,
  readPanelHzPref,
  setPanelHzStorage,
  setPanelHzPref,
} from "../src/logic/panel-hz";

/** Multi-Key-StorageLike-Stub (in-memory, wie in meta-persist.test.ts). */
function memStorage(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("Panel-Hz-Präferenz (M10-panel-hz-pref)", () => {
  it("setOption(fps=0/MAX) schreibt die max-Präferenz (APK-Lock aufheben)", () => {
    const s = memStorage();
    setPanelHzStorage(s);
    setOption(DEFAULT_OPTIONS, "fps", FPS_MAX);
    expect(s.getItem(PANEL_HZ_KEY)).toBe(PANEL_HZ_VALUE_MAX);
    expect(readPanelHzPref(s)).toBe("max");
  });

  it("setOption(fps=60) und AUTO löschen die Präferenz (Default gelockt)", () => {
    const s = memStorage();
    setPanelHzStorage(s);
    setOption(DEFAULT_OPTIONS, "fps", FPS_MAX);
    expect(s.getItem(PANEL_HZ_KEY)).toBe(PANEL_HZ_VALUE_MAX);
    setOption(DEFAULT_OPTIONS, "fps", 60);
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
    // erneut MAX, dann zurück auf AUTO
    setOption(DEFAULT_OPTIONS, "fps", FPS_MAX);
    setOption(DEFAULT_OPTIONS, "fps", FPS_AUTO);
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
    expect(readPanelHzPref(s)).toBe("locked60");
  });

  it("kein NaN: ungültige fps-Werte clampen auf AUTO → locked60, Storage bleibt sauber", () => {
    const s = memStorage();
    setPanelHzStorage(s);
    const next = setOption(DEFAULT_OPTIONS, "fps", Number.NaN);
    expect(next.fps).toBe(FPS_AUTO);
    expect(next.fps).not.toBeNaN();
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
    expect(JSON.stringify(s.dump())).not.toContain("NaN");
  });

  it("stepOption-Zyklus (BILDRATE-Zeile) schreibt die Präferenz mit", () => {
    const s = memStorage();
    setPanelHzStorage(s);
    // AUTO → 60 → MAX
    let o = stepOption(DEFAULT_OPTIONS, 6, 1);
    expect(o.fps).toBe(60);
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
    o = stepOption(o, 6, 1);
    expect(o.fps).toBe(FPS_MAX);
    expect(s.getItem(PANEL_HZ_KEY)).toBe(PANEL_HZ_VALUE_MAX);
    // zurück auf 60 → wieder gelockt
    o = stepOption(o, 6, -1);
    expect(o.fps).toBe(60);
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
  });

  it("setPanelHzPref direkt: 'max' setzt, 'locked60' löscht (removeItem-Fallback: schreibt locked60)", () => {
    const noRemove = memStorage(); // hat kein removeItem → Fallback-Pfad
    setPanelHzStorage(noRemove);
    setPanelHzPref("max");
    expect(readPanelHzPref(noRemove)).toBe("max");
    setPanelHzPref("locked60"); // kein removeItem → schreibt explizit "locked60"
    expect(readPanelHzPref(noRemove)).toBe("locked60");
  });

  it("Ohne Storage (Node-Default) wirft nichts und ändert nichts", () => {
    setPanelHzStorage(null);
    expect(() => setOption(DEFAULT_OPTIONS, "fps", FPS_MAX)).not.toThrow();
    expect(() => setPanelHzPref("max")).not.toThrow();
    expect(readPanelHzPref(null)).toBeNull();
  });

  it("Persistenz-Expecteds unangetastet: saveOptions/loadOptions speichern lfhz_panel NICHT und triggern den Hook nicht", () => {
    const s = memStorage();
    setPanelHzStorage(s);
    const loaded = loadOptions(s);
    expect(loaded.fps).toBe(DEFAULT_OPTIONS.fps);
    saveOptions(s, { ...loaded, fps: FPS_MAX });
    // Options-Key enthält fps=0 wie gehabt — ohne Panel-Hz-Zusatzfeld
    const saved = JSON.parse(s.getItem(OPTIONS_KEY) as string) as { fps?: number };
    expect(saved.fps).toBe(FPS_MAX);
    expect(Object.keys(saved).sort()).toEqual(
      ["damageNumbers", "fps", "muted", "music", "sfx", "scale", "shake"].sort(),
    );
    // loadOptions hat die Panel-Präferenz NICHT angefasst (Hook nur in setOption)
    expect(s.getItem(PANEL_HZ_KEY)).toBeNull();
  });
});
