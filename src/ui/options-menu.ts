import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { applyOptions } from "../audio/AudioSystem";
import { getSettings } from "../audio/settings";
import {
  OPTION_ROWS, optionValueLabel, stepOption,
} from "../audio/options";
import type { ActionState } from "../input/InputState";

interface RowView {
  label: PixelText;
  value: PixelText;
  outline: Phaser.GameObjects.Rectangle;
}

/**
 * M10-options-focus: Zeilen-Hover gilt nur, wenn der Zeiger sich seit dem
 * Öffnen bewegt hat. Ohne diesen Guard öffnet das Overlay unter einem
 * stillstehenden Mauszeiger (OPTIONEN-Knopf sitzt über Zeile 6 ZURÜCK) mit
 * fokussierter ZURÜCK-Zeile statt Zeile 0 — Uneinigkeit zwischen Tastatur-
 * und Maus-Fokus-Start (Befund K1, shots/m10-options-focus-before.json).
 * Rein, testbar.
 */
export function hoverRowAllowed(
  pointer: { x: number; y: number },
  openPointer: { x: number; y: number } | null,
): boolean {
  if (!openPointer) return true;
  return pointer.x !== openPointer.x || pointer.y !== openPointer.y;
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
  /** Zeigerposition beim Öffnen (Hover-Guard, hoverRowAllowed). */
  private openPointer: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, depth: number, onClose: () => void) {
    this.scene = scene;
    this.onClose = onClose;
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    const rowW = Math.min(520, W - 40);
    const rowLeft = cx - rowW / 2;
    const labelX = rowLeft + 12;
    const valueX = rowLeft + rowW - 12;
    const arrowL = valueX - 100;
    const arrowR = rowLeft + rowW - 4;
    this.container = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    // Klick-Blocker: verhindert, dass Mausklicks durch das Menü darunterliegende
    // Knöpfe (Titel/Pause) auslösen.
    const blocker = scene.add.zone(cx, H / 2, W, H).setInteractive();
    blocker.on("pointerdown", () => { /* schluckt Klicks */ });
    this.container.add(blocker);
    this.interactives.push(blocker);
    this.container.add(scene.add.rectangle(0, 0, W, H, PAL[C.ink], 0.92).setOrigin(0, 0));
    this.container.add(scene.add.nineslice(
      cx, 135 + oy, "ui_frame", undefined, Math.min(rowW + 24, W - 24), 234, 8, 8, 8, 8,
    ));
    this.container.add(new PixelText(scene, cx, 42 + oy, "OPTIONEN", C.lantern, "center").setScale(2));
    this.container.add(new PixelText(scene, cx, 62 + oy, "PFEILE ODER MAUS - ENTER/ESC", C.fog, "center"));

    // M10: Jede Zeile hat EINE zusammenhaengende Trefferflaeche ueber die volle
    // Zeilenbreite und die ganze Zeilenhoehe (20 px Pitch). Die Flaechen beruehren
    // sich, ueberlappen aber nicht - so trifft ein Tap nie die Nachbarzeile.
    const ROW_PITCH = 20;
    for (let i = 0; i < OPTION_ROWS.length; i++) {
      const y = 84 + oy + i * 20;
      const rowZone = scene.add.rectangle(cx, y + 3, rowW, ROW_PITCH, PAL[C.nightMid], 0)
        .setOrigin(0.5);
      // Hintergrundfläche als sichtbarer Fokus-Streifen.
      const outline = scene.add.rectangle(cx, y + 3, rowW, 16, PAL[C.ink], 0)
        .setStrokeStyle(1, PAL[C.lantern]).setVisible(false);
      const label = new PixelText(scene, labelX, y, "", C.bone);
      const value = new PixelText(scene, valueX, y, "", C.candleWhite, "right");
      this.container.add([rowZone, outline, label, value]);
      rowZone.setInteractive({ useHandCursor: true });
      rowZone.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        if (!hoverRowAllowed(pointer, this.openPointer)) return;
        this.selected = i;
        this.refresh();
      });
      rowZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        this.selected = i;
        this.refresh();
        if (i >= OPTION_ROWS.length - 1) { this.close(); return; }
        // Tap auf dem "<"-Glyph senkt, alles andere erhoeht/umschaltet.
        const delta = Math.abs(pointer.x - arrowL) <= 22 ? -1 : 1;
        this.apply(i, delta);
      });
      this.interactives.push(rowZone);
      if (i < OPTION_ROWS.length - 1) {
        this.container.add(new PixelText(scene, arrowL, y, "<", C.lantern, "center"));
        this.container.add(new PixelText(scene, arrowR, y, ">", C.lantern, "center"));
      }
      this.rows.push({ label, value, outline });
    }
    this.container.add(new PixelText(
      scene, cx, H - 14, "OPTIONEN GELTEN SOFORT UND BLEIBEN GESPEICHERT",
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
    // M10-options-focus: Zeigerposition beim Öffnen merken — stillstehender
    // Zeiger darf beim Erscheinen des Overlays keine Zeile anwählen.
    const p = this.scene.input.activePointer;
    this.openPointer = { x: p.x, y: p.y };
  }

  close(): void {
    this.container.setVisible(false);
    this.setInputEnabled(false);
    this.openPointer = null;
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

  /** M8-input: Gamepad-Navigation (A/B/D-Pad/Stick); true wenn verarbeitet. */
  handlePad(actions: ActionState): boolean {
    if (!this.visible) return false;
    if (actions.back) { this.close(); return true; }
    if (actions.up) {
      this.selected = (this.selected + OPTION_ROWS.length - 1) % OPTION_ROWS.length;
      this.refresh();
      return true;
    }
    if (actions.down) {
      this.selected = (this.selected + 1) % OPTION_ROWS.length;
      this.refresh();
      return true;
    }
    if (actions.left) { this.apply(this.selected, -1); return true; }
    if (actions.right) { this.apply(this.selected, 1); return true; }
    if (actions.confirm) {
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
