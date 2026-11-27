import { describe, expect, it } from "vitest";
import { Pool } from "../src/systems/Pool";
import {
  MAX_ENTRIES, ViewBudget, addDamage, expireDamage, resetAggregateEntry,
  type AggregateEntry, type EntrySink,
} from "../src/logic/damage-numbers";
import { ensureAiState, resetAiState } from "../src/logic/ai-state";
import type { AiState } from "../src/logic/enemy-ai";

describe("Pool: Reuse ohne Neuanlage im Steady State", () => {
  it("liefert nach release dasselbe Objekt (Identität bleibt)", () => {
    let made = 0;
    const pool = new Pool<{ n: number }>(() => ({ n: ++made }), (o) => { o.n = 0; }, 2);
    expect(pool.freeCount).toBe(2);
    const a = pool.obtain();
    const b = pool.obtain();
    expect(pool.createdTotal).toBe(2);
    pool.release(a);
    pool.release(b);
    expect(pool.freeCount).toBe(2);
    const a2 = pool.obtain();
    expect([a2, pool.obtain()].sort((x, y) => (x === a ? -1 : 1))).toHaveLength(2);
    expect(a2 === a || a2 === b).toBe(true);
    expect(pool.createdTotal).toBe(2);
  });

  it("legt im wiederholten obtain/release-Zyklus nichts neu an", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 0 }), (o) => { o.x = 0; }, 4);
    const seen: object[] = [];
    for (let i = 0; i < 2000; i++) {
      const o = pool.obtain();
      if (!seen.includes(o)) seen.push(o);
      expect(o.x).toBe(0);
      pool.release(o);
    }
    expect(pool.createdTotal).toBe(4);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(pool.freeCount).toBe(4);
    expect(pool.activeCount).toBe(0);
  });

  it("ignoriert release eines fremden/doppelt freigegebenen Objekts", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 1 }));
    const foreign = { x: 9 };
    pool.release(foreign as { x: number });
    expect(pool.freeCount).toBe(0);
    expect(pool.activeCount).toBe(0);
    const a = pool.obtain();
    pool.release(a);
    pool.release(a);
    expect(pool.freeCount).toBe(1);
    expect(pool.activeCount).toBe(0);
  });

  it("releaseAll gibt den aktiven Bestand frei", () => {
    const pool = new Pool<{ x: number }>(() => ({ x: 1 }));
    pool.obtain();
    pool.obtain();
    pool.obtain();
    expect(pool.activeCount).toBe(3);
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(3);
  });

  it("trim kappt Retention nach einer Peak-Welle", () => {
    let made = 0;
    const pool = new Pool<{ x: number }>(() => ({ x: ++made }), undefined, 100);
    expect(pool.freeCount).toBe(100);
    expect(pool.trim(10)).toBe(90);
    expect(pool.freeCount).toBe(10);
    expect(pool.trim(10)).toBe(0);
    expect(pool.trim(-5)).toBe(10);
    expect(pool.freeCount).toBe(0);
  });
});

describe("Damage-Number-Einträge: Reuse + Cap", () => {
  it("nutzt einen Eintrag aus dem Free-Pool wieder (keine Neuanlage)", () => {
    const entries: AggregateEntry[] = [];
    const free: AggregateEntry[] = [];
    const sink: EntrySink = {
      take: () => free.pop() ?? {
        enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
      },
      give: (e) => { free.push(e); },
    };
    addDamage(entries, { enemyUid: 1, damage: 10, crit: false, time: 0 }, undefined, sink);
    expect(entries).toHaveLength(1);
    const first = entries[0];
    expireDamage(entries, 10, 0.8, sink);
    expect(entries).toHaveLength(0);
    expect(free).toHaveLength(1);
    addDamage(entries, { enemyUid: 2, damage: 4, crit: false, time: 0 }, undefined, sink);
    expect(entries[0]).toBe(first);
    expect(entries[0].enemyUid).toBe(2);
    expect(entries[0].damage).toBe(4);
    expect(entries[0].hits).toBe(1);
  });

  it("kappt die Eintragsliste bei MAX_ENTRIES und gibt den ältesten zurück", () => {
    const entries: AggregateEntry[] = [];
    const given: AggregateEntry[] = [];
    const sink: EntrySink = {
      take: () => ({
        enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 1,
      }),
      give: (e) => { given.push(e); },
    };
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      addDamage(entries, { enemyUid: i, damage: 1, crit: false, time: i * 0.01 }, undefined, sink);
    }
    expect(entries).toHaveLength(MAX_ENTRIES);
    expect(given).toHaveLength(10);
    expect(entries.some((e) => e.enemyUid === 0)).toBe(false);
  });
});

