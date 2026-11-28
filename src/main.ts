import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, setGameView } from "./config";
import { computeView, snapCanvasRect, viewKey, type ViewSpec } from "./logic/view";
import { Boot } from "./scenes/Boot";
import { Loading } from "./scenes/Loading";
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
 * M10-perf-cap-rollback: der M10-Crowd-Deckel ist rueckgebaut — iGPU haelt M25
 * 780x360@3 ohne Deckel bei vsync-60 (Belege docs/lanes/m10-perf-cap-rollback.md).
 */

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
  // M10 Android/ARM: harte 60-FPS-Grenze gegen 90/120-Hz-Hitze und Akku-Drosselung
  // auf Mali/Adreno, plus GPU-Hint auf die tatsaechlich starke Einheit.
  // Phaser 3.90 liest powerPreference als TOP-LEVEL-GameConfig (nicht unter render).
  powerPreference: "high-performance",
  fps: {
    target: 60,
    limit: 60,
  },
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
  scene: [Boot, Loading, Title, CharSelect, Run, UI, Results, Credits],
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
  // M10-view-pixel-snap: das Flex-Layout zentriert den Canvas; bei unteilbaren
  // Breiten liegt seine Kante dann auf halben Geraetepixeln (2560x1080@1:
  // CSS-x = 0.5) und die Randspalte blurrt zum Seitenhintergrund. Fix in der
  // POSITIONIERUNG, nicht in der View-Rechnung: Rect nach dem Layout messen
  // (Transform vorher loeschen, damit sich Offsets nicht akkumulieren) und um
  // snapCanvasRect verschieben — Restspalte nach rechts/unten, harte Kante.
  canvas.style.transform = "";
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    const snap = snapCanvasRect(rect.left, rect.top, spec.dpr);
    canvas.style.transform = snap.alreadySnapped ? "" : `translate(${snap.dx}px, ${snap.dy}px)`;
  }
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
