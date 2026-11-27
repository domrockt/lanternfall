import { describe, expect, it } from "vitest";
import { EVOLUTIONS } from "../src/data/evolutions";
import { canEvolve, evolutionReadyList } from "../src/logic/evolution";
import type { OwnedItem } from "../src/logic/levelup";

const w = (id: string, level: number): OwnedItem => ({ id, level });
const p = (id: string, level: number): OwnedItem => ({ id, level });

const ALL_PAIRS = EVOLUTIONS.map((e) => ({ base: e.baseWeapon, passive: e.passive }));

describe("evolutionReadyList (M10-Hinweis)", () => {
  it("liefert ohne Waffen/Powerups eine leere Liste", () => {
    expect(evolutionReadyList([], [])).toEqual([]);
  });

  it("meldet eine Evolution erst bei Waffe Stufe 8 und Powerup >= 1", () => {
    expect(evolutionReadyList([w("ember", 7)], [p("tome", 1)])).toEqual([]);
    expect(evolutionReadyList([w("ember", 8)], [p("tome", 0)])).toEqual([]);
    expect(evolutionReadyList([w("ember", 8)], [])).toEqual([]);
    const ready = evolutionReadyList([w("ember", 8)], [p("tome", 1)]);
    expect(ready.map((e) => e.id)).toEqual(["phoenix"]);
    expect(ready[0].name).toBe("Phönixschwarm");
  });

  it("ist konsistent mit canEvolve (gleiche Regeln)", () => {
    const weapons = [w("frost", 8), w("thorn", 8)];
    const passives = [p("hourglass", 2), p("boots", 1)];
    const ready = evolutionReadyList(weapons, passives);
    expect(ready.length).toBe(2);
    // canEvolve liefert den ersten Treffer derselben Regelmenge.
    expect(canEvolve(weapons, passives)?.id).toBe(ready[0].id);
  });

  it("listet alle 6 Evolutionen, wenn alle Paare bereit sind – deterministisch, ohne Duplikate", () => {
    const weapons = ALL_PAIRS.map((pair) => w(pair.base, 8));
    const passives = ALL_PAIRS.map((pair) => p(pair.passive, 3));
    const ready = evolutionReadyList(weapons, passives);
    expect(ready.map((e) => e.id)).toEqual(EVOLUTIONS.map((e) => e.id));
    expect(new Set(ready.map((e) => e.id)).size).toBe(ready.length);
    // Zweiter Aufruf liefert exakt dieselbe Reihenfolge.
    expect(evolutionReadyList(weapons, passives).map((e) => e.id))
      .toEqual(ready.map((e) => e.id));
  });

  it("dupliziert keine Treffer, auch wenn dieselbe Waffe mehrfach übergeben wird", () => {
    const ready = evolutionListWithDuplicates();
    expect(ready.map((e) => e.id)).toEqual(["phoenix"]);
  });

  it("ignoriert bereits evolvierte Waffen (Basiswaffe ersetzt)", () => {
    const ready = evolutionReadyList([w("phoenix", 8)], [p("tome", 2)]);
    expect(ready).toEqual([]);
  });

  it("verändert die Eingaben nicht", () => {
    const weapons = [w("lantern", 8)];
    const passives = [p("charm", 1)];
    const weaponsBefore = JSON.stringify(weapons);
    const passivesBefore = JSON.stringify(passives);
    evolutionReadyList(weapons, passives);
    expect(JSON.stringify(weapons)).toBe(weaponsBefore);
    expect(JSON.stringify(passives)).toBe(passivesBefore);
  });
});

function evolutionListWithDuplicates() {
  return evolutionReadyList(
    [w("ember", 8), w("ember", 8)],
    [p("tome", 1), p("tome", 4)],
  );
}