describe("EnemyPool: KI-Zustand in-place zurücksetzen", () => {
  it("behält die Objektidentität und setzt alle Felder zurück", () => {
    const rng = { next: () => 0.5 };
    const state: AiState = {
      mode: "charge", timer: 9, cooldown: 9, aimX: 0, aimY: 1,
      orbitDir: 1, fuse: 3, blinks: 7, attacks: 11, phase: 5,
    };
    const before = state;
    resetAiState(state, rng);
    expect(state).toBe(before);
    expect(state.mode).toBe("approach");
    expect(state.timer).toBeCloseTo(1.9, 5);
    expect(state.cooldown).toBeCloseTo(1.7, 5);
    expect(state.aimX).toBe(1);
    expect(state.aimY).toBe(0);
    expect(state.orbitDir).toBe(1);
    expect(state.fuse).toBe(0);
    expect(state.blinks).toBe(0);
    expect(state.attacks).toBe(0);
    expect(state.phase).toBe(0);
  });
});

describe("Damage-Einträge: Eviction, Multi-Expire, Reset", () => {
  it("verdrängt nach lastTime (nicht FIFO) und gibt genau den ältesten zurück", () => {
    const entries: AggregateEntry[] = [];
    const given: AggregateEntry[] = [];
    const fresh = (): AggregateEntry => ({
      enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
    });
    const sink: EntrySink = { take: fresh, give: (e) => { given.push(e); } };
    // uid 0 ist zuletzt getroffen (lastTime 10), uid 1 am ältesten (lastTime 1).
    addDamage(entries, { enemyUid: 0, damage: 1, crit: false, time: 10 }, 0.45, sink);
    addDamage(entries, { enemyUid: 1, damage: 1, crit: false, time: 1 }, 0.45, sink);
    for (let i = 2; i < MAX_ENTRIES; i++) {
      addDamage(entries, { enemyUid: i, damage: 1, crit: false, time: 5 }, 0.45, sink);
    }
    expect(entries).toHaveLength(MAX_ENTRIES);
    addDamage(entries, { enemyUid: 999, damage: 1, crit: false, time: 5.1 }, 0.45, sink);
    expect(given).toHaveLength(1);
    expect(given[0].enemyUid).toBe(1);
    expect(entries.some((e) => e.enemyUid === 1)).toBe(false);
    expect(entries.some((e) => e.enemyUid === 0)).toBe(true);
  });

  it("expireDamage entfernt mehrere alte Einträge und behält die frischen", () => {
    const entries: AggregateEntry[] = [];
    const given: AggregateEntry[] = [];
    const sink: EntrySink = {
      take: () => ({ enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0 }),
      give: (e) => { given.push(e); },
    };
    addDamage(entries, { enemyUid: 1, damage: 1, crit: false, time: 0 }, undefined, sink);
    addDamage(entries, { enemyUid: 2, damage: 1, crit: false, time: 1 }, undefined, sink);
    addDamage(entries, { enemyUid: 3, damage: 1, crit: false, time: 2 }, undefined, sink);
    expect(entries.map((e) => e.enemyUid)).toEqual([1, 2, 3]);
    expireDamage(entries, 2.5, 0.8, sink);
    expect(entries.map((e) => e.enemyUid)).toEqual([3]);
    expect(given.map((e) => e.enemyUid).sort()).toEqual([1, 2]);
  });

  it("resetAggregateEntry löscht alle Felder eines recycelten Eintrags", () => {
    const e: AggregateEntry = {
      enemyUid: 42, damage: 999, crit: true, firstTime: 1, lastTime: 2, hits: 7,
    };
    resetAggregateEntry(e);
    expect(e).toEqual({
      enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
    });
  });
});

describe("ViewBudget: Limit und Zähler ohne Drift", () => {
  it("aktiviert nur bis zum Limit und zählt deactivate korrekt herunter", () => {
    const b = new ViewBudget();
    expect(b.tryActivate(2)).toBe(true);
    expect(b.tryActivate(2)).toBe(true);
    expect(b.tryActivate(2)).toBe(false);
    expect(b.count).toBe(2);
    b.deactivate();
    b.deactivate();
    b.deactivate();
    expect(b.count).toBe(0);
    expect(b.tryActivate(1)).toBe(true);
  });

  it("reset setzt den Zähler auf 0 (clear/Disabled)", () => {
    const b = new ViewBudget();
    b.tryActivate(24);
    b.tryActivate(24);
    b.reset();
    expect(b.count).toBe(0);
  });
});

describe("ensureAiState: Recycle behält die Objektidentität", () => {
  it("liefert beim zweiten Spawn exakt dasselbe State-Objekt", () => {
    const rng = { next: () => 0.25 };
    const first = ensureAiState(undefined, rng);
    first.mode = "charge";
    first.timer = 9;
    const second = ensureAiState(first, rng);
    expect(second).toBe(first);
    expect(second.mode).toBe("approach");
    expect(second.timer).toBeCloseTo(1.55, 5);
  });
});
