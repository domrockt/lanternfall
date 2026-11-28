// M10-panel-hz-device-check K1: Datenvertrag JS-Seite des Dom-Folgepunkts
// 17:45Z ("Tablet-Tor bestanden") — die Menü-Option BILDRATE:MAX muss die
// Panel-Hz-Präferenz (lfhz) setzen, BILDRATE:60 sie auf Standard zurücksetzen.
// Diese Datei friert den Vertrag ein, den die APK-Bridge (MainActivity liest
// lfhz beim Start, Seite Vera) später lesen muss. Nur Messung/Vertrag: KEINE
// Änderung an src/** (panel-hz.ts/options.ts sind gemergt, fremd).
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS,
  OPTIONS_KEY,
  OPTION_ROWS,
  loadOptions,
  optionValueLabel,
  saveOptions,
  setOption,
} from "../src/audio/options";
import { FPS_AUTO, FPS_60, FPS_MAX } from "../src/logic/fps-cap";
import {
  PANEL_HZ_KEY,
  PANEL_HZ_VALUE_MAX,
  readPanelHzPref,
  setPanelHzStorage,
} from "../src/logic/panel-hz";

interface FakeStorage {
  map: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function fakeStorage(): FakeStorage {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

let store: FakeStorage;

beforeEach(() => {
  store = fakeStorage();
  setPanelHzStorage(store);
});

describe("M10-panel-hz-device-check K1: BILDRATE <-> Panel-Hz-Präferenz", () => {
  it("BILDRATE: MAX schreibt die Panel-Hz-Präferenz lfhz_panel=max", () => {
    const next = setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_MAX);
    expect(next.fps).toBe(FPS_MAX);
    expect(store.getItem(PANEL_HZ_KEY)).toBe(PANEL_HZ_VALUE_MAX);
    expect(readPanelHzPref()).toBe("max");
  });

  it("BILDRATE: 60 setzt die Präferenz auf Standard zurück (Key gelöscht)", () => {
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_MAX);
    expect(store.getItem(PANEL_HZ_KEY)).toBe(PANEL_HZ_VALUE_MAX);
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_60);
    expect(store.getItem(PANEL_HZ_KEY)).toBeNull();
    expect(readPanelHzPref()).toBe("locked60");
  });

  it("BILDRATE: AUTO setzt die Präferenz ebenfalls auf Standard zurück", () => {
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_MAX);
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_AUTO);
    expect(store.getItem(PANEL_HZ_KEY)).toBeNull();
    expect(readPanelHzPref()).toBe("locked60");
  });

  it("Präferenz-Vertrag: exakter Key 'lfhz_panel' mit Wert 'max' (APK-Lesung)", () => {
    // Bewusst harte Strings: die APK-/Bridge-Seite (Vera) bindet an diese Werte.
    expect(PANEL_HZ_KEY).toBe("lfhz_panel");
    expect(PANEL_HZ_VALUE_MAX).toBe("max");
  });

  it("Storage ohne removeItem fällt auf 'locked60'-Schreiben zurück (Kontakt weiter lesbar)", () => {
    const minimal: FakeStorage = {
      map: new Map(),
      getItem: (k) => (minimal.map.has(k) ? minimal.map.get(k)! : null),
      setItem: (k, v) => void minimal.map.set(k, v),
    };
    setPanelHzStorage(minimal);
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_MAX);
    expect(minimal.getItem(PANEL_HZ_KEY)).toBe("max");
    setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_60);
    // removeItem fehlt -> expliziter locked60-Wert statt gelöschtem Key.
    expect(minimal.getItem(PANEL_HZ_KEY)).toBe("locked60");
  });

  it("BILDRATE ohne Storage schreibt keine Präferenz (No-op, Spiel läuft weiter)", () => {
    setPanelHzStorage(null);
    expect(() => setOption({ ...DEFAULT_OPTIONS }, "fps", FPS_MAX)).not.toThrow();
    expect(readPanelHzPref()).toBeNull();
  });
});

describe("M10-panel-hz-device-check K1: Options-Contract unverändert", () => {
  it("Persistenz: alle BILDRATE-Stufen überleben saveOptions/loadOptions", () => {
    for (const fps of [FPS_AUTO, FPS_60, FPS_MAX]) {
      const opts = { ...DEFAULT_OPTIONS, fps };
      saveOptions(store, opts);
      expect(loadOptions(store).fps).toBe(fps);
    }
  });

  it("Persistenz-Expecteds: Options-JSON hält genau die 7 bekannten Felder", () => {
    saveOptions(store, { ...DEFAULT_OPTIONS, fps: FPS_60, scale: 2, music: 0.1, sfx: 0.2, shake: false, damageNumbers: false, muted: true });
    const raw = JSON.parse(store.getItem(OPTIONS_KEY)!) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(
      ["damageNumbers", "fps", "muted", "music", "sfx", "scale", "shake"].sort(),
    );
  });

  it("Default bleibt AUTO (Geräteknoten entscheidet 60/MAX — kein versteckter Lock)", () => {
    expect(DEFAULT_OPTIONS.fps).toBe(FPS_AUTO);
    expect(loadOptions(store).fps).toBe(FPS_AUTO);
  });

  it("OPTION_ROWS unverändert: 8 Zeilen, BILDRATE an Index 6, ZURÜCK an 7", () => {
    expect(OPTION_ROWS).toHaveLength(8);
    expect(OPTION_ROWS[6]).toBe("BILDRATE");
    expect(OPTION_ROWS[7]).toBe("ZURÜCK");
  });

  it("BILDRATE-Label: MAX zeigt MAX, 60 zeigt 60 (Anzeige-Lüge-frei)", () => {
    const max = { ...DEFAULT_OPTIONS, fps: FPS_MAX };
    const sixty = { ...DEFAULT_OPTIONS, fps: FPS_60 };
    expect(optionValueLabel(max, 6)).toBe("MAX");
    expect(optionValueLabel(sixty, 6)).toBe("60");
  });
});
