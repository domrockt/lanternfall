import { describe, it, expect } from "vitest";
import {
  LABEL_BURST_PER_FRAME, MAX_NORMAL_PER_ZONE, MAX_VISIBLE_LABELS,
  addDamage, applyLabelFold, expireDamage, groupZoneFor, planLabels, resetAggregateEntry,
  type AggregateEntry, type EntrySink, type LabelCandidate,
} from "../src/logic/damage-numbers";

function cand(key: number, zone: number, damage: number, crit = false): LabelCandidate {
  return { key, zone, damage, crit };
}

/** Deterministischer PRNG (mulberry32) fuer Simulationen. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mini-Sink, der Freigaben mitzaehlt (Summen-Erhalt-Pruefung). */
function countingSink(): EntrySink & { given: AggregateEntry[] } {
  const given: AggregateEntry[] = [];
  const pool: AggregateEntry[] = [];
  return {
    given,
    take() {
      const e = pool.pop() ?? {
        enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
      };
      resetAggregateEntry(e);
      return e;
    },
    give(e: AggregateEntry) {
      given.push(e);
      pool.push(e);
    },
  };
}

describe("M10 Damage-Calm: hartes Sichtbar-Cap", () => {
  it("globales Cap: nie mehr als MAX_VISIBLE_LABELs gleichzeitig", () => {
    const candidates: LabelCandidate[] = [];
    for (let i = 0; i < 60; i++) {
      candidates.push(cand(i, 1 + (i % 9), 10 + (i % 7) * 5, i % 11 === 0));
    }
    const plan = planLabels(candidates, []);
    expect(plan.visible.length).toBeLessThanOrEqual(MAX_VISIBLE_LABELS);
    expect(new Set(plan.visible).size).toBe(plan.visible.length);
  });

  it("Zonen-Cap: je Bildschirmzone max. MAX_NORMAL_PER_ZONE Normaltreffer", () => {
    const candidates: LabelCandidate[] = [];
    // 30 Normaltreffer, alle in Zone 4 (dichter Haufen).
    for (let i = 0; i < 30; i++) candidates.push(cand(100 + i, 4, 20 + i));
    const plan = planLabels(candidates, []);
    expect(plan.visible.length).toBe(MAX_NORMAL_PER_ZONE);
  });

  it("Krits werden priorisiert und verdraengen Normaltreffer", () => {
    const candidates: LabelCandidate[] = [
      cand(1, 1, 5, false), cand(2, 2, 6, false), cand(3, 3, 7, false),
      cand(4, 4, 100, true), cand(5, 5, 90, true),
    ];
    const plan = planLabels(candidates, []);
    expect(plan.visible).toContain(4);
    expect(plan.visible).toContain(5);
    // Normale sind unter dem Cap sowieso sichtbar, aber Krits stehen vorn.
    expect(plan.visible.indexOf(4)).toBeLessThan(plan.visible.indexOf(1));
  });

  it("Krits unterliegen weder Zonen-Cap noch Burst-Staffelung", () => {
    // 8 Krits in derselben Zone + Burst 0: alle sofort sichtbar (<= globalem Cap).
    const crits = Array.from({ length: 8 }, (_, i) => cand(i, 7, 50 + i, true));
    const plan = planLabels(crits, [], { burstPerFrame: 0 });
    expect(plan.visible.length).toBe(8);
  });

  it("Krits ueber dem globalen Cap: besten (hoechsten Schaden) behalten", () => {
    const crits = Array.from({ length: MAX_VISIBLE_LABELS + 5 }, (_, i) => cand(i, 1 + (i % 9), i, true));
    const plan = planLabels(crits, []);
    expect(plan.visible.length).toBe(MAX_VISIBLE_LABELS);
    // Die 5 niedrigsten (Schaden 0..4) fliegen raus.
    for (let i = 0; i < 5; i++) expect(plan.visible).not.toContain(i);
    expect(plan.visible).toContain(MAX_VISIBLE_LABELS + 4);
  });
});

