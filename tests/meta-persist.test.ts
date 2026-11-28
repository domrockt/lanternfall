import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS, OPTION_ROWS, OPTIONS_KEY, SCALE_MAX,
  clampScale, clampVolume, loadOptions, saveOptions, setOption, stepOption,
  type StorageLike,
} from "../src/audio/options";
import {
  META_KEY, emptyBest, emptyMeta, loadMeta, recordRun, saveMeta,
  type RunSummaryInput,
} from "../src/logic/meta";

/** Multi-Key-StorageLike-Stub (wie window.localStorage, aber in-memory). */
function memStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => { map.set(k, String(v)); },
  };
}

function storeWith(key: string, value: string): StorageLike {
  const s = memStorage();
  s.setItem(key, value);
  return s;
}

function run(over: Partial<RunSummaryInput>): RunSummaryInput {
  return { character: "mira", time: 10, kills: 5, level: 2, victory: false, ...over };
}

describe("M10 Persistenz: recordRun-Monotonie und NaN-Guards", () => {
  it("Bestwerte sind monoton: schlechtere Läufe ersetzen nichts", () => {
    let meta = emptyMeta();
    meta = recordRun(meta, run({ time: 120, kills: 40, level: 6 })).meta;
    const res = recordRun(meta, run({ time: 60, kills: 20, level: 3 }));
    expect(res.records).toEqual({ time: false, kills: false, level: false, victory: false });
    expect(res.meta.mira).toEqual({ time: 120, kills: 40, level: 6, victories: 0, runs: 2 });
  });

  it("NaN/undefined-Eingaben erzeugen keine NaN/undefined in BestStats", () => {
    let meta = recordRun(emptyMeta(), run({ time: 100, kills: 30, level: 5 })).meta;
    meta = recordRun(meta, run({
      time: Number.NaN, kills: Number.NaN, level: undefined as unknown as number, victory: true,
    })).meta;
    for (const b of [meta.mira, meta.kael]) {
      for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(meta.mira).toEqual({ time: 100, kills: 30, level: 5, victories: 1, runs: 2 });
  });

  it("korrupter In-Memory-Stand (NaN in BestStats) vergiftet neue Läufe nicht", () => {
    const dirty = emptyMeta();
    dirty.mira.time = Number.NaN;
    dirty.mira.kills = undefined as unknown as number;
    const res = recordRun(dirty, run({ time: 50, kills: 10, level: 3 }));
    expect(Number.isFinite(res.meta.mira.time)).toBe(true);
    expect(res.meta.mira.time).toBe(50);
    expect(res.meta.mira.kills).toBe(10);
  });

  it("unbekannte Charakter-IDs erzeugen keinen Streu-Eintrag", () => {
    const res = recordRun(emptyMeta(), run({
      character: "gustav" as unknown as "mira", time: 99, kills: 9, level: 9,
    }));
    expect(Object.keys(res.meta).sort()).toEqual(["kael", "mira"]);
    expect(res.meta.mira.runs).toBe(0);
    expect(res.records.time).toBe(false);
  });

  it("loadMeta fällt bei korrupter Payload auf emptyMeta zurück statt zu werfen", () => {
    expect(loadMeta(storeWith(META_KEY, "{nicht json!!!"))).toEqual(emptyMeta());
    expect(loadMeta(storeWith(META_KEY, "42"))).toEqual(emptyMeta());
  });

  it("loadMeta sanitisiert teilweise korrupte Payload pro Charakter", () => {
    const meta = loadMeta(storeWith(META_KEY, JSON.stringify({
      mira: { time: 33, kills: 7, level: 2, victories: 1, runs: 3 },
      kael: { time: Number.NaN, kills: "x", level: -5, victories: null, runs: undefined },
    })));
    expect(meta.mira).toEqual({ time: 33, kills: 7, level: 2, victories: 1, runs: 3 });
    expect(meta.kael).toEqual(emptyBest());
  });

  it("saveMeta -> loadMeta ist verlustfrei (Roundtrip) und null-Storage wirft nicht", () => {
    let meta = recordRun(emptyMeta(), run({ time: 90.5, kills: 33, level: 7, victory: true })).meta;
    meta = recordRun(meta, run({ character: "kael", time: 15, kills: 4, level: 1 })).meta;
    const s = memStorage();
    saveMeta(s, meta);
    expect(loadMeta(s)).toEqual(meta);
    expect(() => saveMeta(null, meta)).not.toThrow();
    expect(loadMeta(null)).toEqual(emptyMeta());
  });
});

describe("M10 Persistenz: Options-Clamp, Reload-Zyklen, korrupte Payload", () => {
  it("alle 8 OPTION_ROWS existieren und clampVolume/clampScale halten die Grenzen", () => {
    expect(OPTION_ROWS).toHaveLength(8);
    expect(clampVolume(-0.5)).toBe(0);
    expect(clampVolume(1.7)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(clampScale(-3)).toBe(0);
    expect(clampScale(SCALE_MAX + 2)).toBe(SCALE_MAX);
    expect(clampScale(3.7)).toBe(4);
    expect(clampScale(Number.NaN)).toBe(0);
  });

  it("stepOption/setOption clamplen in allen Zeilen (kein Wert verlässt 0..1 bzw. 0..SCALE_MAX)", () => {
    let o = { ...DEFAULT_OPTIONS, music: 0.95, sfx: 0.05 };
    for (let i = 0; i < 5; i++) o = stepOption(o, 0, 1);
    expect(o.music).toBe(1);
    for (let i = 0; i < 5; i++) o = stepOption(o, 1, -1);
    expect(o.sfx).toBe(0);
    expect(setOption(o, "scale", 99).scale).toBe(SCALE_MAX);
    expect(setOption(o, "scale", -1).scale).toBe(0);
    expect(setOption(o, "scale", Number.NaN).scale).toBe(0);
    expect(setOption(o, "music", Number.NaN).music).toBe(0);
    // Skalen-Zyklus bleibt in [0, SCALE_MAX] (Zykluslänge 6, 12 Schritte = rundum):
    let scale = DEFAULT_OPTIONS.scale;
    for (let i = 0; i < 12; i++) scale = stepOption({ ...o, scale }, 5, 1).scale;
    expect(scale).toBe(0);
    for (let i = 0; i < 12; i++) scale = stepOption({ ...o, scale }, 5, -1).scale;
    expect(scale).toBe(0);
  });

  it("saveOptions -> loadOptions über 3 Reload-Zyklen identisch (alle 7 Zeilen)", () => {
    const s = memStorage();
    let options = { ...DEFAULT_OPTIONS, music: 0.3, sfx: 0.45, shake: false, damageNumbers: false, muted: true, scale: 4 };
    for (let c = 0; c < 3; c++) {
      saveOptions(s, options);
      const loaded = loadOptions(s);
      expect(loaded).toEqual(options);
      options = loaded;
    }
    expect(JSON.parse(s.getItem(OPTIONS_KEY)!)).toMatchObject({ muted: true, scale: 4 });
  });

  it("korrupte/teilweise Options-Payload fällt feldweise auf Defaults zurück", () => {
    expect(loadOptions(storeWith(OPTIONS_KEY, "{kaputt"))).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(storeWith(OPTIONS_KEY, "null"))).toEqual(DEFAULT_OPTIONS);
    const partial = loadOptions(storeWith(OPTIONS_KEY, JSON.stringify({
      music: "x", sfx: null, scale: 99, shake: "ja", muted: 1,
    })));
    expect(partial.music).toBe(DEFAULT_OPTIONS.music);
    expect(partial.sfx).toBe(DEFAULT_OPTIONS.sfx);
    expect(partial.scale).toBe(SCALE_MAX);
    expect(partial.shake).toBe(DEFAULT_OPTIONS.shake);
    expect(partial.muted).toBe(DEFAULT_OPTIONS.muted);
    expect(partial.damageNumbers).toBe(DEFAULT_OPTIONS.damageNumbers);
  });

  it("OPTIONS_KEY bleibt stabil und null-Storage wirft nicht", () => {
    expect(OPTIONS_KEY).toBe("lanternfall-options-v1");
    expect(loadOptions(null)).toEqual(DEFAULT_OPTIONS);
    expect(() => saveOptions(null, DEFAULT_OPTIONS)).not.toThrow();
  });
});
