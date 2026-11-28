/**
 * Output-Hygiene (Befund E-4, Nachabnahme E): Verify-Skripte duerfen keine
 * getrackten Belege unter shots/ ueberschreiben. Guard: die Skripte schreiben
 * ausschliesslich timestamped nach ~/games/.evidence/ (bzw. LF_VERIFY_OUTPUT_DIR).
 * Rein statisch (Quelltext-Analyse), kein Browser noetig.
 */
import { expect, describe, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

const SCRIPTS = [
  "verify-final.mjs",
  "verify-robust.mjs",
] as const;

/** Alle String-Literale direkt hinter writeFileSync(<hier> bzw. path: <hier>. */
export function writeTargets(source: string): string[] {
  const targets: string[] = [];
  const writeRe = /writeFileSync\(\s*("([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  const shotRe = /path:\s*("([^"]*)"|'([^']*)'|`([^`]*)`)/g;
  for (const re of [writeRe, shotRe]) {
    for (const m of source.matchAll(re)) {
      targets.push(m[2] ?? m[3] ?? m[4] ?? "");
    }
  }
  return targets;
}

describe("Verify-Output-Hygiene (E-4-Guard)", () => {
  for (const name of SCRIPTS) {
    const src = readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");

    it(`${name}: kein Schreibziel unter shots/`, () => {
      const bad = writeTargets(src).filter((t) => /(^|[^\w.])shots\//.test(t));
      expect(bad, `Schreibziele unter shots/: ${bad.join(", ")}`).toEqual([]);
    });

    it(`${name}: Output-Pfad ist konfigurierbar und liegt ausserhalb des Repos`, () => {
      expect(src).toMatch(/LF_VERIFY_OUTPUT_DIR/);
      expect(src).toMatch(/\.evidence/);
    });

    it(`${name}: Outputs sind timestamped (kein fixer Dateiname = kein Overwrite)`, () => {
      expect(src).toMatch(/STAMP/);
    });
  }
});
