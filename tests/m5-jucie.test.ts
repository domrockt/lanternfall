import { describe, expect, it } from "vitest";
import { lodFor, LOD_THRESHOLD } from "../src/logic/lod";
import {
  addDamage, expireDamage, damageLabel, rollCrit, critDamage, AGGREGATE_WINDOW,
  type AggregateEntry,
} from "../src/logic/damage-numbers";
import { clampShake, hitStopFor, knockbackFor, shakeFor, MAX_SHAKE_PX } from "../src/logic/feedback";
import {
  canPlay, newMixerState, notePlayed, releaseVoice, effectiveVolume, PRIORITY, MAX_TOTAL_VOICES,
} from "../src/audio/mixing";
import {
  DEFAULT_OPTIONS, loadOptions, saveOptions, setOption, clampVolume, type StorageLike,
} from "../src/audio/options";

describe("M5 LOD-Schwellen", () => {
  it("volle Dichte bis 250 Gegner", () => {
    expect(lodFor(10).level).toBe("full");
    expect(lodFor(250).trails).toBe(true);
    expect(lodFor(250).fxCap).toBe(200);
  });
  it("reduziert zwischen 251 und 400", () => {
    const lod = lodFor(300);
    expect(lod.level).toBe("reduced");
    expect(lod.particleCap).toBeLessThan(360);
  });
  it("minimal über 400: Trails aus, Damage-Summen, kleine Caps", () => {
    const lod = lodFor(LOD_THRESHOLD + 1);
    expect(lod.level).toBe("minimal");
    expect(lod.trails).toBe(false);
    expect(lod.damageAggregate).toBe(true);
    expect(lod.particleCap).toBeLessThanOrEqual(160);
    expect(lod.gemCap).toBeLessThanOrEqual(120);
  });
});

describe("Damage-Number-Zusammenfassung", () => {
  it("summiert Treffer desselben Gegners im Fenster", () => {
    const list: AggregateEntry[] = [];
    addDamage(list, { enemyUid: 7, damage: 10, crit: false, time: 1 });
    addDamage(list, { enemyUid: 7, damage: 5, crit: false, time: 1.2 });
    expect(list).toHaveLength(1);
    expect(list[0].damage).toBe(15);
    expect(list[0].hits).toBe(2);
  });
  it("summiert nicht über das Fenster oder für andere Gegner", () => {
    const list: AggregateEntry[] = [];
    addDamage(list, { enemyUid: 7, damage: 10, crit: false, time: 1 });
    addDamage(list, { enemyUid: 7, damage: 5, crit: false, time: 1 + AGGREGATE_WINDOW + 0.01 });
    addDamage(list, { enemyUid: 8, damage: 3, crit: false, time: 1.2 });
    expect(list).toHaveLength(3);
  });
  it("Krit bleibt beim Summieren erhalten, Label mit !", () => {
    const list: AggregateEntry[] = [];
    addDamage(list, { enemyUid: 1, damage: 10, crit: false, time: 0 });
    addDamage(list, { enemyUid: 1, damage: 10, crit: true, time: 0.1 });
    expect(list[0].crit).toBe(true);
    expect(damageLabel(list[0])).toBe("20!");
  });
  it("expire entfernt alte Einträge", () => {
    const list: AggregateEntry[] = [];
    addDamage(list, { enemyUid: 1, damage: 10, crit: false, time: 0 });
    expireDamage(list, 2);
    expect(list).toHaveLength(0);
  });
  it("Krit-Rollen deterministisch", () => {
    expect(rollCrit(0.01)).toBe(true);
    expect(rollCrit(0.5)).toBe(false);
    expect(critDamage(10)).toBe(15);
  });
});

describe("Screen-Shake / Hit-Stop / Knockback", () => {
  it("Shake nie über 6 px, auch bei absurder Intensität", () => {
    const s = clampShake(10, 9999);
    expect(s.pixels).toBe(MAX_SHAKE_PX);
    expect(s.durationMs).toBe(400);
  });
  it("Shake aus erzeugt 0", () => {
    expect(shakeFor("bossDeath", false)).toEqual({ durationMs: 0, intensity: 0, pixels: 0 });
  });
  it("Boss-Tod-Shake bleibt im 6-px-Limit", () => {
    expect(shakeFor("bossDeath").pixels).toBeLessThanOrEqual(MAX_SHAKE_PX);
  });
  it("Hit-Stop 60–120 ms", () => {
    expect(hitStopFor("bossHit")).toBeGreaterThanOrEqual(0.06);
    expect(hitStopFor("bossDeath")).toBeLessThanOrEqual(0.12);
    expect(hitStopFor("bossDeath")).toBeGreaterThan(hitStopFor("bossHit"));
  });
  it("Rückstoß sinkt mit Masse", () => {
    expect(knockbackFor(100, 1)).toBe(100);
    expect(knockbackFor(100, 2)).toBe(50);
  });
});

