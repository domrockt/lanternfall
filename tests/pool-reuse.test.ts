import { describe, expect, it } from "vitest";
import { Pool } from "../src/systems/Pool";
import {
  MAX_ENTRIES, addDamage, expireDamage, type AggregateEntry, type EntrySink,
} from "../src/logic/damage-numbers";
import { resetAiState } from "../src/logic/ai-state";
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
      orbitDir: 1, fuse: 3, blinks: 7, attacks: 11,
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
  });
});
