import { describe, expect, it } from "vitest";
import {
  MAX_HITSTOP_SECONDS,
  MAX_KNOCKBACK_SPEED,
  MAX_SHAKE_PX,
  clampKnockbackSpeed,
  clampShake,
  hitStopFor,
  knockbackFor,
  mergeHitStop,
  mergeShake,
  shakeFor,
} from "../src/logic/feedback";

describe("M10-feedback-budget: Shake im 500-Gegner-Chaos", () => {
  it("1000 Treffer in einem Frame ergeben nie mehr als 6 px", () => {
    const requests = Array.from({ length: 1000 }, () => shakeFromAbsurdHit());
    const naiveSum = requests.reduce((sum, r) => sum + r.pixels, 0);
    const merged = mergeShake(...requests);
    expect(naiveSum).toBeGreaterThan(MAX_SHAKE_PX * 100); // Summieren waere fatal
    expect(merged.pixels).toBeLessThanOrEqual(MAX_SHAKE_PX);
    expect(merged.intensity * 480).toBeLessThanOrEqual(MAX_SHAKE_PX);
  });

  it("staerkster Request gewinnt, Dauern werden nicht addiert", () => {
    const a = shakeFor("hit"); // 70 ms
    const b = shakeFor("bossDeath"); // 320 ms
    const merged = mergeShake(a, b, a, b);
    expect(merged.pixels).toBe(Math.max(a.pixels, b.pixels));
    expect(merged.durationMs).toBe(Math.max(a.durationMs, b.durationMs));
    expect(merged.durationMs).toBeLessThanOrEqual(400);
  });
});

describe("M10-feedback-budget: Hit-Stop ist gedeckelt und nicht kumulativ", () => {
  it("1000 Requests in einem Frame summieren sich nicht", () => {
    let stop = 0;
    for (let i = 0; i < 1000; i++) stop = mergeHitStop(stop, hitStopFor("bossHit"));
    expect(stop).toBeCloseTo(hitStopFor("bossHit"), 6);
    expect(stop).toBeLessThanOrEqual(MAX_HITSTOP_SECONDS);
  });

  it("laufender Stop wird nicht verlaengert (kein Dauerfreeze)", () => {
    const running = 0.05;
    expect(mergeHitStop(running, hitStopFor("bossHit"))).toBe(running);
    expect(mergeHitStop(running, hitStopFor("bossDeath"))).toBe(running);
    expect(mergeHitStop(running, 5)).toBe(running);
  });

  it("einzelner Request bleibt auf 120 ms gedeckelt", () => {
    expect(mergeHitStop(0, 5)).toBe(MAX_HITSTOP_SECONDS);
    expect(mergeHitStop(0, hitStopFor("bossDeath"))).toBeLessThanOrEqual(MAX_HITSTOP_SECONDS);
  });
});

describe("M10-feedback-budget: Knockback teleportiert nicht", () => {
  it("einzelner Impuls bleibt unter der Schwelle", () => {
    expect(knockbackFor(9999, 0.01)).toBeLessThanOrEqual(MAX_KNOCKBACK_SPEED);
    expect(knockbackFor(50, 1)).toBe(50); // normale Treffer unveraendert
  });

  it("1000 Treffer im selben Substep addieren sich nicht zum Sprung", () => {
    const mass = 0.6;
    const impulse = knockbackFor(92, mass);
    let vx = 0;
    let vy = 0;
    for (let i = 0; i < 1000; i++) {
      vx += impulse;
      vy += impulse * 0.5;
    }
    const clamped = clampKnockbackSpeed(vx, vy);
    expect(Math.hypot(clamped.vx, clamped.vy)).toBeLessThanOrEqual(MAX_KNOCKBACK_SPEED + 1e-9);
    // Bei 60 Hz entspricht das < 3 px pro Frame, also sichtbarer Rueckstoss statt Teleport.
    expect((Math.hypot(clamped.vx, clamped.vy) / 60)).toBeLessThanOrEqual(3);
  });
});

function shakeFromAbsurdHit() {
  return clampShake(10 + Math.random(), 9999);
}
