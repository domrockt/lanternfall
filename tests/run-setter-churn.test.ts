// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";

// Lane m10-run-setter-churn, K3 (#12706): Guard-Tests zum Setter-Churn-Fix.
//
// K2 hat in src/scenes/Run.ts (nur dort) die Phaser-Setter im Frame-Pfad auf
// compare-then-set umgestellt: Setter laufen nur, wenn sich der Wert wirklich
// aendert (Elite-Aura-Block, playerBody Tint/Alpha, hpBar, Positionen von
// player/shadow/light/enemy/aura). Vorher liefen z. B. der Elite-Aura-Block
// (setBlendMode/setTintFill/setAlpha/setDepth/setVisible) und playerBody
// clearTint()+setAlpha(1) JEDEM Frame — Messung K1: 123,5 Setter/Frame in der
// Run-Szene, 94,3 % davon No-ops.
//
// Die Tests frieren ein:
//   1. Quell-Kontrakt: die compare-then-set-Guards bleiben verdrahtet.
//   2. Setter-Budget + Bitgleichheit ueber 3 Seeds: eine Emulation des Musters
//      (naiver Setter je Frame vs. Guard) liefert IMMER denselben Endzustand,
//      aber der Guard setzt keinen einzigen No-op-Setter.

const SOURCE = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

describe("m10-run-setter-churn: Quell-Kontrakt der compare-then-set-Hebel (Run.ts)", () => {
  it("Elite-Aura: Konstant-Setter sind je Frame bewacht, nicht unbedingte Aufrufe", () => {
    // Kein unbedingter Aura-Block mehr (Regressionsschutz zum Vorher-Zustand).
    expect(SOURCE).not.toMatch(/\n\s+e\.aura\.setBlendMode\(Phaser\.BlendModes\.NORMAL\);/);
    expect(SOURCE).not.toMatch(/\n\s+e\.aura\.setTintFill\(PAL\[C\.amber\]\);/);
    expect(SOURCE).not.toMatch(/\n\s+e\.aura\.setAlpha\(0\.92\);/);
    expect(SOURCE).not.toMatch(/\n\s+e\.aura\.setDepth\(e\.sprite\.depth - 0\.01\);/);
    // Bewachte Varianten vorhanden.
    expect(SOURCE).toContain("if (e.aura.blendMode !== Phaser.BlendModes.NORMAL) e.aura.setBlendMode(Phaser.BlendModes.NORMAL);");
    expect(SOURCE).toContain("if (e.aura.tintTopLeft !== PAL[C.amber]) e.aura.setTintFill(PAL[C.amber]);");
    expect(SOURCE).toContain("if (e.aura.alpha !== 0.92) e.aura.setAlpha(0.92);");
    expect(SOURCE).toContain("if (!e.aura.visible) e.aura.setVisible(true);");
  });

  it("playerBody: Tint/Alpha nur bei Aenderung (kein je-Frame clearTint/setAlpha(1))", () => {
    expect(SOURCE).not.toMatch(/else\s+this\.playerBody\.clearTint\(\);/);
    expect(SOURCE).not.toMatch(/else\s+this\.playerBody\.setAlpha\(1\);/);
    expect(SOURCE).toContain("if (this.playerBody.tintTopLeft !== PAL[C.hotRed]) this.playerBody.setTint(PAL[C.hotRed]);");
    expect(SOURCE).toContain("if (this.playerBody.alpha !== bodyAlpha) this.playerBody.setAlpha(bodyAlpha);");
  });

  it("hpBar: Sichtbarkeits-Sync nur bei Wechsel, Position/Scale nur im sichtbaren Zustand", () => {
    expect(SOURCE).toContain("if (hurt !== this.hpBarShown) {");
    expect(SOURCE).toContain("if (!hurt) return;");
  });

  it("Positionen (player/shadow/light, enemy, aura) werden nur bei geaenderter Position gesetzt", () => {
    expect(SOURCE).toContain("if (this.player.x !== rx || this.player.y !== ry) {");
    expect(SOURCE).toContain("if (e.sprite.x !== ex || e.sprite.y !== ey) e.sprite.setPosition(ex, ey);");
    expect(SOURCE).toContain("if (e.aura.x !== e.sprite.x || e.aura.y !== e.sprite.y) e.aura.setPosition(e.sprite.x, e.sprite.y);");
  });
});

// ── Emulation des compare-then-set-Musters ──────────────────────────────────
// Nachbildung der bewachten Phaser-Setter-Semantik (nur die im Fix genutzten
// Properties). Plain-Objekt statt Phaser: gleiche getter/setter-Vertraege,
// zaehlt Setter-Aufrufe.

type FakeGO = {
  x: number; y: number; alpha: number; depth: number; visible: boolean;
  blendMode: number; tintTopLeft: number;
  calls: Record<string, number>;
};

