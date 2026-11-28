import { describe, expect, it } from "vitest";
import { Pool } from "../src/systems/Pool";

/**
 * Guard-Test zur Karte #2438 (m10-pool-trim): `Pool.trim()` ist im Run-Pfad
 * NICHT verdrahtet (0 Aufrufstellen, Befund docs/lanes/m10-pool-trim.md).
 * Dieser Test pinnt den Vertrag, auf den die spätere Verdrahtung bauen kann
 * (Karte #2439): Kapazität nach Spitze sinkt, Wiederverhalten im Normalbetrieb
 * bleibt unverändert.
 */
describe("Pool.trim: Vertrag für die spätere Run-Pfad-Verdrahtung", () => {
  it("senkt die Kapazität (Free-Stack) nach einer Spitze und gibt den Overhang zurück", () => {
    const pool = new Pool<{ n: number }>(() => ({ n: 0 }));
    const peak: { n: number }[] = [];
    for (let i = 0; i < 100; i++) peak.push(pool.obtain());
    for (const o of peak) pool.release(o);
    expect(pool.freeCount).toBe(100); // Overhang nach der Spitze

    const removed = pool.trim(10);
    expect(removed).toBe(90);
    expect(pool.freeCount).toBe(10);
  });

  it("lässt Wiederverhalten im Normalbetrieb unverändert: kein Neuanlagen nach Trim", () => {
    const pool = new Pool<{ n: number }>(() => ({ n: 0 }), (o) => { o.n = -1; });
    const warmup: { n: number }[] = [];
    for (let i = 0; i < 10; i++) warmup.push(pool.obtain());
    for (const o of warmup) pool.release(o);
    pool.trim(10);
    expect(pool.createdTotal).toBe(10);

    // Gleich viele obtain wie vorher aktiv: alles aus dem Free-Stack, reset greift,
    // keine Neuanlage (Steady State bleibt auch nach trim() erhalten).
    for (let i = 0; i < 10; i++) {
      const o = pool.obtain();
      expect(o.n).toBe(-1); // reset wurde beim release gelaufen
    }
    expect(pool.createdTotal).toBe(10);
    expect(pool.activeCount).toBe(10);
  });

  it("gibt bei trim(0) den gesamten Overhang frei: nachfolgende obtains wachsen neu", () => {
    const pool = new Pool<{ n: number }>(() => ({ n: 0 }));
    const peak: { n: number }[] = [];
    for (let i = 0; i < 50; i++) peak.push(pool.obtain());
    for (const o of peak) pool.release(o);
    expect(pool.trim(0)).toBe(50);
    expect(pool.freeCount).toBe(0);

    const o = pool.obtain();
    expect(peak.includes(o)).toBe(false); // Overhang ist wirklich freigegeben
    expect(pool.createdTotal).toBe(51); // neue Anlage, kein gepooltes Objekt
  });

  it("ist idempotent und toleriert Deck-/Negativwerte", () => {
    const pool = new Pool<{ n: number }>(() => ({ n: 0 }), undefined, 7);
    expect(pool.freeCount).toBe(7);
    expect(pool.trim(3)).toBe(4);
    expect(pool.trim(3)).toBe(0);
    expect(pool.trim(-5)).toBe(3); // Negativwert -> keep = 0
    expect(pool.freeCount).toBe(0);
    expect(pool.trim(100)).toBe(0);
  });

  it("release eines fremden Objekts wird ignoriert und wächst nicht in den Free-Stack (Trim-Sicherheit)", () => {
    const pool = new Pool<{ n: number }>(() => ({ n: 0 }));
    pool.trim(0);
    const fremd = { n: 1 };
    pool.release(fremd);
    expect(pool.freeCount).toBe(0);
    expect(pool.activeCount).toBe(0);
  });
});
