import { describe, expect, it, vi } from "vitest";
// Run.ts importiert Phaser (Szene); der geprüfte Freeze-Gate-Zustand ist rein.
// Phaser wird neutral gemockt (Muster tests/chest-icon-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  const MathObj = { Clamp: (v: number) => v, Distance: { Between: () => 0 } };
  return { default: { GameObjects: { Container }, Scene, Math: MathObj } };
});
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { Run } from "../src/scenes/Run";

// Lane m10-pause-freeze, Karte K3 (#7507): Unit-Tests zum Pause-Freeze-Gate.
//
// Befund (shots/m10-pause-freeze-before.json): Szenen-Clock und Tweens sind
// wall-clock-getrieben und liefen trotz `if (this.paused) return;` weiter —
// ein Probe-delayedCall über denselben Mechanismus wie Run.ts (Boss-Tod ->
// hp=0+Truhe 1826, Truhe-Autoöffnung 1811, Morgendämmerung 1086, Banner-Retry
// 668) feuerte mitten in der Pause und mutierte Kills +7; Probe-Tweens
// (Splash/Blink-Klasse, Run.ts 711/995/1097) animierten im Pausenbild.
//
// Fix (#7506): Update-Gate in Run.update() — bei Wechsel von `paused` werden
// Szenen-Clock (time.paused) und Tweens (pauseAll/resumeAll) mitgezogen;
// create() setzt den Zustand zurück. Integration-nachweis:
// shots/m10-pause-freeze-after.json (Verdict PASS).

const SOURCE = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

/** Spiegel des Inlined-Gates aus Run.update() als reines Modell (Semantik). */
type FreezeState = { freezeGate: boolean; timePaused: boolean; tweensPaused: boolean };
function freezeGateStep(state: FreezeState, paused: boolean, applyClock: (s: FreezeState, frozen: boolean) => void): FreezeState {
  const frozen = paused;
  if (state.freezeGate !== frozen) {
    state.freezeGate = frozen;
    applyClock(state, frozen);
  }
  return state;
}

describe("Pause-Freeze-Gate (m10-pause-freeze)", () => {
  it("Quell-Kontrakt: Gate existiert in Run.update() und liegt vor dem paused-Return", () => {
    const gateIdx = SOURCE.indexOf("const frozen = this.paused;");
    expect(gateIdx).toBeGreaterThan(-1);
    const clockIdx = SOURCE.indexOf("this.time.paused = frozen;", gateIdx);
    const pauseAllIdx = SOURCE.indexOf("this.tweens.pauseAll();", gateIdx);
    const resumeAllIdx = SOURCE.indexOf("this.tweens.resumeAll();", gateIdx);
    expect(clockIdx).toBeGreaterThan(gateIdx);
    expect(pauseAllIdx).toBeGreaterThan(gateIdx);
    expect(resumeAllIdx).toBeGreaterThan(gateIdx);
    // Das Gate muss VOR dem frühen paused-Return angewandt werden (sonst läuft
    // die Clock im ersten Pausenframe weiter).
    const pausedReturnIdx = SOURCE.indexOf("if (this.paused) return;", gateIdx);
    expect(pausedReturnIdx).toBeGreaterThan(clockIdx);
    // Nur bei Wechsel anwenden (kein pro-Frame pauseAll/resumeAll-Spam).
    expect(SOURCE.indexOf("if (this.freezeGate !== frozen)")).toBeGreaterThan(gateIdx);
  });

  it("Quell-Kontrakt: create() setzt Freeze-Zustand zurück (Szenen-Wiedereinstieg)", () => {
    expect(SOURCE).toContain("this.freezeGate = false;");
    expect(SOURCE).toContain("this.time.paused = false;");
    expect(SOURCE).toContain("this.tweens.resumeAll();");
    // Feld-Deklaration vorhanden (sonst gate der Typprüfung entzogen).
    expect(SOURCE).toContain("private freezeGate = false;");
  });

  it("Semantik: paused=true friert genau beim Wechsel ein (idempotent über Frames)", () => {
    const state: FreezeState = { freezeGate: false, timePaused: false, tweensPaused: false };
    const applyClock = (s: FreezeState, frozen: boolean) => { s.timePaused = frozen; s.tweensPaused = frozen; };
    // erster Pausenframe: Wechsel -> Clock/Tweens eingefroren
    freezeGateStep(state, true, applyClock);
    expect(state).toEqual({ freezeGate: true, timePaused: true, tweensPaused: true });
    // weitere Pausenframes: kein Zustandswechsel mehr (idempotent)
    for (let i = 0; i < 300; i++) freezeGateStep(state, true, applyClock);
    expect(state).toEqual({ freezeGate: true, timePaused: true, tweensPaused: true });
  });

  it("Semantik: Fortsetzen friert exakt auf (kein Frozen-Rest)", () => {
    const state: FreezeState = { freezeGate: true, timePaused: true, tweensPaused: true };
    const applyClock = (s: FreezeState, frozen: boolean) => { s.timePaused = frozen; s.tweensPaused = frozen; };
    freezeGateStep(state, false, applyClock);
    expect(state).toEqual({ freezeGate: false, timePaused: false, tweensPaused: false });
  });

  it("Semantik: Level-up-/Truhen-Pause (paused=true) friert dieselben Systeme ein", () => {
    // openChest()/Level-up setzen this.paused = true — das Gate hängt nur am
    // paused-Flag, deckt also beide Pfade ab (kein zweites Flag nötig).
    const state: FreezeState = { freezeGate: false, timePaused: false, tweensPaused: false };
    const applyClock = (s: FreezeState, frozen: boolean) => { s.timePaused = frozen; s.tweensPaused = frozen; };
    // Truhe öffnet: paused=true (openChest) -> eingefroren ...
    freezeGateStep(state, true, applyClock);
    expect(state.timePaused).toBe(true);
    // ... und finishChest() stellt chestPausedBefore wieder her -> Gate hebt auf.
    freezeGateStep(state, false, applyClock);
    expect(state.timePaused).toBe(false);
  });

  it("Integration-Beleg: after-JSON zeigt 0 Sim-Events in der Pause + bitgleichen Anschluss", () => {
    const report = JSON.parse(readFileSync(new URL("../shots/m10-pause-freeze-after.json", import.meta.url), "utf8")) as {
      verdict: string;
      checks: Array<{ name: string; ok: boolean }>;
      simDeltasDuringPause: Record<string, number>;
      leaks: unknown[];
    };
    expect(report.verdict).toBe("PASS");
    expect(report.leaks).toEqual([]);
    // 0 Kills / 0 Schaden / 0 Spawns / 0 Timer-/Wellen-Fortschritt während Pause:
    for (const [k, v] of Object.entries(report.simDeltasDuringPause)) expect(v, k).toBe(0);
    const ok = (name: string) => report.checks.find((c) => c.name.startsWith(name))?.ok ?? false;
    expect(ok("pause_friert_sim_ein")).toBe(true);
    expect(ok("anschluss_bitgleich")).toBe(true); // Zustand nach 5 s Pause ≡ Pause-Start
    expect(ok("pause_friert_clock_ein")).toBe(true);
    expect(ok("pause_friert_tweens_ein")).toBe(true);
    expect(ok("fortsetzen_ohne_luecke")).toBe(true);
  });

  it("Run-Szene exportiert die Gate-Grundlage (paused-Flag ist öffentlich schaltbar)", () => {
    const run = new Run() as unknown as { paused: boolean; freezeGate: boolean };
    expect(run.paused).toBe(false);
    expect(run.freezeGate).toBe(false);
  });
});
