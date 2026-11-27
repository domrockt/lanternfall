import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, setGameView } from "./config";
import { computeView, shouldCapForCrowd, viewKey, type ViewSpec } from "./logic/view";
import { Boot } from "./scenes/Boot";
import { Title } from "./scenes/Title";
import { CharSelect } from "./scenes/CharSelect";
import { Run } from "./scenes/Run";
import { UI } from "./scenes/UI";
import { Results } from "./scenes/Results";
import { Credits } from "./scenes/Credits";
import { installDebugApi } from "./debug";
import { getSettings, onSettingsChanged } from "./audio/settings";

/**
 * M8: View wird vor dem Spielstart aus dem Geraet berechnet. logische Hoehe 360,
 * Breite nach Seitenverhaeltnis; jeder Spielpixel = n x n Geraetepixel.
 * M10-Crowd: Bei hoher Gegnerlast (>=300 aktiv) wird die interne Breite auf
 * 640 geklemmt, damit der Endgame-Fill nicht die FPS frisst.
 */
let crowdCapped = false;
const crowdDisabled = new URLSearchParams(window.location.search).get("viewcap") === "off";

function measureView(): ViewSpec {
  const viewport = window.visualViewport;
  // visualViewport folgt der Tastatur/Browserleisten-Aenderung auf Handys.
  const width = viewport ? viewport.width : window.innerWidth;
  const height = viewport ? viewport.height : window.innerHeight;
  return computeView({
    width,
    height,
    dpr: window.devicePixelRatio || 1,
    setting: getSettings().scale,
    crowd: crowdCapped && !crowdDisabled,
  });
}

const initialView = measureView();
setGameView(initialView.width, initialView.height, initialView.scale);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  // M8-input: Gamepad-Plugin (Hotplug) + bis zu vier gleichzeitige Touch-Pointer
  // (Joystick + Tippen).
  input: {
    gamepad: true,
    activePointers: 4,
  },
  scale: {
    // Canvas bleibt logisch klein; die CSS-Anzeige setzt main.ts geraetepixelgenau.
    mode: Phaser.Scale.NONE,
  },
  scene: [Boot, Title, CharSelect, Run, UI, Results, Credits],
});

installDebugApi(game);

// Messlaeufe (balance.mjs --density): Spawnraten-Faktor ohne Rebuild setzen.
const densityParam = Number(new URLSearchParams(window.location.search).get("density"));
if (Number.isFinite(densityParam) && densityParam > 0) game.registry.set("lf-density", densityParam);

let appliedKey = "";

/** Dreh-Hinweis bei Hochkant (DOM-Overlay, blockiert Eingaben). */
function rotateOverlay(): HTMLElement | null {
  return document.getElementById("lf-rotate");
}

let portraitAutoPaused = false;
function pauseForPortrait(portrait: boolean): void {
  const overlay = rotateOverlay();
  if (overlay) overlay.classList.toggle("visible", portrait);
  if (!game.scene.isActive("run")) return;
  const run = game.scene.getScene("run") as Run;
  if (!run) return;
  if (portrait) {
    // Hochkant: laufendes Spiel pausieren, damit nichts im Hintergrund weiterlaeuft.
    if (!run.paused && !run.levelUpOpen && !run.chestOpen) {
      run.togglePause();
      portraitAutoPaused = true;
    }
  } else if (portraitAutoPaused) {
    // Zurueck im Querformat: die automatische Dreh-Pause wieder aufheben.
    portraitAutoPaused = false;
    if (run.paused && !run.levelUpOpen && !run.chestOpen) run.resumeRun();
  }
}

/**
 * Setzt View + Canvas-CSS. `game.scale.resize` informiert alle Szenen per
 * Scale-Events; die Szenen lesen danach die neuen GAME_WIDTH/GAME_HEIGHT.
 */
function applyView(spec: ViewSpec, force = false): void {
  const key = viewKey(spec);
  const canvas = game.canvas;
  if (!canvas) return;
  const changed = force || key !== appliedKey || GAME_WIDTH !== spec.width || GAME_HEIGHT !== spec.height;
  appliedKey = key;
  // CSS zuerst setzen, dann EIN resize(): ScaleManager.refresh() laeuft darin
  // und emittiert genau ein RESIZE (kein doppelter Szenen-Restart).
  canvas.style.width = `${spec.cssWidth}px`;
  canvas.style.height = `${spec.cssHeight}px`;
  canvas.style.maxWidth = "100vw";
  canvas.style.maxHeight = "100dvh";
  if (changed && game.scale && game.isBooted) {
    setGameView(spec.width, spec.height, spec.scale);
    game.scale.resize(spec.width, spec.height);
  }
  pauseForPortrait(spec.portrait);
}

let pendingFrame = false;
/** Resize-Ereignisse (resize/orientation/visualViewport/dpr) in einem Frame buendeln. */
function scheduleView(): void {
  if (pendingFrame) return;
  pendingFrame = true;
  requestAnimationFrame(() => {
    pendingFrame = false;
    applyView(measureView());
  });
}

/** Wechsel der Windows-Skalierung aendert devicePixelRatio -> matchMedia(resolution). */
let resolutionQuery: MediaQueryList | null = null;
function watchResolution(): void {
  if (resolutionQuery) resolutionQuery.removeEventListener("change", onResolutionChange);
  const dpr = window.devicePixelRatio || 1;
  resolutionQuery = window.matchMedia(`(resolution: ${dpr}dppx)`);
  resolutionQuery.addEventListener("change", onResolutionChange);
}
function onResolutionChange(): void {
  watchResolution();
  scheduleView();
}

function installLifecycle(): void {
  // Tab-Wechsel pausiert den Phaser-Loop komplett (kein Zeit-Sprung beim
  // Zurueckkehren). Der View-Handler bleibt unabhaengig davon aktiv.
  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden) game.loop.sleep();
      else game.loop.wake();
    } catch { /* Loop evtl. noch nicht bereit */ }
  });
  window.addEventListener("resize", scheduleView);
  window.addEventListener("orientationchange", scheduleView);
  window.visualViewport?.addEventListener("resize", scheduleView);
  watchResolution();
  game.events.once(Phaser.Core.Events.READY, () => {
    applyView(measureView(), true);
    watchResolution();
  });
  onSettingsChanged(() => scheduleView());
  applyView(initialView);
}

installLifecycle();

/**
 * M10-Crowd: waehrend eines Runs alle 500 ms pruefen, ob die interne Breite
 * geklemmt werden muss. Ein Wechsel loest genau ein applyView/resize aus.
 */
setInterval(() => {
  if (crowdDisabled || !game.isBooted || !game.scene.isActive("run")) return;
  let enemies = 0;
  try {
    const run = game.scene.getScene("run") as Run;
    enemies = Number(run.getQuickStats().enemies ?? 0);
  } catch {
    enemies = 0;
  }
  const next = shouldCapForCrowd(enemies, crowdCapped);
  if (next !== crowdCapped) {
    crowdCapped = next;
    applyView(measureView());
  }
}, 500);
