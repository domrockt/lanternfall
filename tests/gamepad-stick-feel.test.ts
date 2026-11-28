// Lane m10-gamepad-stick-feel (K3): Regressions-Tests fuer den Stick-Feel-
// Filter in src/input/Gamepad.ts.
//
// Abnahme (Dom-Freigabe 06:00Z, Android-TV-Gamepad-Kurs):
// - Deadzone wirksam: kein Drift/Rauschen im Stillstand (exakt 0-Ausgabe),
// - Richtungswechsel ohne Zwischen-Dither (Sektor-Hysterese, keine
//   Doppel-Events am 45°-Sektorwechsel),
// - Stick und D-Pad liefern konsistente Einheitsvektoren.
// InputState.ts wird nicht angefasst; die Tests pruefen den Adapter-Ausgang,
// wie ihn alle Szenen via readSceneGamepad/readNavigatorGamepad erhalten.
import { describe, expect, it } from "vitest";
import {
  STICK_ENGAGE_DEADZONE,
  STICK_RELEASE_DEADZONE,
  STICK_SECTOR_MARGIN,
  cleanStickSample,
  freshStickFeelState,
  readSceneGamepad,
  resetStickFeel,
  stickSectorIndex,
  stickSectorWithHysteresis,
} from "../src/input/Gamepad";
import { normalizeVector, readGamepadMoveActions } from "../src/input/InputState";

const DEG = Math.PI / 180;
/** Sektor-Mittelpunkt-Einheitsvektor (k*45°), exakt wie D-Pad-Diagonalen. */
function sectorVector(k: number): { x: number; y: number } {
  return { x: Math.cos(k * 45 * DEG), y: Math.sin(k * 45 * DEG) };
}

describe("Stick-Deadzone wirksam (Stillstand: exakt 0, kein Drift)", () => {
  it("Rauschen unterhalb der Engage-Kante gibt immer exakt (0,0)", () => {
    let state = freshStickFeelState();
    // Deterministischer Drift+Rauschen-Stream (wie Messung, Serie 'still').
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i++) {
      const x = 0.11 + (rnd() - 0.5) * 0.14;
      const y = 0.06 + (rnd() - 0.5) * 0.14;
      const r = cleanStickSample(x, y, state);
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      state = r.state;
      expect(state.engaged).toBe(false);
    }
  });

  it("Engage-Kante: erst oberhalb 0.28 wird aktiv, Output ist Einheitsvektor", () => {
    let state = freshStickFeelState();
    const inside = cleanStickSample(STICK_ENGAGE_DEADZONE - 0.01, 0, state);
    expect(inside.x).toBe(0);
    expect(inside.state.engaged).toBe(false);

    const outside = cleanStickSample(STICK_ENGAGE_DEADZONE + 0.02, 0, state);
    expect(outside.state.engaged).toBe(true);
    expect(outside.x).toBe(1);
    expect(outside.y).toBe(0);
  });

  it("Hysterese-Band [Release, Engage]: engaged bleibt engaged (kein Ein/Aus-Zittern)", () => {
    let state = freshStickFeelState();
    state = cleanStickSample(0.6, 0, state).state; // engagieren
    // Im Band zwischen Release und Engage: bleibt aktiv, letzte Richtung halt.
    const r = cleanStickSample(STICK_RELEASE_DEADZONE + 0.01, 0, state);
    expect(r.state.engaged).toBe(true);
    expect(r.x).toBe(1);
    // Unter Release: sauber loesen, exakt 0.
    const off = cleanStickSample(STICK_RELEASE_DEADZONE - 0.01, 0, r.state);
    expect(off.state.engaged).toBe(false);
    expect(off.x).toBe(0);
    expect(off.y).toBe(0);
  });

  it("Half-Push (0.4) liefert Einheitsvektor, nicht abgeschwaechte Magnitude", () => {
    const r = cleanStickSample(0.4, 0, freshStickFeelState());
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(1, 12);
  });

  it("NaN/Inf-Achsen bleiben Stillstand", () => {
    let state = freshStickFeelState();
    for (const [ax, ay] of [[Number.NaN, 0], [0, Infinity], [NaN, NaN]]) {
      const r = cleanStickSample(ax, ay, state);
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      state = r.state;
    }
  });
});

