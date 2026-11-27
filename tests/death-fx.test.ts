import { describe, it, expect } from "vitest";
import {
  allDeathFx,
  deathClassFor,
  deathFxFor,
  type DeathClass,
  type DeathFxSpec,
} from "../src/logic/death";
import { ENEMIES } from "../src/data/enemies";

const CLASSES: DeathClass[] = ["crumble", "burst", "dissolve", "sputter"];

/** Dimensionen, in denen sich zwei Klassen-Specs sichtbar unterscheiden können. */
const DIMENSIONS = [
  "shard",
  "dust",
  "count",
  "dustCount",
  "life",
  "dustLife",
  "scaleFrom",
  "scaleTo",
  "dustScale",
  "rim",
  "rimTint",
  "rimScale",
  "spread",
  "tint",
  "dustTint",
  "additive",
] as const;

function differingDimensions(a: DeathFxSpec, b: DeathFxSpec): string[] {
  return DIMENSIONS.filter((k) => a[k] !== b[k]);
}

describe("Todes-VFX-Specs (#K4)", () => {
  it("jeder der 30 Archetypen mappt auf genau eine der 4 Klassen", () => {
    // Alle 30 Gegner-Einträge einzeln prüfen, nicht nur die 10 Unique-Archetypen:
    // ein fehlender/neuer Gegner muss den Test rot machen.
    const entries = Object.entries(ENEMIES);
    expect(entries.length).toBe(30);
    for (const [id, e] of entries) {
      const cls = deathClassFor(e.archetype);
      expect(CLASSES, `${id} (${e.archetype})`).toContain(cls);
    }
    const archetypes = [...new Set(entries.map(([, e]) => e.archetype))];
    expect(archetypes.length).toBe(10);
    // Unbekannte Archetypen fallen bewusst auf dissolve zurück.
    expect(deathClassFor("unbekannt")).toBe("dissolve");
    // Alle 4 Klassen kommen unter den 30 Gegnern wirklich vor (echte Verteilung,
    // nicht die tautologische Ableitung aus allDeathFx()).
    const used = new Set(entries.map(([, e]) => deathClassFor(e.archetype)));
    expect(used).toEqual(new Set(CLASSES));
  });

  it("alle 4 Klassen sind paarweise in >= 3 Dimensionen unterscheidbar", () => {
    const specs = new Map(CLASSES.map((c) => [c, deathFxFor(c)]));
    for (let i = 0; i < CLASSES.length; i++) {
      for (let j = i + 1; j < CLASSES.length; j++) {
        const a = specs.get(CLASSES[i])!;
        const b = specs.get(CLASSES[j])!;
        const dims = differingDimensions(a, b);
        expect(dims.length, `${CLASSES[i]} vs ${CLASSES[j]}: ${dims.join(",")}`).toBeGreaterThanOrEqual(3);
        // Textur ist immer klasseneigen.
        expect(a.shard).not.toBe(b.shard);
      }
    }
  });

  it("Boss-Specs unterscheiden sich von Nicht-Boss-Specs (eigene Textur, >=2x Fläche)", () => {
    for (const cls of CLASSES) {
      const base = deathFxFor(cls, false);
      const boss = deathFxFor(cls, true);
      expect(boss.boss).toBe(true);
      expect(base.boss).toBe(false);
      expect(boss).not.toEqual(base);
      // Eigene Boss-Textur, nicht die Klassen-Textur.
      expect(boss.shard).toBe("fx_boss_core");
      expect(boss.shard).not.toBe(base.shard);
      // Fläche skaliert quadratisch mit scaleFrom: mindestens 2x.
      const areaRatio = (boss.scaleFrom / base.scaleFrom) ** 2;
      expect(areaRatio, `${cls}: ${areaRatio.toFixed(2)}x`).toBeGreaterThanOrEqual(2);
      // Mehr Partikel, länger (Shard und Staub), weiter gestreut.
      expect(boss.count).toBeGreaterThan(base.count);
      expect(boss.dustCount).toBeGreaterThan(base.dustCount);
      expect(boss.life).toBeGreaterThan(base.life);
      expect(boss.dustLife).toBeGreaterThan(base.dustLife);
      expect(boss.spread).toBeGreaterThan(base.spread);
    }
  });

  it("Specs sind deterministisch: zwei Läufe liefern identische Werte", () => {
    for (const cls of CLASSES) {
      const a = deathFxFor(cls);
      const b = deathFxFor(cls);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      const bossA = deathFxFor(cls, true);
      const bossB = deathFxFor(cls, true);
      expect(JSON.stringify(bossA)).toBe(JSON.stringify(bossB));
    }
    expect(JSON.stringify(allDeathFx())).toBe(JSON.stringify(allDeathFx()));
  });

  it("jede Klasse besitzt alle VFX-Felder und keine Gameplay-Werte", () => {
    for (const spec of allDeathFx()) {
      expect(spec.count).toBeGreaterThan(0);
      expect(spec.dustCount).toBeGreaterThan(0);
      expect(spec.life).toBeGreaterThan(0);
      expect(spec.dustLife).toBeGreaterThan(0);
      expect(spec.scaleFrom).toBeGreaterThan(spec.scaleTo);
      expect(spec.spread).toBeGreaterThan(0);
      // Eigene Kontur-Textur + dunkler Rim fuer harte Silhouette.
      expect(spec.rim).toBeTruthy();
      expect(spec.rimScale).toBeGreaterThan(1);
      expect(Number.isInteger(spec.rimTint)).toBe(true);
      expect(Number.isInteger(spec.tint)).toBe(true);
      expect(Number.isInteger(spec.dustTint)).toBe(true);
      // VFX-Spec trägt keine Schadens-/HP-/Hitbox-Felder.
      expect(spec).not.toHaveProperty("damage");
      expect(spec).not.toHaveProperty("hp");
      expect(spec).not.toHaveProperty("radius");
    }
  });
});
