/**
 * M8: View-Groesse ist dynamisch (logische Hoehe 360, Breite je Seitenverhaeltnis).
 * Die Exporte sind `let`-Bindings: importierende Module sehen Aenderungen live.
 * Gesetzt wird ausschliesslich ueber setGameView() aus main.ts.
 */
export let GAME_WIDTH = 640;
export let GAME_HEIGHT = 360;
/** Geraetepixel pro Spielpixel (n aus floor(geraeteHoehe/360), Fit-Rueckfall gebrochen). */
export let GAME_SCALE = 3;

export function setGameView(width: number, height: number, scale: number): void {
  GAME_WIDTH = Math.max(1, Math.round(width));
  GAME_HEIGHT = Math.max(1, Math.round(height));
  GAME_SCALE = Math.max(0.1, scale);
}

import {
  RENDER_SCALE_MAX,
  RENDER_SCALE_MIN,
  parseRenderScaleOverride,
} from "./logic/scale";
import {
  THERMAL_WINDOW_MS,
  evaluateThermalStep,
  initialQualityState,
  initialThermalState,
  qualityBudgetFor,
  stepQuality,
  QUALITY_ORDER,
  type QualityState,
  type QualityTier,
  type ThermalState,
  type ThermalTier,
} from "./logic/quality";

/**
 * M10-dpr-budget-cap: adaptiver Render-Massstab. RENDER_SCALE ist der
 * ganzzahlige TEILER der internen Renderbuffer-Kanten (1 = voll, 2 = halbe
 * Kanten). CSS-Groesse und logische Szene bleiben unveraendert; der Buffer
 * wird per image-rendering: pixelated hochskaliert (keine weichen Kanten).
 * Gesetzt wird ausschliesslich ueber setRenderScale()/den Laufzeit-Regler.
 */
export let RENDER_SCALE = RENDER_SCALE_MIN;

/**
 * M10-android-scale-floor-r2 (K3): Qualitaetsstufe des Laufzeit-Reglers.
 * high/medium/low mit Budgets in src/logic/quality.ts; der Regler wechselt
 * NUR die Stufe (Hysterese: < 45 FPS 3 s runter, > 57 FPS 12 s rauf), nie die
 * Aufloesung. Live-Binding wie RENDER_SCALE: importierende Module sehen
 * Aenderungen sofort (FxSystem/DamageNumbers lesen die Deckel je Frame).
 *
 * m10-thermal-tier-types: ehrlich ThermalTier — der aktivierte thermische
 * Guard uebersteuert hier auf "thermal" (Engage -> QUALITY = "thermal"), und
 * alle Cap-Wrapper (glowEnabledFor, glowAreaCapForQuality,
 * damageLabelCapForQuality, audioBudgetFor, …) tragen ThermalTier.
 * AUSNAHME Hazard-Grenze (drawQualityTier & Co., src/gfx/hazardDisc.ts): die
 * Hazard-Helfer bleiben bewusst QualityTier — Warn-Disc-Lesbarkeit in thermal
 * erhalten (thermal faellt dort in den offenen Zweig, nie in den low-Draw-Cap);
 * die Laufzeitidentitaet ist an der Aufrufstelle in src/systems/Hazards.ts
 * dokumentiert.
 */
export let QUALITY: ThermalTier = "high";

/**
 * m10-thermal-wiring K2: Aufrufer-Seite des thermischen Guards. Die Serie der
 * FPS-Median-Bewertung fuehrt der AUFRUFER (1-Hz-Samples über THERMAL_WINDOW_MS
 * = 8 s, siehe src/logic/quality.ts THERMAL_WINDOW_MS); hier der Ringfenster-
 * Schritt als reine Funktion (in Vitest getestet).
 */
export interface FpsSampleState {
  /** 1-Hz-Samples von fpsEwma, Laenge ≤ round(THERMAL_WINDOW_MS/1000). */
  serie: number[];
  /** Akkumulierte ms bis zum naechsten 1-Hz-Sample. */
  acc: number;
}

