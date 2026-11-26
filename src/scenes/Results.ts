import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { iconTextureKey } from "../gfx/icons";
import { damageTable } from "../logic/results";
import { CHARACTERS } from "../data/characters";
import type { CharacterId } from "../data/types";
import { formatDuration, readMeta, recordRun, writeMeta } from "../logic/meta";
import { createMenuButton, type MenuButton } from "../ui/menu";

export interface RunResult {
  reason: "death" | "dawn" | "giveup";
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
  private buttons: MenuButton[] = [];
  private selected = 0;
  private leaving = false;

  constructor() { super("results"); }

  init(data: RunResult): void {
    this.result = data;
  }

  create(): void {
    this.selected = 0;
    this.leaving = false;
    this.buttons = [];
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.add.image(240, 135, "vignette").setDepth(-1);
    this.add.rectangle(240, 135, 400, 240, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    const victory = this.result.reason === "dawn";
    const giveUp = this.result.reason === "giveup";
    const title = victory ? "MORGENDÄMMERUNG" : giveUp ? "AUFGEGEBEN" : "DIE LATERNE ERLISCHT";
    new PixelText(this, 240, 28, title, victory ? C.lantern : C.crimson, "center").setScale(2).setDepth(2);
    new PixelText(this, 240, 48, victory ? "SIEG - DU HAST ÜBERLEBT" : "NIEDERLAGE", C.mist, "center").setDepth(2);

    const char = CHARACTERS[this.result.character as CharacterId];
    new PixelText(this, 44, 64, `CHARAKTER: ${char ? char.name.toUpperCase() : "?"}`, C.bone).setDepth(2);
    new PixelText(this, 44, 78, `ZEIT: ${formatDuration(this.result.elapsed)}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 92, `KILLS: ${this.result.kills}`, C.candleWhite).setDepth(2);
    new PixelText(this, 44, 106, `LEVEL: ${this.result.level}`, C.candleWhite).setDepth(2);
    if (this.result.god) new PixelText(this, 44, 120, "GOTT-MODUS - NICHT GESPEICHERT", C.amber).setDepth(2);

    // Kleine Meta: Bestwerte nur für ehrliche Läufe fortschreiben.
    if (!this.result.god && char) {
      const recorded = recordRun(readMeta(), {
        character: char.id,
        time: this.result.elapsed,
        kills: this.result.kills,
        level: this.result.level,
        victory,
      });
      writeMeta(recorded.meta);
      const labels: string[] = [];
      if (recorded.records.time) labels.push("ZEIT");
      if (recorded.records.kills) labels.push("KILLS");
      if (recorded.records.level) labels.push("LEVEL");
      if (recorded.records.victory) labels.push("SIEG");
      if (labels.length > 0) {
        new PixelText(this, 44, 120, `NEUER BESTWERT: ${labels.join(", ")}`, C.lantern).setDepth(2);
      } else {
        new PixelText(this, 44, 120, "BESTWERTE BLEIBEN STEHEN", C.mist).setDepth(2);
      }
    }

    new PixelText(this, 52, 132, "SCHADEN PRO WAFFE", C.lantern).setDepth(2);
    const entries = damageTable(this.result.damageByWeapon);
    if (entries.length === 0) {
      new PixelText(this, 52, 152, "KEINE TREFFER", C.fog).setDepth(2);
    }
    const columns = [44, 176, 308];
    entries.forEach((entry, i) => {
      // Bis zu 12 Einträge (6 Basis + 6 Evolutionen) in 3 Spalten × 4 Zeilen.
      const x = columns[Math.floor(i / 4)];
      const y = 144 + (i % 4) * 19;
      const key = iconTextureKey(entry.isEvolution ? "evolution" : "weapon", entry.id);
      if (this.textures.exists(key)) {
        this.add.image(x + 8, y + 3, key).setDepth(2);
      }
      const name = entry.name.toUpperCase().slice(0, 18);
      new PixelText(this, x + 22, y, name, C.bone).setDepth(2);
      // Schaden direkt unter dem Namen (nicht in die nächste Zeile gerückt).
      new PixelText(this, x + 22, y + 9, `${entry.damage}`, C.candleWhite).setDepth(2);
    });

    this.buttons.push(createMenuButton(
      this, 146, 232, 136, "NEUE RUNDE", () => this.newRun(), { height: 20, depth: 4 },
    ));
    this.buttons.push(createMenuButton(
      this, 316, 232, 112, "TITEL", () => this.toTitle(), { height: 20, depth: 4 },
    ));
    this.refreshButtons();
    new PixelText(this, 240, 246, "ENTER/PFEILE ODER MAUS", C.fog, "center").setDepth(2);

    const kb = this.input.keyboard!;
    kb.removeAllListeners("keydown");
    kb.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
  }

  private refreshButtons(): void {
    this.buttons.forEach((b, i) => b.setFocused(i === this.selected));
  }

  private onKey(ev: KeyboardEvent): void {
    if (ev.repeat || this.leaving) return;
    const key = ev.key.toLowerCase();
    if (key === "1") { this.newRun(); return; }
    if (key === "2" || ev.key === "Escape") { this.toTitle(); return; }
    if (ev.key === "ArrowLeft" || key === "a") { this.selected = 0; this.refreshButtons(); return; }
    if (ev.key === "ArrowRight" || key === "d") { this.selected = 1; this.refreshButtons(); return; }
    if (ev.key === "Enter" || ev.key === " ") {
      if (this.selected === 0) this.newRun();
      else this.toTitle();
    }
  }

  private newRun(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start("run", {
      character: this.result.character as CharacterId,
      seed: (this.result.seed ?? 1) + 1,
      debug: this.result.debug ?? false,
    });
  }

  private toTitle(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start("title", { seed: this.result.seed ?? 1, debug: this.result.debug ?? false });
  }
}
