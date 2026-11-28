// m10-charselect-truth K3: SSOT-Guard für den Charakter-Auswahl-Screen.
//
// Der CharSelect-Screen zeigt Startwerte (Name, Titel, HP/TEMPO/RÜSTUNG,
// Bonus, Startwaffe). Dieser Test stellt sicher, dass jede ANGEZEIGTE Zeile
// exakt dem Datenwert in src/data entspricht — für beide Charaktere.
//
// Quelle der angezeigten Zeilen: shots/m10-charselect-truth-after.json,
// erzeugt von scripts/m10-charselect-truth.mjs (headless CharSelect-Render,
// Extraktion aller PixelText-Objekte). Die Erwartungswerte werden hier
// unabhängig aus src/data/characters.ts + weapons.ts abgeleitet.
// Bei Daten- oder Anzeige-Änderung: Skript neu laufen lassen
// (`node scripts/m10-charselect-truth.mjs --phase=after`) und after-JSON
// mitcommitten — dann muss dieser Test weiterhin grün sein.
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHARACTER_LIST } from "../src/data/characters";
import { WEAPONS } from "../src/data/weapons";

const GAME_WIDTH = 640; // src/config.ts (m10-view-fill); CharSelect-Panel-Layout
const PANEL_OFFSET = 224; // CharSelect.ts: x = GAME_WIDTH/2 + (i - 0.5) * 224
const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

interface DisplayLine { text: string; x: number; y: number }
interface TruthJson {
  phase: string;
  jsErrors: string[];
  deviations: Array<{ char: string; field: string; kind: string; expected: unknown; actual: unknown }>;
  displayLines: DisplayLine[];
}

const truth = JSON.parse(
  readFileSync(new URL("../shots/m10-charselect-truth-after.json", import.meta.url), "utf8"),
) as TruthJson;

const pct = (v: number): string => `${v >= 0 ? "+" : ""}${v}%`;

/** Erwartete Bonus-Zeile, abgeleitet aus char.mods (gleicher Anzeige-Scope
 * wie CharSelect.bonusText: areaPct, maxHpPct, moveSpeedPct). */
function expectedBonus(mods: Record<string, number | undefined>): string {
  const parts: string[] = [];
  if (mods.areaPct) parts.push(`${pct(mods.areaPct)} FLÄCHENWIRKUNG`);
  if (mods.maxHpPct) parts.push(`${pct(mods.maxHpPct)} MAX-HP`);
  if (mods.moveSpeedPct) parts.push(`${pct(mods.moveSpeedPct)} TEMPO`);
  return parts.join(" / ");
}

/** Zeilen dem Panel zuordnen: nächstes Panelzentrum gewinnt; exakt mittig
 * liegende Header/Buttons (d0 === d1) gehören zu keinem Charakter. */
function panelOf(line: DisplayLine, index: number): boolean {
  const center = GAME_WIDTH / 2 + (index - 0.5) * PANEL_OFFSET;
  const other = GAME_WIDTH / 2 + ((1 - index) - 0.5) * PANEL_OFFSET;
  return Math.abs(line.x - center) < Math.abs(line.x - other);
}

describe("charselect-truth: Anzeige == src/data (SSOT)", () => {
  it("after-JSON stammt von der CharSelect-Szene ohne JS-Fehler und ohne Skript-Abweichungen", () => {
    expect(truth.phase).toBe("after");
    expect(truth.jsErrors).toEqual([]);
    expect(truth.deviations).toEqual([]);
  });

  it("zeigt keine JS-Fehler beim Rendern", () => {
    expect(truth.jsErrors).toEqual([]);
  });

  for (const [index, char] of CHARACTER_LIST.entries()) {
    it(`${char.name}: Name, Titel und Startwerte stimmen mit src/data überein`, () => {
      const lines = truth.displayLines.filter((l) => panelOf(l, index)).map((l) => norm(l.text));
      const expectLine = (label: string, expected: string) => {
        expect(lines, `${label}: erwartet "${expected}" im Panel von ${char.name}`).toContain(expected);
      };

      expectLine("Name", norm(char.name));
      expectLine("Titel", norm(char.title.toUpperCase()));
      expectLine("HP", `HP ${char.hp}`);
      expectLine("TEMPO", `TEMPO ${char.speed}`);
      expectLine("RÜSTUNG", `RÜSTUNG ${char.armor}`);
      expectLine("Bonus", expectedBonus(char.mods as unknown as Record<string, number | undefined>));
      expectLine("Startwaffe", `START: ${WEAPONS[char.startWeapon].name.toUpperCase()}`);
    });
  }

  it("Kael-Bonus folgt den Daten (Regression für den +20%-Befund, Daten sagen maxHpPct 25)", () => {
    const kael = CHARACTER_LIST.find((c) => c.id === "kael")!;
    expect(kael.mods.maxHpPct).toBe(20); // Spec GAME.md Z.35 "+20 % Max-HP" (F4-Entscheid)
    const kaelLines = truth.displayLines
      .filter((l) => panelOf(l, CHARACTER_LIST.findIndex((c) => c.id === "kael")))
      .map((l) => norm(l.text));
    expect(kaelLines).toContain("+20% MAX-HP"); // F3: moveSpeedPct entfernt ⇒ kein "-5% TEMPO" mehr
    expect(kaelLines.some((t) => t.includes("+25%"))).toBe(false);
  });
});
