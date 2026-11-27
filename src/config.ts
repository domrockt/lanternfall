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
  chooseRenderScale,
  parseRenderScaleOverride,
  stepRenderScale,
  type RenderScaleState,
} from "./logic/scale";

/**
 * M10-dpr-budget-cap: adaptiver Render-Massstab. RENDER_SCALE ist der
 * ganzzahlige TEILER der internen Renderbuffer-Kanten (1 = voll, 2 = halbe
 * Kanten). CSS-Groesse und logische Szene bleiben unveraendert; der Buffer
 * wird per image-rendering: pixelated hochskaliert (keine weichen Kanten).
 * Gesetzt wird ausschliesslich ueber setRenderScale()/den Laufzeit-Regler.
 */
export let RENDER_SCALE = RENDER_SCALE_MIN;

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

/** Frame-Budget des Reglers (Ziel 60 FPS,deckungsgleich mit perf-Ziel). */
const RENDER_BUDGET_MS = 1000 / 60;
/** URL-Override fuer Messungen: ?rbscale=0 (aus) oder ?rbscale=1..3 (fest). */
function forcedRenderScale(): number | null {
  if (typeof window === "undefined" || !window.location) return null;
  return parseRenderScaleOverride(new URLSearchParams(window.location.search).get("rbscale"));
}

type BudgetGame = {
  canvas: HTMLCanvasElement;
  scale: { width: number; height: number; on: (ev: string, cb: () => void) => void };
  renderer: { resize: (w: number, h: number) => void; type: number };
};

/**
 * Laufzeit-Verdrahtung im Canvas-Setup (nur Browser; in Vitest/Node passiv):
 * wartet auf `window.__game` (installDebugApi), haengt FPS-EWMA + Hysterese an
 * den Game-Loop und setzt Canvas-Buffer + renderer zusammen. main.ts/view.ts
 * bleiben unveraendert; CSS bleibt geraetepixelgenau wie in m8-display.
 */
function installRenderBudget(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const forced = forcedRenderScale();
  let state: RenderScaleState = { scale: RENDER_SCALE_MIN, belowMs: 0, aboveMs: 0 };
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
    const game = (window as unknown as { __game?: BudgetGame }).__game;
    if (!game || !game.scale || !game.renderer) return;
    const dt = lastNow > 0 ? Math.min(250, now - lastNow) : 0;
    lastNow = now;
    if (dt > 0 && dt < 250) {
      const instant = 1000 / dt;
      fpsEwma = fpsEwma === 0 ? instant : fpsEwma * 0.9 + (instant * 0.1);
    }

    if (forced !== null) {
      apply(game, forced);
      return;
    }
    const cap = chooseRenderScale(
      window.devicePixelRatio || 1,
      game.scale.width,
      game.scale.height,
      fpsEwma,
      RENDER_BUDGET_MS,
    );
    state = stepRenderScale(state, fpsEwma, dt, cap);
    apply(game, state.scale);
    const d2 = (window as unknown as { __rbDbg?: Record<string, unknown> }).__rbDbg;
    if (d2) { d2.fps = fpsEwma; d2.cap = cap; d2.afterW = game.canvas.width; d2.state = state; }
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
