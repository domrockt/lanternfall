/**
 * M10-device-janky-node (K2/K4): Guard für die Geräteknoten-Verdrahtung.
 *
 * Pinnt:
 *  1. die reine Erkennung isDeviceNode (NUR "Adreno (TM) 710" + DPR ≥ 2 —
 *     Desktop/iGPU/SwiftShader fallen nie hinein),
 *  2. den Stufen-Deckel clampTierMax (Identität auf Desktop, medium-Deckel am
 *     Gerät; Abstieg auf low/thermal bleibt möglich),
 *  3. die Desktop-Bitgleichheit der Pool-Caps (DEVICE_NODE = false in Vitest/
 *     Node: FxSystem 220 / ParticleSystem 360 unverändert, setMaxActive
 *     unverändert),
 *  4. per Quell-Pin die EINZIGEN Verdrahtungsstellen (config.ts tick: Basis-
 *     Stufe am Gerät auf DEVICE_TIER_CAP; FxSystem.ts: beide Pool-Caps) —
 *     src/logic/quality.ts bleibt UNVERÄNDERT (Schwellen 45/57 FPS).
 */
import { describe, expect, it, afterEach, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
// FxSystem importiert Phaser fuer BlendModes/Szene; im Node-Test neutral gemockt
// (Muster tests/fx-overdraw.test.ts).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));
import {
  DEVICE_MAX_FX_ACTIVE,
  DEVICE_MAX_PARTICLES,
  DEVICE_TIER_CAP,
  clampTierMax,
  isDeviceNode,
} from "../src/config";
import { QUALITY_ORDER, QUALITY_BUDGETS, qualityBudgetFor } from "../src/logic/quality";
import { FxSystem, ParticleSystem } from "../src/systems/FxSystem";

const configSrc = (): string => readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");
const fxSrc = (): string => readFileSync(new URL("../src/systems/FxSystem.ts", import.meta.url), "utf8");
const qualitySrc = (): string => readFileSync(new URL("../src/logic/quality.ts", import.meta.url), "utf8");

const DEVICE_RENDERER = "Adreno (TM) 710";
const DESKTOP_RENDERERS = [
  "Mesa Intel(R) Graphics (RPL-S)",
  "Apple M1",
  "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)",
  "SwiftShader",
];

// --- Fake-Sprite/Scene (Muster tests/boss-fx-contrast.test.ts) ---------------
interface FakeSprite {
  width: number; height: number; visible: boolean; alpha: number; blend: number;
  frame: { name: string }; texture: { key: string };
  setAlpha(a: number): unknown; setBlendMode(m: number): unknown; setPosition(): unknown;
  setScale(x: number, y: number): unknown; setRotation(): unknown; setDepth(): unknown;
  setVisible(v: boolean): unknown; setActive(v: boolean): unknown; setTint(): unknown;
  clearTint(): unknown; setTexture(k: string): unknown;
}
function fakeSprite(w = 8, h = 8): FakeSprite {
  const rec: FakeSprite = {
    width: w, height: h, visible: false, alpha: 1, blend: 0,
    frame: { name: "fx" }, texture: { key: "fx_spark" },
    setAlpha(a: number) { rec.alpha = a; return rec; },
    setBlendMode(m: number) { rec.blend = m; return rec; },
    setPosition() { return rec; }, setScale() { return rec; },
    setRotation() { return rec; }, setDepth() { return rec; },
    setVisible(v: boolean) { rec.visible = v; return rec; },
    setActive() { return rec; }, setTint() { return rec; },
    clearTint() { return rec; }, setTexture() { return rec; },
  };
  return rec;
}
function fakeScene(sprite: FakeSprite): Phaser.Scene {
  return {
    events: { once: () => {} },
    add: { image: () => sprite },
    time: { now: 0 },
  } as unknown as Phaser.Scene;
}

const spawnsAccepted = (sys: FxSystem | ParticleSystem, n: number): number => {
  let ok = 0;
  for (let i = 0; i < n; i++) {
    if (sys.spawn({ texture: "fx_spark", x: 0, y: 0, life: 1, additive: false }) !== null) ok++;
  }
  return ok;
};

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("K2a: isDeviceNode — nur der Adreno-710-Knoten mit DPR ≥ 2", () => {
  it("Geraeteknoten erkannt: 'Adreno (TM) 710' + DPR 2 (Redmi Pad Pro)", () => {
    expect(isDeviceNode(DEVICE_RENDERER, 2)).toBe(true);
    expect(isDeviceNode(DEVICE_RENDERER, 3)).toBe(true);
  });

  it("Desktop/iGPU/SwiftShader fallen NIE hinein (auch mit DPR 2)", () => {
    for (const r of DESKTOP_RENDERERS) expect(isDeviceNode(r, 2)).toBe(false);
  });

  it("ohne Renderer-String oder ohne DPR ≥ 2 nie Geraet (misstraut fehlerhaftem GL)", () => {
    expect(isDeviceNode(null, 2)).toBe(false);
    expect(isDeviceNode(undefined, 2)).toBe(false);
    expect(isDeviceNode("", 2)).toBe(false);
    expect(isDeviceNode(DEVICE_RENDERER, 1)).toBe(false);
    expect(isDeviceNode(DEVICE_RENDERER, 0)).toBe(false);
  });
});

describe("K2b: clampTierMax — Stufen-Deckel (reine Ordnung ueber QUALITY_ORDER)", () => {
  it("Desktop-Deckel 'high' ist Identitaet", () => {
    expect(QUALITY_ORDER[QUALITY_ORDER.length - 1]).toBe("high");
    for (const t of QUALITY_ORDER) expect(clampTierMax(t, "high")).toBe(t);
  });

  it("Geraete-Deckel 'medium': high -> medium, medium/low bleiben", () => {
    expect(DEVICE_TIER_CAP).toBe("medium");
    expect(clampTierMax("high", "medium")).toBe("medium");
    expect(clampTierMax("medium", "medium")).toBe("medium");
    expect(clampTierMax("low", "medium")).toBe("low"); // Abstieg bleibt moeglich
  });

  it("unbekannte Stufe = Identitaet (kein Rueckfall in den Deckel)", () => {
    expect(clampTierMax("thermal" as never, "medium")).toBe("thermal" as never);
  });
});

describe("K2c: Desktop-Bitgleichheit der Pool-Caps (DEVICE_NODE = false in Node)", () => {
  it("FxSystem: Default-Cap 220 unveraendert (220 Spawns ok, 221. abgewiesen)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const fx = new FxSystem(fakeScene(fakeSprite()));
    expect(spawnsAccepted(fx, 221)).toBe(220);
  });

  it("FxSystem: setMaxActive verhaelt sich unveraendert (90 -> 90 Spawns, dann abgewiesen)", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const fx = new FxSystem(fakeScene(fakeSprite()));
    fx.setMaxActive(90);
    expect(spawnsAccepted(fx, 91)).toBe(90);
  });

  it("ParticleSystem: Default-Cap 360 unveraendert", () => {
    (globalThis as { window?: unknown }).window = { devicePixelRatio: 1 };
    const ps = new ParticleSystem(fakeScene(fakeSprite()));
    expect(spawnsAccepted(ps, 361)).toBe(360);
  });

  it("Deckel-Konstanten: FX = medium-Budget (140), Partikel 240 < 360", () => {
    expect(DEVICE_MAX_FX_ACTIVE).toBe(QUALITY_BUDGETS.medium.maxFxSprites);
    expect(DEVICE_MAX_FX_ACTIVE).toBe(qualityBudgetFor("medium").maxFxSprites);
    expect(DEVICE_MAX_PARTICLES).toBe(240);
    expect(DEVICE_MAX_PARTICLES).toBeLessThan(360);
  });
});

