import Phaser from "phaser";
import { PAL } from "../palette";
export class Boot extends Phaser.Scene {
  constructor() { super("boot"); }
  create() {
    this.cameras.main.setBackgroundColor(PAL[1]);
    this.add.text(160, 90, "READY", { fontFamily: "monospace", fontSize: "8px", color: "#fff1e8" }).setOrigin(0.5);
  }
}
