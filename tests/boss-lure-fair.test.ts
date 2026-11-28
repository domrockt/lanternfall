import { describe, expect, it } from "vitest";
import {
  BOSS_ATTACKS,
  BOSS_CATCHUP_AFTER_S,
  BOSS_CATCHUP_DIST,
  BOSS_CATCHUP_ENGAGE_DIST,
  BOSS_CATCHUP_MAX_SPEED,
  BOSS_LEASH_BLEND,
  BOSS_LEASH_RADIUS,
  BOSS_MIN_DAMAGE_WINDOW_S,
  BOSS_VIEW_CLAMP_MARGIN,
  bossCatchupSpeed,
  bossLeashSteer,
  canRetargetAttack,
  clampPointToView,
  minBossAttackTelegraph,
  type ViewRect,
} from "../src/logic/bosses";

/**
 * M10-boss-lure-fair: reine Fairness-Regeln des Boss-Verfolgungsverhaltens.
 * Wie tests/enemy-ai.test.ts ohne Renderer/Kamera — die Regeln in
 * src/logic/bosses.ts werden direkt geprüft (Leash, Catch-up,
 * Sichtbarkeits-Klemme, Zielwechsel-Fenster, Determinismus).
 */

const VIEW: ViewRect = { x: 1000, y: 2000, width: 640, height: 360 };
const SPAWN = { x: 1320, y: 2180 }; // Spawn-Zone (Mitte des Beispiel-Views)

describe("M10-boss-lure-fair: sanfter Leash", () => {
  it("mischt die Bewegung zur Spawn-Zone zurück, wenn der Boss sie verlassen hat", () => {
    // Boss 150 px südlich außerhalb der Zone, Bewegung zeigt nach Süden (weg).
    const boss = { x: SPAWN.x, y: SPAWN.y + BOSS_LEASH_RADIUS + 150 };
    const res = bossLeashSteer(boss.x, boss.y, SPAWN.x, SPAWN.y, SPAWN.x, SPAWN.y, 0, 1);
    expect(res.leashed).toBe(true);
    // Rückmischung: (1-B) * 1 (Süd) + B * (-1) (nach Norden zur Zone) < 0
    expect(res.my).toBeLessThan(0);
    expect(res.my).toBeCloseTo((1 - BOSS_LEASH_BLEND) * 1 + BOSS_LEASH_BLEND * -1, 10);
  });

  it("lässt den Boss in der Zone unangetastet und löst den Leash, wenn der Spieler selbst hinausläuft", () => {
    // In der Zone: Bewegung bleibt exakt erhalten.
    const inside = bossLeashSteer(SPAWN.x + 40, SPAWN.y - 40, SPAWN.x, SPAWN.y, SPAWN.x, SPAWN.y, 1, 0);
    expect(inside.leashed).toBe(false);
    expect(inside.mx).toBe(1);
    // Spieler weit außerhalb: Leash gelöst, damit der Kampf nicht stockt.
    const released = bossLeashSteer(
      SPAWN.x, SPAWN.y + BOSS_LEASH_RADIUS + 300, SPAWN.x, SPAWN.y,
      SPAWN.x, SPAWN.y + BOSS_LEASH_RADIUS + 600, 0, 1,
    );
    expect(released.leashed).toBe(false);
    expect(released.my).toBe(1);
  });
});

