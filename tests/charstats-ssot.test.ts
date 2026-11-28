// Lane m10-charstats-ssot K3: SSOT-Guard für die Charakter-Startwerte.
//
// GAME.md (Z. 34/35) ist die verbindliche Design-Spec für Mira/Kael; dieser
// Test pinnt die korrigierten Werte aus src/data/characters.ts, damit die
// Datenbasis nicht erneut vom Spec abdriftet (Befund 2026-11-28: CharSelect
// zeigte Mira "HP 250", Spec sagt HP 90). Je Zeile steht der GAME.md-Anker
// als Kommentar — ein Rückfall fällt sofort als Spec-Verstoß auf.
//
// Offene Spec-Fragen (F1–F5) sind in docs/lanes/m10-charstats-ssot.md und
// coding-brain/Lead/Fragen an Dom.md dokumentiert; hier wird bewusst nur der
// IST-Stand relativ geprüft (Kael tankt mehr/weniger als Mira), damit ein
// Dom-Entscheid nicht zwangsläufig diesen Guard bricht.
import { describe, expect, it } from "vitest";
import { CHARACTER_LIST } from "../src/data/characters";
import { WEAPONS } from "../src/data/weapons";

const mira = CHARACTER_LIST.find((c) => c.id === "mira")!;
const kael = CHARACTER_LIST.find((c) => c.id === "kael")!;

/** Effektive Start-HP wie in Run.recomputeStats (src/scenes/Run.ts). */
const effectiveHp = (c: (typeof CHARACTER_LIST)[number]) =>
  Math.round(c.hp * (1 + (c.mods.maxHpPct ?? 0) / 100)) + (c.mods.maxHpFlat ?? 0);

describe("charstats-ssot: Charakter-Startwerte folgen GAME.md (Z. 34/35)", () => {
  it("Mira: HP 90 (GAME.md:34 — Regression gegen den 250er-Drift)", () => {
    expect(mira.hp).toBe(90);
  });

  it("Mira: Tempo 62, +10 % Fläche, Start Glutfunke (GAME.md:34, Z. 173)", () => {
    expect(mira.speed).toBe(62);
    expect(mira.mods.areaPct).toBe(10);
    expect(mira.startWeapon).toBe("ember");
    expect(WEAPONS[mira.startWeapon].name).toBe("Glutfunke");
  });

  it("Kael: HP 130, Start Kettenflegel (GAME.md:35)", () => {
    expect(kael.hp).toBe(130);
    expect(kael.startWeapon).toBe("flail");
    expect(WEAPONS[kael.startWeapon].name).toBe("Kettenflegel");
  });

  it("relativ: Kael tankt mehr, Mira ist schneller (GAME.md:34/35 Rollen)", () => {
    expect(effectiveHp(kael)).toBeGreaterThan(effectiveHp(mira));
    expect(mira.speed).toBeGreaterThan(kael.speed);
    // Ist-Stand bis F5 (Kael armor 2 vs Spec "1 Rüstung") entschieden ist.
    expect(kael.armor).toBeGreaterThanOrEqual(mira.armor);
  });

  it("sinnvolle Startwerte: beide Helden komplett (id, hp, speed, armor, Waffe, Sprite)", () => {
    for (const c of CHARACTER_LIST) {
      expect(c.hp).toBeGreaterThan(0);
      expect(c.speed).toBeGreaterThan(0);
      expect(c.armor).toBeGreaterThanOrEqual(0);
      expect(c.spriteKey).toMatch(/^player_/);
      expect(WEAPONS[c.startWeapon]).toBeTruthy();
    }
  });
});
