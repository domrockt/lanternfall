import { describe, expect, it } from "vitest";
import {
  CONTENT_TARGET,
  DRAWS_P95_WARN,
  FRAME_P95_TARGET_MS,
  HEAP_TARGET_PCT,
  TEXTURES_WARN,
  evaluateGates,
  frameP95,
  rendererVerdict,
  retainedHeapDeltaPct,
  // @ts-expect-error – reine JS-Tor-Definitionen aus dem Gate-Skript, keine d.ts vorhanden
} from "../scripts/m10-v10-gate.mjs";

// Lane m10-v10-gate-guard, Karte K2 (#12725): Die Tor-Logik des v1.0-Host-Gates
// ist als reine Funktion evaluateGates() exportiert und wird hier deterministisch
// gegen Fixtures geprüft — PASS/FAIL-Matrix pro Tor plus Renderer-Pflicht
// (Regel 6, 2026-11-28: SwiftShader-Belege sind ungültig). Kein echter Browser-
// Lauf im Unit-Test; der Gate-Lauf selbst ist Karte K3.

/** Fixture: alles grün (realistische Werte eines gültigen iGPU-Laufs). Rückgabetyp offen, da Import aus .mjs. */
function passingInput(): any {
  return {
    renderer: "Mesa Intel(R) Graphics (RPL-S)",
    content: { ok: true, counts: { ...CONTENT_TARGET } },
    perf: {
      frameDtsMs: Array.from({ length: 100 }, (_, i) => 5 + (i % 10) / 10), // p95 = 5.9 ms
      jsErrors: [],
      drawsMedian: 17,
      drawsP95: 18,
      drawsMax: 25,
      textures: 320,
    },
    guard: {
      completed: true,
      resultReason: "dawn",
      gates: { passed: true, failures: [], gates: [] },
      jsErrors: [],
      heap: { startMB: 43.6, minute1MB: 44.2, endMB: 47.5 }, // +8,9 % retained -> im Tor
    },
    verify: { checks: [{ name: "a", ok: true }, { name: "b", ok: true }], errors: [] },
  };
}

describe("rendererVerdict (Tor R1, Pflicht)", () => {
  it("echter GPU-Renderer-String ist gültig", () => {
    expect(rendererVerdict("Mesa Intel(R) Graphics (RPL-S)").ok).toBe(true);
    expect(rendererVerdict("Adreno (TM) 710").ok).toBe(true);
  });

  it("SwiftShader/Software/leer ist ungültig (Regel 6)", () => {
    expect(rendererVerdict("SwiftShader").ok).toBe(false);
    expect(rendererVerdict("Google SwiftShader (llvmpipe CPU)").ok).toBe(false);
    expect(rendererVerdict("llvmpipe (LLVM 15)")).toMatchObject({ ok: false });
    expect(rendererVerdict("ANGLE (Google, Vulkan SwiftShader)").ok).toBe(false);
    expect(rendererVerdict("").ok).toBe(false);
    expect(rendererVerdict("none").ok).toBe(false);
    expect(rendererVerdict(null).ok).toBe(false);
  });
});

