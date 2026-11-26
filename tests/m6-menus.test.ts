import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIONS, OPTION_ROWS, clampScale, loadOptions, optionValueLabel,
  resolveScale, saveOptions, scaleLabel, setOption, stepOption, type StorageLike,
} from "../src/audio/options";
import {
  META_KEY, emptyMeta, formatDuration, loadMeta, metaLine, recordRun, saveMeta,
} from "../src/logic/meta";

function memStorage(seed?: string): StorageLike & { data: string | null } {
  const box = {
    data: seed ?? null,
    getItem: () => box.data,
    setItem: (_k: string, v: string) => { box.data = v; },
  };
  return box;
}

describe("M6 Optionen: Damage-Numbers, Skalierung, Anzeige", () => {
  it("Defaults enthalten alle fünf Optionen", () => {
    expect(DEFAULT_OPTIONS.damageNumbers).toBe(true);
    expect(DEFAULT_OPTIONS.scale).toBe(0);
    expect(OPTION_ROWS).toHaveLength(6);
    expect(OPTION_ROWS[5]).toBe("ZURÜCK");
  });
  it("stepOption schaltet Schalter und skaliert ganzzahlig", () => {
    const off = stepOption(DEFAULT_OPTIONS, 3, 1);
    expect(off.damageNumbers).toBe(false);
    expect(stepOption(off, 3, -1).damageNumbers).toBe(true);
    expect(stepOption(DEFAULT_OPTIONS, 0, 1).music).toBeCloseTo(0.7);
    expect(stepOption(DEFAULT_OPTIONS, 0, -1).music).toBeCloseTo(0.5);
    expect(stepOption(DEFAULT_OPTIONS, 1, 1).sfx).toBeCloseTo(0.9);
    expect(stepOption(DEFAULT_OPTIONS, 4, 1).scale).toBe(1);
    expect(stepOption({ ...DEFAULT_OPTIONS, scale: 3 }, 4, 1).scale).toBe(3);
    expect(stepOption({ ...DEFAULT_OPTIONS, scale: 0 }, 4, -1).scale).toBe(0);
  });
  it("Labels und Value-Texte passen zu den Optionen", () => {
    expect(optionValueLabel(DEFAULT_OPTIONS, 0)).toBe("55%");
    expect(optionValueLabel({ ...DEFAULT_OPTIONS, shake: false }, 2)).toBe("AUS");
    expect(optionValueLabel({ ...DEFAULT_OPTIONS, damageNumbers: false }, 3)).toBe("AUS");
    expect(scaleLabel(0)).toBe("AUTO");
    expect(scaleLabel(2)).toBe("2X");
    expect(optionValueLabel({ ...DEFAULT_OPTIONS, scale: 2 }, 4)).toBe("2X");
  });
  it("resolveScale bleibt ganzzahlig und passt in den Viewport", () => {
    expect(resolveScale(0, 960, 540, 480, 270)).toBe(2);
    expect(resolveScale(0, 480, 270, 480, 270)).toBe(1);
    expect(resolveScale(3, 960, 540, 480, 270)).toBe(2);
    expect(resolveScale(2, 1920, 1080, 480, 270)).toBe(2);
    expect(resolveScale(1, 1920, 1080, 480, 270)).toBe(1);
    expect(clampScale(9)).toBe(3);
  });
  it("Persistenz speichert neue Felder und lädt alte Saves defensiv", () => {
    const s = memStorage();
    saveOptions(s, { music: 0.1, sfx: 0.2, shake: false, damageNumbers: false, scale: 2 });
    expect(loadOptions(s).damageNumbers).toBe(false);
    expect(loadOptions(s).scale).toBe(2);
    const legacy = memStorage(JSON.stringify({ music: 0.4, shake: true }));
    const loaded = loadOptions(legacy);
    expect(loaded.sfx).toBe(DEFAULT_OPTIONS.sfx);
    expect(loaded.damageNumbers).toBe(true);
    expect(loaded.scale).toBe(0);
    expect(setOption(DEFAULT_OPTIONS, "scale", 99).scale).toBe(3);
  });
});

describe("M6 Meta: Bestwerte pro Charakter", () => {
  it("erster Lauf setzt alle Bestwerte und zählt Runs", () => {
    const first = recordRun(emptyMeta(), {
      character: "mira", time: 123, kills: 40, level: 5, victory: false,
    });
    expect(first.meta.mira.time).toBe(123);
    expect(first.meta.mira.kills).toBe(40);
    expect(first.meta.mira.level).toBe(5);
    expect(first.meta.mira.runs).toBe(1);
    expect(first.records).toEqual({ time: true, kills: true, level: true, victory: false });
    expect(first.meta.kael.runs).toBe(0);
  });
  it("Bestwerte werden nicht verschlechtert, Siege zählen", () => {
    const m1 = recordRun(emptyMeta(), {
      character: "kael", time: 100, kills: 90, level: 9, victory: false,
    }).meta;
    const m2 = recordRun(m1, {
      character: "kael", time: 80, kills: 20, level: 3, victory: true,
    });
    expect(m2.meta.kael.time).toBe(100);
    expect(m2.meta.kael.kills).toBe(90);
    expect(m2.meta.kael.level).toBe(9);
    expect(m2.meta.kael.runs).toBe(2);
    expect(m2.meta.kael.victories).toBe(1);
    expect(m2.records).toEqual({ time: false, kills: false, level: false, victory: true });
  });
  it("Formatierung und Meta-Zeile", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(3599)).toBe("59:59");
    expect(metaLine(undefined)).toBe("NOCH KEIN LAUF");
    expect(metaLine({ time: 754, kills: 456, level: 12, victories: 0, runs: 2 }))
      .toBe("BEST 12:34 · 456 KILLS · LV12");
  });
  it("load/save ertragen kaputte Daten und erhalten beide Charaktere", () => {
    const s = memStorage();
    const m = recordRun(emptyMeta(), {
      character: "mira", time: 50, kills: 7, level: 2, victory: false,
    }).meta;
    saveMeta(s, m);
    expect(loadMeta(s).mira.kills).toBe(7);
    expect(loadMeta(s).kael.runs).toBe(0);
    const broken = memStorage("{kaputt");
    expect(loadMeta(broken)).toEqual(emptyMeta());
    expect(META_KEY).toBe("lanternfall-meta-v1");
  });
});
