import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { WEAPONS } from "../data/weapons";
import { PASSIVES } from "../data/passives";
import type { Offer } from "../logic/levelup";
import type { HudState, Run } from "./Run";

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  number: PixelText;
  name: PixelText;
  level: PixelText;
  desc: PixelText[];
}

/** Parallele UI-Szene: HUD, Level-up-Dialog, Pause/Build. */
export class UI extends Phaser.Scene {
  private run!: Run;
  private timerText!: PixelText;
  private levelText!: PixelText;
  private killsText!: PixelText;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private xpBg!: Phaser.GameObjects.Rectangle;

  private levelGroup!: Phaser.GameObjects.Container;
  private levelTitle!: PixelText;
  private levelSub!: PixelText;
  private cards: CardView[] = [];
  private selected = 0;
  private autoPickTimer = 0;

  private pauseGroup!: Phaser.GameObjects.Container;
  private pauseLines: PixelText[] = [];
  private lastPauseShown = false;

  constructor() { super("ui"); }

  create(): void {
    this.run = this.scene.get("run") as Run;

    // HUD-Leiste oben
    this.add.rectangle(0, 0, GAME_WIDTH, 12, PAL[C.nightDeep], 0.82).setOrigin(0, 0).setDepth(10);
    this.levelText = new PixelText(this, 5, 2, "LV 1", C.lantern).setDepth(11);
    this.timerText = new PixelText(this, GAME_WIDTH / 2, 2, "00:00", C.candleWhite, "center").setDepth(11);
    this.killsText = new PixelText(this, GAME_WIDTH - 5, 2, "KILL 0", C.bone, "right").setDepth(11);
    this.xpBg = this.add.rectangle(5, 9, GAME_WIDTH - 10, 3, PAL[C.nightSlate]).setOrigin(0, 0).setDepth(11);
    this.xpFill = this.add.rectangle(5, 9, GAME_WIDTH - 10, 3, PAL[C.amber]).setOrigin(0, 0).setDepth(12);

    this.createLevelUpUI();
    this.createPauseUI();

    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
    this.run.events.on("levelup", this.onLevelUp, this);
    this.run.events.on("levelupClosed", this.onLevelUpClosed, this);
    this.run.events.on("pauseChanged", this.onPauseChanged, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.run.events.off("levelup", this.onLevelUp, this);
      this.run.events.off("levelupClosed", this.onLevelUpClosed, this);
      this.run.events.off("pauseChanged", this.onPauseChanged, this);
    });
  }

  private createLevelUpUI(): void {
    this.levelGroup = this.add.container(0, 0).setDepth(100).setVisible(false);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.86).setOrigin(0, 0);
    this.levelGroup.add(dim);
    const frame = this.add.rectangle(GAME_WIDTH / 2, 134, 448, 220, PAL[C.night], 0.97).setStrokeStyle(2, PAL[C.fog]);
    this.levelGroup.add(frame);
    this.levelTitle = new PixelText(this, GAME_WIDTH / 2, 36, "LEVEL UP", C.lantern, "center").setScale(2);
    this.levelSub = new PixelText(this, GAME_WIDTH / 2, 56, "", C.mist, "center");
    this.levelGroup.add(this.levelTitle);
    this.levelGroup.add(this.levelSub);

    this.cards = [];
    for (let i = 0; i < 3; i++) {
      const cx = 84 + i * 156;
      const bg = this.add.rectangle(cx, 158, 132, 146, PAL[C.nightMid]).setStrokeStyle(2, PAL[C.nightSlate]);
      const number = new PixelText(this, cx - 62, 92, `${i + 1}`, C.lantern);
      const name = new PixelText(this, cx - 50, 90, "", C.candleWhite);
      const level = new PixelText(this, cx - 62, 108, "", C.amber);
      const desc: PixelText[] = [
        new PixelText(this, cx - 62, 126, "", C.mist),
        new PixelText(this, cx - 62, 138, "", C.mist),
        new PixelText(this, cx - 62, 150, "", C.mist),
      ];
      this.levelGroup.add([bg, number, name, level, ...desc]);
      this.cards.push({ bg, number, name, level, desc });
    }
    const hint = new PixelText(this, GAME_WIDTH / 2, 251, "1-3 ODER PFEILE + ENTER", C.fog, "center");
    this.levelGroup.add(hint);
  }

  private createPauseUI(): void {
    this.pauseGroup = this.add.container(0, 0).setDepth(120).setVisible(false);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.8).setOrigin(0, 0);
    this.pauseGroup.add(dim);
    const frame = this.add.rectangle(GAME_WIDTH / 2, 135, 300, 220, PAL[C.night], 0.96).setStrokeStyle(2, PAL[C.fog]);
    this.pauseGroup.add(frame);
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 36, "PAUSE", C.lantern, "center").setScale(2));
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 54, "DEIN BUILD", C.bone, "center"));
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 238, "ESC = WEITER", C.mist, "center"));
    this.pauseLines = [];
  }

  update(_time: number, delta: number): void {
    if (!this.run || !this.run.scene.isActive()) return;
    const s = this.run.getHudState();
    this.refreshHud(s);

    if (s.levelUpOpen) {
      if (!this.levelGroup.visible) this.showOffers(s.offers, s.level);
      if (this.run.autoPlay) {
        this.autoPickTimer += delta / 1000;
        if (this.autoPickTimer > 0.35) {
          this.autoPickTimer = 0;
          try { this.run.pickLevelUp(0); } catch { /* Angebot evtl. schon weg */ }
        }
      }
    } else {
      this.autoPickTimer = 0;
      this.levelGroup.setVisible(false);
    }

    const pauseVisible = s.paused && !s.levelUpOpen;
    if (pauseVisible !== this.lastPauseShown) {
      this.lastPauseShown = pauseVisible;
      this.refreshPause();
    }
  }

  private refreshHud(s: HudState): void {
    this.levelText.setText(`LV ${s.level}`);
    const total = Math.max(0, Math.floor(s.time));
    this.timerText.setText(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
    this.killsText.setText(`KILL ${s.kills}`);
    this.xpFill.setScale(Math.max(0.001, s.xpRatio), 1);
  }

  private onPauseChanged(): void {
    this.refreshPause();
  }

  private onLevelUp(data: { offers: Offer[]; level: number }): void {
    this.selected = 0;
    this.autoPickTimer = 0;
    this.showOffers(data.offers, data.level);
  }

  private onLevelUpClosed(): void {
    this.levelGroup.setVisible(false);
    this.selected = 0;
  }

  private showOffers(offers: Offer[], level: number): void {
    if (offers.length === 0) {
      this.levelGroup.setVisible(false);
      return;
    }
    this.levelSub.setText(`STUFE ${level} - WAEHLE EINE BELOHNUNG`);
    this.selected = Math.min(this.selected, offers.length - 1);
    offers.forEach((offer, i) => {
      const card = this.cards[i];
      if (!card) return;
      card.bg.setVisible(true);
      card.number.setVisible(true);
      card.number.setText(`${i + 1}`);
      card.name.setVisible(true).setText(offer.name.toUpperCase());
      card.level.setVisible(true).setText(`${offer.isNew ? "NEU" : "STUFE"} ${offer.level}`);
      const lines = wrapText(offer.description, 22);
      card.desc.forEach((t, li) => {
        t.setText(lines[li] ?? "");
        t.setVisible(Boolean(lines[li]));
      });
    });
    for (let i = offers.length; i < 3; i++) {
      const card = this.cards[i];
      card.bg.setVisible(false);
      card.number.setVisible(false);
      card.name.setVisible(false);
      card.level.setVisible(false);
      card.desc.forEach((t) => t.setVisible(false));
    }
    this.highlight();
    this.levelGroup.setVisible(true);
  }

  private highlight(): void {
    this.cards.forEach((card, i) => {
      card.bg.setStrokeStyle(i === this.selected ? 2 : 1, i === this.selected ? PAL[C.lantern] : PAL[C.nightSlate]);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.run) return;
    if (this.run.levelUpOpen) {
      const offers = this.run.currentOffers;
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
        const idx = Number(ev.key) - 1;
        if (idx < offers.length) this.pick(idx);
        return;
      }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp" || ev.key === "a" || ev.key === "w") {
        this.selected = (this.selected + offers.length - 1) % offers.length;
        this.highlight();
        return;
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown" || ev.key === "d" || ev.key === "s") {
        this.selected = (this.selected + 1) % offers.length;
        this.highlight();
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        this.pick(this.selected);
        return;
      }
    }
  }

  private pick(index: number): void {
    try {
      this.run.pickLevelUp(index);
    } catch (err) {
      console.warn("[Lanternfall] pickLevelUp:", err);
    }
  }

  private refreshPause(): void {
    const s = this.run.getHudState();
    const visible = s.paused && !s.levelUpOpen;
    this.pauseGroup.setVisible(visible);
    this.lastPauseShown = visible;
    if (!visible) return;
    for (const line of this.pauseLines) line.destroy();
    this.pauseLines = [];
    let y = 76;
    for (const w of s.weapons) {
      const def = WEAPONS[w.id as keyof typeof WEAPONS];
      const line = new PixelText(this, 116, y, `${def.name.toUpperCase()}  STUFE ${w.level}`, C.bone);
      this.pauseGroup.add(line);
      this.pauseLines.push(line);
      y += 13;
    }
    y += 6;
    for (const p of s.passives) {
      const def = PASSIVES[p.id as keyof typeof PASSIVES];
      const line = new PixelText(this, 116, y, `${def.name.toUpperCase()}  STUFE ${p.level}`, C.mist);
      this.pauseGroup.add(line);
      this.pauseLines.push(line);
      y += 13;
    }
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
