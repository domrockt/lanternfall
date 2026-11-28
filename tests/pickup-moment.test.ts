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

import { PAL } from "../src/palette";
import {
  MAX_MOMENTS,
  MOMENT_DURATION,
  MOMENT_ICON_SIZE,
  MOMENT_RING_FROM,
  MOMENT_RING_TO,
  PickupSystem,
  diffPassiveAcquisitions,
  pickupMomentSpec,
  type PowerupMoment,
} from "../src/systems/PickupSystem";

// ── Stubs ───────────────────────────────────────────────────────────────────
interface StubImage {
  key: string;
  active: boolean;
  alpha: number;
  tintFill: boolean;
  positions: [number, number][];
  destroyed: boolean;
  setDepth: () => StubImage;
  setScale: (s: number) => StubImage;
  setAlpha: (a: number) => StubImage;
  setTintFill: () => StubImage;
  clearTint: () => StubImage;
  setPosition: (x: number, y: number) => StubImage;
  setVisible: () => StubImage;
  setActive: () => StubImage;
  destroy: () => void;
}

function makeStubImage(key = "unknown"): StubImage {
  const img: StubImage = {
    key,
    active: true,
    alpha: 1,
    tintFill: false,
    positions: [],
    destroyed: false,
    setDepth() { return img; },
    setScale() { return img; },
    setAlpha(a: number) { img.alpha = a; return img; },
    setTintFill() { img.tintFill = true; return img; },
    clearTint() { img.tintFill = false; return img; },
    setPosition(x: number, y: number) { img.positions.push([x, y]); return img; },
    setVisible() { return img; },
    setActive() { return img; },
    destroy() { img.destroyed = true; img.active = false; },
  };
  images.push(img);
  return img;
}

const images: StubImage[] = [];

function graphicsStub() {
  const g = {
    active: true,
    lineWidths: [] as number[],
    destroyed: false,
    setDepth() { return g; },
    clear() { g.lineWidths = []; },
    lineStyle(w: number) { g.lineWidths.push(w); },
    strokeRect() {},
    strokeCircle() {},
    destroy() { g.destroyed = true; g.active = false; },
  };
  return g;
}

function makeScene(passives: { id: string; level: number }[] | null = null) {
  return {
    add: { graphics: () => graphicsStub() },
    levelSys: passives ? { passives } : undefined,
  } as never;
}

const noop = () => {};
const rng = { next: () => 0.5 };
const POWERUPS = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];

