import { describe, expect, it } from "vitest";
import { computeView, type DeviceInput } from "../src/logic/view";
import { layoutResultRows, resultsLayout, stressEntries, type Rect } from "../src/logic/results";

/**
 * M10-Results-Overlap: der Ergebnis-Screen muss bei ALLEN bekannten
 * Aufloesungsprofilen ohne Ueberlappungen und ohne Clipping rendern
 * (Nachabnahme-Blocker "Results-Screen-Overlap", art-director FAIL 3,25/5).
 *
 * Der Test spiegelt die Szenen-Positionen aus src/scenes/Results.ts
 * (Untertitel 40+oy, Portrait cx-169, Labels cx-114, rowsTop 68, Banner,
 * Knöpfe, Fusszeile) und prueft sie gegen dieselben Rechtecke, die auch die
 * Szene zeichnet - Szene und Test sehen denselben Satz an Boxen.
 */

/** Die 5 bekannten M8-Geraete (verify-display.mjs) + die 2 Abnahme-Views. */
const DEVICES: DeviceInput[] = [
  { width: 640, height: 360, dpr: 1 }, // Fit-Rueckfall: logisch 480x360
  { width: 780, height: 360, dpr: 3 }, // Abnahme-View 780x360@3
  { width: 844, height: 390, dpr: 3 }, // iphone14
  { width: 915, height: 412, dpr: 2 }, // pixel7
  { width: 1366, height: 768, dpr: 1 }, // laptop
];

interface Box {
  id: string;
  rect: Rect;
  /** darf aus dem Panel ragen (Knöpfe/Fusszeile unterhalb des Panels) */
  outsidePanel?: boolean;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contained(small: Rect, big: Rect): boolean {
  return small.x >= big.x && small.y >= big.y &&
    small.x + small.w <= big.x + big.w + 0.5 && small.y + small.h <= big.y + big.h + 0.5;
}

function textRect(x: number, y: number, chars: number, align: "left" | "center" = "left"): Rect {
  const w = Math.max(1, chars * 6 - 1);
  return { x: align === "center" ? x - Math.floor(w / 2) : x, y, w, h: 7 };
}

/** Szenen-Chrome + Layout als Boxliste (Coordinates = Results.ts). */
function sceneBoxes(width: number, victory: boolean, god: boolean): { boxes: Box[]; panel: Rect; canvas: { w: number; h: number } } {
  const H = 360;
  const cx = width / 2;
  const oy = Math.round((H - 270) / 2);
  const rowsTop = 68;
  const layout = layoutResultRows(stressEntries(), { width, oy, rowsTop });

  const title = victory ? "MORGENDÄMMERUNG" : "DIE LATERNE ERLISCHT";
  const subtitle = victory ? "SIEG - DU HAST ÜBERLEBT" : "NIEDERLAGE";
  const boxes: Box[] = [
    // Titel ist scale 2 -> Doppelte Hoehe/Breite, top-anchored bei 24+oy.
    { id: "title", rect: { x: cx - Math.floor((title.length * 12 - 2) / 2), y: 24 + oy, w: title.length * 12 - 2, h: 14 } },
    { id: "subtitle", rect: textRect(cx, 40 + oy, subtitle.length, "center") },
    { id: "header", rect: layout.header },
    { id: "total", rect: layout.totalLabel },
    { id: "divider", rect: layout.divider },
    { id: "bannerBox", rect: { x: cx - 118 - 82, y: 196 + oy - 8.5, w: 164, h: 17 } },
    { id: "bannerText", rect: textRect(cx - 118, 193 + oy, 26, "center") },
    { id: "portrait", rect: { x: cx - 169 - 48, y: 72 + oy - 48, w: 96, h: 96 } },
    { id: "charLabel", rect: textRect(cx - 114, 58 + oy, "CHARAKTER".length) },
    { id: "charName", rect: textRect(cx - 114, 70 + oy, 14) },
    { id: "zeit", rect: textRect(cx - 200, 134 + oy, "ZEIT: 30:10".length) },
    { id: "kills", rect: textRect(cx - 200, 148 + oy, "KILLS: 99999".length) },
    { id: "level", rect: textRect(cx - 200, 162 + oy, "LEVEL: 99".length) },
    { id: "buttonNeu", rect: { x: cx - 94 - 68, y: H - 26 - 10, w: 136, h: 20 }, outsidePanel: true },
    { id: "buttonTitel", rect: { x: cx + 76 - 56, y: H - 26 - 10, w: 112, h: 20 }, outsidePanel: true },
    { id: "footer", rect: textRect(cx, H - 9, "ENTER/PFEILE ODER MAUS".length, "center"), outsidePanel: true },
  ];
  for (const row of layout.rows) {
    boxes.push({ id: `${row.id}:icon`, rect: { x: row.icon.x, y: row.icon.y, w: row.icon.w, h: row.icon.h } });
    row.nameRects.forEach((rect, i) => boxes.push({ id: `${row.id}:name${i}`, rect }));
    boxes.push({ id: `${row.id}:bar`, rect: row.barBg });
    boxes.push({ id: `${row.id}:value`, rect: row.valueRect });
  }
  return { boxes, panel: { x: cx - 220, y: 11 + oy, w: 440, h: 250 }, canvas: { w: width, h: H } };
}

function findConflicts(width: number, victory: boolean, god: boolean): string[] {
  const { boxes, panel, canvas } = sceneBoxes(width, victory, god);
  const conflicts: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (!intersects(a.rect, b.rect)) continue;
      // Text im eigenen Banner-Rahmen ist Absicht; sonst ist jede Beruehrung
      // ein Konflikt.
      if ((a.id === "bannerBox" && b.id === "bannerText") || (a.id === "bannerText" && b.id === "bannerBox")) continue;
      conflicts.push(`${a.id}|${b.id}`);
    }
  }
  for (const box of boxes) {
    if (!box.outsidePanel && !contained(box.rect, panel)) conflicts.push(`panelClip|${box.id}`);
    if (box.rect.x < -0.5 || box.rect.y < -0.5 ||
      box.rect.x + box.rect.w > canvas.w + 0.5 || box.rect.y + box.rect.h > canvas.h + 0.5) {
      conflicts.push(`canvasClip|${box.id}`);
    }
  }
  if (god) {
    // GOTT-MODUS-Zeile (nur Debug) endet bei cx-200+161 und darf die
    // Trennlinie (cx-35) nicht beruehren.
    const godRect = textRect(width / 2 - 200, 176 + Math.round((360 - 270) / 2), "GOTT-MODUS - NICHT GEWERTET".length);
    if (godRect.x + godRect.w >= width / 2 - 35) conflicts.push("divider|god");
  }
  return conflicts;
}

