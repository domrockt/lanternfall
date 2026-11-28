/**
 * m10-loading-screen K2 — Guard-Tests fuer den Loading-Warmup.
 *
 * Die Warmup-Tasks selbst brauchen Canvas/DOM (prozedurale Texturen) und sind
 * im Node-Test nicht ausfuehrbar; geprueft wird:
 * - die Task-Struktur (Reihenfolge/Labels: Titel zuerst, Atlas vor den
 *   View-abhaengigen Laufzeit-Texturen, GPU-Warmup add->cleanup am Ende),
 * - der Glyphen-Warmup-Satz (alle GLYPHS-Zeichen inkl. ä ö ü ß, Ziffern,
 *   Satzzeichen; alle 32 Palettenfarben),
 * - Szenen-Verdrahtung per Quelltext-Check (Repo-Muster boot-light-textures).
 */
import { describe, expect, it, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert (Repo-Muster boot-light-textures).
import { readFileSync } from "node:fs";
// Der Warmup zieht Szenen-Module (Boot/Title/font), die Phaser als Wert
// importieren — neutral gemockt (Repo-Muster tests/title-bg-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Image {}
  class Scene {}
  return { default: { GameObjects: { Container, Image }, Scene } };
});
import {
  buildWarmupTasks,
  GLYPH_WARMUP_CHARS,
  GLYPH_WARMUP_COLORS,
  LOADING_LANTERN,
  LOADING_UI_CHARS,
} from "../src/gfx/warmup";
import { GLYPHS } from "../src/gfx/glyphs";
import { PAL } from "../src/palette";

const BOOT_TS = readFileSync(new URL("../src/scenes/Boot.ts", import.meta.url), "utf8");
const MAIN_TS = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const LOADING_TS = readFileSync(new URL("../src/scenes/Loading.ts", import.meta.url), "utf8");

/** Task-Erzeugung braucht keine echte Szene (run-Closures werden hier nicht ausgefuehrt). */
const dummyScene = {} as never;

function taskLabels(): string[] {
  return buildWarmupTasks(dummyScene).map((t) => t.label);
}

describe("Loading-Warmup Task-Struktur (m10-loading-screen K2)", () => {
  it("erzeugt Tasks mit eindeutigen Labels", () => {
    const labels = taskLabels();
    expect(labels.length).toBeGreaterThan(30);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("beginnt mit Loading-UI-Glyphen und Titel-Texturen (UI rendert ab Frame 1)", () => {
    const labels = taskLabels();
    expect(labels[0]).toBe("glyphs-loading-ui");
    expect(labels[1]).toBe("title-textures");
  });

  it("deckt alle Grossbloecke ab (chars/enemies/bosses/ui/props/fx/icons/derived)", () => {
    const labels = taskLabels();
    for (const l of ["chars", "enemies", "bosses", "ui-frames", "props", "fx", "icons", "derived-atlas"]) {
      expect(labels).toContain(l);
    }
  });

  it("baut den Runtime-Atlas, bevor die View-abhaengigen Laufzeit-Texturen entstehen", () => {
    const labels = taskLabels();
    const atlas = labels.indexOf("runtime-atlas");
    expect(atlas).toBeGreaterThan(0);
    expect(labels.indexOf("title-runtime")).toBeGreaterThan(atlas);
    expect(labels.indexOf("menu-vignette-edges")).toBeGreaterThan(atlas);
    expect(labels.indexOf("hd-shots")).toBeGreaterThan(atlas);
  });

  it("endet mit GPU-Warmup add -> cleanup (Uploads vor dem Titel)", () => {
    const labels = taskLabels();
    expect(labels[labels.length - 2]).toBe("gpu-warmup");
    expect(labels[labels.length - 1]).toBe("gpu-warmup-cleanup");
  });

  it("waermt alle 32 Palettenfarben fuer Glyphen (je ein Chunk)", () => {
    const labels = taskLabels();
    expect(GLYPH_WARMUP_COLORS).toHaveLength(PAL.length);
    for (const c of GLYPH_WARMUP_COLORS) expect(labels).toContain(`glyphs-c${c}`);
  });
});

describe("Glyphen-Warmup-Satz (m10-loading-screen K2)", () => {
  it("enthaelt alle GLYPHS-Zeichen ausser Space", () => {
    const expected = Object.keys(GLYPHS).filter((c) => c !== " ").sort();
    expect([...GLYPH_WARMUP_CHARS].sort()).toEqual(expected);
  });

  it("enthaelt Umlaute, ß, Ziffern und Satzzeichen (Briefing K2)", () => {
    for (const ch of ["Ä", "Ö", "Ü", "ä", "ö", "ü", "ß", "0", "9", ".", ",", "!", "?", "(", ")", "%", ":"]) {
      expect(GLYPH_WARMUP_CHARS).toContain(ch);
    }
  });

  it("Loading-UI-Zeichensatz deckt die in der Szene benutzten Zeichen", () => {
    for (const ch of "LADEN ...0123456789%") {
      if (ch === " ") continue;
      expect(LOADING_UI_CHARS).toContain(ch);
    }
  });
});

describe("Loading-Szenen-Verdrahtung (Quelltext-Check)", () => {
  it("Boot startet 'loading' statt direkt 'title' (kein scheduleWarmup mehr)", () => {
    expect(BOOT_TS).toContain('scene.start("loading"');
    expect(BOOT_TS).not.toContain("this.scheduleWarmup");
    expect(BOOT_TS).not.toContain('this.scene.start("title"');
  });

  it("main.ts registriert die Loading-Szene nach Boot", () => {
    expect(MAIN_TS).toContain('import { Loading } from "./scenes/Loading"');
    expect(MAIN_TS).toMatch(/scene:\s*\[Boot,\s*Loading,/);
  });

  it("Loading fuehrt genau einen Task pro Frame aus und startet den Titel erst am Ende", () => {
    expect(LOADING_TS).toContain("buildWarmupTasks(this)");
    expect(LOADING_TS).toContain('loop: true');
    expect(LOADING_TS.indexOf("scene.start(\"title\"")).toBeGreaterThan(
      LOADING_TS.indexOf("startTitleOnce"),
    );
  });
});

describe("Loading-Laterne (Pixel-Textur)", () => {
  it("9x14, nur gueltige Paletten-Indizes (0-9, a-z)", () => {
    expect(LOADING_LANTERN.rows).toHaveLength(LOADING_LANTERN.h);
    for (const row of LOADING_LANTERN.rows) {
      expect(row).toHaveLength(LOADING_LANTERN.w);
      expect(row).toMatch(/^[0-9a-z.]+$/);
    }
  });
});