function imageOf(m: PowerupMoment): StubImage {
  return m.icon as unknown as StubImage;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("M10 Aufnahme-Moment: Existenz je Powerup", () => {
  it("erzeugt fuer jedes der 6 Powerups einen Moment mit dem richtigen Icon", () => {
    for (const id of POWERUPS) {
      images.length = 0;
      const ps = new PickupSystem(makeScene());
      ps.playPowerupMoment(id, 100, 100);
      expect(ps.moments.length).toBe(1);
      expect(ps.moments[0].id).toBe(id);
      expect(images.map((i) => i.key)).toContain(`icon_passive_${id}`);
      expect(ps.momentStats.triggered).toBe(1);
      expect(ps.momentStats.byId[id]).toBe(1);
    }
  });

  it("ignoriert unbekannte ids (kein Moment)", () => {
    const ps = new PickupSystem(makeScene());
    ps.playPowerupMoment("nicht_da", 0, 0);
    expect(ps.moments.length).toBe(0);
    expect(ps.momentStats.triggered).toBe(0);
  });

  it("haelt max. 3 parallele Momente ein (aeltester wird beendet)", () => {
    const ps = new PickupSystem(makeScene());
    for (const id of POWERUPS) ps.playPowerupMoment(id, 100, 100);
    expect(ps.moments.length).toBe(MAX_MOMENTS);
    expect(ps.momentStats.triggered).toBe(POWERUPS.length);
  });
});

describe("M10 Aufnahme-Moment: Dauer", () => {
  it("Dauer liegt unter 0,5 s", () => {
    expect(MOMENT_DURATION).toBeLessThanOrEqual(0.5);
    for (const id of POWERUPS) {
      expect(pickupMomentSpec(id)?.durationS).toBeLessThanOrEqual(0.5);
    }
  });

  it("Moment ist nach genau MOMENT_DURATION vorbei", () => {
    const ps = new PickupSystem(makeScene());
    ps.playPowerupMoment("tome", 100, 100);
    expect(ps.moments.length).toBe(1);
    for (let i = 0; i < 3; i++) ps.update(MOMENT_DURATION / 4, 0, 0, 0, noop);
    expect(ps.moments.length).toBe(1); // 0,3 s — noch aktiv
    ps.update(MOMENT_DURATION / 4, 0, 0, 0, noop); // 0,4 s — fertig
    expect(ps.moments.length).toBe(0);
    expect(ps.momentStats.triggered).toBe(1);
  });
});

describe("M10 Aufnahme-Moment: Palette binaer / kein Mixel", () => {
  it("zeichnent ausschliesslich mit Palettefarben und 1-px-Stufen", () => {
    for (const id of POWERUPS) {
      const spec = pickupMomentSpec(id);
      expect(spec).not.toBeNull();
      expect(spec!.scale).toBe(1); // Zielgroesse, nie > 1x hochskaliert
      expect(spec!.iconSize).toBe(MOMENT_ICON_SIZE);
      expect(spec!.rimPx).toBe(1);
      expect(spec!.ringFrom).toBe(MOMENT_RING_FROM);
      expect(spec!.ringTo).toBe(MOMENT_RING_TO);
      // Akzent + Aufblitz sind gueltige Palettenindizes.
      expect(spec!.accent).toBeGreaterThanOrEqual(0);
      expect(spec!.accent).toBeLessThan(PAL.length);
      expect(PAL[spec!.flash]).toBeDefined();
    }
  });

  it("alle Akzentfarben sind aussprechbar unterscheidbar (6 distincte Indizes)", () => {
    const accents = POWERUPS.map((id) => pickupMomentSpec(id)!.accent);
    expect(new Set(accents).size).toBe(POWERUPS.length);
  });

  it("zeichnet nur an ganzzahligen Positionen mit 1-px-Linien", () => {
    images.length = 0;
    const ps = new PickupSystem(makeScene());
    ps.playPowerupMoment("charm", 100.4, 100.6);
    // Bewegung mit nicht-ganzzahliger Schrittweite (echter dt).
    for (let i = 0; i < 6; i++) ps.update(1 / 60, 0, 0, 0, noop);
    const icon = imageOf(ps.moments[0]);
    expect(icon.positions.length).toBeGreaterThan(0);
    for (const [x, y] of icon.positions) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });
});

describe("M10 Aufnahme-Moment: Gem-/XP-Pfad unberuehrt", () => {
  it("Momente veraendern weder Kristalle noch XP-Buchhaltung", () => {
    const ps = new PickupSystem(makeScene());
    ps.drop(100, 100, "medium", rng);
    ps.drop(140, 100, "small", rng);
    const gemsBefore = ps.count;
    const xpBefore = ps.totalXp;
    const statsBefore = { ...ps.stats };

    ps.playPowerupMoment("heart", 100, 100);
    ps.update(0.1, 100, 100, 20, noop); // sammelt den Medium-Kristall

    expect(ps.moments.length).toBe(1); // Moment laeuft nebenher
    expect(ps.stats.collected).toBe(statsBefore.collected + 1);
    expect(ps.stats.collectedXp).toBe(statsBefore.collectedXp + 6);
    expect(ps.stats.grantedXp).toBe(6); // nur der Kristall, kein Moment-Einfluss
    expect(ps.count).toBe(gemsBefore - 1);
    expect(ps.totalXp).toBe(xpBefore - 6);
  });

  it("xpLoss bleibt 0 (gem-drawcap-Invariante)", () => {
    const ps = new PickupSystem(makeScene());
    ps.setCap(24);
    for (let i = 0; i < 40; i++) ps.drop(i, i, "small", rng);
    ps.playPowerupMoment("boots", 0, 0);
    ps.update(0.5, 1000, 1000, 10, noop); // nichts eingesammelt
    const s = ps.stats;
    expect(s.spawnedXp - s.grantedXp - ps.totalXp).toBe(0);
  });
});

describe("M10 Aufnahme-Moment: Erwerb-Erkennung", () => {
  it("diffPassiveAcquisitions: neu / Upgrade / Entfernung ignoriert", () => {
    expect(diffPassiveAcquisitions([], [{ id: "boots", level: 1 }]))
      .toEqual([{ id: "boots", kind: "new" }]);
    expect(diffPassiveAcquisitions(
      [{ id: "boots", level: 1 }],
      [{ id: "boots", level: 3 }],
    )).toEqual([{ id: "boots", kind: "upgrade" }]);
    expect(diffPassiveAcquisitions(
      [{ id: "boots", level: 2 }],
      [{ id: "tome", level: 1 }],
    )).toEqual([{ id: "tome", kind: "new" }]); // Entfernung -> kein Moment
    expect(diffPassiveAcquisitions(
      [{ id: "boots", level: 1 }, { id: "tome", level: 2 }],
      [{ id: "boots", level: 1 }, { id: "tome", level: 2 }],
    )).toEqual([]);
  });

  it("erster update() liefert nur Grundzustand, danach loest Neuerwerb aus", () => {
    const passives: { id: string; level: number }[] = [];
    const scene = makeScene(passives);
    const ps = new PickupSystem(scene);
    ps.update(0.016, 50, 50, 10, noop);
    expect(ps.moments.length).toBe(0);
    passives.push({ id: "tome", level: 1 });
    ps.update(0.016, 50, 50, 10, noop);
    expect(ps.moments.map((m) => m.id)).toEqual(["tome"]);
    // Upgrade loest erneut aus.
    passives[0] = { id: "tome", level: 2 };
    ps.update(0.016, 50, 50, 10, noop);
    expect(ps.momentStats.byId.tome).toBe(2);
    // Entfernung loest nicht aus.
    passives.length = 0;
    ps.update(0.016, 50, 50, 10, noop);
    expect(ps.momentStats.triggered).toBe(2);
  });

  it("Szenen ohne levelSys (Tests/andere Szenen) loesen nichts aus", () => {
    const ps = new PickupSystem({ add: { graphics: () => graphicsStub() } } as never);
    ps.update(0.016, 0, 0, 0, noop);
    ps.update(0.016, 0, 0, 0, noop);
    expect(ps.moments.length).toBe(0);
    expect(ps.momentStats.triggered).toBe(0);
  });

  it("clearMoments raeumt ab (Run-Neustart)", () => {
    images.length = 0;
    const ps = new PickupSystem(makeScene());
    ps.playPowerupMoment("whetstone", 10, 10);
    ps.playPowerupMoment("hourglass", 10, 10);
    ps.clearMoments();
    expect(ps.moments.length).toBe(0);
    expect(images.every((i) => i.destroyed)).toBe(true);
  });
});