describe("Helfer", () => {
  it("frameP95 nimmt das 95 %-Perzentil, leere Samples -> null", () => {
    expect(frameP95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
    expect(frameP95([])).toBeNull();
    expect(frameP95([Number.NaN, 5])).toBe(5);
  });

  it("retainedHeapDeltaPct rechnet endMB vs startMB, unmessbar -> null", () => {
    expect(retainedHeapDeltaPct(43.6, 47.5)).toBeCloseTo(8.9, 1);
    expect(retainedHeapDeltaPct(40, 40)).toBe(0);
    expect(retainedHeapDeltaPct(0, 40)).toBeNull();
    expect(retainedHeapDeltaPct(40, null)).toBeNull();
  });
});

describe("evaluateGates PASS/FAIL-Matrix", () => {
  it("Sollwerte", () => {
    expect(CONTENT_TARGET).toEqual({ enemies: 30, weapons: 6, powerups: 6, evolutions: 6, bosses: 6, characters: 2 });
    expect(FRAME_P95_TARGET_MS).toBe(16);
    expect(HEAP_TARGET_PCT).toBe(15);
    expect(DRAWS_P95_WARN).toBeGreaterThan(0);
    expect(TEXTURES_WARN).toBeGreaterThan(0);
  });

  it("alles grün -> PASS ohne failures", () => {
    const verdict = evaluateGates(passingInput());
    expect(verdict.verdict).toBe("PASS");
    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
    expect(verdict.gates.map((g: any) => g.gate)).toEqual([
      "renderer-pflicht",
      "content-counts",
      "frame-p95",
      "js-errors-0",
      "fullrun-inhalt",
      "heap-retained",
    ]);
  });

  it("frame-p95 über 16 ms -> FAIL", () => {
    const input = passingInput();
    input.perf.frameDtsMs = Array.from({ length: 100 }, () => 17.5);
    const verdict = evaluateGates(input);
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain("frame-p95");
  });

  it("p95 genau am Tor 16 ms zählt noch als PASS", () => {
    const input = passingInput();
    input.perf.frameDtsMs = [16, 16, 16, 16];
    expect(evaluateGates(input).failures).not.toContain("frame-p95");
  });

  it("heap +15.0 % ist FAIL (strikt unter Tor), +8.9 % PASS", () => {
    const atLimit = passingInput();
    atLimit.guard.heap = { startMB: 40, endMB: 46 };
    expect(evaluateGates(atLimit).failures).toContain("heap-retained");

    const inside = passingInput();
    inside.guard.heap = { startMB: 40, endMB: 45.9 };
    expect(evaluateGates(inside).failures).not.toContain("heap-retained");
  });

  it("heap nicht messbar (null) -> FAIL statt stillschweigend grün", () => {
    const input = passingInput();
    input.guard.heap = { startMB: null, endMB: null };
    expect(evaluateGates(input).failures).toContain("heap-retained");
  });

  it("fullrun: Run nicht beendet / Guard-Tore rot -> FAIL", () => {
    const incomplete = passingInput();
    incomplete.guard.completed = false;
    expect(evaluateGates(incomplete).failures).toContain("fullrun-inhalt");

    const gatesRed = passingInput();
    gatesRed.guard.gates = { passed: false, failures: ["chests-6"], gates: [] };
    expect(evaluateGates(gatesRed).failures).toContain("fullrun-inhalt");
  });

  it("JS-Fehler aus allen Schritten summieren -> FAIL", () => {
    const fromPerf = passingInput();
    fromPerf.perf.jsErrors = ["TypeError: x"];
    expect(evaluateGates(fromPerf).failures).toContain("js-errors-0");

    const fromGuard = passingInput();
    fromGuard.guard.jsErrors = ["pageerror"];
    expect(evaluateGates(fromGuard).failures).toContain("js-errors-0");

    const fromVerify = passingInput();
    fromVerify.verify.errors = ["console.error"];
    expect(evaluateGates(fromVerify).failures).toContain("js-errors-0");
  });

  it("roter verify-Check zählt als Tor-Verletzung", () => {
    const input = passingInput();
    input.verify.checks = [{ name: "a", ok: true }, { name: "b", ok: false }];
    expect(evaluateGates(input).failures).toContain("js-errors-0");
  });

  it("Inhaltszählung falsch -> FAIL", () => {
    const input = passingInput();
    input.content = { ok: false, counts: { ...CONTENT_TARGET, enemies: 29 } };
    expect(evaluateGates(input).failures).toContain("content-counts");

    const okTrueButWrong = passingInput();
    okTrueButWrong.content = { ok: true, counts: { ...CONTENT_TARGET, bosses: 5 } };
    expect(evaluateGates(okTrueButWrong).failures).toContain("content-counts");
  });

  it("fehlende Felder -> FAIL bzw. INVALID (kein stillschweigendes PASS)", () => {
    // Ganz ohne Daten fehlt schon der Renderer -> INVALID (Exit-2-Semantik).
    expect(evaluateGates({}).verdict).toBe("INVALID");
    const noPerf = passingInput();
    noPerf.perf.frameDtsMs = [];
    expect(evaluateGates(noPerf).failures).toContain("frame-p95");
  });

  it("Renderer ungültig -> verdict INVALID, auch wenn alle Tore grün wären (Exit 2)", () => {
    const input = passingInput();
    input.renderer = "SwiftShader";
    const verdict = evaluateGates(input);
    expect(verdict.verdict).toBe("INVALID");
    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toContain("renderer-pflicht");
  });

  it("Beobachtungen (Draw-Calls/Texturen) warnen, aber FAILen nicht", () => {
    const input = passingInput();
    input.perf.drawsP95 = 99;
    input.perf.textures = 4000; // TEXTURES_WARN = 3500 (Baseline-Kalibrierung)
    input.perf.avgEnemies = 61; // Minute-25-Top-up nicht gehalten -> Messvaliditäts-Warnung
    const verdict = evaluateGates(input);
    expect(verdict.verdict).toBe("PASS");
    expect(verdict.warnings.length).toBe(3);
  });
});
