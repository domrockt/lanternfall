import { afterEach, describe, expect, it, vi } from "vitest";

// Gleiche Stub-Struktur wie tests/hazard-disc.test.ts (Raster-Guard-Contract dort).
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));

const imageCalls: { key: string; calls: [string, ...unknown[]][] }[] = [];
vi.mock("../src/gfx/atlas", () => ({
  makeImage: (_scene: unknown, _x: number, _y: number, key: string) => {
    const entry = { key, calls: [] as [string, ...unknown[]][] };
    imageCalls.push(entry);
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "destroy",
    ]) {
      img[m] = (...args: unknown[]) => { entry.calls.push([m, ...args]); return img; };
    }
    return img;
  },
}));

vi.stubGlobal("document", {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      fillStyle: "",
      fillRect: () => {},
    }),
  }),
});

import { HazardSystem } from "../src/systems/Hazards";
import { rimPulseAlpha, rimPulseAlphaStaged } from "../src/systems/Hazards";
import {
  DISC_DRAW_CAP_LOW, RIM_PULSE_PHASE_FRACTION_LOW,
  drawQualityTier, forcedQualityTier,
  rimPulsePhaseFractionForQuality, warnDiscDrawCapForQuality,
} from "../src/gfx/hazardDisc";
import type { QualityTier } from "../src/logic/quality";

const fakeScene = () => ({
  tweens: { add: vi.fn() },
  textures: { exists: () => false, addCanvas: () => {} },
}) as unknown as import("phaser").Scene;

const call = (img: { calls: [string, ...unknown[]][] }, m: string, arg?: unknown) =>
  img.calls.find(([mm, a]) => mm === m && (arg === undefined || a === arg)) !== undefined;

