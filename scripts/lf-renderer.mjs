// M10-Renderer-Guard (Karte #13404): Doms Regel "in jedem Perf-Beleg den
// WebGL-Renderer mitschreiben (Abnahme ungueltig bei SwiftShader)".
// Wiederverwendbarer Helper fuer Mess-Skripte: Renderer-String aus der
// Game-Page ziehen und seine Gueltigkeit pruefen. Bestehende Skripte, die
// den Renderer schon selbst erfassen (fullrun.mjs, m10-heap-budget.mjs),
// bleiben unangetastet — keine Duplikate hier.

/**
 * Liest den WebGL-Renderer-String aus der Page: bevorzugt
 * WEBGL_debug_renderer_info / UNMASKED_RENDERER_WEBGL, sonst gl.RENDERER.
 * Liefert immer einen String ("" wenn nicht ermittelbar), damit
 * Output-JSONs robust bleiben.
 */
export async function getRendererString(page) {
  if (!page) return "";
  try {
    const s = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) return "";
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return String(
        (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) ||
          gl.getParameter(gl.RENDERER) ||
          "",
      );
    });
    return typeof s === "string" ? s : "";
  } catch {
    return "";
  }
}

/** SwiftShader-Varianten (Chrome-Software-GL, DevTools-Headless, emuliert). */
const SWIFTSHADER_RE = /swiftshader/i;

/** true, wenn der String auf SwiftShader hinweist (unabhaengig von Gross/klein). */
export function isSwiftShader(s) {
  return typeof s === "string" && SWIFTSHADER_RE.test(s);
}

/**
 * Gueltiger Abnahme-Renderer: nicht-leer UND nicht SwiftShader.
 * Echte iGPU-/Adreno-Strings sind gueltig; fehlender Renderer ist es nicht.
 */
export function rendererValid(s) {
  if (typeof s !== "string" || s.trim() === "") return false;
  return !isSwiftShader(s);
}