export function pushFpsSample(
  serie: readonly number[],
  acc: number,
  dtMs: number,
  fpsEwma: number,
  windowMs: number = THERMAL_WINDOW_MS,
): FpsSampleState {
  const out = serie.slice();
  let next = acc;
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  if (dt > 0) {
    next += dt;
    if (next >= 1000) {
      out.push(Number.isFinite(fpsEwma) ? fpsEwma : 0);
      // Neu beginnen (nicht -= 1000): auch ein Riesen-Delta ergibt genau
      // EIN Sample und das Fenster startet sauber neu.
      next = 0;
      const max = Math.max(1, Math.round(windowMs / 1000));
      while (out.length > max) out.shift();
    }
  }
  return { serie: out, acc: next };
}

/**
 * Effektive Qualitaetsstufe: aktivierter thermischer Guard uebersteuert die
 * Basis-Stufe. m10-thermal-tier-types: der frueher dokumentierte
 * QualityTier-Cast ist ENTFALLEN — die Cap-Wrapper (glowEnabledFor,
 * glowAreaCapForQuality, damageLabelCapForQuality, audioBudgetFor) tragen
 * jetzt ThermalTier, der Rueckgabetyp ist ehrlich ThermalTier. Hazard-Helfer
 * (drawQualityTier etc.) bleiben bewusst QualityTier — siehe QUALITY oben.
 */
export function effectiveQuality(baseTier: QualityTier, thermal: ThermalState): ThermalTier {
  return thermal.active ? "thermal" : baseTier;
}

/**
 * M10-device-janky-node (K2): Geräteknoten-Erkennung. Das Redmi Pad Pro
 * (SM7435, "Adreno (TM) 710", DPR 2, 120-Hz-Panel) faehrt unter Minute-25-Last
 * 109–112 FPS Durchsatz — der stepQuality-Regler (Schwellen 45/57 FPS in
 * src/logic/quality.ts, hier NICHT veraendert) sieht nie Budget-Mangel und das
 * Geraet bleibt dauerhaft auf "high". Beleg: gfxinfo janky 13,44 %/13,90 %
 * (m10-v10-device-acceptance K3 FAIL, p95 21 ms). Auf dem Tile-GPU-Geraet
 * klemmt diese Lane daher die Basis-Stufe auf medium (Regler darf weiter auf
 * low/thermal absehen, nie zurueck auf high).
 *
 * Rein (unit-getestet in tests/device-janky-node.test.ts): Erkennung ueber
 * WebGL-UNMASKED_RENDERER_WEBGL + DPR. Der Renderer-String matcht bewusst
 * NUR den Adreno-710-Knoten — Desktop/iGPU-Profile (Mesa Intel, Apple, NVIDIA,
 * SwiftShader) bleiben unangetastet. Die 120 Hz werden nicht geprueft (im
 * Browser unzuverlaessig ermittelbar); DPR 2 + Renderer sind gemeinsam
 * eindeutig genug und der Cap wirkt nur auf dem Geraet.
 */
export function isDeviceNode(renderer: string | null | undefined, dpr: number): boolean {
  return typeof renderer === "string" && renderer.includes("Adreno (TM) 710") && dpr >= 2;
}

/**
 * Klemmt eine Basis-Stufe auf das Stufen-Maximum `cap` (reine Ordnung ueber
 * QUALITY_ORDER; "thermal" ist im Basis-Pfad nie Eingang — effectiveQuality
 * setzt es erst NACH diesem Cap). Desktop: cap = "high" -> Identitaet.
 */
export function clampTierMax(tier: QualityTier, cap: QualityTier): QualityTier {
  const ti = QUALITY_ORDER.indexOf(tier);
  const ci = QUALITY_ORDER.indexOf(cap);
  if (ti < 0 || ci < 0) return tier;
  return QUALITY_ORDER[Math.min(ti, ci)];
}

/** Stufen-Deckel am Geraeteknoten (medium-Budget, siehe isDeviceNode). */
export const DEVICE_TIER_CAP: QualityTier = "medium";

/**
 * FX-Pool-Deckel am Geraeteknoten: grosser Effekt-Pool auf das medium-Budget
 * (maxFxSprites 140 statt LOD-220), Partikel-Pool proportional gedrosselt
 * (360 * 140/220 ≈ 229 -> 240). Wirkt unmittelbar auf den Frame-Tail
 * (Spawn-/Update-Last je Frame), unabhaengig vom Tier-Regler.
 */
export const DEVICE_MAX_FX_ACTIVE = qualityBudgetFor("medium").maxFxSprites;
export const DEVICE_MAX_PARTICLES = 240;

