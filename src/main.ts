import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./config";
import { Boot } from "./scenes/Boot";
import { Title } from "./scenes/Title";
import { CharSelect } from "./scenes/CharSelect";
import { Run } from "./scenes/Run";
import { UI } from "./scenes/UI";
import { Results } from "./scenes/Results";
import { installDebugApi } from "./debug";
import { integerScale } from "./logic/scale";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    // Ganzzahlige Skalierung: Canvas bleibt 480x270, CSS-Größe wird per resize gesetzt.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [Boot, Title, CharSelect, Run, UI, Results],
});

installDebugApi(game);

/** Nur ganzzahlige Vielfache (2x, 3x, ...) — keine weichen Skalierungsartefakte. */
function applyIntegerScale(): void {
  const canvas = game.canvas;
  if (!canvas) return;
  const scale = integerScale(window.innerWidth, window.innerHeight, GAME_WIDTH, GAME_HEIGHT);
  canvas.style.width = `${GAME_WIDTH * scale}px`;
  canvas.style.height = `${GAME_HEIGHT * scale}px`;
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
  applyIntegerScale();
}

installLifecycle();
