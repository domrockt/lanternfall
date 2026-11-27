import { describe, expect, it, vi } from "vitest";

// M10-enemy-frame-cadence: Frame-Auswahl der Gegner.
// Run.ts waehlte Frames mit `% Math.min(2, frames.length)` und suchte
// SPRITE_FRAMES nach spriteKey — obwohl die Map nach Gegner-ID bzw. Boss-ID
// verschluesselt ist. Beides wird hier als reine Funktion geprueft.
vi.mock("phaser", () => ({ default: { BlendModes: { ADD: 1, NORMAL: 0 } } }));

const { framesForDef, runFrameIndex } = await import("../src/logic/enemy-frames");
const { SPRITE_FRAMES } = await import("../src/gfx/textures");
const { ENEMY_LIST } = await import("../src/data/enemies");
const { BOSSES } = await import("../src/data/bosses");
const { bossEnemyDef } = await import("../src/systems/BossSystem");

/** Indizes ueber eine Sekunde bei 6 fps (wie im Render-Loop von Run.ts). */
function cycleIndices(frameCount: number, phase = 0): number[] {
  const out: number[] = [];
  for (let step = 0; step < 12; step++) out.push(runFrameIndex(frameCount, step / 6, phase));
  return out;
}

describe("framesForDef", () => {
  it("findet fuer alle 30 Gegnertypen die 4 generierten Lauf-Frames", () => {
    expect(ENEMY_LIST.length).toBe(30);
    for (const def of ENEMY_LIST) {
      const frames = framesForDef(def);
      expect(frames, `keine Frames fuer ${def.id}`).toBeDefined();
      expect(frames!.length, `${def.id}: erwartet 4 generierte Frames`).toBe(4);
      expect(frames![0], `${def.id}: Basis-Frame muss der spriteKey sein`).toBe(def.spriteKey);
    }
  });

  it("findet fuer alle 6 Bosse die 3 Frames (F2 = Wind-up) ohne Boss-Praefix", () => {
    expect(BOSSES.length).toBe(6);
    for (const boss of BOSSES) {
      const def = bossEnemyDef(boss.index);
      expect(def.spriteKey).toBe(`boss_${boss.id}`);
      const frames = framesForDef(def);
      expect(frames, `keine Frames fuer Boss ${boss.id}`).toBeDefined();
      expect(frames!.length, `${boss.id}: erwartet 3 Boss-Frames`).toBe(3);
      // Wind-up-Key exakt pinnen: F2 ist der 3. generierte Boss-Frame.
      expect(frames![2], `${boss.id}: Wind-up-Frame`).toBe(`boss_${boss.id}_3`);
    }
  });
});

describe("runFrameIndex (6 fps, zyklisch)", () => {
  it("nutzt bei 4-Frame-Typen zyklisch alle 4 Frames (4/4)", () => {
    for (const def of ENEMY_LIST) {
      const frames = framesForDef(def)!;
      for (const phase of [0, 1.3, 2.7, 5.1]) {
        const seen = new Set(cycleIndices(frames.length, phase));
        expect(seen, `${def.id} phase=${phase}`).toEqual(new Set([0, 1, 2, 3]));
      }
    }
  });

  it("bleibt bei 2-Frame-Typen auf F0/F1 (2/2), zeigt nie F2+", () => {
    // Die 3 Legacy-2-Frame-Eintraege bleiben in SPRITE_FRAMES (Keys unangetastet).
    const legacy2 = Object.entries(SPRITE_FRAMES).filter(([, f]) => f.length === 2);
    expect(legacy2.length).toBe(3);
    for (const [key, frames] of legacy2) {
      const seen = new Set(cycleIndices(frames.length, 0));
      expect(seen, key).toEqual(new Set([0, 1]));
    }
    // Kein Index kann bei frameCount=2 ausserhalb {0,1} liegen, auch nicht
    // mit beliebiger Phase oder grossen Zeiten.
    for (let t = 0; t < 10; t += 0.037) {
      for (const phase of [0, 0.5, 2.2, 6.1]) {
        const idx = runFrameIndex(2, t, phase);
        expect(idx === 0 || idx === 1).toBe(true);
      }
    }
  });

  it("hat deterministische Eckfaelle", () => {
    expect(runFrameIndex(4, 0, 0)).toBe(0);
    expect(runFrameIndex(4, 1 / 6, 0)).toBe(1);
    expect(runFrameIndex(4, 3 / 6, 0)).toBe(3);
    expect(runFrameIndex(4, 4 / 6, 0)).toBe(0);
    expect(runFrameIndex(3, 0, 0)).toBe(0);
    expect(runFrameIndex(0, 5, 1)).toBe(0); // leerer Frames-Array kann nicht crashen
  });
});
