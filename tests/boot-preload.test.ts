/**
 * Lane m10-loadscreen-pretext (K2): Der Boot-Vor-Text "LADE MOOR ..." muss an
 * die View-Breite gekoppelt sein (GAME_WIDTH ist dynamisch: logische Hoehe 360,
 * Breite je Seitenverhaeltnis). Vorher fixer X=240 — das war das Zentrum einer
 * 480er-Annahme und sitzt auf breiten Views links der Mitte (Redmi-Pad-Beleg
 * 2026-11-28T13:25Z: Vor-Text bei ~37% Breite zwischen WebView-Start und
 * Ladescreen).
 *
 * Boot.ts ist eine Phaser-Szene und nicht headless importierbar; die Pruefung
 * laeuft als Quelltext-Check (Muster tests/boot-light-textures.test.ts).
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BOOT_TS = readFileSync(new URL("../src/scenes/Boot.ts", import.meta.url), "utf8");
/** Quelltext ohne Kommentarzeilen (Guards zielen auf aktiven Code). */
const BOOT_CODE = BOOT_TS.split("\n")
  .filter((l: string) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*"); })
  .join("\n");

describe("Boot-Vor-Text an View-Breite gekoppelt (m10-loadscreen-pretext)", () => {
  it("PixelText-X ist Math.round(GAME_WIDTH / 2), nicht fix", () => {
    expect(BOOT_CODE).toContain('new PixelText(this, Math.round(GAME_WIDTH / 2), 132, "LADE MOOR ..."');
  });

  it("kein fixer 240er-X-Rest fuer den Vor-Text", () => {
    expect(BOOT_CODE).not.toMatch(/new PixelText\(this,\s*240\b/);
  });

  it("GAME_WIDTH bleibt importiert (Live-Binding aus src/config.ts)", () => {
    expect(BOOT_TS).toContain('import { GAME_WIDTH, GAME_HEIGHT } from "../config";');
  });
});
