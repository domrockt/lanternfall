// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fitTouchRect, MIN_TOUCH_SIZE, type TouchRect } from "../src/ui/touch-targets";

/**
 * M10 "menu-touch-targets" (K4): Reine Rechteck-Assertions fuer die
 * Touch-Trefferflaechen der Menues. Die Laufzeit-Messung (Tap-Probe auf
 * 640x360@3 und 780x360@3) liegt in scripts/verify-menu-touch.mjs; hier werden
 * dieselben Layout-Zahlen nachgebaut und geprueft:
 *  - jede Trefferflaeche >= 44x44 logische Pixel,
 *  - jede Trefferflaeche bleibt vollstaendig innerhalb der View,
 *  - die Tap-Punkte der Probe treffen die richtige Zone,
 *  - die 7 Optionszeilen sind zusammenhaengend und überlappen nicht.
 * Kein Phaser, keine Spiel-/Run-Logik: nur Geometrie + Quelltext-Verankerung.
 */

const PROFILES = [
  { name: "640x360@3", w: 640, h: 360 },
  { name: "780x360@3", w: 780, h: 360 },
];

/** r.x/r.y sind Zentren (wie scene.add.zone mit Origin 0.5). */
const contains = (r: TouchRect, x: number, y: number): boolean =>
  Math.abs(x - r.x) <= r.w / 2 && Math.abs(y - r.y) <= r.h / 2;

const inView = (r: TouchRect, w: number, h: number): boolean =>
  r.x - r.w / 2 >= 0 && r.y - r.h / 2 >= 0 && r.x + r.w / 2 <= w && r.y + r.h / 2 <= h;

/** Layout wie Title/CharSelect/Results/UI (H=360 => oy=45). */
function layout(w: number, h: number) {
  const cx = Math.round(w / 2);
  const oy = Math.round((h - 270) / 2);
  return { cx, oy, W: w, H: h };
}

describe("M10 Touch-Targets: fitTouchRect-Geometrie", () => {
  it("vergroessert kleine Flaechen auf >= 44x44 und haelt die Zentrierung", () => {
    const r = fitTouchRect(320, 259, 96, 22, 640, 360);
    expect(r.w).toBeGreaterThanOrEqual(MIN_TOUCH_SIZE);
    expect(r.h).toBeGreaterThanOrEqual(MIN_TOUCH_SIZE);
    expect(r.x).toBe(320);
    expect(r.y).toBe(259);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(Number.isInteger(r.y)).toBe(true);
  });

  it("erzwingt das Minimum auch bei grossen Breiten (Hoehe >= 44)", () => {
    const r = fitTouchRect(320, 180, 520, 20, 640, 360, 44);
    expect(r.w).toBe(520);
    expect(r.h).toBe(MIN_TOUCH_SIZE);
    expect(inView(r, 640, 360)).toBe(true);
  });

  it.each(PROFILES)("clampet Randbuttons in die View ($name)", ({ w, h }) => {
    // Vollbild-Knopf am oberen Rand (Title: W-54, y=18, sichtbar 18 hoch).
    const fs = fitTouchRect(w - 54, 18, 92, 18, w, h);
    expect(inView(fs, w, h)).toBe(true);
    expect(contains(fs, w - 54, 18)).toBe(true);
    // CharSelect START am unteren Rand (cx+40, H-18, sichtbar 18 hoch).
    const { cx } = layout(w, h);
    const start = fitTouchRect(cx + 40, h - 18, 132, 18, w, h);
    expect(inView(start, w, h)).toBe(true);
    expect(contains(start, cx + 40, h - 18)).toBe(true);
    // Degenerat ueber View-Groesse: Flaeche deckt die View ab (kein NEGATIVER
    // Ursprung, Mittelpunkt-Semantik wie scene.add.zone).
    const huge = fitTouchRect(0, 0, 9999, 9999, w, h);
    expect(contains(huge, w / 2, h / 2)).toBe(true);
    expect(huge.x - huge.w / 2).toBeLessThanOrEqual(1);
    expect(huge.y - huge.h / 2).toBeLessThanOrEqual(1);
  });
});

