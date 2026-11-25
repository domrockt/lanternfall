import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { iconTextureKey } from "../gfx/icons";
import { damageTable } from "../logic/results";
import { CHARACTERS } from "../data/characters";

export interface RunResult {
  reason: "death" | "dawn";
  elapsed: number;
  kills: number;
  level: number;
  character: string;
  damageByWeapon: Record<string, number>;
  god: boolean;
  seed?: number;
  debug?: boolean;
}

export class Results extends Phaser.Scene {
  private result!: RunResult;

  constructor() { super("results"); }

  init(data: RunResult): void {
    this.result = data;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.add.image(240, 135, "vignette").setDepth(-1);
    this.add.rectangle(240, 135, 400, 232, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    const dawn = this.result.reason === "dawn";
    new PixelText(this, 240, 34, dawn ? "MORGENDAMMERUNG" : "DIE LATERNE ERLISCHT", dawn ? C.lantern : C.crimson, "center").setScale(2).setDepth(2);
    new PixelText(this, 240, 54, dawn ? "DER ENDBOSS FOLGT IN M5" : "ERGEBNIS", C.mist, "center").setDepth(2);

    const char = CHARACTERS[this.result.character as keyof typeof CHARACTERS];
    new PixelText(this, 44, 76, `CHARAKTER: ${char ? char.name.toUpperCase() : "?"}`, C.bone).setDepth(2);
    new PixelText(this, 44, 92, `ZEIT: ${formatTime(this.result.elapsed)}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 108, `KILLS: ${this.result.kills}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 124, `LEVEL: ${this.result.level}`, C.candleWhite).setDepth(2);
    if (this.result.god) new PixelText(this, 44, 140, "GOTT-MODUS AKTIV", C.amber).setDepth(2);

    new PixelText(this, 52, 162, "SCHADEN PRO WAFFE", C.lantern).setDepth(2);
    const entries = damageTable(this.result.damageByWeapon);
    if (entries.length === 0) {
      new PixelText(this, 52, 178, "KEINE TREFFER", C.fog).setDepth(2);
    }
    const columns = [52, 176, 300];
    entries.forEach((entry, i) => {
      const x = columns[Math.floor(i / 4)];
      const y = 178 + (i % 4) * 16;
      const key = iconTextureKey(entry.isEvolution ? "evolution" : "weapon", entry.id);
      if (this.textures.exists(key)) {
        this.add.image(x + 8, y + 3, key).setDepth(2);
      }
      const name = entry.name.toUpperCase().slice(0, 14);
      new PixelText(this, x + 22, y, name, C.bone).setDepth(2);
      new PixelText(this, x + 112, y + 9, `${entry.damage}`, C.candleWhite, "right").setDepth(2);
    });

    const prompt = new PixelText(this, 240, 248, "ENTER = ZURÜCK ZUM TITEL", C.candleWhite, "center").setDepth(2);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    this.input.keyboard!.once("keydown-ENTER", () =>
      this.scene.start("title", { seed: this.result.seed ?? 1, debug: this.result.debug ?? false }));
  }
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
