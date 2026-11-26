import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { Boot } from "./scenes/Boot";
import { Title } from "./scenes/Title";
import { CharSelect } from "./scenes/CharSelect";
import { Run } from "./scenes/Run";
import { UI } from "./scenes/UI";
import { Results } from "./scenes/Results";
import { Credits } from "./scenes/Credits";
import { installDebugApi } from "./debug";
import { getSettings, onSettingsChanged } from "./audio/settings";
import { resolveScale } from "./audio/options";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  // M8-input: Gamepad-Plugin (Hotplug) + bis zu vier gleichzeitige Touch-Pointer
  // (Joystick + Tippen). Keine Änderung an Auflösung/Skalierung.
  input: {
    gamepad: true,
    activePointers: 4,
  },
  scale: {
    // Ganzzahlige Skalierung: Canvas bleibt 480x270, CSS-Größe wird per resize gesetzt.
    // Zentrierung erfolgt per CSS-Flexbox (keine doppelten Phaser-Margins).
    mode: Phaser.Scale.NONE,
  },
  scene: [Boot, Title, CharSelect, Run, UI, Results, Credits],
});

installDebugApi(game);

/**
 * Nur ganzzahlige Vielfache (2x, 3x, ...) — keine weichen Skalierungsartefakte.
 * Die Option "Skalierung" kann AUTO oder 1x/2x/3x erzwingen (persistiert);
 * AUTO = größtes ganzzahliges Vielfaches, das in den Viewport passt.
 */
function applyIntegerScale(): void {
  const canvas = game.canvas;
  if (!canvas) return;
  const scale = resolveScale(
    getSettings().scale,
    window.innerWidth,
    window.innerHeight,
    GAME_WIDTH,
    GAME_HEIGHT,
  );
  canvas.style.width = `${GAME_WIDTH * scale}px`;
  canvas.style.height = `${GAME_HEIGHT * scale}px`;
  // Input-Hitboxen sofort an die neue CSS-Größe anpassen (kein Fehlklick-Fenster).
  game.scale.refresh();
}

/**
 * Tab-Wechsel pausiert das Spiel komplett (kein Zeit-Sprung beim
 * Zurückkehren): der Phaser-Loop schläft und wird erst beim Sichtbarwerden
 * wieder geweckt. Der Resize-Handler hält die CSS-Skalierung ganzzahlig.
 */
function installLifecycle(): void {
  document.addEventListener("visibilitychange", () => {
    try {
      if (document.hidden) game.loop.sleep();
      else game.loop.wake();
    } catch { /* Loop evtl. noch nicht bereit */ }
  });
  game.events.once(Phaser.Core.Events.READY, applyIntegerScale);
  window.addEventListener("resize", applyIntegerScale);
  onSettingsChanged(() => applyIntegerScale());
  applyIntegerScale();
}

installLifecycle();
