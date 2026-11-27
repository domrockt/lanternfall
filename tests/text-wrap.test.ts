import { describe, expect, it } from "vitest";
import { ELLIPSIS, fitBanner } from "../src/gfx/text";

/** M10-text-wrap: Banner-Texte brechen an Leerzeichen, nie mitten im Wort. */
describe("fitBanner", () => {
  it("lässt kurze Texte unverändert", () => {
    expect(fitBanner("NEUER BESTWERT", 26)).toBe("NEUER BESTWERT");
    expect(fitBanner("BESTWERTE BLEIBEN STEHEN", 26)).toBe("BESTWERTE BLEIBEN STEHEN");
  });

  it("bricht an Leerzeichen und hängt die Ellipsis ans ganze Wort", () => {
    const out = fitBanner("NEUER BESTWERT: ZEIT, LEVEL", 26);
    expect(out).toBe("NEUER BESTWERT: ZEIT,..");
    expect(out.length).toBeLessThanOrEqual(26);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
  });

  it("scheidet nie mitten im Wort (kein Teilwort vor der Ellipsis)", () => {
    const words = ["NEUER", "BESTWERT:", "ZEIT,", "KILLS,", "LEVEL,", "SIEG"];
    // Alle Kombinationen der Bestwert-Labels, wie sie Results.ts baut.
    const labelSets = [
      ["ZEIT"], ["KILLS"], ["LEVEL"], ["SIEG"],
      ["ZEIT", "KILLS"], ["ZEIT", "LEVEL"], ["ZEIT", "SIEG"],
      ["KILLS", "LEVEL"], ["KILLS", "SIEG"], ["LEVEL", "SIEG"],
      ["ZEIT", "KILLS", "LEVEL"], ["ZEIT", "KILLS", "SIEG"],
      ["ZEIT", "LEVEL", "SIEG"], ["KILLS", "LEVEL", "SIEG"],
      ["ZEIT", "KILLS", "LEVEL", "SIEG"],
    ];
    for (const labels of labelSets) {
      const full = `NEUER BESTWERT: ${labels.join(", ")}`;
      const out = fitBanner(full, 26);
      expect(out.length).toBeLessThanOrEqual(26);
      if (out.length !== full.length) {
        expect(out.endsWith(ELLIPSIS)).toBe(true);
        // Das Wort vor der Ellipsis muss ganz sein (kein abgeschnittenes Fragment).
        const prefix = out.slice(0, -ELLIPSIS.length).trimEnd();
        const lastWord = prefix.split(" ").pop() ?? "";
        expect(words.some((w) => w === lastWord) || labels.some((l) => full.includes(lastWord))).toBe(true);
        expect(full.startsWith(prefix)).toBe(true);
      }
    }
  });

  it("gibt bei nur einem passenden Wort dieses plus Ellipsis zurück", () => {
    expect(fitBanner("NEUER BESTWERT: ZEIT, KILLS, LEVEL, SIEG", 26)).toBe("NEUER BESTWERT: ZEIT,..");
    expect(fitBanner("EIN WORT MEHR", 8)).toBe("EIN..");
  });

  it("kürzt mit Ellipsis, wenn nicht einmal das erste Wort passt", () => {
    expect(fitBanner("SEHR_LANGES_WORT", 10)).toBe("SEHR_LAN..");
  });

  it("respektiert die Ellipsis-Länge (maxChars >= ELLIPSIS.length)", () => {
    expect(fitBanner("ABC", 2)).toBe("..");
    expect(fitBanner("ABCD", 3)).toBe("A..");
    expect(fitBanner("ABCDE", 4)).toBe("AB..");
  });
});
