import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelText } from "../gfx/font";
import { iconTextureKey } from "../gfx/icons";
import { damageTotal, formatDamageCompact, resultsLayout } from "../logic/results";
import { CHARACTERS } from "../data/characters";
import type { CharacterId } from "../data/types";
import { formatDuration, readMeta, recordRun, writeMeta } from "../logic/meta";
import { createMenuButton, type MenuButton } from "../ui/menu";
import { InputState, allActionsReleased } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";

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
  private pad = new InputState();
  /** Erst nach einem Loslassen aller Pad-Aktionen wieder Eingaben annehmen. */
  private padArmed = false;
  /** Messbeleg fuer den Abnahme-Lauf: HUD-Gesamtschaden vs. Summe der Balken. */
  private proofData: Record<string, unknown> = {};

  /** Abnahme-Hook: von scripts/m10-results-attribution.mjs gelesen. */
  proof(): Record<string, unknown> {
    return this.proofData;
  }

  constructor() { super("results"); }

  init(data: RunResult): void {
    this.result = data;
  }

  private viewW = 0;
  private viewH = 0;

  create(): void {
    this.selected = 0;
    this.leaving = false;
    this.pad.reset();
    this.padArmed = false;
    this.buttons = [];
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    this.viewW = W;
    this.viewH = H;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,
      () => this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize, this));
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    this.add.image(cx, H / 2, "vignette").setDepth(-1).setDisplaySize(W, H);
    this.add.rectangle(cx, 136 + oy, 440, 250, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.lantern]).setDepth(0);

    const victory = this.result.reason === "dawn";
    const giveUp = this.result.reason === "giveup";
    const title = victory ? "MORGENDÄMMERUNG" : giveUp ? "AUFGEGEBEN" : "DIE LATERNE ERLISCHT";
    new PixelText(this, cx, 24 + oy, title, victory ? C.lantern : C.crimson, "center").setScale(2).setDepth(2);
    new PixelText(this, cx, 42 + oy, victory ? "SIEG - DU HAST ÜBERLEBT" : "NIEDERLAGE", C.mist, "center").setDepth(2);

    // Zwei Spalten: links Charakter/Zeit/Kills/Level, rechts Schadensbalken.
    this.add.rectangle(cx - 34, 132 + oy, 1, 140, PAL[C.nightMid], 1).setOrigin(0.5).setDepth(1);

    const char = CHARACTERS[this.result.character as CharacterId];
    const charName = char ? char.name.toUpperCase() : "?";
    const portraitKey = char ? `portrait_${char.id}` : "portrait_mira";
    if (this.textures.exists(portraitKey)) {
      this.add.image(cx - 186, 72 + oy, portraitKey).setScale(2).setDepth(2);
    }
    new PixelText(this, cx - 136, 58 + oy, "CHARAKTER", C.mist).setDepth(2);
    new PixelText(this, cx - 136, 70 + oy, charName.slice(0, 14), C.bone).setDepth(2);

    new PixelText(this, cx - 200, 134 + oy, `ZEIT: ${formatDuration(this.result.elapsed)}`, C.candleWhite).setDepth(2);
    new PixelText(this, cx - 200, 148 + oy, `KILLS: ${this.result.kills}`, C.candleWhite).setDepth(2);
    new PixelText(this, cx - 200, 162 + oy, `LEVEL: ${this.result.level}`, C.candleWhite).setDepth(2);
    if (this.result.god) new PixelText(this, cx - 200, 176 + oy, "GOTT-MODUS - NICHT GEWERTET", C.amber).setDepth(2);

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
    this.add.rectangle(cx - 118, 196 + oy, 164, 17, PAL[C.nightMid], 0.9)
      .setStrokeStyle(1, bannerColor).setDepth(1);
    new PixelText(this, cx - 118, 196 + oy, bannerText.slice(0, 26), bannerColor, "center").setDepth(2);

    // Rechte Spalte: sortierte Schadensbalken mit Waffen-Icons. Positionen kommen
    // aus resultsLayout(), damit Tests und Screen exakt dieselben Rechtecke pruefen.
    const layout = resultsLayout(this.result.damageByWeapon, { width: W, oy, rowsTop: 64 });
    new PixelText(this, layout.header.x, layout.header.y, "SCHADEN PRO WAFFE", C.lantern).setDepth(2);
    const totalDamage = damageTotal(this.result.damageByWeapon);
    new PixelText(this, layout.totalLabel.x, layout.totalLabel.y,
      `GESAMT: ${formatDamageCompact(totalDamage)}`, C.candleWhite).setDepth(2);
    if (layout.rows.length === 0) {
      new PixelText(this, cx - 20, 80 + oy, "KEINE TREFFER", C.fog).setDepth(2);
    }
    layout.rows.forEach((row) => {
      const key = iconTextureKey(row.isEvolution ? "evolution" : "weapon", row.id);
      if (this.textures.exists(key)) {
        this.add.image(row.icon.x + row.icon.w / 2, row.icon.y + row.icon.h / 2, key).setDepth(2);
      }
      row.lines.forEach((line, i) => {
        const rect = row.nameRects[i];
        new PixelText(this, rect.x, rect.y, line, C.bone).setDepth(2);
      });
      const bar = row.barBg;
      this.add.rectangle(bar.x, bar.y + bar.h / 2, bar.w, bar.h, PAL[C.nightMid], 0.9)
        .setOrigin(0, 0.5).setDepth(1);
      const fill = row.barFill;
      this.add.rectangle(fill.x, fill.y + fill.h / 2, fill.w, fill.h,
        PAL[row.isEvolution ? C.paleMist : C.lantern], 0.95).setOrigin(0, 0.5).setDepth(1);
      new PixelText(this, row.valueRect.x, row.valueRect.y, row.valueText, C.candleWhite).setDepth(2);
    });

    const barsSum = layout.rows.reduce((sum, row) => sum + row.damage, 0);
    const deltaPct = totalDamage > 0 ? Math.abs(barsSum - totalDamage) / totalDamage * 100 : 0;
    this.proofData = {
      totalDamage,
      barsSum,
      deltaPct: Math.round(deltaPct * 10000) / 10000,
      rowCount: layout.rows.length,
      overlaps: layout.overlaps.length,
      overlapList: layout.overlaps,
      rows: layout.rows.map((row) => ({
        id: row.id, name: row.name, damage: row.damage, isEvolution: row.isEvolution,
        lines: row.lines, nameRects: row.nameRects,
      })),
    };
    this.registry.set("lf-results-proof", this.proofData);

    this.buttons.push(createMenuButton(
      this, cx - 94, H - 26, 136, "NEUE RUNDE", () => this.newRun(), { height: 20, depth: 4 },
    ));
    this.buttons.push(createMenuButton(
      this, cx + 76, H - 26, 112, "TITEL", () => this.toTitle(), { height: 20, depth: 4 },
    ));
    this.refreshButtons();
    new PixelText(this, cx, H - 9, "ENTER/PFEILE ODER MAUS", C.fog, "center").setDepth(2);

    const kb = this.input.keyboard!;
    kb.removeAllListeners("keydown");
    kb.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
  }

  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  update(): void {
    if (this.leaving) return;
    const a = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    if (!this.padArmed) {
      if (allActionsReleased(a)) this.padArmed = true;
      return;
    }
    if (a.left || a.up) { this.selected = 0; this.refreshButtons(); }
    else if (a.right || a.down) { this.selected = 1; this.refreshButtons(); }
    else if (a.confirm) {
      if (this.selected === 0) this.newRun();
      else this.toTitle();
    } else if (a.back) {
      this.toTitle();
    }
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
