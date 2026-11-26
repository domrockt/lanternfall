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
    this.add.rectangle(240, 134, 440, 240, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    const victory = this.result.reason === "dawn";
    const giveUp = this.result.reason === "giveup";
    const title = victory ? "MORGENDÄMMERUNG" : giveUp ? "AUFGEGEBEN" : "DIE LATERNE ERLISCHT";
    new PixelText(this, 240, 24, title, victory ? C.lantern : C.crimson, "center").setScale(2).setDepth(2);
    new PixelText(this, 240, 42, victory ? "SIEG - DU HAST ÜBERLEBT" : "NIEDERLAGE", C.mist, "center").setDepth(2);

    // Zwei Spalten: links Charakter/Zeit/Kills/Level, rechts Schadensbalken.
    this.add.rectangle(206, 132, 1, 140, PAL[C.nightMid], 1).setOrigin(0.5).setDepth(1);

    const char = CHARACTERS[this.result.character as CharacterId];
    const charName = char ? char.name.toUpperCase() : "?";
    const portraitKey = char ? `portrait_${char.id}` : "portrait_mira";
    if (this.textures.exists(portraitKey)) {
      this.add.image(54, 72, portraitKey).setScale(2).setDepth(2);
    }
    new PixelText(this, 104, 58, "CHARAKTER", C.mist).setDepth(2);
    new PixelText(this, 104, 70, charName.slice(0, 14), C.bone).setDepth(2);

    new PixelText(this, 40, 134, `ZEIT: ${formatDuration(this.result.elapsed)}`, C.candleWhite).setDepth(2);
    new PixelText(this, 40, 148, `KILLS: ${this.result.kills}`, C.candleWhite).setDepth(2);
    new PixelText(this, 40, 162, `LEVEL: ${this.result.level}`, C.candleWhite).setDepth(2);
    if (this.result.god) new PixelText(this, 40, 176, "GOTT-MODUS - NICHT GEWERTET", C.amber).setDepth(2);

    // Bestwert als zentriertes Banner in der linken Spalte.
    let bannerText = "BESTWERTE BLEIBEN STEHEN";
    let bannerColor: number = C.mist;
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
        bannerText = labels.length > 2 ? "NEUER BESTWERT" : `NEUER BESTWERT: ${labels.join(", ")}`;
        bannerColor = C.lantern;
      }
    }
    this.add.rectangle(122, 196, 164, 17, PAL[C.nightMid], 0.9)
      .setStrokeStyle(1, bannerColor).setDepth(1);
    new PixelText(this, 122, 196, bannerText.slice(0, 26), bannerColor, "center").setDepth(2);

    // Rechte Spalte: sortierte Schadensbalken mit Waffen-Icons.
    new PixelText(this, 220, 58, "SCHADEN PRO WAFFE", C.lantern).setDepth(2);
    const entries = damageTable(this.result.damageByWeapon);
    if (entries.length === 0) {
      new PixelText(this, 220, 80, "KEINE TREFFER", C.fog).setDepth(2);
    }
    const maxDamage = entries.reduce((m, e) => Math.max(m, e.damage), 1);
    const rowsTop = 74;
    const rowStep = 10;
    entries.forEach((entry, i) => {
      const y = rowsTop + i * rowStep;
      const key = iconTextureKey(entry.isEvolution ? "evolution" : "weapon", entry.id);
      if (this.textures.exists(key)) {
        this.add.image(228, y + 3, key).setDepth(2);
      }
      const name = entry.name.toUpperCase();
      new PixelText(this, 238, y, name, C.bone).setDepth(2);
      const barX = 322;
      const barMax = 90;
      const width = Math.max(2, Math.round((entry.damage / maxDamage) * barMax));
      this.add.rectangle(barX, y + 3, barMax, 5, PAL[C.nightMid], 0.9).setOrigin(0, 0.5).setDepth(1);
      this.add.rectangle(barX, y + 3, width, 5, PAL[entry.isEvolution ? C.paleMist : C.lantern], 0.95)
        .setOrigin(0, 0.5).setDepth(1);
      new PixelText(this, 446, y, `${entry.damage}`, C.candleWhite, "right").setDepth(2);
    });

    this.buttons.push(createMenuButton(
      this, 146, 238, 136, "NEUE RUNDE", () => this.newRun(), { height: 20, depth: 4 },
    ));
    this.buttons.push(createMenuButton(
      this, 316, 238, 112, "TITEL", () => this.toTitle(), { height: 20, depth: 4 },
    ));
    this.refreshButtons();
    new PixelText(this, 240, 256, "ENTER/PFEILE ODER MAUS", C.fog, "center").setDepth(2);

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