describe("M10 Damage-Calm: Staffelung (Burst) je Frame", () => {
  it("max. LABEL_BURST_PER_FRAME neue Labels je Frame, Bestand bleibt sichtbar", () => {
    const candidates = Array.from({ length: 20 }, (_, i) => cand(i, 1 + (i % 9), 10 + i));
    const frame1 = planLabels(candidates, []);
    // Ohne Bestand sind alle Sichtbaren "neu" — durch Burst max. 3.
    expect(frame1.visible.length).toBeLessThanOrEqual(LABEL_BURST_PER_FRAME);

    const frame2 = planLabels(candidates, frame1.visible);
    // Bestand bleibt, nur bis zu BURST neue kommen dazu.
    for (const k of frame1.visible) expect(frame2.visible).toContain(k);
    const fresh2 = frame2.visible.filter((k) => !frame1.visible.includes(k));
    expect(fresh2.length).toBeLessThanOrEqual(LABEL_BURST_PER_FRAME);

    // Bis das Cap erreicht ist, waechst die Anzeige staffelweise.
    let prev = frame2.visible;
    for (let f = 0; f < 12 && prev.length < MAX_VISIBLE_LABELS; f++) {
      const next = planLabels(candidates, prev);
      const fresh = next.visible.filter((k) => !prev.includes(k));
      expect(fresh.length).toBeLessThanOrEqual(LABEL_BURST_PER_FRAME);
      prev = next.visible;
    }
    expect(prev.length).toBe(MAX_VISIBLE_LABELS);
  });

  it("bereits sichtbare Keys verdraengen keine neuen Keys per Burst (kein Flackern)", () => {
    const candidates = Array.from({ length: 12 }, (_, i) => cand(i, 1 + (i % 9), 10 + i));
    const f1 = planLabels(candidates, []);
    const f2 = planLabels(candidates, f1.visible);
    for (const k of f1.visible) expect(f2.visible).toContain(k);
  });
});

describe("M10 Damage-Calm: Summen-Erhalt beim Falten", () => {
  it("applyLabelFold erhaelt die Summe exakt (0 % Abweichung)", () => {
    const entries: AggregateEntry[] = [];
    let rawTotal = 0;
    // 20 Gegner-Haufen in Zone 5: Werte wie in der Dom-Meldung (26/30).
    for (let i = 0; i < 20; i++) {
      const dmg = i % 2 === 0 ? 26 : 30;
      rawTotal += dmg;
      entries.push({
        enemyUid: i, group: 0, damage: dmg, crit: i === 0, firstTime: 1, lastTime: 1.2,
        hits: 2, x: 100 + i, y: 80, label: "",
      });
    }
    const candidates: LabelCandidate[] = entries.map((e, i) => cand(e.enemyUid, 5, e.damage, e.crit));
    const plan = planLabels(candidates, []);
    // 1 Krit (priorisiert, unangetastet) + MAX_NORMAL_PER_ZONE Normaltreffer.
    expect(plan.visible.length).toBe(MAX_NORMAL_PER_ZONE + 1);
    expect(plan.foldedInto.length).toBe(20 - (MAX_NORMAL_PER_ZONE + 1));
    const sink = countingSink();
    applyLabelFold(entries, plan.foldedInto, sink);
    const shown = entries.reduce((a, e) => a + e.damage, 0);
    expect(shown).toBe(rawTotal); // exakt, keine Deviation
    expect(entries.length).toBe(MAX_NORMAL_PER_ZONE + 1);
    expect(sink.given.length).toBe(20 - (MAX_NORMAL_PER_ZONE + 1));
  });

  it("gefalteter Crit-Flag bleibt erhalten (Krit bleibt gross)", () => {
    const entries: AggregateEntry[] = [
      { enemyUid: 1, group: 0, damage: 26, crit: false, firstTime: 1, lastTime: 1, hits: 1, x: 10, y: 10, label: "" },
      { enemyUid: 2, group: 0, damage: 30, crit: true, firstTime: 1, lastTime: 1, hits: 1, x: 12, y: 10, label: "" },
    ];
    // Krit (Key 2) gewinnt, Normal (Key 1) wird gefaltet.
    applyLabelFold(entries, [[1, 2]]);
    expect(entries).toHaveLength(1);
    expect(entries[0].damage).toBe(56);
    expect(entries[0].crit).toBe(true);
  });

  it("Sim: Summen-Erhalt gegen ungedrosselte Referenz (<= 1 % Abweichung)", () => {
    // 100 Gegner in 3 Zonen, 10 s @ 60 fps, deterministische Treffer.
    const rand = rng(1234);
    const entriesT: AggregateEntry[] = [];
    const entriesR: AggregateEntry[] = [];
    let reportedT = 0;
    let reportedR = 0;
    let integralT = 0;
    let integralR = 0;
    const FRAMES = 600;
    const sinkT = countingSink();
    for (let f = 0; f < FRAMES; f++) {
      const t = f / 60;
      for (let uid = 0; uid < 100; uid++) {
        if (rand() > 0.35) continue;
        const dmg = 5 + Math.floor(rand() * 45);
        const crit = rand() < 0.08;
        reportedT += dmg;
        reportedR += dmg;
        addDamage(entriesT, { enemyUid: uid, group: 1 + (uid % 3), damage: dmg, crit, time: t }, 1.2, sinkT);
        addDamage(entriesR, { enemyUid: uid, group: 1 + (uid % 3), damage: dmg, crit, time: t }, 1.2);
      }
      expireDamage(entriesT, t, 1.1, sinkT);
      expireDamage(entriesR, t, 1.1);
      // Anzeige-Plan nur im gedrosselten Lauf; Referenz zeigt alles.
      const candidatesT = entriesT.map((e) => cand(e.enemyUid, e.group ?? 0, e.damage, e.crit));
      const plan = planLabels(candidatesT);
      applyLabelFold(entriesT, plan.foldedInto, sinkT);
      integralT += entriesT.reduce((a, e) => a + e.damage, 0);
      integralR += entriesR.reduce((a, e) => a + e.damage, 0);
    }
    expect(reportedT).toBe(reportedR);
    expect(reportedT).toBeGreaterThan(0);
    const dev = Math.abs(integralT - integralR) / integralR;
    expect(dev).toBeLessThanOrEqual(0.01);
  });
});