afterEach(() => {
  // Nur das Override-Flag ruecksetzen — der document-Stub muss stehen bleiben.
  delete (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality;
});

describe("K2 Tier-Matrix: Draw-Cap und Puls-Phase je Stufe (reine Funktionen)", () => {
  it("Draw-Cap: low = DISC_DRAW_CAP_LOW, high/medium offen (bitgleich)", () => {
    expect(DISC_DRAW_CAP_LOW).toBe(6);
    expect(warnDiscDrawCapForQuality("low")).toBe(6);
    expect(warnDiscDrawCapForQuality("medium")).toBe(Number.POSITIVE_INFINITY);
    expect(warnDiscDrawCapForQuality("high")).toBe(Number.POSITIVE_INFINITY);
    // Rueckfall high bei unbekanntem Tier (wie qualityBudgetFor).
    expect(warnDiscDrawCapForQuality("nope" as QualityTier)).toBe(Number.POSITIVE_INFINITY);
  });

  it("Puls-Phasen-Anteil: low = 0.5 ('kuerzere Puls-Phase'), high/medium = 1", () => {
    expect(RIM_PULSE_PHASE_FRACTION_LOW).toBe(0.5);
    expect(rimPulsePhaseFractionForQuality("low")).toBe(0.5);
    expect(rimPulsePhaseFractionForQuality("medium")).toBe(1);
    expect(rimPulsePhaseFractionForQuality("high")).toBe(1);
  });

  it("forcedQualityTier: nur 'low'/'medium'/'high' sind wirksam, alles andere null", () => {
    expect(forcedQualityTier({})).toBeNull();
    expect(forcedQualityTier({ __lfForceQuality: undefined })).toBeNull();
    expect(forcedQualityTier({ __lfForceQuality: "low" })).toBe("low");
    expect(forcedQualityTier({ __lfForceQuality: "medium" })).toBe("medium");
    expect(forcedQualityTier({ __lfForceQuality: "high" })).toBe("high");
    expect(forcedQualityTier({ __lfForceQuality: "nope" })).toBeNull();
    expect(forcedQualityTier({ __lfForceQuality: 42 })).toBeNull();
  });

  it("drawQualityTier: Override hat Vorrang, sonst Regler-Stand", () => {
    expect(drawQualityTier("high", {})).toBe("high");
    expect(drawQualityTier("medium", {})).toBe("medium");
    expect(drawQualityTier("high", { __lfForceQuality: "low" })).toBe("low");
    expect(drawQualityTier("low", { __lfForceQuality: "high" })).toBe("high");
    expect(drawQualityTier("high", { __lfForceQuality: "x" })).toBe("high");
  });
});

describe("K2 rimPulseAlphaStaged: gestutzte Puls-Phase, HIGH bitgleich", () => {
  const WARN_MAX = 1.2;
  const samples = Array.from({ length: 121 }, (_, i) => (i / 120) * WARN_MAX);

  it("phaseFraction 1 (bzw. NaN): exakt rimPulseAlpha(elapsed) — bitgleich", () => {
    for (const t of samples) {
      expect(rimPulseAlphaStaged(t, WARN_MAX, 1)).toBeCloseTo(rimPulseAlpha(t), 12);
      expect(rimPulseAlphaStaged(t, WARN_MAX, Number.NaN)).toBeCloseTo(rimPulseAlpha(t), 12);
    }
  });

  it("phaseFraction 0.5: bis Phasenende bitgleich, danach Konstante (Lesbar-Alpha)", () => {
    const phaseEnd = WARN_MAX * 0.5;
    const frozen = rimPulseAlpha(phaseEnd);
    for (const t of samples) {
      const v = rimPulseAlphaStaged(t, WARN_MAX, 0.5);
      if (t <= phaseEnd) {
        expect(v).toBeCloseTo(rimPulseAlpha(t), 12);
      } else {
        expect(v).toBeCloseTo(frozen, 12);
      }
    }
    // Lesbarkeit: die eingefrorene Alpha liegt im Puls-Band (>= MIN_RIM_ALPHA).
    expect(frozen).toBeGreaterThanOrEqual(0.35);
  });

  it("degenerate warnMax (0/NaN) faellt auf rimPulseAlpha zurueck", () => {
    expect(rimPulseAlphaStaged(0.3, 0, 0.5)).toBeCloseTo(rimPulseAlpha(0.3), 12);
    expect(rimPulseAlphaStaged(0.3, Number.NaN, 0.5)).toBeCloseTo(rimPulseAlpha(0.3), 12);
  });
});

describe("K2 Verdrahtung: Draw-Budget in HazardSystem.update", () => {
  it("high (Regler-Stand): nie setVisible — Draw-Pfad bitgleich, alle Alphas wie zuvor", () => {
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    for (let i = 0; i < 10; i++) hz.spawnCircle(100 + i * 10, 0, { warn: 1, damage: 1, radius: 20 });
    hz.update(1 / 60, 100, 0, () => {});
    expect(imageCalls).toHaveLength(20); // 10 Discs + 10 Rims
    for (const img of imageCalls) expect(call(img, "setVisible")).toBe(false);
    // Alpha-Pflege laeuft unveraendert (Disc-Puls + Rim-Puls je Frame).
    const discAlpha = imageCalls.filter((_, i) => i % 2 === 0).map((img) => img.calls.filter(([m]) => m === "setAlpha").length);
    for (const n of discAlpha) expect(n).toBeGreaterThanOrEqual(2); // Spawn 0.9 + Update(s)
  });

  it("low: nur die 6 spieler-naechsten Warn-Discs gezeichnet, uerige hidden (NUR Optik)", () => {
    (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality = "low";
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    // 10 Discs in Zeile, Spieler bei x=100 -> Distanzen 0..90, Cap 6 haelt i=0..5.
    for (let i = 0; i < 10; i++) hz.spawnCircle(100 + i * 10, 0, { warn: 1, damage: 1, radius: 20 });
    hz.update(1 / 60, 100, 0, () => {});
    const discs = imageCalls.filter((_, i) => i % 2 === 0);
    const rims = imageCalls.filter((_, i) => i % 2 === 1);
    expect(discs).toHaveLength(10);
    for (let i = 0; i < 10; i++) {
      const hidden = i >= DISC_DRAW_CAP_LOW;
      expect(call(discs[i], "setVisible", false)).toBe(hidden);
      expect(call(rims[i], "setVisible", false)).toBe(hidden);
    }
    // Naechste 6 bleiben voll sichtbar mit Alpha-Pflege; Cap genau eingehalten.
    let drawn = 0;
    for (const img of discs) if (!call(img, "setVisible", false)) drawn++;
    expect(drawn).toBe(DISC_DRAW_CAP_LOW);
  });

  it("low: versteckte Warnflaechen bleiben wirksam — Treffer und threats() unveraendert", () => {
    (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality = "low";
    const hz = new HazardSystem(fakeScene());
    // Spieler sitzt in einer WEIT ENTFERNTEN grossen Disc (wird versteckt):
    // 6 naehere kleine Discs + 3 weite, eine davon (radius 100) ueberdeckt den Spieler.
    const px = 1000, py = 0;
    for (const d of [0, 10, 20, 30, 40, 45]) hz.spawnCircle(px + d, 0, { warn: 0.6, damage: 1, radius: 8 });
    const covering = hz.spawnCircle(px + 60, 0, { warn: 0.6, damage: 7, radius: 100 });
    hz.spawnCircle(px + 80, 0, { warn: 0.6, damage: 1, radius: 8 });
    // Distanzen: 0,10,20,30,40,45,60,80 -> Cap 6 versteckt die beiden letzten.
    hz.update(0.1, px, py, () => {});
    // Bot-Sicht: threats() liefert ALLE Warnflaechen, auch versteckte.
    const threats = hz.threats().filter((t) => Math.abs(t.x - (px + 60)) < 1);
    expect(threats).toHaveLength(1);
    expect(threats[0].radius).toBe(100);
    // Warnphase vorbei: versteckte Disc trifft trotzdem (Gameplay bitgleich).
    const hits: number[] = [];
    hz.update(0.6, px, py, (dmg) => hits.push(dmg));
    expect(hits).toContain(7);
    // Trigger/Removal unveraendert: alle Warnphasen abgelaufen, Liste aufgeraeumt.
    expect(covering.triggered).toBe(true);
    expect(hz.active.some((h) => h.warn > 0)).toBe(false);
  });

  it("low: Rim-Puls wird nach dem Phasenende eingefroren (kuerzere Puls-Phase)", () => {
    (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality = "low";
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(0, 0, { warn: 1.2, damage: 1, radius: 30 });
    const rim = imageCalls[1];
    rim.calls.length = 0; // Spawn-Alphas raus; nur die Update-Alpha-Pflege zaehlt.
    // Zweite Haelfte der Warnphase: mehrere Updates, alle Rim-Alphas identisch
    // (elapsed 0.7..0.95, alles nach dem Phasenende 0.6).
    const alphas: number[] = [];
    for (const dt of [0.7, 0.05, 0.05, 0.05, 0.05, 0.05]) {
      hz.update(dt, 100, 0, () => {});
      const [, a] = rim.calls[rim.calls.length - 1];
      alphas.push(a as number);
    }
    for (const a of alphas) expect(a).toBeCloseTo(alphas[0], 12);
    expect(alphas[0]).toBeCloseTo(rimPulseAlpha(0.6), 12);
  });

  it("Rueckauf auf high (Override weg): versteckte Discs werden wieder sichtbar", () => {
    (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality = "low";
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    for (let i = 0; i < 10; i++) hz.spawnCircle(100 + i * 10, 0, { warn: 5, damage: 1, radius: 20 });
    hz.update(1 / 60, 100, 0, () => {});
    const disc6 = imageCalls[12]; // Disc i=6 (Entry-Reihenfolge: 2 je Spawn)
    expect(call(disc6, "setVisible", false)).toBe(true);

    delete (globalThis as { __lfForceQuality?: unknown }).__lfForceQuality; // high
    hz.update(1 / 60, 100, 0, () => {});
    expect(call(disc6, "setVisible", true)).toBe(true);
  });
});