/** Live-Binding: true, sobald der Geraeteknoten erkannt ist (siehe probeDeviceNode). */
export let DEVICE_NODE = false;

/**
 * Einmalige Erkennung im Browser (WebGL-Probe-Canvas, unabhaengig vom Game-
 * Boot). In Vitest/Node passiv (kein document -> false -> Desktop-Pfade
 * bitgleich). Fehlerhaftem GL bewusst MISSTRAUEN: ohne String nie Geraet.
 *
 * Reviewer-Befund (m10-device-janky-node K4): das Latch gilt fuer BEIDE
 * Ausgaenge — ohne `deviceProbed` wuerde der Probe-Body (Canvas + getContext)
 * auf Desktop JEDEM rAF-Tick erneut laufen (60–144 WebGL-Kontexte/s, Browser
 * begrenzen live Kontexte — im schlechtesten Fall verliert der Browser den
 * Phaser-Kontext). Einmal pro Seite, inklusive Fehlerpfad.
 */
let deviceProbed = false;
export function probeDeviceNode(): boolean {
  if (deviceProbed) return DEVICE_NODE;
  deviceProbed = true;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") ?? c.getContext("webgl")) as WebGLRenderingContext | null;
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl && dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      : String((gl && gl.getParameter(gl.RENDERER)) ?? "");
    DEVICE_NODE = isDeviceNode(renderer, window.devicePixelRatio || 1);
  } catch {
    DEVICE_NODE = false;
  }
  return DEVICE_NODE;
}

export function setRenderScale(scale: number): number {
  RENDER_SCALE = Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(scale)));
  return RENDER_SCALE;
}

/** Renderbuffer-Groesse fuer eine Reglerstufe (ganzzahlig, nie < 1). */
export function renderBufferSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number } {
  const s = Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(scale)));
  return { width: Math.max(1, Math.floor(width / s)), height: Math.max(1, Math.floor(height / s)) };
}

/** URL-Override fuer Messungen: ?rbscale=0 (aus) oder ?rbscale=1..3 (fest,
 *  seit K2 auf 1 geklemmt — Werte > 1 zerstoeren den Text nicht mehr). */
const QUERY_RENDER_SCALE =
  typeof window !== "undefined" && window.location
    ? parseRenderScaleOverride(new URLSearchParams(window.location.search).get("rbscale"))
    : null;

/**
 * URL-Override (?rbscale) oder Runtime-Override (window.__rbOverride = 0..3,
 * fuer Pixel-Vergleiche im pausierten Zustand). Letzteres gewinnt.
 */
function forcedRenderScale(): number | null {
  if (typeof window === "undefined") return null;
  const runtime = (window as unknown as { __rbOverride?: number | null }).__rbOverride;
  if (runtime !== undefined && runtime !== null) return parseRenderScaleOverride(String(runtime));
  return QUERY_RENDER_SCALE;
}

type BudgetCamera = {
  zoom: number;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  setZoom: (z: number) => void;
  setViewport: (x: number, y: number, w: number, h: number, center?: boolean) => void;
};
type BudgetGame = {
  canvas: HTMLCanvasElement;
  scale: { width: number; height: number; on: (ev: string, cb: () => void) => void };
  renderer: { resize: (w: number, h: number) => void };
  scene?: {
    scenes?: {
      cameras?: { cameras?: BudgetCamera[]; list?: BudgetCamera[]; main?: BudgetCamera };
    }[];
  };
};

/** Reglerstufe hart klemmen (wie renderBufferSize). */
function effScale(scale: number): number {
  return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(scale)));
}

/**
 * Kamera-Projektion an den gesenkten Buffer anpassen: Zoom = 1/Teiler und
 * Viewport = Game-Size/Teiler, Midpoint ueber die Aenderung gerettet. Phaser
 * rendert Kamera-Viewports in Game-Size-Koordinaten 1:1 in den Canvas und
 * clippt am Buffer — ohne Anpassung waere der gesenkte Buffer ein Zoom-Crop
 * (Spieler off-screen; Beleg shots/m10-dpr-budget-pixel*: A entsprach dem
 * B-Viertel mit AE 1464/70200). Mit Viewport W/s x H/s + Zoom 1/s rendert die
 * Kamera die volle logische Szene (Welt UND UI) in den kleineren Buffer;
 * das Display-Upscale bleibt ganzzahlig (pixelated). Empirie:
 * scripts/m10-dpr-camera-matrix.mjs (6 Konfigs, Sieger z0.5_vp_half mit
 * Midpoint-Erhaltung). Jeder Frame, weil Szenenwechsel/-restarts zuruecksetzen.
 */
