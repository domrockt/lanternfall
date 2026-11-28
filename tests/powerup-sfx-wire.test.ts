import { describe, expect, it, vi } from "vitest";

// PickupSystem importiert Phaser + Atlas + Icons; fuer den Unit-Test genuegen Stubs.
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));
vi.mock("../src/gfx/atlas", () => ({
  makeImage: (_scene: unknown, _x: number, _y: number, key: string) => makeStubImage(key),
  applyTexture: () => {},
}));
vi.mock("../src/gfx/icons", () => ({
  iconKeyForOffer: (kind: string, id: string) => `icon_${kind}_${id}`,
}));

// Audio wird gemockt (die echte Audio-Familie ist von m10-pickup-sfx-distinct
// geclaimed): getAudio().play zaehlt Calls, SFX_KEYS enthaelt "powerup" — das
// bildet den Stand nach dem Merge der sfx-distinct-Lane ab.
const state = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("../src/audio/AudioSystem", () => ({
  SFX_KEYS: { hit: "sfx_hit", levelup: "sfx_levelup", powerup: "sfx_powerup" },
  getAudio: () => ({
    play: (id: string) => {
      state.calls.push(id);
      return true;
    },
  }),
}));

import { PickupSystem, pickupMomentSpec } from "../src/systems/PickupSystem";

// ── Stubs (Muster tests/pickup-moment.test.ts) ──────────────────────────────
interface StubImage {
  key: string;
  active: boolean;
  destroyed: boolean;
  setDepth: () => StubImage;
  setScale: () => StubImage;
  setAlpha: () => StubImage;
  setTintFill: () => StubImage;
  clearTint: () => StubImage;
  setPosition: () => StubImage;
  setVisible: () => StubImage;
  setActive: () => StubImage;
  destroy: () => void;
}

function makeStubImage(key = "unknown"): StubImage {
  const img: StubImage = {
    key,
    active: true,
    destroyed: false,
    setDepth() { return img; },
    setScale() { return img; },
    setAlpha() { return img; },
    setTintFill() { return img; },
    clearTint() { return img; },
    setPosition() { return img; },
    setVisible() { return img; },
    setActive() { return img; },
    destroy() { img.destroyed = true; img.active = false; },
  };
  return img;
}

function graphicsStub() {
  const g = {
    active: true,
    destroyed: false,
    setDepth() { return g; },
    clear() { return g; },
    lineStyle() { return g; },
    strokeRect() { return g; },
    strokeCircle() { return g; },
    destroy() { g.destroyed = true; g.active = false; },
  };
  return g;
}

/** Szene mit levelSys (Erkennungspfad) + add (Moment-Anlage). */
function makeScene(passives: { id: string; level: number }[] = []) {
  return {
    add: { graphics: graphicsStub },
    levelSys: { passives },
  } as never;
}

function newSystem(passives: { id: string; level: number }[] = []) {
  state.calls.length = 0;
  return new PickupSystem(makeScene(passives));
}

describe("powerup-sfx-wire: Aufnahme-Moment loest genau einen SFX aus", () => {
  it("playPowerupMoment: genau ein 'powerup'-Call je gueltigem Moment", () => {
    const sys = newSystem();
    expect(pickupMomentSpec("boots")).not.toBeNull();
    sys.playPowerupMoment("boots", 10, 10);
    expect(state.calls).toEqual(["powerup"]);
    sys.playPowerupMoment("tome", 10, 10);
    expect(state.calls).toEqual(["powerup", "powerup"]);
    expect(sys.moments.length).toBe(2);
  });

  it("unbekannte Powerup-id: kein spec, kein Sound", () => {
    const sys = newSystem();
    sys.playPowerupMoment("gibt_es_nicht", 10, 10);
    expect(state.calls).toEqual([]);
    expect(sys.moments.length).toBe(0);
  });

  it("Erkennungspfad (Level-up/Truhe via passives-Diff): genau 1 Call je Erwerb, kein Doppel-Sound", () => {
    const passives: { id: string; level: number }[] = [];
    const sys = newSystem(passives);
    const onCollect = () => {};
    // Erstes update() liefert nur den Grundzustand (kein Moment beim Run-Start).
    sys.update(1 / 60, 0, 0, 40, onCollect);
    expect(state.calls).toEqual([]);
    // Neuer Erwerb -> genau ein neuer Call.
    passives.push({ id: "boots", level: 1 });
    sys.update(1 / 60, 0, 0, 40, onCollect);
    expect(state.calls).toEqual(["powerup"]);
    // Frame ohne Erwerb -> kein weiterer Call (kein Doppel-Sound).
    sys.update(1 / 60, 0, 0, 40, onCollect);
    expect(state.calls).toEqual(["powerup"]);
    // Upgrade -> wieder genau ein Call.
    passives[0] = { id: "boots", level: 2 };
    sys.update(1 / 60, 0, 0, 40, onCollect);
    expect(state.calls).toEqual(["powerup", "powerup"]);
  });

  it("Gem-/XP-Sammelpfad bleibt lautlos (0 powerup-Calls)", () => {
    const sys = newSystem();
    const rng = { next: () => 0.5 };
    sys.drop(0, 0, "small", rng);
    expect(sys.count).toBe(1);
    let collected = 0;
    sys.update(1 / 60, 0, 0, 40, () => { collected += 1; });
    expect(collected).toBe(1);
    expect(state.calls).toEqual([]);
  });

  it("clearMoments veraendert die Call-Historie nicht (Sound startet einmal)", () => {
    const sys = newSystem();
    sys.playPowerupMoment("heart", 5, 5);
    sys.clearMoments();
    expect(sys.moments.length).toBe(0);
    expect(state.calls).toEqual(["powerup"]);
  });
});
