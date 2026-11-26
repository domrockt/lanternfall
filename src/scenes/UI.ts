import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { weaponDef, isEvolutionWeapon } from "../data/weaponIds";
import { iconKeyForOffer, iconTextureKey } from "../gfx/icons";
import { PASSIVES } from "../data/passives";
import type { Offer } from "../logic/levelup";
import { slotNameLines } from "../logic/text";
import { chooseBestOffer } from "../logic/autoplay";
import { OptionsMenu } from "../ui/options-menu";
import { createMenuButton, type MenuButton } from "../ui/menu";
import { InputState, type ActionState } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";
import { TouchControls } from "../input/TouchControls";
import type { HudState, Run } from "./Run";

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
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
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private hpLabel!: PixelText;

  private levelGroup!: Phaser.GameObjects.Container;
  private levelTitle!: PixelText;
  private levelSub!: PixelText;
  private cards: CardView[] = [];
  private selected = 0;
  private autoPickTimer = 0;

  private pauseGroup!: Phaser.GameObjects.Container;
  private pauseLines: Phaser.GameObjects.GameObject[] = [];
  private pauseWeaponHead!: PixelText;
  private pausePassiveHead!: PixelText;
  private pauseButtons: MenuButton[] = [];
  private pauseSelected = 0;
  private lastPauseShown = false;

  private hudIconBg!: Phaser.GameObjects.Rectangle;
  private hudIcons: Phaser.GameObjects.Image[] = [];

  private chestGroup!: Phaser.GameObjects.Container;
  private chestSprite!: Phaser.GameObjects.Image;
  private chestBeam!: Phaser.GameObjects.Image;
  private chestTitle!: PixelText;
  private chestSlots: { bg: Phaser.GameObjects.Rectangle; slotBg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; text: PixelText; text2: PixelText; level: PixelText }[] = [];
  private chestHideTimer?: Phaser.Time.TimerEvent;
  private chestSkip?: Phaser.GameObjects.Zone;

  private bossGroup!: Phaser.GameObjects.Container;
  private bossName!: PixelText;
  private bossPhaseText!: PixelText;
  private bossBarBg!: Phaser.GameObjects.Rectangle;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private bossBarShadow!: Phaser.GameObjects.Rectangle;
  private bannerGroup!: Phaser.GameObjects.Container;
  private bannerText!: PixelText;
  private bannerSub!: PixelText;
  private bannerTimer?: Phaser.Time.TimerEvent;

  private options!: OptionsMenu;
  /** M8-input: Gamepad-Flanken für Menü-Navigation. */
  private pad = new InputState();
  private touch?: TouchControls;

  constructor() { super("ui"); }

  /** M8: Bei View-Wechsel (Resize/Rotation) wird die UI neu aufgebaut. */
  private viewW = 0;
  private viewH = 0;

  create(): void {
    this.run = this.scene.get("run") as Run;
    this.viewW = GAME_WIDTH;
    this.viewH = GAME_HEIGHT;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);

    // HUD-Leiste oben (volle aktuelle View-Breite).
    this.add.rectangle(0, 0, GAME_WIDTH, 12, PAL[C.nightDeep], 0.82).setOrigin(0, 0).setDepth(10);
    // Texte auf y=1 (7 px hoch) und Depth 13: der XP-Balken darf keine
    // Glyphenzeile mehr ueberdecken (sonst wird aus "02:02" optisch "07:07").
    this.levelText = new PixelText(this, 5, 1, "LV 1", C.lantern).setDepth(13);
    this.timerText = new PixelText(this, GAME_WIDTH / 2, 1, "00:00", C.candleWhite, "center").setDepth(13);
    this.killsText = new PixelText(this, GAME_WIDTH - 5, 1, "KILL 0", C.bone, "right").setDepth(13);
    this.xpBg = this.add.rectangle(5, 8, GAME_WIDTH - 10, 4, PAL[C.ink]).setOrigin(0, 0)
      .setStrokeStyle(1, PAL[C.nightSlate]).setDepth(11);
    this.xpFill = this.add.rectangle(6, 9, GAME_WIDTH - 12, 2, PAL[C.amber]).setOrigin(0, 0).setDepth(12);
    // Spieler-HP oben links, fester Rahmen + 4-px-Füllung.
    this.hpBg = this.add.rectangle(5, 15, 106, 9, PAL[C.ink]).setOrigin(0, 0)
      .setStrokeStyle(1, PAL[C.nightSlate]).setDepth(11);
    this.hpLabel = new PixelText(this, 9, 16, "HP", C.bone).setDepth(12);
    this.hpFill = this.add.rectangle(25, 17, 82, 4, PAL[C.crimson]).setOrigin(0, 0).setDepth(12);
    this.createHudIcons();

    this.createLevelUpUI();
    this.createPauseUI();
    this.createChestUI();
    this.createBossUI();
    this.options = new OptionsMenu(this, 125, () => {});
    // M8-input: Touch-Overlay liegt über allen Menüs und liefert den Joystick-Vektor
    // an die globale TouchState (vom Run gelesen). Der Pause-Puls wird dort von Run
    // über InputState entgegengenommen.
    this.pad.reset();
    this.touch = new TouchControls(this, { canMove: () => this.canTouchMove() });

    this.input.keyboard!.removeAllListeners("keydown");
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
    this.run.events.on("levelup", this.onLevelUp, this);
    this.run.events.on("levelupClosed", this.onLevelUpClosed, this);
    this.run.events.on("pauseChanged", this.onPauseChanged, this);
    this.run.events.on("chestOpen", this.onChestOpen, this);
    this.run.events.on("chestClosed", this.onChestClosed, this);
    this.run.events.on("bossSpawn", this.onBossBanner, this);
    this.run.events.on("bossDefeated", this.onBossDefeated, this);
    this.run.events.on("bossPhase", this.onBossPhase, this);
    this.run.events.on("dawn", this.onDawn, this);
    this.run.events.on("evolution", this.onEvolution, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);
      this.touch?.destroy();
      this.touch = undefined;
      this.pad.reset();
      this.run.events.off("levelup", this.onLevelUp, this);
      this.run.events.off("levelupClosed", this.onLevelUpClosed, this);
      this.run.events.off("pauseChanged", this.onPauseChanged, this);
      this.run.events.off("chestOpen", this.onChestOpen, this);
      this.run.events.off("chestClosed", this.onChestClosed, this);
      this.run.events.off("bossSpawn", this.onBossBanner, this);
      this.run.events.off("bossDefeated", this.onBossDefeated, this);
      this.run.events.off("bossPhase", this.onBossPhase, this);
      this.run.events.off("dawn", this.onDawn, this);
      this.run.events.off("evolution", this.onEvolution, this);
    });
  }

  /** M8: Nach Resize/Rotation die komplette UI neu aufbauen (View ist dann neu gesetzt). */
  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  private createHudIcons(): void {
    this.hudIconBg = this.add.rectangle(0, 13, 4, 19, PAL[C.nightDeep], 0.6)
      .setOrigin(0, 0).setDepth(10).setVisible(false);
    this.hudIcons = [];
    for (let i = 0; i < 12; i++) {
      const img = this.add.image(122 + i * 17, 15, "icon_weapon_ember")
        .setOrigin(0, 0).setDepth(11).setVisible(false);
      this.hudIcons.push(img);
    }
  }

  private createBossUI(): void {
    const cx = GAME_WIDTH / 2;
    const barW = Math.min(236, GAME_WIDTH - 48);
    const left = cx - barW / 2;
    this.bossGroup = this.add.container(0, 0).setDepth(90).setVisible(false);
    this.bossBarBg = this.add.rectangle(left, 46, barW, 12, PAL[C.ink], 0.95)
      .setOrigin(0, 0.5).setStrokeStyle(1, PAL[C.amber]);
    this.bossBarFill = this.add.rectangle(left + 4, 46, barW - 8, 6, PAL[24])
      .setOrigin(0, 0.5);
    this.bossBarShadow = this.add.rectangle(left + 4, 48, barW - 8, 2, PAL[23])
      .setOrigin(0, 0.5);
    // Segmente + Endkappen mit 2x2-Amberpunkten.
    const segs: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 1; i < 9; i++) {
      segs.push(this.add.rectangle(left + 4 + i * (barW - 8) / 9, 46, 2, 6, PAL[C.ink])
        .setOrigin(0, 0.5));
    }
    for (const sx of [left - 5, cx + barW / 2 - 5]) {
      segs.push(this.add.rectangle(sx, 46, 5, 14, PAL[C.nightSlate]).setStrokeStyle(1, PAL[C.ink]));
      segs.push(this.add.rectangle(sx + 1, 41, 2, 2, PAL[C.amber]));
      segs.push(this.add.rectangle(sx + 1, 49, 2, 2, PAL[C.amber]));
    }
    this.bossName = new PixelText(this, cx, 33, "", C.amber, "center");
    this.bossPhaseText = new PixelText(this, cx + barW / 2 - 6, 33, "", C.candleWhite, "right");
    this.bossGroup.add([this.bossBarBg, this.bossBarShadow, this.bossBarFill, ...segs,
      this.bossName, this.bossPhaseText]);

    this.bannerGroup = this.add.container(0, 0).setDepth(95).setVisible(false).setAlpha(0);
    const bg = this.add.nineslice(cx, 92, "ui_frame", undefined, 300, 48, 8, 8, 8, 8);
    this.bannerText = new PixelText(this, cx, 84, "", C.lantern, "center").setScale(1);
    this.bannerSub = new PixelText(this, cx, 98, "", C.bone, "center");
    this.bannerGroup.add([bg, this.bannerText, this.bannerSub]);
  }

  private onBossBanner(data: { name?: string; index?: number }): void {
    this.showBanner(
      data.index === 5 ? "DER HOHE KÖNIG" : (data.name ?? "BOSS").toUpperCase(),
      data.index === 5 ? "3 PHASEN - SIEG BEI SEINEM TOD" : "EIN BOSS ERWACHT",
      C.amber,
    );
  }

  private onBossDefeated(data: { name?: string; index?: number }): void {
    this.showBanner(`${(data.name ?? "BOSS").toUpperCase()} BESIEGT`, "EINE TRUHE ERSCHEINT", C.amber);
  }

  private onEvolution(data: { name?: string }): void {
    this.showBanner("EVOLUTION", (data.name ?? "").toUpperCase(), C.lantern);
  }

  private onBossPhase(data: { index: number; phase: number }): void {
    if (data.index !== 5) return;
    this.showBanner(`PHASE ${data.phase}`, data.phase === 3 ? "DER KÖNIG BRENNT" : "NEUE ANGRIFFE", C.amber);
  }

  private onDawn(): void {
    this.showBanner("MORGENDÄMMERUNG", "DU HAST ÜBERLEBT", C.lantern);
  }

  private showBanner(title: string, sub: string, color: number): void {
    this.bannerTimer?.remove(false);
    this.bannerText.setColorIndex(color).setText(title);
    this.bannerSub.setText(sub);
    this.bannerGroup.setVisible(true).setAlpha(0).setY(-6);
    this.tweens.add({ targets: this.bannerGroup, alpha: 1, y: 0, duration: 240, ease: "Quad.Out" });
    this.bannerTimer = this.time.delayedCall(2400, () => {
      this.tweens.add({
        targets: this.bannerGroup, alpha: 0, y: -6, duration: 380,
        onComplete: () => this.bannerGroup.setVisible(false),
      });
    });
  }

  private createLevelUpUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    // Overlays behalten ihre 270er-Proportionen, werden aber mittig in die
    // aktuelle 360er-Hoehe gesetzt (+45 px) und in der Breite zentriert.
    const oy = Math.round((H - 270) / 2);
    const gap = 18;
    const cardW = Math.max(120, Math.min(160, Math.floor((W - 32 - 2 * gap) / 3)));
    const frameW = Math.min(W - 24, cardW * 3 + gap * 2 + 28);
    this.levelGroup = this.add.container(0, 0).setDepth(100).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.86).setOrigin(0, 0);
    this.levelGroup.add(dim);
    const frame = this.add.nineslice(cx, 134 + oy, "ui_frame", undefined, frameW, 220, 8, 8, 8, 8);
    this.levelGroup.add(frame);
    this.levelTitle = new PixelText(this, cx, 36 + oy, "LEVEL UP", C.lantern, "center").setScale(2);
    this.levelSub = new PixelText(this, cx, 56 + oy, "", C.mist, "center");
    this.levelGroup.add(this.levelTitle);
    this.levelGroup.add(this.levelSub);

    this.cards = [];
    for (let i = 0; i < 3; i++) {
      const cardX = Math.round(cx + (i - 1) * (cardW + gap));
      const textX = cardX - Math.floor(cardW / 2) + 4;
      const bg = this.add.rectangle(cardX, 158 + oy, cardW, 150, PAL[C.nightMid]).setStrokeStyle(2, PAL[C.nightSlate]);
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", () => {
        if (!this.run?.levelUpOpen) return;
        this.selected = i;
        this.highlight();
      });
      bg.on("pointerdown", () => {
        if (!this.run?.levelUpOpen) return;
        this.selected = i;
        this.highlight();
        this.pick(i);
      });
      const slotBg = this.add.rectangle(cardX, 112 + oy, 60, 60, PAL[C.nightDeep]).setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(cardX, 112 + oy, "icon_weapon_ember").setScale(3).setVisible(false);
      const divider = this.add.rectangle(textX, 148 + oy, cardW - 8, 1, PAL[C.nightSlate]);
      const number = new PixelText(this, textX + 2, 88 + oy, `${i + 1}`, C.lantern);
      const name = new PixelText(this, textX, 154 + oy, "", C.candleWhite);
      const level = new PixelText(this, textX, 166 + oy, "", C.amber);
      const desc: PixelText[] = [
        new PixelText(this, textX, 180 + oy, "", C.mist),
        new PixelText(this, textX, 192 + oy, "", C.mist),
        new PixelText(this, textX, 204 + oy, "", C.mist),
      ];
      this.levelGroup.add([bg, slotBg, icon, divider, number, name, level, ...desc]);
      this.cards.push({ bg, icon, number, name, level, desc });
    }
    this.levelWrapChars = Math.max(16, Math.floor((cardW - 10) / 6));
    // Hinweis am unteren Rand, nicht auf einer festen 270er-Koordinate.
    const hint = new PixelText(this, cx, H - 14, "1-3, PFEILE + ENTER ODER MAUS", C.fog, "center");
    this.levelGroup.add(hint);
    this.setLevelCardsEnabled(false);
  }

  /** Zeichen pro Kartenzeile, abhaengig von der aktuellen View-Breite. */
  private levelWrapChars = 21;

  /** Verhindert, dass unsichtbare Level-up-Karten Mausklicks schlucken. */
  private setLevelCardsEnabled(value: boolean): void {
    for (const card of this.cards) {
      if (value) card.bg.setInteractive({ useHandCursor: true });
      else card.bg.disableInteractive();
    }
  }

  private createPauseUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    const ox = Math.round(cx - 240);
    this.pauseGroup = this.add.container(0, 0).setDepth(120).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.8).setOrigin(0, 0);
    this.pauseGroup.add(dim);
    const frame = this.add.nineslice(cx, 135 + oy, "ui_frame", undefined, Math.min(384, W - 24), 232, 8, 8, 8, 8);
    this.pauseGroup.add(frame);
    this.pauseGroup.add(new PixelText(this, cx, 28 + oy, "PAUSE", C.lantern, "center").setScale(2));
    this.pauseGroup.add(new PixelText(this, cx, 46 + oy, "DEIN BUILD", C.bone, "center"));
    this.pauseWeaponHead = new PixelText(this, 84 + ox, 62 + oy, "", C.lantern);
    this.pausePassiveHead = new PixelText(this, 234 + ox, 62 + oy, "", C.lantern);
    this.pauseGroup.add([this.pauseWeaponHead, this.pausePassiveHead]);

    const resume = createMenuButton(this, 108 + ox, 201 + oy, 108, "FORTSETZEN", () => this.run.resumeRun(), { height: 20, depth: 1 });
    const options = createMenuButton(this, cx, 201 + oy, 96, "OPTIONEN", () => this.options.open(), { height: 20, depth: 1 });
    const giveUp = createMenuButton(this, 368 + ox, 201 + oy, 92, "AUFGABE", () => this.run.giveUp(), { height: 20, depth: 1 });
    this.pauseButtons = [resume, options, giveUp];
    this.pauseSelected = 0;
    resume.setFocused(true);
    for (const b of this.pauseButtons) {
      b.setEnabled(false);
      this.pauseGroup.add(b.container);
    }
    this.pauseGroup.add(new PixelText(this, cx, 222 + oy, "ESC = WEITER - O = OPTIONEN - Q = AUFGABE", C.mist, "center"));
    this.pauseGroup.add(new PixelText(this, cx, 234 + oy, "PFEILE + ENTER ODER MAUS", C.fog, "center"));
    this.pauseLines = [];
  }

  private refreshPauseButtons(): void {
    this.pauseButtons.forEach((b, i) => b.setFocused(i === this.pauseSelected));
  }

  private activatePauseButton(): void {
    if (this.pauseSelected === 0) this.run.resumeRun();
    else if (this.pauseSelected === 1) this.options.open();
    else this.run.giveUp();
  }

  private createChestUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    this.chestGroup = this.add.container(0, 0).setDepth(130).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.9).setOrigin(0, 0);
    this.chestGroup.add(dim);
    const frame = this.add.nineslice(cx, 140 + oy, "ui_frame", undefined, Math.min(452, W - 24), 244, 8, 8, 8, 8);
    this.chestGroup.add(frame);
    this.chestBeam = this.add.image(cx, 70 + oy, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(0.25)
      .setAlpha(0);
    this.chestGroup.add(this.chestBeam);
    this.chestSprite = this.add.image(cx, 84 + oy, "chest_closed").setScale(2.4);
    this.chestGroup.add(this.chestSprite);
    this.chestTitle = new PixelText(this, cx, 38 + oy, "TRUHE GEÖFFNET", C.lantern, "center").setScale(2);
    this.chestGroup.add(this.chestTitle);
    this.chestGroup.add(new PixelText(this, cx, 54 + oy, "BELOHNUNGEN ROLLEN ...", C.mist, "center"));
    this.chestSlots = [];
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 86;
      const bg = this.add.rectangle(x, 196 + oy, 96, 92, PAL[C.nightMid])
        .setStrokeStyle(2, PAL[C.nightSlate]);
      const slotBg = this.add.rectangle(x, 176 + oy, 44, 44, PAL[C.nightDeep])
        .setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(x, 176 + oy, "icon_weapon_ember").setScale(2.4).setVisible(false);
      const text = new PixelText(this, x, 202 + oy, "", C.candleWhite, "center");
      const text2 = new PixelText(this, x, 213 + oy, "", C.candleWhite, "center");
      const level = new PixelText(this, x, 224 + oy, "", C.amber, "center");
      this.chestGroup.add([bg, slotBg, icon, text, text2, level]);
      this.chestSlots.push({ bg, slotBg, icon, text, text2, level });
    }
    this.chestGroup.add(new PixelText(this, cx, H - 14, "TIPPE ODER A = ÜBERNEHMEN", C.fog, "center"));
    // M8-input: Truhe per Tippen/Bestaetigen uebernehmen (Belohnungen werden
    // sofort angewendet). Die automatische Sequenz bleibt unveraendert.
    const skip = this.add.zone(cx, H / 2, W, H);
    skip.setInteractive();
    skip.disableInteractive();
    skip.on("pointerdown", () => {
      if (this.run?.chestOpen) this.run.finishChest();
    });
    this.chestGroup.add(skip);
    this.chestSkip = skip;
  }

  private onChestOpen(result: import("../logic/evolution").ChestResult): void {
    // Ein noch laufender Hide-Timer der vorigen Truhe darf die neue Sequenz nicht ausblenden.
    this.chestHideTimer?.remove(false);
    this.chestHideTimer = undefined;
    this.chestGroup.setVisible(true);
    this.chestSkip?.setInteractive();
    this.chestTitle.setText("TRUHE");
    this.chestSprite.setTexture("chest_closed").setScale(2.2).setAlpha(1);
    this.chestBeam.setAlpha(0).setScale(0.25);
    const n = result.rewards.length;
    const cx = GAME_WIDTH / 2;
    const oy = Math.round((GAME_HEIGHT - 270) / 2);
    for (let i = 0; i < this.chestSlots.length; i++) {
      const slot = this.chestSlots[i];
      const reward = result.rewards[i];
      const x = cx + (i - (n - 1) / 2) * 104;
      slot.bg.setPosition(x, 196 + oy).setVisible(Boolean(reward));
      slot.slotBg.setPosition(x, 176 + oy).setVisible(Boolean(reward));
      slot.icon.setPosition(x, 176 + oy).setVisible(Boolean(reward)).setAlpha(1)
        .setTexture(reward ? iconTextureKey(
          reward.kind === "evolution" ? "evolution" : reward.kind,
          reward.id,
        ) : "icon_weapon_ember");
      slot.text.setPosition(x, 202 + oy).setVisible(Boolean(reward)).setAlpha(0).setText("?");
      slot.text2.setPosition(x, 213 + oy).setVisible(false).setAlpha(0).setText("");
      slot.level.setPosition(x, 224 + oy).setVisible(Boolean(reward)).setAlpha(0).setText("");
    }
    // Deckel öffnen + Lichtstrahl.
    this.time.delayedCall(280, () => this.chestSprite.setTexture("chest_open"));
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: this.chestBeam, alpha: 0.9, scale: 1.15, duration: 520, ease: "Sine.Out" });
    });
    // Münzen-Partikel.
    this.time.delayedCall(420, () => this.spawnChestCoins());
    // Slot-Rollen: zufällige Namen, dann feste Belohnung.
    this.time.delayedCall(520, () => {
      this.chestTitle.setText("TRUHE GEÖFFNET");
      for (let i = 0; i < result.rewards.length; i++) {
        const slot = this.chestSlots[i];
        slot.text.setAlpha(1);
        slot.text2.setVisible(false);
        let tick = 0;
        this.time.addEvent({
          delay: 95,
          repeat: 7,
          callback: () => {
            // Rollnamen wie die ausgerollten Namen vollständig auf 2 Zeilen verteilen.
            const lines = slotNameLines(pickRollName(result.rewards, tick++).toUpperCase(), 13);
            slot.text.setText(lines[0] ?? "").setAlpha(1);
            slot.text2.setText(lines[1] ?? "").setVisible(Boolean(lines[1])).setAlpha(1);
          },
        });
      }
    });
    // Settle nacheinander.
    for (let i = 0; i < result.rewards.length; i++) {
      const reward = result.rewards[i];
      this.time.delayedCall(1450 + i * 220, () => {
        const slot = this.chestSlots[i];
        const lines = slotNameLines(reward.name.toUpperCase(), 13);
        slot.text.setText(lines[0] ?? "");
        slot.text2.setText(lines[1] ?? "").setVisible(Boolean(lines[1])).setAlpha(1);
        slot.level.setText(reward.kind === "evolution" ? "EVOLUTION" : `STUFE ${reward.level}`);
        slot.bg.setStrokeStyle(2, PAL[reward.iconColor] ?? PAL[C.lantern]);
        slot.icon.setAlpha(1);
        slot.text.setAlpha(1);
        slot.text2.setAlpha(1);
        slot.level.setAlpha(1);
      });
    }
    const finishAt = 1650 + result.rewards.length * 220;
    this.time.delayedCall(finishAt, () => {
      this.run.finishChest();
    });
    this.chestHideTimer = this.time.delayedCall(finishAt + 260, () => this.chestGroup.setVisible(false));
  }

  private onChestClosed(): void {
    this.chestHideTimer?.remove(false);
    this.chestHideTimer = undefined;
    this.chestGroup.setVisible(false);
    this.chestSkip?.disableInteractive();
  }

  private spawnChestCoins(): void {
    for (let i = 0; i < 12; i++) {
      const oy = Math.round((GAME_HEIGHT - 270) / 2);
      const cx = GAME_WIDTH / 2;
      const coin = this.add.image(cx, 96 + oy, "fx_coin")
        .setScale(1.4)
        .setBlendMode(Phaser.BlendModes.NORMAL);
      this.chestGroup.add(coin);
      // Deterministisch gestreut (kein Math.random): reproduzierbare GIF-Frames.
      const t = (i * 7) % 12 / 11;
      const angle = -Math.PI / 2 + (t - 0.5) * 2.2;
      const speed = 70 + t * 90;
      const tx = cx + Math.cos(angle) * speed;
      const ty = 96 + oy + Math.sin(angle) * speed;
      this.tweens.add({
        targets: coin,
        x: tx,
        y: ty,
        alpha: 0,
        scale: 0.4,
        duration: 700 + t * 350,
        ease: "Cubic.Out",
        onComplete: () => coin.destroy(),
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.run || !this.run.scene.isActive()) return;
    const s = this.run.getHudState();
    this.registry.set("lf-options-open", this.options.visible);
    this.touch?.update();
    this.handlePad(s);
    this.refreshHud(s);
    this.refreshBoss(s.boss);

    if (s.levelUpOpen) {
      if (!this.levelGroup.visible) this.showOffers(s.offers, s.level);
      if (this.run.autoPlay) {
        this.autoPickTimer += delta / 1000;
        if (this.autoPickTimer > 0.35) {
          this.autoPickTimer = 0;
          try { this.run.pickLevelUp(chooseBestOffer(s.offers, { weapons: s.weapons, passives: s.passives, startingWeapon: this.run.character.startWeapon })); } catch { /* Angebot evtl. schon weg */ }
        }
      }
    } else {
      this.autoPickTimer = 0;
      if (this.levelGroup.visible) {
        this.levelGroup.setVisible(false);
        this.setLevelCardsEnabled(false);
      }
    }

    const pauseVisible = s.paused && !s.levelUpOpen && !s.chestOpen;
    if (pauseVisible !== this.lastPauseShown) {
      this.lastPauseShown = pauseVisible;
      this.refreshPause();
      if (!pauseVisible && this.options.visible) this.options.close();
    }
  }

  /** Touch-Overlay nur, wenn eine Bewegung jetzt moeglich ist. */
  private canTouchMove(): boolean {
    if (!this.run || !this.run.scene.isActive()) return false;
    const s = this.run.getHudState();
    return !s.paused && !s.levelUpOpen && !s.chestOpen && !this.options.visible;
  }

  /**
   * M8-input: Gamepad bedient alle Menüs. Start/Pause wird im Run
   * verarbeitet (InputState-Bewegungsframe); hier nur Fokus/Bestaetigen/Zurueck.
   * Fokus entsteht aus dem bestehenden setFocused/selected-Pfad und ist sichtbar.
   */
  private handlePad(s: HudState): void {
    const a: ActionState = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    const any = a.up || a.down || a.left || a.right || a.confirm || a.back;
    if (!any) return;
    if (this.options.visible) {
      this.options.handlePad(a);
      return;
    }
    if (s.levelUpOpen) {
      const count = Math.max(1, s.offers.length);
      if (a.left || a.up) {
        this.selected = (this.selected + count - 1) % count;
        this.highlight();
      } else if (a.right || a.down) {
        this.selected = (this.selected + 1) % count;
        this.highlight();
      } else if (a.confirm) {
        if (this.selected < s.offers.length) this.pick(this.selected);
      }
      return;
    }
    if (s.chestOpen) {
      if (a.confirm || a.back) this.run.finishChest();
      return;
    }
    if (s.paused) {
      if (a.left || a.up) {
        this.pauseSelected = (this.pauseSelected + this.pauseButtons.length - 1) % this.pauseButtons.length;
        this.refreshPauseButtons();
      } else if (a.right || a.down) {
        this.pauseSelected = (this.pauseSelected + 1) % this.pauseButtons.length;
        this.refreshPauseButtons();
      } else if (a.confirm) {
        this.activatePauseButton();
      } else if (a.back) {
        this.run.resumeRun();
      }
    }
  }

  private refreshBoss(boss: import("./Run").HudState["boss"]): void {
    if (!boss) {
      this.bossGroup.setVisible(false);
      return;
    }
    this.bossGroup.setVisible(true);
    this.bossName.setText(boss.name.toUpperCase());
    this.bossPhaseText.setText(boss.phase > 1 ? `PHASE ${boss.phase}` : "");
    this.bossBarFill.setScale(Math.max(0.001, boss.ratio), 1);
    this.bossBarFill.setFillStyle(PAL[boss.color] ?? PAL[C.crimson]);
  }

  private refreshHud(s: HudState): void {
    this.levelText.setText(`LV ${s.level}`);
    const total = Math.max(0, Math.floor(s.time));
    this.timerText.setText(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
    this.killsText.setText(`KILL ${s.kills}`);
    this.xpFill.setScale(Math.max(0.001, s.xpRatio), 1);
    const hpRatio = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
    this.hpFill.setScale(Math.max(0.001, hpRatio), 1);
    this.hpFill.setFillStyle(hpRatio < 0.3 ? PAL[C.hotRed] : hpRatio < 0.6 ? PAL[C.amber] : PAL[C.crimson]);

    const keys = [
      ...s.weapons.map((w) => iconTextureKey(isEvolutionWeapon(w.id) ? "evolution" : "weapon", w.id)),
      ...s.passives.map((p) => iconTextureKey("passive", p.id)),
    ].slice(0, this.hudIcons.length);
    this.hudIcons.forEach((img, i) => {
      const key = keys[i];
      if (!key) { img.setVisible(false); return; }
      if (img.texture.key !== key) img.setTexture(key);
      img.setVisible(true);
    });
    const width = keys.length === 0 ? 0 : 8 + keys.length * 18;
    this.hudIconBg.setSize(width, 19).setVisible(keys.length > 0);
  }

  private onPauseChanged(): void {
    this.pauseSelected = 0;
    this.refreshPause();
  }

  private onLevelUp(data: { offers: Offer[]; level: number }): void {
    this.selected = 0;
    this.autoPickTimer = 0;
    this.showOffers(data.offers, data.level);
  }

  private onLevelUpClosed(): void {
    this.levelGroup.setVisible(false);
    this.setLevelCardsEnabled(false);
    this.selected = 0;
  }

  private showOffers(offers: Offer[], level: number): void {
    if (offers.length === 0) {
      this.levelGroup.setVisible(false);
      return;
    }
    this.levelSub.setText(`STUFE ${level} - WÄHLE EINE BELOHNUNG`);
    this.selected = Math.min(this.selected, offers.length - 1);
    offers.forEach((offer, i) => {
      const card = this.cards[i];
      if (!card) return;
      card.bg.setVisible(true);
      card.icon.setVisible(true).setTexture(iconKeyForOffer(offer.kind, offer.id));
      card.number.setVisible(true);
      card.number.setText(`${i + 1}`);
      card.name.setVisible(true).setText(offer.name.toUpperCase());
      card.level.setVisible(true).setText(`${offer.isNew ? "NEU" : "STUFE"} ${offer.level}`);
      const lines = wrapText(offer.description, this.levelWrapChars);
      card.desc.forEach((t, li) => {
        t.setText(lines[li] ?? "");
        t.setVisible(Boolean(lines[li]));
      });
    });
    for (let i = offers.length; i < 3; i++) {
      const card = this.cards[i];
      card.bg.setVisible(false);
      card.icon.setVisible(false);
      card.number.setVisible(false);
      card.name.setVisible(false);
      card.level.setVisible(false);
      card.desc.forEach((t) => t.setVisible(false));
    }
    this.highlight();
    this.levelGroup.setVisible(true);
    this.setLevelCardsEnabled(true);
  }

  private highlight(): void {
    this.cards.forEach((card, i) => {
      card.bg.setStrokeStyle(i === this.selected ? 2 : 1, i === this.selected ? PAL[C.lantern] : PAL[C.nightSlate]);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.run || ev.repeat) return;
    const key = ev.key.toLowerCase();
    if (this.options?.visible) {
      this.options.handleKey(ev);
      return;
    }
    if (ev.key === "Escape") { this.run.togglePause(); return; }
    if (key === "o" && this.run.getHudState().paused && !this.run.levelUpOpen && !this.run.chestOpen) {
      this.options.open();
      return;
    }
    const hud = this.run.getHudState();
    if (hud.paused && !hud.levelUpOpen && !hud.chestOpen) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp" || key === "a" || key === "w") {
        this.pauseSelected = (this.pauseSelected + this.pauseButtons.length - 1) % this.pauseButtons.length;
        this.refreshPauseButtons();
        return;
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown" || key === "d" || key === "s") {
        this.pauseSelected = (this.pauseSelected + 1) % this.pauseButtons.length;
        this.refreshPauseButtons();
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") { this.activatePauseButton(); return; }
      if (key === "q") { this.run.giveUp(); return; }
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
        this.pauseSelected = Number(ev.key) - 1;
        this.refreshPauseButtons();
        return;
      }
    }
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
    const ox = Math.round(GAME_WIDTH / 2 - 240);
    const visible = s.paused && !s.levelUpOpen && !s.chestOpen;
    this.pauseGroup.setVisible(visible);
    this.lastPauseShown = visible;
    for (const b of this.pauseButtons) b.setEnabled(visible);
    if (!visible) return;
    this.refreshPauseButtons();
    for (const line of this.pauseLines) line.destroy();
    this.pauseLines = [];
    const addRow = (
      name: string, level: number, color: number,
      x: number, levelRight: number, iconKey: string,
    ): void => {
      const icon = this.add.image(x + ox - 20, y - 4, iconKey).setOrigin(0, 0).setScale(1);
      const left = new PixelText(this, x + ox, y, name, color);
      // Feste rechte Spalte, damit alle "LV n" bündig stehen.
      const right = new PixelText(this, levelRight + ox, y, `LV ${level}`, color, "right");
      this.pauseGroup.add([icon, left, right]);
      this.pauseLines.push(icon, left, right);
    };
    const oy = Math.round((GAME_HEIGHT - 270) / 2);
    let y = 76 + oy;
    for (const w of s.weapons) {
      const def = weaponDef(w.id);
      addRow(def?.name.toUpperCase() ?? w.id.toUpperCase(), w.level, C.bone, 84, 212,
        iconTextureKey(isEvolutionWeapon(w.id) ? "evolution" : "weapon", w.id));
      y += 15;
    }
    y = 76 + oy;
    for (const p of s.passives) {
      const def = PASSIVES[p.id as keyof typeof PASSIVES];
      addRow(def?.name.toUpperCase() ?? p.id.toUpperCase(), p.level, C.mist, 234, 386,
        iconTextureKey("passive", p.id));
      y += 15;
    }
    this.pauseWeaponHead.setText(`WAFFEN ${s.weapons.length}/6`);
    this.pausePassiveHead.setText(`POWERUPS ${s.passives.length}/6`);
  }
}

function pickRollName(rewards: { name: string }[], tick = 0): string {
  return rewards[tick % Math.max(1, rewards.length)]?.name ?? "???";
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
