import { describe, expect, it, vi } from "vitest";
// UI.ts importiert Phaser (Szene); die gepruefte Panel-Box-Mathematik ist rein.
// Phaser wird neutral gemockt (Muster tests/chest-panel-ui.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import {
  LEVELUP_CARD_GAP,
  LEVELUP_FOCUS_CONTRAST_MIN,
  LEVELUP_ICON_SCALE,
  LEVELUP_TITLE_SCALE,
  levelUpPanelBoxes,
  type AnchorBox,
} from "../src/scenes/UI";
import { LevelUpSystem } from "../src/systems/LevelUpSystem";
import { SeededRng } from "../src/logic/rng";

// m10-levelup-panel-crisp K4: Regression fuer das Level-Up-Panel (3 Angebote).
// Befund K1 (~/games/.evidence/m10-levelup-panel-crisp/m10-levelup-panel-before.json):
// die Trennlinie lag falsch geankert (Origin 0.5 statt linker Kante) und kreuzte
// in allen 3 Formaten Kartenrand und Panelrahmen (5 Ueberlappungen je Format,
// left = -10 bei 640x360). K2-Fix: setOrigin(0, 0.5) -> Trennlinie vollstaendig
// in der eigenen Karte. K3: Fokus-Kontrast >= 3:1 (gemessen 11.9:1) und
// Fokusgleichheit je Eingabeart (Hover-Guard, Muster options-touch-focus).
// Die Angebotslogik bleibt bitgleich (K1-Snapshot, 3 Seeds).

const PROFILES = [
  { label: "640x360", width: 640, height: 360 },
  { label: "780x360", width: 780, height: 360 },
  { label: "960x540", width: 960, height: 540 },
];

function overlaps(a: AnchorBox, b: AnchorBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("levelup-panel-crisp: ganzzahlige Skalen (Mixel-Regel)", () => {
  it("alle im Panel verwendeten Skalen sind ganzzahlig", () => {
    expect(Number.isInteger(LEVELUP_TITLE_SCALE)).toBe(true);
    expect(Number.isInteger(LEVELUP_ICON_SCALE)).toBe(true);
  });

  it("alle Panel-Boxen liegen auf Spielpixeln (ganzzahlige Anker)", () => {
    for (const p of PROFILES) {
      const boxes = levelUpPanelBoxes(p.width, p.height);
      for (const [name, b] of Object.entries(boxes)) {
        expect(Number.isInteger(b.x)).toBe(true);
        expect(Number.isInteger(b.y)).toBe(true);
        expect(Number.isInteger(b.w)).toBe(true);
        expect(Number.isInteger(b.h)).toBe(true);
      }
    }
  });
});

describe("levelup-panel-crisp: 0 Überlappungen (K1-Kriterium)", () => {
  it("Karten, Titel, Untertitel, Evo-Hinweis und Fußzeile überlappen nie", () => {
    for (const p of PROFILES) {
      const b = levelUpPanelBoxes(p.width, p.height);
      const chrome = ["title", "subtitle", "hint-0", "hint-1", "foot"];
      const cards = ["card-0", "card-1", "card-2"];
      for (const c of chrome) {
        for (const card of cards) {
          expect(overlaps(b[c], b[card]), `${p.label} ${c} vs ${card}`).toBe(false);
        }
      }
      for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
          expect(overlaps(b[cards[i]], b[cards[j]]), `${p.label} ${cards[i]} vs ${cards[j]}`).toBe(false);
        }
      }
    }
  });

  it("Trennlinie liegt vollständig in der eigenen Karte (K2-Fix, inset 4 px)", () => {
    for (const p of PROFILES) {
      const b = levelUpPanelBoxes(p.width, p.height);
      for (let i = 0; i < 3; i++) {
        const d = b[`divider-${i}`];
        const c = b[`card-${i}`];
        expect(d.x).toBeGreaterThanOrEqual(c.x);
        expect(d.x + d.w).toBeLessThanOrEqual(c.x + c.w);
        expect(d.x - c.x).toBe(4);
        expect(c.x + c.w - (d.x + d.w)).toBe(4);
        for (let j = 0; j < 3; j++) {
          if (j !== i) expect(overlaps(d, b[`card-${j}`]), `${p.label} divider-${i} vs card-${j}`).toBe(false);
        }
      }
    }
  });

  it("Karten-Inhalt (Nummer, Name, Stufe, Beschreibung, Icon, Trennlinie) überlappt sich nie", () => {
    for (const p of PROFILES) {
      const b = levelUpPanelBoxes(p.width, p.height);
      const parts = (i: number) => [
        `number-${i}`, `name-${i}`, `level-${i}`,
        `desc-${i}-0`, `desc-${i}-1`, `desc-${i}-2`,
        `divider-${i}`, `icon-${i}`,
      ];
      for (let i = 0; i < 3; i++) {
        const keys = parts(i);
        for (let a = 0; a < keys.length; a++) {
          for (let c = a + 1; c < keys.length; c++) {
            expect(overlaps(b[keys[a]], b[keys[c]]), `${p.label} ${keys[a]} vs ${keys[c]}`).toBe(false);
          }
        }
      }
    }
  });

  it("alle Panel-Inhalte liegen im Rahmen und im Viewport", () => {
    for (const p of PROFILES) {
      const b = levelUpPanelBoxes(p.width, p.height);
      for (const [name, box] of Object.entries(b)) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w).toBeLessThanOrEqual(p.width);
        expect(box.y + box.h).toBeLessThanOrEqual(p.height);
        // foot liegt by design am unteren Bildrand, unterhalb des Rahmens.
        if (name === "foot") continue;
        expect(box.x).toBeGreaterThanOrEqual(b.frame.x);
        expect(box.x + box.w).toBeLessThanOrEqual(b.frame.x + b.frame.w);
        expect(box.y).toBeGreaterThanOrEqual(b.frame.y);
        expect(box.y + box.h).toBeLessThanOrEqual(b.frame.y + b.frame.h);
      }
    }
  });

  it("Kartenabstand entspricht LEVELUP_CARD_GAP (Sichtbarkeit der Trennung)", () => {
    const b = levelUpPanelBoxes(640, 360);
    expect(b["card-1"].x - (b["card-0"].x + b["card-0"].w)).toBe(LEVELUP_CARD_GAP);
    expect(b["card-2"].x - (b["card-1"].x + b["card-1"].w)).toBe(LEVELUP_CARD_GAP);
  });
});