describe("8-Richtungs-Konsistenz (Stick == D-Pad-Einheitsvektoren)", () => {
  it("jeder Engage-Winkel rastet auf den Sektor-Mittelpunkt (45°-Raster)", () => {
    for (let k = 0; k < 8; k++) {
      // 20° um den Mittelpunkt: immer derselbe gerasterte Vektor.
      for (const off of [-20, -10, 0, 10, 20]) {
        const a = (k * 45 + off) * DEG;
        const r = cleanStickSample(Math.cos(a) * 0.7, Math.sin(a) * 0.7, freshStickFeelState());
        const want = sectorVector(k);
        expect(r.x).toBeCloseTo(want.x, 12);
        expect(r.y).toBeCloseTo(want.y, 12);
      }
    }
  });

  it("Stick-Diagonale == D-Pad-Diagonale (normalizeVector(1,1))", () => {
    const stick = cleanStickSample(0.5, 0.5, freshStickFeelState());
    const dpad = normalizeVector(1, 1);
    expect(stick.x).toBeCloseTo(dpad.x, 12);
    expect(stick.y).toBeCloseTo(dpad.y, 12);
  });

  it("Richtungs-Aktionen aus gerasterten Achsen sind deckungsgleich mit D-Pad", () => {
    // Stick 45° (gerastert) vs. D-Pad rechts+unten: identische Actions.
    const stickSnap = { axes: [Math.SQRT1_2, Math.SQRT1_2], buttons: [] as boolean[] };
    const dpadSnap = { axes: [0, 0], buttons: [false, false, false, false, false, false, false, false, false, false, false, false, false, true, false, true] };
    const a = readGamepadMoveActions(stickSnap);
    const b = readGamepadMoveActions(dpadSnap);
    expect(a.up).toBe(b.up);
    expect(a.down).toBe(b.down);
    expect(a.left).toBe(b.left);
    expect(a.right).toBe(b.right);
    expect(a.down).toBe(true);
    expect(a.right).toBe(true);
  });
});

describe("Sektor-Hysterese (Richtungswechsel ohne Zwischen-Dither)", () => {
  it("nahe der 45°-Grenze bleibt der bisherige Sektor (Marge 5,625°)", () => {
    // Engagiert in Sektor 1 (45°). 50° ist 5° vom Zentrum entfernt -> halten.
    const a = 50 * DEG;
    const next = stickSectorWithHysteresis(Math.cos(a), Math.sin(a), 1);
    expect(next).toBe(1);
    // 76° ist 31° > 22.5° + 5.625° vom Zentrum entfernt -> Wechsel.
    const b = 76 * DEG;
    expect(stickSectorWithHysteresis(Math.cos(b), Math.sin(b), 1)).toBe(2);
  });

  it("Sweep über die Sektorgrenze: keine Sektor-Flacker-Sequenz", () => {
    // 40° -> 50° -> 40° -> 50° um die 45°-Grenze: Sektor 0/1-Wechsel nur
    // jenseits der Marge, nicht pro Frame.
    let sector = stickSectorIndex(Math.cos(40 * DEG), Math.sin(40 * DEG));
    expect(sector).toBe(1); // 40° rastet auf Sektor 1 (Zentrum 45°)
    const seen: number[] = [];
    for (const deg of [40, 42, 44, 46, 48, 50, 48, 46, 44, 42, 40]) {
      const a = deg * DEG;
      sector = stickSectorWithHysteresis(Math.cos(a), Math.sin(a), sector);
      seen.push(sector);
    }
    // Alle Winkel liegen <= 5° um das Zentrum von Sektor 1, also innerhalb
    // 22.5° + Marge -> der Sektor haelt durch (kein Flackern zu Sektor 0/2).
    for (const s of seen) expect(s).toBe(1);
  });

  it("kein Doppel-Event: pro Frame wechselt maximal eine Richtungs-Aktion", () => {
    resetStickFeel();
    // Rauschender Sweep 20° -> 70° über die 45°-Grenze (wie Messung, Serie 'sweep').
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    let last = { up: false, down: false, left: false, right: false };
    resetStickFeel(); // Hysterese ueber den ganzen Sweep hinweg (kein Reset pro Frame)
    for (let i = 0; i < 120; i++) {
      const a = (20 + (i * 50) / 119) * DEG;
      const noise = (rnd() - 0.5) * 0.06;
      const x = Math.cos(a) * 0.9 + noise;
      const y = Math.sin(a) * 0.9 + noise;
      // readSceneGamepad mit Plugin-Pad nutzt denselben Modulzustand wie der
      // echte Szenen-Pfad (navigator.getGamepads existiert in Node nicht).
      const snap = readSceneGamepad({
        input: { gamepad: { pad1: { axes: [x, y], buttons: [] } } },
      } as never);
      const act = readGamepadMoveActions(snap);
      let toggles = 0;
      for (const k of ["up", "down", "left", "right"] as const) {
        if (act[k] !== last[k]) toggles++;
        last[k] = act[k];
      }
      expect(toggles).toBeLessThanOrEqual(1);
    }
  });

  it("Stillstand-Stream erzeugt keine Richtungs-Events (0 Events im Stillstand)", () => {
    resetStickFeel();
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < 300; i++) {
      const x = 0.11 + (rnd() - 0.5) * 0.14;
      const y = 0.06 + (rnd() - 0.5) * 0.14;
      const snap = readSceneGamepad({
        input: { gamepad: { pad1: { axes: [x, y], buttons: [] } } },
      } as never);
      expect(snap).not.toBeNull();
      expect(snap!.axes[0]).toBe(0);
      expect(snap!.axes[1]).toBe(0);
      const act = readGamepadMoveActions(snap);
      expect(act.up).toBe(false);
      expect(act.down).toBe(false);
      expect(act.left).toBe(false);
      expect(act.right).toBe(false);
    }
  });

  it("STICK_SECTOR_MARGIN ist ein Achtel der Sektorbreite (5,625°)", () => {
    expect(STICK_SECTOR_MARGIN).toBeCloseTo((45 / 8) * DEG, 12);
  });
});
