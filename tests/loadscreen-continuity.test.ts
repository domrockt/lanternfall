/**
 * Lane m10-loadscreen-continuity (K3, #12684): Der Kaltstart muss DURCHGEHEND im
 * Ladescreen-Stil bleiben (Dom-Wunsch 2026-11-28T13:25Z, Punkt 1) — keine
 * Stilbrueche zwischen Boot-Vor-Phase (WAV-Load) und Laternen-Ladescreen.
 *
 * #12013 (Fix): Boot.preload zeichnet Laterne + Balken-Rahmen (0%) + Prozent-Text
 * ueber drawLoadingChrome aus Loading.ts — EINE Layout-Basis fuer beide Phasen.
 *
 * Boot.ts/Loading.ts sind Phaser-Szenen und nicht headless importierbar; die
 * Pruefung laeuft als Quelltext-Check (Muster tests/boot-preload.test.ts).
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (path: string): string =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/** Quelltext ohne Kommentarzeilen (Guards zielen auf aktiven Code). */
const code = (path: string): string =>
  src(path)
    .split("\n")
    .filter((l: string) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

const BOOT_CODE = code("../src/scenes/Boot.ts");
const LOADING_CODE = code("../src/scenes/Loading.ts");

describe("Ladescreen-Kontinuitaet Boot -> Loading (m10-loadscreen-continuity)", () => {
  it("Boot.preload nutzt drawLoadingChrome (gemeinsame Layout-Basis mit Loading)", () => {
    expect(BOOT_CODE).toContain("drawLoadingChrome(this)");
    expect(BOOT_CODE).toContain('from "./Loading"');
  });

  it("keine zweite Layout-Basis: Boot zeichnet keinen eigenen Balken/Laterne", () => {
    // Balken- und Lantern-Zeichnung liegen ausschliesslich in drawLoadingChrome.
    expect(BOOT_CODE).not.toContain("fillRect");
    expect(BOOT_CODE).not.toContain("loading_lantern");
  });

  it("Loading.create nutzt drawLoadingChrome und dupliziert den Chrome nicht", () => {
    expect(LOADING_CODE).toContain('drawLoadingChrome(this, "LADEN ...")');
    // Der Chrome (BG/Laterne/Balken/Texte) existiert genau einmal — in der Funktion.
    expect(LOADING_CODE.match(/setBackgroundColor/g)?.length).toBe(1);
    expect(LOADING_CODE.match(/addGridTexture\(scene, "loading_lantern"/g)?.length).toBe(1);
    expect(LOADING_CODE.match(/"loading_lantern"\)\.setScale\(2\)/g)?.length).toBe(1);
  });

  it("Ladescreen-Hintergrund ist nightDeep (Laternen-Screen-Ton) in beiden Phasen", () => {
    // Der Ton wird nur in drawLoadingChrome gesetzt — Boot- und Loading-Phase
    // teilen ihn damit zwingend.
    expect(LOADING_CODE).toContain("setBackgroundColor(PAL[C.nightDeep])");
    expect(BOOT_CODE).not.toContain("setBackgroundColor");
  });

  it("Vor-Text bleibt an die View-Breite gekoppelt (Guard m10-loadscreen-pretext)", () => {
    expect(BOOT_CODE).toContain('new PixelText(this, Math.round(GAME_WIDTH / 2), 132, "LADE MOOR ..."');
    expect(BOOT_CODE).not.toMatch(/new PixelText\(this,\s*240\b/);
  });
});
