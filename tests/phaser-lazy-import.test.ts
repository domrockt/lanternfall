// M10-phaser-lazy-import (K3): Guard, dass main.ts phaser nicht mehr statisch
// importiert und der Boot-Pfad als Promise-Geruest vorliegt. Quell-Scan nach
// dem Muster der bestehenden Quell-Guards (z. B. chaos-glow-runpath.test.ts,
// vfx-restore.test.ts: readFileSync auf die Quelldatei, Regex auf Importe).
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

const MAIN_TS = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const INDEX_HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

/** Statische Import-Zeilen (kein `import type`, kein `import(`). */
function staticImports(src: string): string[] {
  return src
    .split("\n")
    .filter((line) => /^import\s/.test(line.trim()) && !/^import\s+type\b/.test(line.trim()))
    .map((line) => line.trim());
}

describe("m10-phaser-lazy-import: main.ts laedt phaser dynamisch", () => {
  it("importiert phaser NICHT statisch (nur import() ist erlaubt)", () => {
    const offenders = staticImports(MAIN_TS).filter((line) => /from\s+["']phaser["']/.test(line));
    expect(offenders, `statische phaser-Importe gefunden: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("importiert keine Module, die phaser statisch ziehen (debug, Szenen)", () => {
    // debug.ts und alle Szenen-Module importieren phaser statisch — duerfen in
    // main.ts nur hinter import() stehen, nicht als statischer Import.
    const offenders = staticImports(MAIN_TS).filter((line) =>
      /from\s+["'](\.\/debug|\.\/scenes\/(Boot|Title|CharSelect|Run|UI|Results|Credits))["']/.test(line),
    );
    expect(offenders, `statische Importe mit phaser-Edge: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("der einzige Szenen-Import ist der Typ-Import von Run (buildzeitentfernt)", () => {
    expect(MAIN_TS).toMatch(/import\s+type\s+\{ Run \}\s+from\s+["']\.\/scenes\/Run["']/);
    // und es gibt keinen weiteren Run-Bezug außer dem Typ:
    const nonType = staticImports(MAIN_TS).filter((line) => /scenes\/Run/.test(line));
    expect(nonType).toEqual([]);
  });

  it("Start-Pfad: import('phaser') + Promise-Geruest mit await (kein Polling)", () => {
    expect(MAIN_TS).toMatch(/import\(\s*["']phaser["']\s*\)/);
    expect(MAIN_TS).toMatch(/async\s+function\s+boot\s*\(/);
    expect(MAIN_TS).toMatch(/await\s+Promise\.all/);
    // Boot wird genau einmal angestossen und nicht per sleep/setTimeout erwartet:
    expect(MAIN_TS).toMatch(/void\s+boot\(\)/);
    expect(MAIN_TS).not.toMatch(/setTimeout|setInterval/);
  });

  it("Phase 2 registriert die Late-Szenen per scene.add (autoStart=false)", () => {
    for (const key of ["charselect", "run", "ui", "results", "credits"]) {
      expect(MAIN_TS).toMatch(new RegExp(`scene\\.add\\(\\s*["']${key}["']`));
    }
  });

  it("index.html hat das Boot-Fehler-Overlay (kein weisser Screen im Fehlerfall)", () => {
    expect(INDEX_HTML).toMatch(/id=["']lf-boot-error["']/);
    expect(MAIN_TS).toMatch(/showBootError/);
    expect(MAIN_TS).toMatch(/lf-boot-error/);
  });
});
