import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { WEAPONS } from "../data/weapons";
import type { WeaponId } from "../data/types";
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
    this.add.rectangle(240, 135, 360, 220, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    const dawn = this.result.reason === "dawn";
    new PixelText(this, 240, 42, dawn ? "MORGENDAMMERUNG" : "DIE LATERNE ERLISCHT", dawn ? C.lantern : C.crimson, "center").setScale(2).setDepth(2);
    new PixelText(this, 240, 62, dawn ? "DER ENDBOSS FOLGT IN M5" : "ERGEBNIS", C.mist, "center").setDepth(2);

    const char = CHARACTERS[this.result.character as keyof typeof CHARACTERS];
    new PixelText(this, 44, 86, `CHARAKTER: ${char ? char.name.toUpperCase() : "?"}`, C.bone).setDepth(2);
    new PixelText(this, 44, 102, `ZEIT: ${formatTime(this.result.elapsed)}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 118, `KILLS: ${this.result.kills}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 134, `LEVEL: ${this.result.level}`, C.candleWhite).setDepth(2);
    if (this.result.god) new PixelText(this, 44, 150, "GOTT-MODUS AKTIV", C.amber).setDepth(2);

    new PixelText(this, 44, 170, "SCHADEN PRO WAFFE", C.lantern).setDepth(2);
    const entries = Object.entries(this.result.damageByWeapon)
      .filter(([, dmg]) => dmg > 0)
      .sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) new PixelText(this, 52, 186, "KEINE TREFFER", C.fog).setDepth(2);
    entries.slice(0, 5).forEach(([id, dmg], i) => {
      const def = WEAPONS[id as WeaponId];
      new PixelText(this, 52, 186 + i * 12, `${(def?.name ?? id).toUpperCase()}: ${Math.round(dmg)}`, C.bone).setDepth(2);
    });

    const prompt = new PixelText(this, 240, 232, "ENTER = ZURUECK ZUM TITEL", C.candleWhite, "center").setDepth(2);
    this.tweens.add({ targets: prompt, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    this.input.keyboard!.once("keydown-ENTER", () =>
      this.scene.start("title", { seed: this.result.seed ?? 1, debug: this.result.debug ?? false }));
  }
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