describe("M10 Results-Overlap: 0 Ueberlappungen an allen Aufloesungsprofilen", () => {
  for (const device of DEVICES) {
    const spec = computeView(device);
    it(`${device.width}x${device.height}@${device.dpr} -> View ${spec.width}x${spec.height}: Victory und Defeat ohne Konflikte`, () => {
      expect(spec.height).toBe(360);
      for (const victory of [true, false]) {
        expect(findConflicts(spec.width, victory, false)).toEqual([]);
      }
    });
  }

  it("GOTT-MODUS-Zeile (Debug) beruehrt die Trennlinie nicht", () => {
    for (const device of DEVICES) {
      expect(findConflicts(computeView(device).width, false, true)).toEqual([]);
    }
  });

  it("Kopfblock hat >=2px Abstand: Untertitel-Ende 47+oy, Header 50+oy, Total rowsTop-9", () => {
    const oy = 45;
    const layout = resultsLayout({ ember: 900 }, { width: 780, oy, rowsTop: 68 });
    expect(layout.header.y).toBe(50 + oy);
    expect(layout.totalLabel.y).toBe(59 + oy);
    expect(layout.rows[0].y).toBe(68 + oy);
    expect(layout.header.y - (40 + oy + 7)).toBeGreaterThanOrEqual(2);
    expect(layout.totalLabel.y - (layout.header.y + 7)).toBeGreaterThanOrEqual(2);
    expect(layout.rows[0].icon.y - (layout.totalLabel.y + 7)).toBeGreaterThanOrEqual(1);
  });

  it("12 Waffennamen vollstaendig (2 Zeilen, keine Zeichen verloren)", () => {
    const layout = layoutResultRows(stressEntries(), { width: 480, oy: 45, rowsTop: 68 });
    expect(layout.rows).toHaveLength(12);
    for (const row of layout.rows) {
      expect(row.lines.length).toBeLessThanOrEqual(2);
      expect(row.lines.join("")).toBe(row.name.toUpperCase());
    }
  });

  it("12 Zeilen enden ueber der Panel-Unterkante (kein Clipping, beide Abnahme-Views)", () => {
    for (const width of [480, 780]) {
      const oy = 45;
      const layout = layoutResultRows(stressEntries(), { width, oy, rowsTop: 68 });
      const last = layout.rows[layout.rows.length - 1];
      const iconBottom = last.icon.y + last.icon.h;
      expect(iconBottom).toBeLessThanOrEqual(261 + oy - 2);
    }
  });
});
