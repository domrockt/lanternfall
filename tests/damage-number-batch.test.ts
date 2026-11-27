import { describe, it, expect } from "vitest";
import {
  AGGREGATE_WINDOW, DAMAGE_AGGREGATE_MIN_ENEMIES, GROUP_COLUMNS, GROUP_ROWS,
  MAX_ENTRIES, MAX_VIEWS_AGGREGATE, LabelMemo, ViewBudget,
  addDamage, aggregateKey, damageLabel, entryMatchesKey, expireDamage, groupZoneFor, shouldAggregateDamage,
  type AggregateEntry,
} from "../src/logic/damage-numbers";

function fresh(): AggregateEntry[] {
  return [];
}

const AGGREGATE_MIN_GAP = AGGREGATE_WINDOW + 0.01;


describe("M10 Damage-Batch: Summe und Gruppierung", () => {
  it("Summe der Aggregat-Einträge entspricht der Trefferliste (0 % Abweichung)", () => {
    const entries = fresh();
    let rawTotal = 0;
    let t = 0;
    // 500 Gegner x 4 Treffer, teils gleiche Gegner-Gruppe (Bildschirmzone).
    for (let uid = 0; uid < 500; uid++) {
      for (let hit = 0; hit < 4; hit++) {
        const damage = 3 + ((uid * 7 + hit * 13) % 40);
        rawTotal += damage;
        t += 0.01;
        addDamage(entries, { enemyUid: uid, group: groupZoneFor(uid % 480, uid % 270, 480, 270), damage, crit: hit === 3, time: t }, 1.2);
      }
    }
    const shown = entries.reduce((a, e) => a + e.damage, 0);
    expect(rawTotal).toBeGreaterThan(0);
    expect(Math.abs(shown - rawTotal) / rawTotal).toBeLessThanOrEqual(0.01);
  });

  it("gleiche Gegner-Gruppe summiert verschiedene Gegner in einen Eintrag", () => {
    const entries = fresh();
    addDamage(entries, { enemyUid: 1, group: 5, damage: 10, crit: false, time: 1 });
    addDamage(entries, { enemyUid: 2, group: 5, damage: 15, crit: false, time: 1.2 });
    expect(entries).toHaveLength(1);
    expect(entries[0].damage).toBe(25);
    expect(entries[0].hits).toBe(2);
  });

  it("keine doppelten Einträge/Labels für denselben Gegner im Fenster", () => {
    const entries = fresh();
    addDamage(entries, { enemyUid: 42, damage: 7, crit: false, time: 1 });
    addDamage(entries, { enemyUid: 42, damage: 8, crit: true, time: 1 + AGGREGATE_WINDOW - 0.01 });
    expect(entries.filter((e) => e.enemyUid === 42)).toHaveLength(1);
    expect(entries[0].crit).toBe(true);
    expect(damageLabel(entries[0])).toBe("15!");
  });

  it("nach dem Fenster entsteht genau ein neuer Eintrag (Label-Wechsel erlaubt)", () => {
    const entries = fresh();
    addDamage(entries, { enemyUid: 42, damage: 7, crit: false, time: 1 });
    addDamage(entries, { enemyUid: 42, damage: 9, crit: false, time: 1 + AGGREGATE_MIN_GAP });
    expect(entries).toHaveLength(2);
    expect(entries[1].damage).toBe(9);
  });
});


