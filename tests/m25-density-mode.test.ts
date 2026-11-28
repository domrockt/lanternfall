// m10-m25-density-mode, K2: Guard für den Waffen-Feuer-Schalter (Befund 3,
// docs/lanes/m10-v10-gate-guard.md). Der Hebel ist ein MESSWERKZEUG: ohne
// expliziten Aufruf von setWeaponsEnabled(false) bleibt das Spiel bitgleich.
// Der Test pinnt (a) Flag-Semantik mit A/B-Marken (Default vs. explizit true),
//(b) dass das Gate im CombatSystem ausschließlich bei explizit false feuert und
// vor dem Fire-Switch sitzt (0 neue Projektile/Swings), (c) den dokumentierten
// Reset-Pfad.
import { describe, expect, it, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

vi.mock("phaser", () => ({
  default: {
    BlendModes: { ADD: 1, NORMAL: 0 },
    CANVAS: 2,
    Core: { Events: { READY: "ready" } },
  },
}));

const { isWeaponsEnabled, setWeaponsEnabled } = await import("../src/debug");

const combatSrc = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
const debugSrc = readFileSync(new URL("../src/debug.ts", import.meta.url), "utf8");

describe("m25-density-mode: Waffen-Flag (Mess-Hebel, kein Spielverhalten)", () => {
  it("Default bitgleich: Modul ohne jeden Aufruf (Default) vs. setWeaponsEnabled(true) — identische Marken", async () => {
    // A: frisches Modul, KEIN Aufruf von setWeaponsEnabled (Default-Pfad).
    vi.resetModules();
    const a = (await import("../src/debug")).isWeaponsEnabled;
    const marksA: boolean[] = [];
    for (let t = 0; t < 64; t++) marksA.push(a());
    // B: derselbe Import-Pfad, aber mit explizitem setWeaponsEnabled(true).
    vi.resetModules();
    const b = await import("../src/debug");
    b.setWeaponsEnabled(true);
    const marksB: boolean[] = [];
    for (let t = 0; t < 64; t++) marksB.push(b.isWeaponsEnabled());
    expect(marksB).toEqual(marksA);
    expect(marksA.every((m) => m === true)).toBe(true);
  });

  it("Flag deaktiviert Feuer: setWeaponsEnabled(false) → kein Feuer-Zweig, 0 neue Projektile", () => {
    setWeaponsEnabled(false);
    expect(isWeaponsEnabled()).toBe(false);
    // Gate sitzt im Waffen-Feuer-Pfad (updateWeapons), VOR dem Fire-Switch —
    // erreicht ein Feuer/fire*/projectiles.spawn/playWeapon, ist das Flag true.
    const updateAt = combatSrc.indexOf("private updateWeapons");
    const gateAt = combatSrc.indexOf("if (!isWeaponsEnabled()) {", updateAt);
    const switchAt = combatSrc.indexOf("switch (def.behavior)", updateAt);
    expect(gateAt).toBeGreaterThan(0);
    expect(switchAt).toBeGreaterThan(gateAt);
    // Der Gate-Block erzeugt nichts: kein spawn, kein Sound, nur Timer-Reset + Skip.
    const gateEnd = combatSrc.indexOf("}", combatSrc.indexOf("continue;", gateAt));
    const gateBlock = combatSrc.slice(gateAt, gateEnd);
    expect(gateBlock).toContain("owned.timer = 0;");
    expect(gateBlock).not.toContain("projectiles.spawn");
    expect(gateBlock).not.toContain("playWeapon");
  });

  it("Gate ist der einzige neue Feuer-Eingriff: ohne explizit false läuft der Originalpfad", () => {
    // Genau EIN Gate im Feuer-Pfad, und der bedient sich nur des Flags:
    expect(combatSrc.match(/if \(!isWeaponsEnabled\(\)\)/g)?.length).toBe(1);
    // Debug-API: setWeaponsEnabled ist Cheat-Gated (requireDebug) und gibt den Zustand zurück.
    expect(debugSrc).toContain("setWeaponsEnabled: (value: boolean)");
    expect(debugSrc).toContain("requireDebug();");
    expect(debugSrc).toContain("weaponsEnabled: (): boolean => isWeaponsEnabled()");
  });

  it("Reset-Pfad: setWeaponsEnabled(true) stellt das Feuer wieder her (dokumentiert, kein Reload nötig)", () => {
    setWeaponsEnabled(false);
    expect(isWeaponsEnabled()).toBe(false);
    setWeaponsEnabled(true);
    expect(isWeaponsEnabled()).toBe(true);
    // Der Reset-Pfad ist in der Doku des Flags benannt (Modul-Kommentar in debug.ts).
    expect(debugSrc).toContain("Reset-Pfad");
    expect(debugSrc).toContain("setWeaponsEnabled(true)");
  });
});
