import { describe, expect, it } from "vitest";
// @ts-expect-error – Vite-Raw-Import (nur String, main.ts wird nicht ausgefuehrt)
import mainSrc from "../src/main.ts?raw";
// @ts-expect-error – Vite-Raw-Import (nur String, debug.ts wird nicht ausgefuehrt)
import debugSrc from "../src/debug.ts?raw";
// @ts-expect-error – reine JS-Helfer aus dem Audit-Skript, keine d.ts vorhanden
import { auditTable, classifyOverlay, percentiles, rateStartup, summarizeTextures } from "../scripts/android-audit.mjs";


describe("M10 Mobile-Konfiguration (statischer Vertrag)", () => {
  it("Phaser-Config begrenzt am Geräteknoten auf 60 FPS (target + resolveFpsLimit)", () => {
    // M10-mobile-fps-cap: hartes 60-Cap nur am Geräteknoten (resolveFpsLimit),
    // Desktop MAX (limit 0) — auf 60-Hz-vsync-Profilen verhaltensgleich.
    expect(mainSrc).toMatch(/fps:\s*\{\s*target:\s*60,\s*limit:\s*resolveFpsLimit\(getSettings\(\)\.fps,\s*probeDeviceNode\(\)\) \?\? 0\s*,?\s*\}/);
  });

  it("WebGL-Kontext fordert high-performance", () => {
    expect(mainSrc).toMatch(/powerPreference:\s*"high-performance"/);
  });

  it("Debug-Report liefert WebGL-Daten, MAX_TEXTURE_SIZE und 60-FPS-Cap", () => {
    expect(debugSrc).toMatch(/collectRendererInfo/);
    expect(debugSrc).toMatch(/MAX_TEXTURE_SIZE/);
    expect(debugSrc).toMatch(/MAX_TEXTURE_IMAGE_UNITS/);
    expect(debugSrc).toMatch(/getSupportedExtensions/);
    expect(debugSrc).toMatch(/cappedAt60/);
    expect(debugSrc).toMatch(/rendererInfo:/);
  });

  it("Textur-Audit markiert > 2048 px als Befund", () => {
    expect(debugSrc).toMatch(/2048/);
    expect(debugSrc).toMatch(/oversized/);
  });
});

describe("M10 Audit-Helfer", () => {
  it("summarizeTextures zaehlt Pixel, VRAM und >2048-Befunde", () => {
    const summary = summarizeTextures([
      { key: "a", width: 512, height: 256, frames: 4 },
      { key: "big", width: 4096, height: 2048, frames: 1 },
      { key: "empty", width: 0, height: 0 },
    ]);
    expect(summary.count).toBe(2);
    expect(summary.pixels).toBe(512 * 256 + 4096 * 2048);
    expect(summary.approxBytes).toBe(summary.pixels * 4);
    expect(summary.maxEdge).toBe(4096);
    expect(summary.oversizedCount).toBe(1);
    expect(summary.oversized[0]).toEqual({ key: "big", width: 4096, height: 2048, frames: 1 });
  });

  it("classifyOverlay erkennt Vollbild-Alpha und ADD", () => {
    const full = { width: 860, height: 360 };
    expect(classifyOverlay({ bounds: full, canvasWidth: 860, canvasHeight: 360, alpha: 1, blendMode: 0, visible: true })).toBeNull();
    const alpha = classifyOverlay({ bounds: full, canvasWidth: 860, canvasHeight: 360, alpha: 0.9, blendMode: 0, visible: true });
    expect(alpha?.translucent).toBe(true);
    expect(alpha?.severity).toBe("niedrig");
    const add = classifyOverlay({ bounds: full, canvasWidth: 860, canvasHeight: 360, alpha: 0.5, blendMode: 1, visible: true });
    expect(add?.additive).toBe(true);
    expect(add?.severity).toBe("hoch");
    const small = classifyOverlay({ bounds: { width: 16, height: 16 }, canvasWidth: 860, canvasHeight: 360, alpha: 0.5, blendMode: 1, visible: true });
    expect(small).toBeNull();
    const hidden = classifyOverlay({ bounds: full, canvasWidth: 860, canvasHeight: 360, alpha: 0.5, blendMode: 1, visible: false });
    expect(hidden).toBeNull();
  });

  it("percentiles und rateStartup liefern robuste Werte", () => {
    expect(percentiles([], 95)).toBe(0);
    expect(percentiles([1, 2, 3, 4, 100], 95)).toBe(100);
    expect(percentiles([10, 20, 30], 50)).toBe(20);
    expect(rateStartup(1200)).toBe("gut");
    expect(rateStartup(2500)).toBe("grenzwertig");
    expect(rateStartup(4000)).toBe("zu langsam");
  });

  it("auditTable enthaelt die 60-FPS-Zeile und Texturgroesse", () => {
    const table = auditTable({
      gl: { renderer: "SwiftShader", maxTextureSize: 8192 },
      canvas: { attrWidth: 860, attrHeight: 360, logicalWidth: 860, logicalHeight: 360, rendersDevicePixels: false },
      textureSummary: { count: 10, pixels: 100, approxBytes: 400, oversizedCount: 0 },
      title: { drawsPerFrame: 12, frames: 180, fps: 60 },
      run: { drawsPerFrame: 20, drawsP95: 30, switchesPerFrame: 20 },
      overlays: { count: 1, worst: "niedrig: vignette" },
      fx: { preFXObjects: 0, postFXObjects: 0 },
      boot: { timeToTitleMs: 1300, startupRating: "gut" },
      cpuThrottle: 4,
      fpsCapActive: true,
      powerPreference: "high-performance",
      config: { fps: { target: 60, limit: 60 } },
    });
    expect(table).toMatch(/60-FPS-Grenze aktiv \| ja/);
    expect(table).toMatch(/powerPreference \| high-performance/);
    expect(table).toMatch(/Texturen gesamt \| 10/);
  });
});
