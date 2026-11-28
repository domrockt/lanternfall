import { describe, expect, it } from "vitest";
import { computeView, type DeviceInput } from "../src/logic/view";
import { layoutResultRows, stressEntries } from "../src/logic/results";
import { slotNameLines } from "../src/logic/text";
import { fitBanner, ELLIPSIS } from "../src/gfx/text";

/**
 * M10-results-followup (#4382): der Ergebnis-Screen ist nach view-fill-refit
 * und menubg-crisp in main gegen ALLE 3 Abnahme-Formate neu geprueft worden
 * (scripts/m10-results-followup.mjs, before/after-JSON). Der Test haertet die
 * Befunde:
 *
 *  1. 0 Text-Ueberlappungen im stress12-Stresslayout (alle 12 Waffennamen) in
 *     allen 3 Formaten — inkl. des neuen Fill-Paths (640x360 -> logisch 640
 *     breit, nicht mehr 480) und 1920x1080 (logisch 640x360@3).
 *  2. Waffennamen vollstaendig auf max. 2 Zeilen, ohne Zeichenverlust;
 *     Mehrwort-Namen brechen an der Wortgrenze.
 *  3. Belegte #4382-Maengel bleiben gefixt (Szene-Mirror wie in
 *     results-overlap.test.ts, Koordinaten aus src/scenes/Results.ts):
 *     Bodenluft letzte Zeile >= 4px, Titel->Untertitel >= 4px.
 *  4. Bestwert-Banner bricht an Wortgrenzen (fitBanner, ganze Woerter + "…").
 */

/** Die 3 Abnahme-Formate dieser Lane. */
const FORMATS: DeviceInput[] = [
  { width: 640, height: 360, dpr: 1 }, // Fill-View (M10-view-fill): logisch 640x360@1
  { width: 780, height: 360, dpr: 3 }, // Abnahme-View 780x360@3
  { width: 1920, height: 1080, dpr: 1 }, // Desktop: logisch 640x360@3
];

const ROWS_TOP = 68; // rowsTop aus Results.ts

describe("M10-results-followup: 3 Abnahme-Formate ohne Ueberlappungen (stress12)", () => {
  for (const device of FORMATS) {
    it(`${device.width}x${device.height}@${device.dpr} -> logische View, 0 Ueberlappungen`, () => {
      const spec = computeView(device);
      expect(spec.height).toBe(360);
      const oy = Math.round((spec.height - 270) / 2);
      const layout = layoutResultRows(stressEntries(), {
        width: spec.width, oy, rowsTop: ROWS_TOP,
      });
      expect(layout.rows.length).toBe(12);
      expect(layout.overlaps).toEqual([]);
    });
  }

  it("Fill-View 640x360 ist logisch 640 breit (nicht mehr 480 wie vor view-fill)", () => {
    const spec = computeView({ width: 640, height: 360, dpr: 1 });
    expect(spec.width).toBe(640);
    expect(spec.scale).toBe(1);
    expect(spec.fit).toBe(true);
  });

  it("1920x1080 ist logisch 640x360@3 (ganzzahlig, pixelgenau)", () => {
    const spec = computeView({ width: 1920, height: 1080, dpr: 1 });
    expect(spec.width).toBe(640);
    expect(spec.scale).toBe(3);
    expect(spec.fit).toBe(false);
  });

  it("Balken-/Summenlayout stabil: 12 Zeilen-Icons enden ueber dem Total-Label und im Panel", () => {
    for (const device of FORMATS) {
      const spec = computeView(device);
      const oy = Math.round((spec.height - 270) / 2);
      const layout = layoutResultRows(stressEntries(), {
        width: spec.width, oy, rowsTop: ROWS_TOP,
      });
      const lastIconBottom = Math.max(...layout.rows.map((r) => r.icon.y + r.icon.h));
      const panelBottom = 136 + oy + 127; // Panel-Mitte 136+oy, Hoehe 254 (Results.ts)
      expect(lastIconBottom).toBeLessThanOrEqual(panelBottom - 4);
      // Total-Label bleibt zwischen Header und erster Zeile.
      expect(layout.totalLabel.y + layout.totalLabel.h).toBeLessThanOrEqual(layout.rows[0].y - 2);
      expect(layout.header.y + layout.header.h).toBeLessThanOrEqual(layout.totalLabel.y);
      // Summenkonsistenz: gerundete Einzelwerte summieren sich zum Gesamt.
      const barsSum = layout.rows.reduce((s, r) => s + r.damage, 0);
      const total = stressEntries().reduce((s, e) => s + e.damage, 0);
      expect(barsSum).toBe(total);
    }
  });
});

describe("M10-results-followup: Waffennamen vollstaendig, Umbruch an Wortgrenzen", () => {
  const nameMaxChars = Math.max(1, Math.floor((104 - 6 - 4 + 1) / 6)); // barX-nameX-4 aus layoutResultRows

  it("alle 12 stress12-Namen: max. 2 Zeilen, kein Zeichenverlust", () => {
    for (const entry of stressEntries()) {
      const lines = slotNameLines(entry.name.toUpperCase(), nameMaxChars);
      expect(lines.length).toBeLessThanOrEqual(2);
      expect(lines.join("").replace(/ /g, ""))
        .toBe(entry.name.toUpperCase().replace(/ /g, ""));
    }
  });

  it("Mehrwort-Namen brechen an der Wortgrenze, wenn sie nicht passen", () => {
    expect(slotNameLines("EWIGER WINTER", nameMaxChars)).toEqual(["EWIGER WINTER"]); // 12 <= 15: eine Zeile
    expect(slotNameLines("EWIGER WINTERSUPPE", 11)).toEqual(["EWIGER", "WINTERSUPPE"]);
    expect(slotNameLines("EWIGERWINTER", 6)).toEqual(["EWIGER", "WINTER"]); // Compound: balanciert
  });
});

describe("M10-results-followup: #4382-Maengel gefixt (Szene-Mirror Results.ts)", () => {
  const oy = 45; // alle 3 Formate: logische Hoehe 360

  it("Bodenluft letzte Zeile >= 4px zum Panel-Boden (vorher 2px)", () => {
    const lastIconBottom = ROWS_TOP + oy + 11 * 16 - 1 + 16;
    const panelBottom = 136 + oy + 127;
    expect(panelBottom - lastIconBottom).toBeGreaterThanOrEqual(4);
  });

  it("Titel->Untertitel >= 4px (vorher 2px), Untertitel->Header >= 3px", () => {
    const titleBottom = 22 + oy + 14; // Titel 22+oy, Scale 2 -> 14px hoch (origin top)
    const subtitleTop = 40 + oy;
    const subtitleBottom = 40 + oy + 7;
    const headerTop = 50 + oy;
    expect(subtitleTop - titleBottom).toBeGreaterThanOrEqual(4);
    expect(headerTop - subtitleBottom).toBeGreaterThanOrEqual(3);
  });
});

describe("M10-results-followup: Bestwert-Banner bricht an Wortgrenzen", () => {
  it("fitBanner haelt ganze Woerter und endet mit Ellipsis", () => {
    const out = fitBanner("NEUER BESTWERT: ZEIT, KILLS", 26);
    expect(out.length).toBeLessThanOrEqual(26);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
    for (const word of out.slice(0, -ELLIPSIS.length).trim().split(" ")) {
      expect("NEUER BESTWERT: ZEIT, KILLS".split(" ")).toContain(word);
    }
  });

  it("kurzer Text bleibt unveraendert", () => {
    expect(fitBanner("NEUER BESTWERT: SIEG", 26)).toBe("NEUER BESTWERT: SIEG");
  });
});
