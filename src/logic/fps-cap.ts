/**
 * M10-mobile-fps-cap: Bildraten-Regel (Frame-Cap) und Geräteknoten-Erkennung.
 *
 * Hintergrund (Dom-Wunsch 28.11., janky-FAIL 13,44 %/13,90 % aus
 * m10-v10-device-acceptance K3): das Gerät (Redmi Pad Pro, 120-Hz-Panel)
 * rendert ohne Cap 100–120 FPS; gfxinfo zählt jeden Frame mit Zeitschwanz
 * als janky, obwohl das Bild flüssig wirkt. Gleichmäßige 60 FPS wirken ruhiger
 * als schwankende 100–120 und sparen Akku/Thermik.
 *
 * Hebel: fps.limit am Phaser-Boot (src/main.ts) aktiv nur für den Geräteknoten,
 * Menü-Option „BILDRATE: 60/MAX“ (OPTION_ROWS in src/audio/options.ts), Standard
 * 60 auf Mobile / MAX auf Desktop. Auf Desktop-60-Hz-vsync-Profilen (perf/
 * fullrun/iGPU) ist „MAX“ verhaltensgleich 60 — die Messwerte bleiben unverändert.
 *
 * Abgrenzung zu m10-device-janky-node (parallel): die Erkennung liegt HIER und
 * nicht in src/config.ts (Disponent-Claim). Beim Merge kann probeDeviceNode aus
 * config.ts an diese Implementierung delegieren; isDeviceNodeRenderer ist
 * absichtlich zeilengleich zu deren Variante.
 */

/** Optionswerte für das Feld `fps`: AUTO = Geräte-Standard, sonst hart 60/MAX. */
export const FPS_AUTO = -1;
export const FPS_60 = 60;
export const FPS_MAX = 0;

/** Validiert einen gespeicherten Optionswert; alles Fremde fällt auf AUTO. */
export function clampFpsSetting(v: unknown): number {
  if (v === FPS_60 || v === FPS_MAX || v === FPS_AUTO) return v as number;
  return FPS_AUTO;
}

/**
 * Löst den Frame-Cap in FPS auf (null = kein Limit / „MAX“).
 * AUTO: 60 am Geräteknoten (mobile), MAX (null) auf Desktop.
 */
export function resolveFpsLimit(setting: number, deviceNode: boolean): number | null {
  const s = clampFpsSetting(setting);
  if (s === FPS_60) return 60;
  if (s === FPS_MAX) return null;
  return deviceNode ? 60 : null;
}

/** Menü-Label der BILDRATE-Zeile; AUTO zeigt den aufgelösten Wert ("60"/"MAX"). */
export function fpsSettingLabel(setting: number, deviceNode: boolean): string {
  return resolveFpsLimit(setting, deviceNode) === null ? "MAX" : "60";
}

/** Nächster Wert im Menü-Zyklus AUTO -> 60 -> MAX -> AUTO (delta ±1). */
export function stepFpsSetting(setting: number, delta: number): number {
  const cycle = [FPS_AUTO, FPS_60, FPS_MAX];
  const idx = Math.max(0, cycle.indexOf(clampFpsSetting(setting)));
  const next = (idx + (delta > 0 ? 1 : cycle.length - 1)) % cycle.length;
  return cycle[next];
}

// ---------- Geräteknoten-Erkennung (analog m10-device-janky-node) ----------

/**
 * Rein prüfbar: Renderer-String + DPR entscheiden. Fehlerhaftem GL bewusst
 * MISSTRAUEN: ohne String nie Geraet (kein SwiftShader-/LLVMpipe-Fehlgriff).
 */
export function isDeviceNodeRenderer(renderer: string | null | undefined, dpr: number): boolean {
  return typeof renderer === "string" && renderer.includes("Adreno (TM) 710") && dpr >= 2;
}

let probed = false;
let cached = false;

/**
 * Einmalige Erkennung im Browser (WebGL-Probe-Canvas, unabhängig vom Game-Boot).
 * In Vitest/Node passiv (kein document -> false -> Desktop-Pfad bitgleich).
 * Das Latch gilt für BEIDE Ausgänge (Befund m10-device-janky-node K4): ohne
 * Latch würde der Probe-Body auf Desktop JEDEM rAF-Tick laufen und 60–144
 * WebGL-Kontexte/s erzeugen — im schlechtesten Fall verliert der Browser den
 * Phaser-Kontext.
 */
export function probeDeviceNode(): boolean {
  if (probed) return cached;
  probed = true;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl && dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String((gl && gl.getParameter(gl.RENDERER)) ?? "");
    cached = isDeviceNodeRenderer(renderer, window.devicePixelRatio || 1);
  } catch {
    cached = false;
  }
  return cached;
}

/** Nur Vitest: Probe-Zustand zurücksetzen, damit Fälle isoliert prüfbar sind. */
export function resetDeviceNodeProbeForTests(): void {
  probed = false;
  cached = false;
}

/**
 * Setzt den Frame-Cap zur Laufzeit (Optionsmenü „gilt sofort“). Phaser 3.90
 * dispatched in TimeStep.tick() dynamisch über hasFpsLimit, daher genügt das
 * Setzen der Felder — kein Spiel-Neustart. „MAX“ (null) hebt das Limit auf;
 * der angehäufte delta-Rest wird verworfen, damit kein Aufstau aus der
 * Limit-Phase als großer Sim-Schritt durchläuft.
 */
export function applyFpsLimit(
  loop: { fpsLimit: number; hasFpsLimit: boolean },
  limit: number | null,
): void {
  const l = loop as { fpsLimit: number; hasFpsLimit: boolean; _limitRate?: number; delta?: number };
  l.fpsLimit = limit ?? 0;
  l.hasFpsLimit = l.fpsLimit > 0;
  l._limitRate = l.hasFpsLimit ? 1000 / l.fpsLimit : 0;
  if (!l.hasFpsLimit) l.delta = 0;
}
