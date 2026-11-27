/**
 * M10-text-wrap: einzeilige Banner-Texte an Wortgrenzen anpassen.
 *
 * K1-Befund aus docs/lanes/m10-results-overlap.md: ein Banner, das mitten im
 * Wort abgeschnitten wird ("NEUER BESTWERT: ZEIT, LEVE"), ist unlesbar. Statt
 * hart zu schneiden bricht fitBanner an Leerzeichen und haengt eine Ellipsis
 * an; ein Banner ist dann immer noch einzeilig und passend zur Box.
 *
 * Die 5x7-Glyphentabelle (src/gfx/glyphs.ts) hat keine U+2026-Glyphe - ein
 * echtes "…" wuerde als "?" gerendert. Die Ellipsis ist deshalb ".." mit
 * bestehenden Glyphen.
 */
export const ELLIPSIS = "..";

/**
 * Kuerzt `text` auf haechstens `maxChars` Zeichen: ganze Woerter, nie mitten
 * im Wort; bei Kuerzung steht die Ellipsis am Ende. Passt der Text komplett,
 * wird er unveraendert zurueckgegeben. `maxChars` muss >= ELLIPSIS.length
 * sein, damit die Ellipsis in die Box passt.
 */
export function fitBanner(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const limit = maxChars - ELLIPSIS.length;
  if (limit < 1) return ELLIPSIS.slice(0, Math.max(0, maxChars));
  const words = text.split(" ");
  let kept = "";
  for (const word of words) {
    const candidate = kept === "" ? word : `${kept} ${word}`;
    if (candidate.length > limit) break;
    kept = candidate;
  }
  if (kept === "") {
    // Nicht einmal das erste Wort passt: letzter Ausweg ist ein Schnitt im
    // Wort (mit Ellipsis). Fuer die Bestwert-Banner ("NEUER ...") nie erreichbar.
    return `${text.slice(0, limit)}${ELLIPSIS}`;
  }
  return `${kept.replace(/\s+$/, "")}${ELLIPSIS}`;
}
