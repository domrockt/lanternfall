import Phaser from "phaser";
import { Boot } from "./scenes/Boot";
new Phaser.Game({
  type: Phaser.AUTO, width: 320, height: 180, pixelArt: true, roundPixels: true, antialias: false,
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 } } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [Boot],
});