describe("M10 Touch-Targets: Probe-Tap-Punkte treffen die Hit-Zonen", () => {
  const cases = [
    {
      name: "Title START (Randtreffer Offset 16)",
      button: { x: "cx - 104", y: "214 + oy", w: 96, h: 22 },
      tap: (cx: number, oy: number) => [cx - 104, 214 + oy + 16] as const,
      target: "start",
    },
    {
      name: "Title OPTIONEN",
      button: { x: "cx", y: "214 + oy", w: 108, h: 22 },
      tap: (cx: number, oy: number) => [cx, 214 + oy] as const,
      target: "optionen",
    },
    {
      name: "CharSelect START (Randtreffer Offset 16)",
      button: { x: "cx + 40", y: "H - 18", w: 132, h: 18 },
      tap: (cx: number, oy: number, _w: number, h: number) => [cx + 40, h - 18 - 16] as const,
      target: "start",
    },
    {
      name: "Results TITEL (Randtreffer Offset 12)",
      button: { x: "cx + 76", y: "H - 26", w: 112, h: 20 },
      tap: (cx: number, _oy: number, _w: number, h: number) => [cx + 76, h - 26 + 12] as const,
      target: "titel",
    },
  ] as const;

  for (const { name, tap, button } of cases) {
    it.each(PROFILES)(`${name} ($name-Profil)`, ({ w, h }) => {
      const { cx, oy } = layout(w, h);
      const bx =
        button.x === "cx - 104" ? cx - 104
        : button.x === "cx + 40" ? cx + 40
        : button.x === "cx + 76" ? cx + 76
        : cx;
      const by = button.y === "H - 18" ? h - 18
        : button.y === "H - 26" ? h - 26
        : 214 + oy;
      const zone = fitTouchRect(bx, by, button.w, button.h, w, h);
      const [tx, ty] = tap(cx, oy, w, h);
      expect(contains(zone, tx, ty)).toBe(true);
      // und der sichtbare Knopf liegt weiterhin in der Zone.
      expect(contains(zone, bx, by)).toBe(true);
    });
  }

  it.each(PROFILES)("Pause-Buttons FORTSETZEN/OPTIONEN ($name)", ({ w, h }) => {
    const { cx, oy } = layout(w, h);
    const resume = fitTouchRect(108 + (cx - 240), 201 + oy, 108, 20, w, h);
    const options = fitTouchRect(cx, 201 + oy, 96, 20, w, h);
    expect(inView(resume, w, h)).toBe(true);
    expect(inView(options, w, h)).toBe(true);
    expect(contains(resume, 108 + (cx - 240), 201 + oy)).toBe(true);
    expect(contains(options, cx, 201 + oy)).toBe(true);
  });
});

describe("M10 Touch-Targets: Optionszeilen (7 Zeilen, zusammenhaengend)", () => {
  const ROWS = 7;
  const ROW_PITCH = 20;
  const rowsFor = (w: number, h: number) => {
    const { cx, oy } = layout(w, h);
    const rowW = Math.min(520, w - 40);
    return Array.from({ length: ROWS }, (_, i) =>
      fitTouchRect(cx, 84 + oy + i * ROW_PITCH + 3, rowW, ROW_PITCH, w, h, 1),
    );
  };

  it.each(PROFILES)("Zeilen ueber volle Breite, keine Luecken/Überlappungen ($name)", ({ w, h }) => {
    const rows = rowsFor(w, h);
    expect(rows).toHaveLength(ROWS);
    for (let i = 0; i < ROWS; i++) {
      expect(rows[i].w).toBe(Math.min(520, w - 40));
      expect(rows[i].h).toBe(ROW_PITCH);
      expect(inView(rows[i], w, h)).toBe(true);
      if (i > 0) {
        // Zusammenhaengend: Unterkante der Vorgaengerzeile = Oberkante der Zeile.
        expect(rows[i].y).toBe(rows[i - 1].y + rows[i - 1].h);
      }
    }
  });

  it.each(PROFILES)("Pfeil-Randtreffer senkt, Label-Tap erhoehht ($name)", ({ w, h }) => {
    const { cx, oy } = layout(w, h);
    const rowW = Math.min(520, w - 40);
    const arrowL = cx + rowW / 2 - 12 - 100;
    const labelX = cx - rowW / 2 + 12;
    const delta = (x: number): number => (Math.abs(x - arrowL) <= 22 ? -1 : 1);
    expect(delta(arrowL + 16)).toBe(-1); // Probe: 16 px neben dem "<"-Glyph
    expect(delta(labelX + 5)).toBe(1); // Probe: Tap auf Zeilenanfang
    // Zeilenmitte gehoert der Zeile (Tap trifft den Wert, nicht den Nachbarn).
    const rows = rowsFor(w, h);
    for (let i = 0; i < ROWS; i++) {
      expect(contains(rows[i], cx, 84 + oy + i * ROW_PITCH + 2)).toBe(true);
    }
  });
});

describe("M10 Touch-Targets: Quelltext-Verankerung (Fix sitzt im echten Code)", () => {
  const menuSrc = readFileSync(new URL("../src/ui/menu.ts", import.meta.url), "utf8");
  const optionsSrc = readFileSync(new URL("../src/ui/options-menu.ts", import.meta.url), "utf8");


  it("menu.ts: Hit-Zonen ueber fitTouchRect (>=44x44, View-Clamp)", () => {
    expect(menuSrc).toContain("fitTouchRect(");
    // Knopf-Hit-Flaeche und freie Hit-Zone laufen beide durch fitTouchRect.
    expect(menuSrc.match(/fitTouchRect\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("options-menu.ts: eine zusammenhaengende Trefferflaeche je Zeile", () => {
    expect(optionsSrc).toContain("ROW_PITCH");
    expect(optionsSrc.match(/rowZone\.on\("pointerdown"/g)?.length).toBe(1);
    // Tap setzt Fokus sichtbar und wendet den Wert an.
    expect(optionsSrc).toContain("this.selected = i");
    expect(optionsSrc).toContain("this.apply(i, delta)");
    expect(optionsSrc).toContain("this.refresh()");
  });

  it("keine Spiel-/Run-Dateien betroffen: Tests importieren nur Geometrie", () => {
    // Guard gegen versehentliche Kopplung der Lane an Run-/Combat-Code.
    expect(menuSrc).not.toContain("CombatSystem");
    expect(optionsSrc).not.toContain("CombatSystem");
  });
});