function enforceCameraProjection(game: BudgetGame, scale: number): void {
  const zoom = 1 / scale;
  const vw = game.scale.width / scale;
  const vh = game.scale.height / scale;
  const scenes = game.scene?.scenes;
  if (!scenes) return;
  for (const scene of scenes) {
    const mgr = scene.cameras as unknown as
      { cameras?: BudgetCamera[]; list?: BudgetCamera[]; main?: BudgetCamera } | undefined;
    if (!mgr) continue;
    const cams = mgr.cameras ?? mgr.list ?? (mgr.main ? [mgr.main] : []);
    for (const cam of cams) {
      if (!cam) continue;
      if (cam.width !== vw || cam.height !== vh) {
        // Midpoint (Weltausschnitt-Zentrum) ueber die Aenderung retten;
        // setViewport verschiebt sonst den Ausschnitt (Kamera-Matrix-Befund).
        const midX = cam.scrollX + cam.width / 2;
        const midY = cam.scrollY + cam.height / 2;
        cam.setViewport(0, 0, vw, vh, false);
        cam.scrollX = midX - vw / 2;
        cam.scrollY = midY - vh / 2;
      }
      if (cam.zoom !== zoom) cam.setZoom(zoom);
    }
  }
}

/**
 * Laufzeit-Verdrahtung im Canvas-Setup (nur Browser; in Vitest/Node passiv):
 * wartet auf `window.__game` (installDebugApi), haengt FPS-EWMA + Hysterese an
 * den Game-Loop und setzt Canvas-Buffer + renderer zusammen. main.ts/view.ts
 * bleiben unveraendert; CSS bleibt geraetepixelgenau wie in m8-display.
 *
 * M10-android-scale-floor-r2 (K2): der Regler kann den Teiler nicht mehr
 * ueber 1 hinaus anheben (RENDER_SCALE_MAX = 1) — der Soll/Ist-Vergleich in
 * apply() bleibt: Boot/applyView/Scale-Manager koennen den Buffer jederzeit
 * zuruecksetzen, dann wird sofort wieder die volle logische Groesse angelegt.
 */
