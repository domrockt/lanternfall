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

/**
 * M10-chest-hint-wrap: Belohnungsnamen im Truhen-Slot auf max. 2 Zeilen
 * verteilen — nie mitten im Wort ohne Trennstrich. Passt der Name auf eine
 * Zeile, bleibt er eine Zeile; bei zwei Worten wird an der Wortgrenze
 * gebrochen; ein (Compound-)Wort laenger als `maxChars` wird ausbalanciert
 * geteilt und der ersten Zeile ein Trennstrich "-" angehaengt (typografischer
 * Umbruch statt stummem mid-word Cut). Es gehen nie Zeichen verloren; nur der
 * (in den Panel-Daten unerreichbare) Fall, dass auch Zeile 2 ueberlaeuft,
 * faellt auf die fitBanner-Ellipsis zurueck.
 */
export function slotLabelLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const space = text.lastIndexOf(" ", maxChars);
  if (space > 0 && text.length - space - 1 <= maxChars) {
    return [text.slice(0, space).trimEnd(), text.slice(space + 1).trimStart()];
  }
  const cut = Math.min(Math.ceil(text.length / 2), maxChars - 1);
  if (cut < 1) return [fitBanner(text, maxChars)];
  const rest = text.slice(cut);
  if (rest.length > maxChars) return [`${text.slice(0, cut)}-`, fitBanner(rest, maxChars)];
  return [`${text.slice(0, cut)}-`, rest];
}

/**
 * M10-chest-hint-wrap: Evo-Hint-Satz verlustfrei auf beide Hint-Zeilen des
 * Truhen-Panels verteilen (kein Satz-Abbruch). Bei mehreren Worten wird die
 * ausbalancierte 2-Zeilen-Aufteilung an Wortgrenzen gewaehlt, die in
 * `maxChars` passt (beide Zeilen sichtbar statt einer ueberlangen Einzelzeile);
 * Ein-Wort-Texte bleiben einzeilig. Rettungsanker fuer pathologische Eingaben
 * (Wort laenger als `maxChars`) ist slotLabelLines mit Trennstrich/Ellipsis.
 */
export function wrapHintLines(text: string, maxChars: number): string[] {
  if (!text.includes(" ")) return slotLabelLines(text, maxChars);
  const words = text.split(" ");
  let best: [string, string] | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    if (l1.length > maxChars || l2.length > maxChars) continue;
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [l1, l2];
    }
  }
  return best ?? slotLabelLines(text, maxChars);
}