describe("K2d: Quell-Pins — EINZIGE Verdrahtungsstellen, quality.ts unberuehrt", () => {
  it("config.ts: Probe im tick + Stufen-Deckel NUR am Geraeteknoten", () => {
    const src = configSrc();
    expect(src).toContain("probeDeviceNode();");
    expect(src).toContain("DEVICE_NODE ? clampTierMax(qState.tier, DEVICE_TIER_CAP) : qState.tier");
    // Desktop-Pfad bleibt exakt der alte: effectiveQuality(qState.tier, ...)
    expect(src).toContain("QUALITY = effectiveQuality(baseTier, thermalState)");
    // Reviewer-Befund K4: Probe latcht BEIDE Ausgaenge (kein Canvas/GetContext
    // pro rAF-Tick auf Desktop).
    expect(src).toContain("if (deviceProbed) return DEVICE_NODE;");
    expect(src).toContain("deviceProbed = true;");
  });

  it("FxSystem.ts: beide Pool-Caps an DEVICE_*_ geklemmt (Desktop: min(x, x) = x)", () => {
    const src = fxSrc();
    expect(src).toContain("DEVICE_NODE ? Math.min(max, DEVICE_MAX_FX_ACTIVE) : max");
    expect(src).toContain("DEVICE_NODE ? Math.min(max, DEVICE_MAX_PARTICLES) : max");
    expect(src).toContain("DEVICE_NODE ? Math.min(220, DEVICE_MAX_FX_ACTIVE) : 220");
    expect(src).toContain("DEVICE_NODE ? Math.min(360, DEVICE_MAX_PARTICLES) : 360");
  });

  it("src/logic/quality.ts bleibt unveraendert: Regler-Schwellen 45/57 FPS + Hysterese gepinnt", () => {
    const src = qualitySrc();
    expect(src).toContain("export const QUALITY_LOW_FPS = 45;");
    expect(src).toContain("export const QUALITY_HIGH_FPS = 57;");
    expect(src).toContain("export const QUALITY_LOW_MS = 3000;");
    expect(src).toContain("export const QUALITY_HIGH_MS = 12000;");
  });
});
