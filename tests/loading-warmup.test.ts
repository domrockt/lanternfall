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
const RUN_TS = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

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

describe("Run-Start-Gate (m10-loading-screen K3, Quelltext-Check)", () => {
  it("Run friert den Sim bis FADE_IN_COMPLETE (Gate, detstart unberuehrt)", () => {
    expect(RUN_TS).toContain("Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE");
    expect(RUN_TS).toMatch(/startGate = true[\s\S]*?FADE_IN_COMPLETE/);
    expect(RUN_TS).toContain('if (!hasFlag("detstart"))');
  });

  it("friert ueber freezeGate/early-return, NICHT ueber paused (kein Pause-UI-Blitz)", () => {
    expect(RUN_TS).toContain("const frozen = this.paused || this.startGate;");
    expect(RUN_TS).toContain("if (this.paused || this.startGate) return;");
    // K3-Gate setzt bewusst kein paused (UI.ts blendet das Pause-Panel an paused).
    const gateBlock = RUN_TS.slice(
      RUN_TS.indexOf("Run-Start-Gate (siehe startGate)"),
      RUN_TS.indexOf("this.time.paused = false;"),
    );
    expect(gateBlock).not.toContain("this.paused = true;");
  });
});

describe("Warmup-Kopien: Key-Kontrakt gegen die Quellen (Reviewer-Finding 3)", () => {
  const WARMUP_TS = readFileSync(new URL("../src/gfx/warmup.ts", import.meta.url), "utf8");
  const EP_TS = readFileSync(new URL("../src/systems/EnemyProjectiles.ts", import.meta.url), "utf8");
  const VIGN_TS = readFileSync(new URL("../src/gfx/vignette-bg.ts", import.meta.url), "utf8");

  it("HD-Shot-Praefix in warmup.ts entspricht HD_PREFIX in EnemyProjectiles.ts", () => {
    const m = EP_TS.match(/const HD_PREFIX = "([^"]+)"/);
    expect(m).not.toBeNull();
    expect(WARMUP_TS).toContain(`const prefix = "${m![1]}"`);
    // HD_GRIDS wird direkt importiert (kein Doppel der Grids).
    expect(WARMUP_TS).toContain('import { HD_GRIDS } from "../systems/EnemyProjectiles"');
  });

  it("Vignette-Kanten-Keys in warmup.ts entsprechen mk() in vignette-bg.ts", () => {
    for (const suffix of ["col_l", "col_r", "row_t", "row_b", "px_tl", "px_tr", "px_bl", "px_br"]) {
      expect(VIGN_TS).toContain("${key}_" + suffix);
      expect(WARMUP_TS).toContain("${key}_" + suffix);
    }
    expect(VIGN_TS).toContain('key = "vignette"');
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
