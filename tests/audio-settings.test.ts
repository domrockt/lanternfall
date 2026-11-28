// m10-audio-settings-guard K3: Guard-Tests fuer den Audio-Einstellungspfad
// (src/audio/settings.ts). Das Modul haelt seinen Cache auf Modul-Level und
// liest window.localStorage beim Import — jeder Test holt sich daher eine
// FRISCHE Modulinstanz (vi.resetModules + dynamischer Import) mit injiziertem
// Storage-Shim. Muster: Probe scripts/m10-audio-settings.mjs (K1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_OPTIONS, OPTIONS_KEY, type Options, type StorageLike } from "../src/audio/options";

interface Shim extends StorageLike {
  /** Rohzustand des "localStorage" als Key->JSON-String. */
  dump(): Record<string, string>;
  /** Storage direkt befuellen (Payload-Tests, auch korrupt). */
  seed(data: Record<string, string>): void;
}

function makeStorage(): Shim {
  let data: Record<string, string> = {};
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = value; },
    dump: () => ({ ...data }),
    seed: (next) => { data = { ...next }; },
  };
}

/** Frisches settings-Modul mit injiziertem Storage (echter Reload). */
async function freshSettings(storage: Shim) {
  vi.stubGlobal("window", { localStorage: storage });
  vi.resetModules();
  return import("../src/audio/settings");
}

/** Payload aus dem Shim-Shot lesen (wie loadOptions sie vorfaende). */
function storedPayload(storage: Shim): Partial<Options> {
  return JSON.parse(storage.dump()[OPTIONS_KEY]) as Partial<Options>;
}

let storage: Shim;

beforeEach(() => {
  storage = makeStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("audio/settings Defaults und Persistenz", () => {
  it("leerer Storage -> exakt DEFAULT_OPTIONS", async () => {
    const s = await freshSettings(storage);
    expect(s.getSettings()).toEqual(DEFAULT_OPTIONS);
    expect(s.getSettings().music).toBe(0.55);
    expect(s.getSettings().sfx).toBe(0.8);
    expect(s.getSettings().muted).toBe(false);
    expect(s.getSettings().scale).toBe(0);
  });

  it("changeSetting clamp't out-of-range Werte und feuert Listener", async () => {
    const s = await freshSettings(storage);
    const seen: Options[] = [];
    s.onSettingsChanged((o) => seen.push(o));
    expect(s.changeSetting("music", 1.7).music).toBe(1);
    expect(s.changeSetting("sfx", -3).sfx).toBe(0);
    expect(s.changeSetting("scale", 9).scale).toBe(6);
    expect(seen).toHaveLength(3);
    expect(seen[2].scale).toBe(6);
  });

  it("Persist-Roundtrip: gesetzte Werte ueberleben den Reload", async () => {
    const s1 = await freshSettings(storage);
    s1.changeSetting("music", 1.7); // -> 1 (geclamped)
    s1.changeSetting("muted", true);
    const payload = storedPayload(storage);
    expect(payload.music).toBe(1);
    expect(payload.muted).toBe(true);
    // Neuer "Seitenload": frisches Modul, gleicher Storage.
    const s2 = await freshSettings(storage);
    expect(s2.getSettings().music).toBe(1);
    expect(s2.getSettings().muted).toBe(true);
    // Unberuehrte Felder bleiben auf Default.
    expect(s2.getSettings().sfx).toBe(DEFAULT_OPTIONS.sfx);
  });

  it("korrupte Payload -> Defaults (kein Crash)", async () => {
    storage.seed({ [OPTIONS_KEY]: "kein JSON{{{" });
    const s = await freshSettings(storage);
    expect(s.getSettings()).toEqual(DEFAULT_OPTIONS);
  });

  it("out-of-range Payload -> geclamped, korrupte Typen -> Feld-Default", async () => {
    storage.seed({
      [OPTIONS_KEY]: JSON.stringify({
        music: 42, sfx: -5, scale: 99, muted: "yes", shake: 1,
      }),
    });
    const s = await freshSettings(storage);
    expect(s.getSettings().music).toBe(1);
    expect(s.getSettings().sfx).toBe(0);
    expect(s.getSettings().scale).toBe(6);
    expect(s.getSettings().muted).toBe(false); // Default, kein "yes"-Truthy
    expect(s.getSettings().shake).toBe(true);  // Default (Fehlfeld)
  });
});

describe("audio/settings setSettings-Normalisierung (K2-Regression)", () => {
  it("NaN/partial/falsch-typisierter Payload -> komplettes validiertes Objekt, Speicher == Storage", async () => {
    const s = await freshSettings(storage);
    const bad = { music: Number.NaN, sfx: 2, muted: "yes" } as unknown as Options;
    const next = s.setSettings(bad);
    expect(next.music).toBe(DEFAULT_OPTIONS.music); // NaN -> Feld-Default
    expect(next.sfx).toBe(1);                       // out-of-range -> clamp
    expect(next.muted).toBe(false);                 // kein Boolean -> Default
    expect(next.shake).toBe(DEFAULT_OPTIONS.shake); // partial -> Default
    expect(next.damageNumbers).toBe(DEFAULT_OPTIONS.damageNumbers);
    // Memory- und Persistenzstand identisch (keine Divergenz mehr).
    expect(storedPayload(storage)).toEqual(next);
  });

  it("Junk-Schluessel via changeSetting wird verworfen", async () => {
    const s = await freshSettings(storage);
    const before = s.getSettings();
    const after = s.changeSetting("mute" as keyof Options, 1);
    expect(after).toEqual(before);
    expect("mute" in s.getSettings()).toBe(false);
  });
});

describe("audio/settings Master-Mute (A7-Vertrag, bitgleich)", () => {
  it("muted bleibt exakt true/false und wird so persistiert", async () => {
    const s = await freshSettings(storage);
    const on = s.changeSetting("muted", true);
    expect(on.muted).toBe(true);
    expect(typeof on.muted).toBe("boolean");
    expect(storedPayload(storage).muted).toBe(true);
    // Konsumpfad wie initAudio: getSettings().muted ist der Wahrheitswert.
    expect(s.getSettings().muted).toBe(true);
    const off = s.resetSettings();
    expect(off.muted).toBe(false);
    expect(off).toEqual(DEFAULT_OPTIONS);
  });
});