describe("Lautstärke-Mixing", () => {
  it("Cooldown blockt Spam, nach Ablauf wieder frei", () => {
    const st = newMixerState();
    const req = { id: "hit", priority: PRIORITY.hit, cooldown: 0.08, maxVoices: 3, volume: 1 };
    st.now = 1;
    expect(canPlay(st, req)).toBe(true);
    notePlayed(st, req);
    st.now = 1.02;
    expect(canPlay(st, req)).toBe(false);
    st.now = 1.1;
    expect(canPlay(st, req)).toBe(true);
  });
  it("max. Stimmen je Sound", () => {
    const st = newMixerState();
    const req = { id: "weapon", priority: PRIORITY.weapon, cooldown: 0, maxVoices: 2, volume: 1 };
    notePlayed(st, req); notePlayed(st, req);
    expect(canPlay(st, req)).toBe(false);
    releaseVoice(st, "weapon");
    expect(canPlay(st, req)).toBe(true);
  });
  it("globales Limit blockt niederpriore Sounds, Boss/Warnung nicht", () => {
    const st = newMixerState();
    st.totalVoices = MAX_TOTAL_VOICES;
    expect(canPlay(st, { id: "w", priority: PRIORITY.weapon, cooldown: 0, maxVoices: 9, volume: 1 })).toBe(false);
    expect(canPlay(st, { id: "b", priority: PRIORITY.boss, cooldown: 0, maxVoices: 9, volume: 1 })).toBe(true);
  });
  it("effektive Lautstärke respektiert Master und Priorität", () => {
    expect(effectiveVolume(1, { id: "x", priority: PRIORITY.boss, cooldown: 0, maxVoices: 1, volume: 1 })).toBe(1);
    expect(effectiveVolume(0.5, { id: "x", priority: PRIORITY.weapon, cooldown: 0, maxVoices: 1, volume: 1 })).toBeCloseTo(0.4);
  });
});

describe("Optionen-Persistenz", () => {
  function memStorage(): StorageLike {
    let data: string | null = null;
    return {
      getItem: () => data,
      setItem: (_k, v) => { data = v; },
    };
  }
  it("ohne Daten Defaults", () => {
    expect(loadOptions(memStorage())).toEqual(DEFAULT_OPTIONS);
    expect(loadOptions(null)).toEqual(DEFAULT_OPTIONS);
  });
  it("speichert und lädt gerundet/validiert", () => {
    const s = memStorage();
    saveOptions(s, { music: 0.3, sfx: 0.7, shake: false });
    expect(loadOptions(s)).toEqual({ music: 0.3, sfx: 0.7, shake: false });
  });
  it("kaputtes JSON und ungueltige Werte → Defaults/Clamp", () => {
    const s: StorageLike = { getItem: () => "{kaputt", setItem: () => {} };
    expect(loadOptions(s)).toEqual(DEFAULT_OPTIONS);
    expect(clampVolume(-2)).toBe(0);
    expect(clampVolume(5)).toBe(1);
  });
  it("setOption ändert nur den Schlüssel", () => {
    const next = setOption(DEFAULT_OPTIONS, "shake", false);
    expect(next.shake).toBe(false);
    expect(next.music).toBe(DEFAULT_OPTIONS.music);
    expect(setOption(DEFAULT_OPTIONS, "sfx", 7).sfx).toBe(1);
  });
});

import { deathClassFor, deathFxFor, type DeathClass } from "../src/logic/death";
import { ENEMIES } from "../src/data/enemies";

describe("Tod-Effekt-Klassen", () => {
  it("alle 10 Archetypen sind zugeordnet", () => {
    const archetypes = new Set(Object.values(ENEMIES).map((e) => e.archetype));
    for (const a of archetypes) expect(["crumble", "burst", "dissolve", "sputter"]).toContain(deathClassFor(a));
  });
  it("mindestens 4 visuell unterscheidbare Klassen kommen vor", () => {
    const classes = new Set<DeathClass>(Object.values(ENEMIES).map((e) => deathClassFor(e.archetype)));
    expect(classes.size).toBe(4);
  });
  it("jede Klasse hat eigene Shard-Textur; Boss mehr Partikel", () => {
    const keys = new Set(["crumble", "burst", "dissolve", "sputter"].map((c) => deathFxFor(c as DeathClass).shard));
    expect(keys.size).toBe(4);
    expect(deathFxFor("crumble", true).count).toBeGreaterThan(deathFxFor("crumble").count);
  });
});