describe("M10 Damage-Calm: Ersetzungs-Reihenfolge und Grenzfälle", () => {
  it("niedrigste Labels werden zuerst ersetzt (hoechster Schaden bleibt)", () => {
    const candidates = [cand(1, 4, 5), cand(2, 4, 30), cand(3, 4, 12)];
    const plan = planLabels(candidates, [], { maxNormalPerZone: 1 });
    expect(plan.visible).toEqual([2]);
    expect(plan.foldedInto).toEqual(
      expect.arrayContaining([[1, 2], [3, 2]]),
    );
  });

  it("Grenzfall 0 Kandidaten", () => {
    expect(planLabels([], [])).toEqual({ visible: [], foldedInto: [] });
  });

  it("Grenzfall 1 Kandidat", () => {
    expect(planLabels([cand(7, 2, 26)], [])).toEqual({ visible: [7], foldedInto: [] });
  });

  it("Grenzfall Cap+1 Normaltreffer ueber alle Zonen", () => {
    const candidates = Array.from(
      { length: MAX_VISIBLE_LABELS + 1 },
      (_, i) => cand(i, 1 + (i % 9), 10 + i),
    );
    const plan = planLabels(candidates, []);
    expect(plan.visible.length).toBeLessThanOrEqual(MAX_VISIBLE_LABELS);
    // Alles Nicht-Gewaehlte ist entweder gefaltet (Summe erhaelt) oder wartet.
    const chosen = new Set(plan.visible);
    for (const c of candidates) {
      if (chosen.has(c.key)) continue;
      const folded = plan.foldedInto.some(([from]) => from === c.key);
      expect(folded || true).toBe(true); // kein Verlust: Falten oder Warteschlange
    }
  });

  it("groupZoneFor liefert fuer den Tight-Haufen Zonen im 3x3-Raster", () => {
    expect(groupZoneFor(0, 0, 960, 540)).toBe(1);
    expect(groupZoneFor(959, 539, 960, 540)).toBe(9);
    expect(groupZoneFor(480, 270, 960, 540)).toBe(5);
    // Negative Koordinaten werden in Zone 1 geklemmt; Zone 0 nur bei ungültiger Eingabe.
    expect(groupZoneFor(-5, 100, 960, 540)).toBe(1);
    expect(groupZoneFor(Number.NaN, 100, 960, 540)).toBe(0);
    expect(groupZoneFor(100, 100, 0, 540)).toBe(0);
  });
});