function installRenderBudget(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  let qState: QualityState = initialQualityState();
  // m10-thermal-wiring K2: Zustand des thermischen Guards + seine 1-Hz-
  // Median-Serie (der Aufrufer fuehrt die Serie, siehe THERMAL_WINDOW_MS).
  let thermalState: ThermalState = initialThermalState();
  let fpsSerie: number[] = [];
  let sampleAcc = 0;
  let applied = -1;
  let lastNow = 0;
  // Eigener FPS-EWMA aus den rAF-Deltas. Phaser loop.actualFps ist pro Sekunde
  // mit 0,25/0,75 geglaettet und braucht ~15 s, um sich an eine Lastaenderung
  // anzunehmen — der Regler haengt dann in der Totzone (45-57 FPS) und bleibt
  // bei Teiler 1 (~45 FPS < Ziel 50). Beleg: Probe unter M25-Last, 2026-11-27.
  let fpsEwma = 0;

  const apply = (game: BudgetGame, scale: number): void => {
    const size = renderBufferSize(game.scale.width, game.scale.height, scale);
    const dbg = ((window as unknown as { __rbDbg?: Record<string, unknown> }).__rbDbg ??= {});
    dbg.calls = (Number(dbg.calls) || 0) + 1;
    dbg.scale = scale;
    dbg.sw = game.scale.width;
    dbg.sh = game.scale.height;
    dbg.size = size;
    // Soll/Ist every frame: Boot/applyView/Scale-Manager koennen den Buffer
    // jederzeit zuruecksetzen; dann sofort wieder anlegen.
    if (game.canvas.width === size.width && game.canvas.height === size.height && applied === scale) return;
    // Erst Buffer (resettet drawing buffer + viewport), dann Projection/Scissor.
    game.canvas.width = size.width;
    game.canvas.height = size.height;
    game.renderer.resize(size.width, size.height);
    applied = scale;
  };

  const tick = (now: number): void => {
    requestAnimationFrame(tick);
    // M10-device-janky-node: Geraeteknoten einmalig erkennen (WebGL-Probe,
    // unabhaengig vom Game-Boot). Desktop: no-op (DEVICE_NODE bleibt false).
    probeDeviceNode();
    const game = (window as unknown as { __game?: BudgetGame }).__game;
    if (!game || !game.scale || !game.renderer) return;
    const dt = lastNow > 0 ? Math.min(250, now - lastNow) : 0;
    lastNow = now;
    if (dt > 0 && dt < 250) {
      const instant = 1000 / dt;
      fpsEwma = fpsEwma === 0 ? instant : fpsEwma * 0.9 + (instant * 0.1);
    }
    // m10-thermal-wiring K2: 1-Hz-Samples in das Median-Ringfenster
    // (THERMAL_WINDOW_MS = 8 s) — die Serie fuehrt der Aufrufer.
    const sample = pushFpsSample(fpsSerie, sampleAcc, dt, fpsEwma);
    fpsSerie = sample.serie;
    sampleAcc = sample.acc;

    const forced = forcedRenderScale();
    if (forced !== null) {
      apply(game, forced);
      if (!(window as unknown as { __rbManual?: boolean }).__rbManual) {
        enforceCameraProjection(game, effScale(forced));
      }
      return;
    }
    // K2: Teiler bleibt 1 — Soll/Ist-Vergleich stellt Buffer-Resets wieder her.
    apply(game, RENDER_SCALE_MIN);
    if (!(window as unknown as { __rbManual?: boolean }).__rbManual) {
      enforceCameraProjection(game, RENDER_SCALE_MIN);
    }
    // K3: Qualitaetsstufen-Regler (Hysterese) statt Aufloesungsregler.
    qState = stepQuality(qState, fpsEwma, dt);
    // m10-thermal-wiring K2: thermischer Guard NUR ab Basis-Stufe "low"
    // (Definition "trotz LOW-Stufe"), engage nach THERMAL_HOLD_MS; die tier-
    // Synchronisation folgt dem Basis-Regler. Engage → QUALITY = "thermal",
    // Budget greift automatisch über qualityBudgetFor (alle Cap-Helfer).
    thermalState = evaluateThermalStep(fpsSerie, { ...thermalState, tier: qState.tier }, dt);
    // M10-device-janky-node (K2): Geraeteknoten — Basis-Stufe auf
    // DEVICE_TIER_CAP (medium) klemmen. Der Regler darf weiter auf low/
    // thermal absehen (clampTierMax ist nur ein Maximum); zurueck auf high
    // kommt das Geraet damit nie, Desktop (DEVICE_NODE = false) bitgleich.
    const baseTier = DEVICE_NODE ? clampTierMax(qState.tier, DEVICE_TIER_CAP) : qState.tier;
    QUALITY = effectiveQuality(baseTier, thermalState);
    const d2 = (window as unknown as { __rbDbg?: Record<string, unknown> }).__rbDbg;
    if (d2) {
      d2.fps = fpsEwma;
      d2.quality = qState.tier;
      d2.qualityState = qState;
      d2.thermalState = thermalState;
      d2.afterW = game.canvas.width;
    }
  };

  const wait = (): void => {
    // apply() prueft Soll/Ist jeden Frame; kein separater Resize-Hook noetig.
    if ((window as unknown as { __game?: BudgetGame }).__game) return;
    setTimeout(wait, 200);
  };
  wait();
  requestAnimationFrame(tick);
}

installRenderBudget();

export const TILE = 16;
export const CHUNK_TILES = 16;
export const CHUNK_SIZE = TILE * CHUNK_TILES;
export const WORLD_TILES = 256;
export const WORLD_SIZE = TILE * WORLD_TILES;

export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;
export const RUN_LENGTH = 30 * 60; // Sekunden
export const PLAYER_BASE_PICKUP_RADIUS = 22;
/** Maximaler Simulations-Teilschritt (s) gegen Tunnel-Kollisionen bei hoher Zeitskalierung. */
export const SIM_MAX_STEP = 1 / 20;
export const PLAYER_INVULN = 0.8;
