import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { applyOptions } from "../audio/AudioSystem";
import { getSettings } from "../audio/settings";
import {
  OPTION_ROWS, optionValueLabel, stepOption,
} from "../audio/options";
import { createHitZone } from "./menu";

interface RowView {
  label: PixelText;
  value: PixelText;
  outline: Phaser.GameObjects.Rectangle;
}

/**
 * Optionsmenü für Titel und Pause: 5 Werte + ZURÜCK, Tastatur und Maus/Touch.
 * Werte werden sofort persistiert (localStorage) und angewendet.
 */
export class OptionsMenu {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly rows: RowView[] = [];
  private readonly onClose: () => void;
  private readonly interactives: Phaser.GameObjects.GameObject[] = [];
  private selected = 0;

  constructor(scene: Phaser.Scene, depth: number, onClose: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    this.container = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    // Klick-Blocker: verhindert, dass Mausklicks durch das Menü darunterliegende
    // Knöpfe (Titel/Pause) auslösen.
    const blocker = scene.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT)
      .setInteractive();
    blocker.on("pointerdown", () => { /* schluckt Klicks */ });
    this.container.add(blocker);
    this.interactives.push(blocker);
    this.container.add(scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.92).setOrigin(0, 0));
    this.container.add(scene.add.nineslice(
      GAME_WIDTH / 2, 135, "ui_frame", undefined, 408, 234, 8, 8, 8, 8,
    ));
    this.container.add(new PixelText(scene, GAME_WIDTH / 2, 42, "OPTIONEN", C.lantern, "center").setScale(2));
    this.container.add(new PixelText(scene, GAME_WIDTH / 2, 62, "PFEILE ODER MAUS - ENTER/ESC", C.fog, "center"));

    for (let i = 0; i < OPTION_ROWS.length; i++) {
      const y = 84 + i * 20;
      const rowZone = scene.add.rectangle(238, y + 3, 368, 16, PAL[C.nightMid], 0)
        .setOrigin(0.5);
      // Hintergrundfläche als sichtbarer Fokus-Streifen.
      const outline = scene.add.rectangle(238, y + 3, 368, 16, PAL[C.ink], 0)
        .setStrokeStyle(1, PAL[C.lantern]).setVisible(false);
      const label = new PixelText(scene, 60, y, "", C.bone);
      const value = new PixelText(scene, 392, y, "", C.candleWhite, "right");
      this.container.add([rowZone, outline, label, value]);
      rowZone.setInteractive({ useHandCursor: true });
      rowZone.on("pointerover", () => { this.selected = i; this.refresh(); });
      this.interactives.push(rowZone);

      const hit = (dx: number, delta: number): void => {
        const zone = createHitZone(scene, this.container, dx, y + 3, 24, 18, () => {
          this.selected = i;
          this.apply(i, delta);
        });
        this.interactives.push(zone);
      };
      if (i < OPTION_ROWS.length - 1) {
        hit(292, -1);
        hit(414, 1);
        this.container.add(new PixelText(scene, 292, y, "<", C.lantern, "center"));
        this.container.add(new PixelText(scene, 414, y, ">", C.lantern, "center"));
        // Klick auf den Wert: bei Schaltern umschalten, sonst erhöhen.
        const valueZone = createHitZone(scene, this.container, 345, y + 3, 72, 18, () => {
          this.selected = i;
          this.apply(i, 1);
        });
        this.interactives.push(valueZone);
      } else {
        const backZone = createHitZone(scene, this.container, 238, y + 3, 368, 18, () => this.close());
        this.interactives.push(backZone);
      }
      this.rows.push({ label, value, outline });
    }
    this.container.add(new PixelText(
      scene, GAME_WIDTH / 2, 218, "OPTIONEN GELTEN SOFORT UND BLEIBEN GESPEICHERT",
      C.mist, "center",
    ));
    this.refresh();
    this.setInputEnabled(false);
  }

  private setInputEnabled(value: boolean): void {
    for (const obj of this.interactives) {
      if (value) (obj as Phaser.GameObjects.GameObject & { setInteractive: () => void }).setInteractive();
      else (obj as Phaser.GameObjects.GameObject & { disableInteractive: () => void }).disableInteractive();
    }
  }

  get visible(): boolean {
    return this.container.visible;
  }

  open(): void {
    this.selected = 0;
    this.refresh();
    this.setInputEnabled(true);
    this.container.setVisible(true);
  }

  close(): void {
    this.container.setVisible(false);
    this.setInputEnabled(false);
    this.onClose();
  }

  /** Tastatur; gibt true zurück, wenn das Menü die Taste verarbeitet hat. */
  handleKey(ev: KeyboardEvent): boolean {
    if (!this.visible || ev.repeat) return false;
    const key = ev.key.toLowerCase();
    if (key === "o" || ev.key === "Escape") { this.close(); return true; }
    if (ev.key === "ArrowUp" || key === "w") {
      this.selected = (this.selected + OPTION_ROWS.length - 1) % OPTION_ROWS.length;
      this.refresh();
      return true;
    }
    if (ev.key === "ArrowDown" || key === "s") {
      this.selected = (this.selected + 1) % OPTION_ROWS.length;
      this.refresh();
      return true;
    }
    if (ev.key === "ArrowLeft" || key === "a") { this.apply(this.selected, -1); return true; }
    if (ev.key === "ArrowRight" || key === "d") { this.apply(this.selected, 1); return true; }
    if (ev.key === "Enter" || ev.key === " ") {
      if (this.selected === OPTION_ROWS.length - 1) this.close();
      else this.apply(this.selected, 1);
      return true;
    }
    return true;
  }

  private apply(row: number, delta: number): void {
    if (row >= OPTION_ROWS.length - 1) {
      this.close();
      return;
    }
    applyOptions(stepOption(getSettings(), row, delta));
    this.refresh();
  }

  private refresh(): void {
    const opts = getSettings();
    this.rows.forEach((row, i) => {
      const selected = i === this.selected;
      row.label.setText(`${selected ? "> " : "  "}${OPTION_ROWS[i]}`)
        .setColorIndex(selected ? C.lantern : C.bone);
      row.value.setText(i === OPTION_ROWS.length - 1 ? "" : optionValueLabel(opts, i))
        .setColorIndex(selected ? C.candleWhite : C.bone);
      row.outline.setVisible(selected);
    });
  }
}