describe("M10-boss-lure-fair: Offscreen-Catch-up", () => {
  it("greift erst nach der Drift-Schwelle und endet in Engagement-Distanz", () => {
    const base = 46; // Grundtempo eines Bosses (src/data/bosses.ts)
    // Nahe/engagiert: kein Eingriff.
    expect(bossCatchupSpeed(base, 1, BOSS_CATCHUP_ENGAGE_DIST, 99)).toBe(base);
    // Fern, aber noch keine 2 s: kein Eingriff.
    expect(bossCatchupSpeed(base, 1, BOSS_CATCHUP_DIST + 50, BOSS_CATCHUP_AFTER_S - 0.1)).toBe(base);
    // Fern seit >= 2 s: Catch-up-Faktor, geklemmt unter dem Spielertempo.
    const boosted = bossCatchupSpeed(base, 1, BOSS_CATCHUP_DIST + 50, BOSS_CATCHUP_AFTER_S + 1);
    expect(boosted).toBe(Math.min(base * 1.2, BOSS_CATCHUP_MAX_SPEED));
    expect(boosted).toBeLessThanOrEqual(BOSS_CATCHUP_MAX_SPEED);
    // Endboss-Sprint (Phase 3) bleibt im Catch-up ebenfalls geklemmt.
    const sprint = bossCatchupSpeed(base, 1.25, BOSS_CATCHUP_DIST + 200, 5);
    expect(sprint).toBeLessThanOrEqual(BOSS_CATCHUP_MAX_SPEED);
  });

  it("bleibt deterministisch: gleiche Eingaben liefern bitgleiche Geschwindigkeit", () => {
    const a = bossCatchupSpeed(46, 1.25, 500, 3.5);
    const b = bossCatchupSpeed(46, 1.25, 500, 3.5);
    expect(a).toBe(b);
    // Und die Schwellen liegen stimmig: engage < catch-up.
    expect(BOSS_CATCHUP_ENGAGE_DIST).toBeLessThan(BOSS_CATCHUP_DIST);
  });
});

describe("M10-boss-lure-fair: Sichtbarkeits-Klemme für Schadensflächen", () => {
  it("zieht Flächen an der geklemmten Weltkante komplett in den View", () => {
    // Spieler nahe der unteren Weltkante: Kamera geklemmt, Fläche 100 px darunter.
    const viewBottom = VIEW.y + VIEW.height;
    const out = clampPointToView(VIEW.x + 300, viewBottom + 100, 24, VIEW);
    expect(out.y).toBeLessThanOrEqual(viewBottom - 24 - BOSS_VIEW_CLAMP_MARGIN);
    expect(out.y).toBeGreaterThanOrEqual(VIEW.y + 24 + BOSS_VIEW_CLAMP_MARGIN);
    expect(out.x).toBe(VIEW.x + 300); // X unberührt
  });

  it("verschiebt Flächen, die bereits im View liegen, nicht", () => {
    const p = clampPointToView(VIEW.x + 200, VIEW.y + 180, 22, VIEW);
    expect(p.x).toBe(VIEW.x + 200);
    expect(p.y).toBe(VIEW.y + 180);
  });
});

describe("M10-boss-lure-fair: Zielwechsel-Regel und Angriffsdaten", () => {
  it("blockt Zielwechsel unter 0,3 s Schadensfenster und erlaubt faire Fenster", () => {
    expect(canRetargetAttack(BOSS_MIN_DAMAGE_WINDOW_S)).toBe(true);
    expect(canRetargetAttack(BOSS_MIN_DAMAGE_WINDOW_S - 0.01)).toBe(false);
    expect(canRetargetAttack(0)).toBe(false);
    expect(canRetargetAttack(Number.NaN)).toBe(false);
  });

  it("jeder Boss-Angriff aller 6 Bosse/Phasen erfüllt das Mindest-Schadensfenster", () => {
    expect(minBossAttackTelegraph()).toBeGreaterThanOrEqual(BOSS_MIN_DAMAGE_WINDOW_S);
    // Und konkret: kein Angriff mit damage > 0 warnet kürzer als 0,3 s.
    for (const [bossIdx, phases] of Object.entries(BOSS_ATTACKS)) {
      for (const [p, phase] of phases.entries()) {
        for (const attack of phase) {
          if (attack.damageMul > 0) {
            expect(attack.telegraph, `boss ${bossIdx} phase ${p + 1} ${attack.kind}`).toBeGreaterThanOrEqual(
              BOSS_MIN_DAMAGE_WINDOW_S,
            );
          }
        }
      }
    }
  });
});
