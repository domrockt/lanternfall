/**
 * M10-phaser-lazy-import: phaser (gzip ~318 kB) laedt nicht mehr upfront,
 * sondern per dynamischem import() parallel zu den Szenen-Buendeln. Statisch
 * bleiben nur phaser-freie Module (config, logic/view, audio/settings) —
 * alles, was phaser statisch zieht (debug.ts, Szenen), steht hinter dem
 * import()-Gate. Der Boot-Pfad WARTET auf das Promise (kein Polling, kein
 * sleep-Warten). Fehler beim Laden = klare Meldung im #lf-boot-error-Overlay,
 * niemals ein stiller weisser Screen.
 *
 * M8: View wird vor dem Spielstart aus dem Geraet berechnet. logische Hoehe 360,
 * Breite nach Seitenverhaeltnis; jeder Spielpixel = n x n Geraetepixel.
 * M10-perf-cap-rollback: der M10-Crowd-Deckel ist rueckgebaut — iGPU haelt M25
 * 780x360@3 ohne Deckel bei vsync-60 (Belege docs/lanes/m10-perf-cap-rollback.md).
 */
import { GAME_HEIGHT, GAME_WIDTH, setGameView } from "./config";
import { computeView, snapCanvasRect, viewKey, type ViewSpec } from "./logic/view";
import { getSettings, onSettingsChanged } from "./audio/settings";
// Nur Typ-Import (wird zur Buildzeit entfernt, kein Runtime-Edge auf phaser).
import type { Run } from "./scenes/Run";

/** Phaser-Typen ohne statischen Import (verbatim entfernt, kein Chunk-Edge). */
type PhaserNS = typeof import("phaser");
type Game = import("phaser").Game;

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

// Messlaeufe (balance.mjs --density): Spawnraten-Faktor ohne Rebuild setzen.
const densityParam = Number(new URLSearchParams(window.location.search).get("density"));

/** Erst nach erfolgreichem import() gesetzt; alle Handler guarden auf null. */
let game: Game | null = null;
let appliedKey = "";

/** Klare Fehlermeldung statt weissem Screen, wenn der Boot-Pfad scheitert. */
function showBootError(detail: string): void {
  console.error("[lanternfall] Spielstart fehlgeschlagen:", detail);
  const el = document.getElementById("lf-boot-error");
  if (!el) return;
  const detailEl = el.querySelector<HTMLElement>(".detail");
  if (detailEl) detailEl.textContent = detail;
  el.classList.add("visible");
}

/** Dreh-Hinweis bei Hochkant (DOM-Overlay, blockiert Eingaben). */
function rotateOverlay(): HTMLElement | null {
  return document.getElementById("lf-rotate");
}

let portraitAutoPaused = false;
function pauseForPortrait(portrait: boolean): void {
  const overlay = rotateOverlay();
  if (overlay) overlay.classList.toggle("visible", portrait);
  if (!game || !game.scene.isActive("run")) return;
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
  const canvas = game ? game.canvas : null;
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
  if (changed && game && game.scale && game.isBooted) {
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

function installLifecycle(ready: Game, Phaser: PhaserNS): void {
  // Tab-Wechsel pausiert den Phaser-Loop komplett (kein Zeit-Sprung beim
  // Zurueckkehren). Der View-Handler bleibt unabhaengig davon aktiv.
  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden) ready.loop.sleep();
      else ready.loop.wake();
    } catch { /* Loop evtl. noch nicht bereit */ }
  });
  window.addEventListener("resize", scheduleView);
  window.addEventListener("orientationchange", scheduleView);
  window.visualViewport?.addEventListener("resize", scheduleView);
  watchResolution();
  ready.events.once(Phaser.Core.Events.READY, () => {
    applyView(measureView(), true);
    watchResolution();
  });
  onSettingsChanged(() => scheduleView());
  applyView(initialView);
}

/**
 * Boot-Pfad in zwei Phasen (M10-phaser-lazy-import):
 *
 *  Phase 1 (blockiert bis Titel): phaser + debug + Boot- + Loading- +
 *    Title-Szene parallel per import() laden; das Game startet nur mit
 *    [Boot, Loading, Title]. Der Titel
 *    braucht phaser zwingend — der Gewinn ist, dass Run/UI/CharSelect/
 *    Results/Credits (zusammen ~60 kB gzip) NICHT mehr im kritischen Pfad
 *    liegen und der Entry-Chunk (App-Shell) von 81 kB gzip auf ~4 kB fällt.
 *
 *  Phase 2 (parallel gestartet, nicht blockierend): restliche Szenen laden und
 *    per scene.add() registrieren. scene.start() in den Szenen loest per Key
 *    auf ("charselect", "run", "ui", "results", "credits") — keine Aenderung an
 *    src/scenes/** noetig. Kein Polling: Phase 2 wartet auf ihr Promise.
 *
 * Scheitert Phase 1, gibt es eine sichtbare Fehlermeldung — kein weisser Screen.
 */
async function boot(): Promise<void> {
  try {
    // Phase 2 sofort (parallel zu Phase 1) anstossen — die Chunks sollen schon
    // waehrend des Phaser-Parsens ueber die Leitung gehen.
    const phase2 = Promise.all([
      import("./scenes/CharSelect"),
      import("./scenes/Run"),
      import("./scenes/UI"),
      import("./scenes/Results"),
      import("./scenes/Credits"),
    ]);

    // m10-loading-screen (gemergt auf main): Boot -> Loading -> Title ist der
    // kritische Pfad, daher gehoert die Loading-Szene in Phase 1.
    const [phaserMod, debugMod, bootMod, loadingMod, titleMod] = await Promise.all([
      import("phaser"),
      import("./debug"),
      import("./scenes/Boot"),
      import("./scenes/Loading"),
      import("./scenes/Title"),
    ]);
    const Phaser = phaserMod.default;

    const started = new Phaser.Game({
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
      // Nur Boot + Loading + Title: der Titel ist der erste Sichtkontakt; alles
      // andere kommt mit Phase 2 in die Scene-Manager-Registrie.
      scene: [bootMod.Boot, loadingMod.Loading, titleMod.Title],
    });
    game = started;

    debugMod.installDebugApi(started);

    if (Number.isFinite(densityParam) && densityParam > 0) started.registry.set("lf-density", densityParam);

    installLifecycle(started, Phaser);

    // Phase 2: Szenen registrieren, sobald die Chunks da sind (await = kein
    // Polling). autoStart=false — gestartet werden sie per scene.start(key).
    const [charSelectMod, runMod, uiMod, resultsMod, creditsMod] = await phase2;
    started.scene.add("charselect", charSelectMod.CharSelect, false);
    started.scene.add("run", runMod.Run, false);
    started.scene.add("ui", uiMod.UI, false);
    started.scene.add("results", resultsMod.Results, false);
    started.scene.add("credits", creditsMod.Credits, false);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    showBootError(`SPIELDATEIEN KONNTEN NICHT GELADEN WERDEN. SEITE NEU LADEN. (${detail})`);
  }
}

void boot();
