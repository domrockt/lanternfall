/**
 * Belohnungsnamen im Truhen-Slot vollständig auf max. 2 Zeilen verteilen.
 * Bevorzugt einen Wortumbruch, wenn beide Teile passen; sonst wird das Wort
 * ausbalanciert geteilt. Es gehen nie Zeichen verloren (nur bei >2·maxChars
 * läuft eine Zeile über, statt Inhalt zu verschlucken).
 */
export function slotNameLines(name: string, maxChars = 11): string[] {
  if (name.length <= maxChars) return [name];
  const space = name.lastIndexOf(" ", maxChars);
  const useSpace = space > 0 && name.length - space - 1 <= maxChars;
  const cut = useSpace ? space : Math.ceil(name.length / 2);
  return [name.slice(0, cut).trimEnd(), name.slice(cut).trimStart()];
}