describe("levelup-panel-crisp: Fokus-Kontrast (K3)", () => {
  it("Abnahmegrenze ist >= 3:1 (gemessen 11.9:1, Selekt-Rahmen ffd77a auf nightMid)", () => {
    expect(LEVELUP_FOCUS_CONTRAST_MIN).toBeGreaterThanOrEqual(3);
  });
});

// Angebots-Snapshot (K1-Vorher, scripts/m10-levelup-panel.mjs Phase A bzw.
// Live-Run seed 101: identische Werte). Bitgleichheit: id/level/isNew/Reihenfolge.
const OFFERS_SNAPSHOT: Record<number, Array<{ kind: string; id: string; level: number; isNew: boolean }>> = {
  101: [
    { kind: "weapon", id: "ember", level: 2, isNew: false },
    { kind: "passive", id: "whetstone", level: 1, isNew: true },
    { kind: "passive", id: "tome", level: 1, isNew: true },
  ],
  202: [
    { kind: "weapon", id: "ember", level: 2, isNew: false },
    { kind: "passive", id: "hourglass", level: 1, isNew: true },
    { kind: "weapon", id: "storm", level: 1, isNew: true },
  ],
  303: [
    { kind: "passive", id: "whetstone", level: 1, isNew: true },
    { kind: "passive", id: "tome", level: 1, isNew: true },
    { kind: "weapon", id: "ember", level: 2, isNew: false },
  ],
};

describe("levelup-panel-crisp: Angebotslogik bitgleich (K1-Snapshot)", () => {
  for (const [seedStr, expected] of Object.entries(OFFERS_SNAPSHOT)) {
    const seed = Number(seedStr);
    it(`Seed ${seed}: generateOffers liefert exakt die Vorher-Angebote in Reihenfolge`, () => {
      const sys = new LevelUpSystem("ember", 1);
      const offers = sys.offers(new SeededRng(seed));
      expect(offers.length).toBe(3);
      expect(offers.map((o) => ({ kind: o.kind, id: o.id, level: o.level, isNew: o.isNew })))
        .toEqual(expected);
    });
  }
});