describe("M10 Damage-Batch: Caps, Label-Memo, Robustheit", () => {
  it("Aggregat beginnt ab DAMAGE_AGGREGATE_MIN_ENEMIES", () => {
    expect(shouldAggregateDamage(DAMAGE_AGGREGATE_MIN_ENEMIES - 1, false)).toBe(false);
    expect(shouldAggregateDamage(DAMAGE_AGGREGATE_MIN_ENEMIES, false)).toBe(true);
  });

  it("ViewBudget deckelt harte Obergrenze 10 im Aggregat-Modus", () => {
    const budget = new ViewBudget();
    for (let i = 0; i < MAX_VIEWS_AGGREGATE; i++) expect(budget.tryActivate(MAX_VIEWS_AGGREGATE)).toBe(true);
    expect(budget.tryActivate(MAX_VIEWS_AGGREGATE)).toBe(false);
    expect(budget.count).toBe(MAX_VIEWS_AGGREGATE);
    budget.deactivate();
    expect(budget.tryActivate(MAX_VIEWS_AGGREGATE)).toBe(true);
  });

  it("MAX_ENTRIES verdrängt den ältesten Eintrag und hält die Liste begrenzt", () => {
    const entries = fresh();
    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      addDamage(entries, { enemyUid: 1000 + i, damage: 1, crit: false, time: i * 0.1 }, 0.01);
    }
    expect(entries.length).toBe(MAX_ENTRIES);
  });

  it("LabelMemo: kein setText ohne Wert-/Krit-Änderung (Spy)", () => {
    const memo = new LabelMemo();
    let setTextCalls = 0;
    const draw = (key: number, label: string) => {
      if (memo.needsUpdate(key, label)) setTextCalls += 1;
    };
    draw(7, "42");
    draw(7, "42");
    draw(7, "42!");
    draw(7, "42!");
    expect(setTextCalls).toBe(2);
    memo.forget(7);
    draw(7, "42!");
    expect(setTextCalls).toBe(3);
    expect(memo.size).toBe(1);
  });

  it("0 NaN/Infinity/negativ im Eintrag", () => {
    const entries = fresh();
    addDamage(entries, { enemyUid: 1, damage: Number.NaN, crit: false, time: 0 });
    addDamage(entries, { enemyUid: 2, damage: Number.POSITIVE_INFINITY, crit: false, time: 0 });
    addDamage(entries, { enemyUid: 3, damage: -50, crit: false, time: 0 });
    addDamage(entries, { enemyUid: 4, damage: 0, crit: false, time: 0 });
    expect(entries).toHaveLength(0);
    addDamage(entries, { enemyUid: 5, damage: 12, crit: false, time: 0 });
    for (const e of entries) {
      expect(Number.isFinite(e.damage)).toBe(true);
      expect(e.damage).toBeGreaterThan(0);
    }
  });

  it("expire räumt alte Einträge, junge bleiben", () => {
    const entries = fresh();
    addDamage(entries, { enemyUid: 1, damage: 10, crit: false, time: 0 });
    addDamage(entries, { enemyUid: 2, damage: 10, crit: false, time: 2 });
    expireDamage(entries, 1.5);
    expect(entries).toHaveLength(1);
    expect(entries[0].enemyUid).toBe(2);
  });

  it("groupZoneFor liefert 1..9 und ist deterministisch", () => {
    const max = 1 + GROUP_ROWS * GROUP_COLUMNS;
    expect(groupZoneFor(-10, -10, 480, 270)).toBe(1);
    expect(groupZoneFor(9999, 9999, 480, 270)).toBe(max - 1);
    for (let i = 0; i < 50; i++) {
      const x = (i * 37) % 480;
      const y = (i * 53) % 270;
      const z = groupZoneFor(x, y, 480, 270);
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThan(max);
      expect(groupZoneFor(x, y, 480, 270)).toBe(z);
    }
    expect(MAX_VIEWS_AGGREGATE).toBeGreaterThanOrEqual(GROUP_ROWS * GROUP_COLUMNS + 1);
  });

  it("aggregateKey trennt Zonen von Gegner-UIDs, entryMatchesKey findet beide", () => {
    expect(aggregateKey(7)).toBe(7);
    expect(aggregateKey(7, 3)).toBe(-3);
    // Zonen-Key kollidiert nicht mit einer UID gleichen Zahlenwerts.
    expect(aggregateKey(3)).not.toBe(aggregateKey(3, 3));
    const byUid: AggregateEntry = { enemyUid: 7, damage: 5, crit: false, firstTime: 0, lastTime: 0, hits: 1 };
    const byGroup: AggregateEntry = { enemyUid: 99, group: 3, damage: 5, crit: false, firstTime: 0, lastTime: 0, hits: 1 };
    expect(entryMatchesKey(byUid, 7)).toBe(true);
    expect(entryMatchesKey(byUid, -3)).toBe(false);
    expect(entryMatchesKey(byGroup, -3)).toBe(true);
    expect(entryMatchesKey(byGroup, 99)).toBe(false);
  });
});