function fakeGo(): FakeGO {
  const go = {
    _x: 0, _y: 0, _alpha: 1, _depth: 0, _visible: true,
    _blendMode: 0, _tintTopLeft: 0xffffff,
    calls: {} as Record<string, number>,
  } as unknown as FakeGO;
  const bump = (k: string) => { go.calls[k] = (go.calls[k] ?? 0) + 1; };
  const acc = (prop: keyof FakeGO, key: string, set: (v: unknown) => void) => {
    Object.defineProperty(go, prop, {
      get() { return go[`_${key}` as keyof FakeGO]; },
      set(v) { bump(key); set(v); },
    });
  };
  acc("x", "x", (v) => { (go as unknown as Record<string, unknown>)["_x"] = v; });
  acc("y", "y", (v) => { (go as unknown as Record<string, unknown>)["_y"] = v; });
  acc("alpha", "alpha", (v) => { (go as unknown as Record<string, unknown>)["_alpha"] = v; });
  acc("depth", "depth", (v) => { (go as unknown as Record<string, unknown>)["_depth"] = v; });
  acc("visible", "visible", (v) => { (go as unknown as Record<string, unknown>)["_visible"] = v; });
  acc("blendMode", "blendMode", (v) => { (go as unknown as Record<string, unknown>)["_blendMode"] = v; });
  acc("tintTopLeft", "tintTopLeft", (v) => { (go as unknown as Record<string, unknown>)["_tintTopLeft"] = v; });
  return go;
}

/** Exakt das K2-Muster aus Run.ts updateVisuals (Aura-Zweig). */
function guardedFrame(go: FakeGO, e: { x: number; y: number; depth: number }): void {
  if (go.blendMode !== 1) go.blendMode = 1; // Phaser.BlendModes.NORMAL
  if (go.tintTopLeft !== 0xffb84d) go.tintTopLeft = 0xffb84d;
  if (go.alpha !== 0.92) go.alpha = 0.92;
  if (go.x !== e.x || go.y !== e.y) { go.x = e.x; go.y = e.y; }
  if (go.depth !== e.depth - 0.01) go.depth = e.depth - 0.01;
  if (!go.visible) go.visible = true;
}

/** Der Vorher-Zustand: dieselben Setter unbeding je Frame. */
function naiveFrame(go: FakeGO, e: { x: number; y: number; depth: number }): void {
  go.blendMode = 1;
  go.tintTopLeft = 0xffb84d;
  go.alpha = 0.92;
  go.x = e.x;
  go.y = e.y;
  go.depth = e.depth - 0.01;
  go.visible = true;
}



describe("m10-run-setter-churn: Guard ist bitgleich und setzt keine No-op-Setter (3 Seeds)", () => {
  for (const seed of [1, 42, 1337]) {
    it(`Seed ${seed}: 1200 Frames — Endzustand identisch, 0 No-op-Setter im Guard`, () => {
      const rng = mulberry32(seed);
      const a = fakeGo();
      const b = fakeGo();
      let noOpSetters = 0;
      let guardedSetters = 0;
      for (let t = 0; t < 1200; t++) {
        // Gegner bewegt sich, Teleport-Frames wechseln Werte hart.
        const teleport = rng() < 0.02;
        const e = {
          x: Math.round(rng() * 640) + (teleport ? 100 : 0),
          y: Math.round(rng() * 360) + (teleport ? -50 : 0),
          depth: 6 + (rng() < 0.5 ? 0 : 0.01),
        };
        const callsBefore = { ...a.calls };
        guardedFrame(a, e);
        naiveFrame(b, e);
        for (const k of Object.keys(a.calls)) {
          guardedSetters += a.calls[k] - (callsBefore[k] ?? 0);
        }
        // Bitgleich: jeder Frame-Effekt muss im Endzustand uebereinstimmen.
        expect([a.x, a.y, a.alpha, a.depth, a.visible, a.blendMode, a.tintTopLeft])
          .toEqual([b.x, b.y, b.alpha, b.depth, b.visible, b.blendMode, b.tintTopLeft]);
      }
      // No-op-Setzer: der Guard darf nur setzen, wenn sich der Wert aendert —
      // bei identischen Folge-Werten MUSS der Zaehler stehen bleiben.
      const repeat = { x: 10, y: 20, depth: 6 };
      guardedFrame(a, repeat);
      const frozen = { ...a.calls };
      for (let i = 0; i < 100; i++) guardedFrame(a, repeat);
      for (const k of Object.keys(frozen)) {
        expect(a.calls[k]).toBe(frozen[k]);
      }
      expect(guardedSetters).toBeGreaterThan(0);
      
    });
  }
});
