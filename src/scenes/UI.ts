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
  private lastPauseShown = false;

  private hudIconBg!: Phaser.GameObjects.Rectangle;
  private hudIcons: Phaser.GameObjects.Image[] = [];

  private chestGroup!: Phaser.GameObjects.Container;
  private chestSprite!: Phaser.GameObjects.Image;
  private chestBeam!: Phaser.GameObjects.Image;
  private chestTitle!: PixelText;
  private chestSlots: { bg: Phaser.GameObjects.Rectangle; slotBg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; text: PixelText; text2: PixelText; level: PixelText }[] = [];
  private chestHideTimer?: Phaser.Time.TimerEvent;

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

  constructor() { super("ui"); }

  create(): void {
    this.run = this.scene.get("run") as Run;

    // HUD-Leiste oben
    this.add.rectangle(0, 0, GAME_WIDTH, 12, PAL[C.nightDeep], 0.82).setOrigin(0, 0).setDepth(10);
    this.levelText = new PixelText(this, 5, 2, "LV 1", C.lantern).setDepth(11);
    this.timerText = new PixelText(this, GAME_WIDTH / 2, 2, "00:00", C.candleWhite, "center").setDepth(11);
    this.killsText = new PixelText(this, GAME_WIDTH - 5, 2, "KILL 0", C.bone, "right").setDepth(11);
    this.xpBg = this.add.rectangle(5, 8, GAME_WIDTH - 10, 5, PAL[C.ink]).setOrigin(0, 0)
      .setStrokeStyle(1, PAL[C.nightSlate]).setDepth(11);
    this.xpFill = this.add.rectangle(6, 9, GAME_WIDTH - 12, 3, PAL[C.amber]).setOrigin(0, 0).setDepth(12);
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

    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
    this.run.events.on("levelup", this.onLevelUp, this);
    this.run.events.on("levelupClosed", this.onLevelUpClosed, this);
    this.run.events.on("pauseChanged", this.onPauseChanged, this);
    this.run.events.on("chestOpen", this.onChestOpen, this);
    this.run.events.on("chestClosed", this.onChestClosed, this);
    this.run.events.on("bossSpawn", this.onBossBanner, this);
    this.run.events.on("bossDefeated", this.onBossBanner, this);
    this.run.events.on("bossPhase", this.onBossPhase, this);
    this.run.events.on("dawn", this.onDawn, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.run.events.off("levelup", this.onLevelUp, this);
      this.run.events.off("levelupClosed", this.onLevelUpClosed, this);
      this.run.events.off("pauseChanged", this.onPauseChanged, this);
      this.run.events.off("chestOpen", this.onChestOpen, this);
      this.run.events.off("chestClosed", this.onChestClosed, this);
      this.run.events.off("bossSpawn", this.onBossBanner, this);
      this.run.events.off("bossDefeated", this.onBossBanner, this);
      this.run.events.off("bossPhase", this.onBossPhase, this);
      this.run.events.off("dawn", this.onDawn, this);
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
    this.bossGroup = this.add.container(0, 0).setDepth(90).setVisible(false);
    this.bossBarBg = this.add.rectangle(GAME_WIDTH / 2 - 118, 46, 236, 12, PAL[C.ink], 0.95)
      .setOrigin(0, 0.5).setStrokeStyle(1, PAL[C.amber]);
    this.bossBarFill = this.add.rectangle(GAME_WIDTH / 2 - 114, 46, 228, 6, PAL[24])
      .setOrigin(0, 0.5);
    this.bossBarShadow = this.add.rectangle(GAME_WIDTH / 2 - 114, 48, 228, 2, PAL[23])
      .setOrigin(0, 0.5);
    // Segmente + Endkappen mit 2x2-Amberpunkten.
    const segs: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 1; i < 9; i++) {
      segs.push(this.add.rectangle(GAME_WIDTH / 2 - 114 + i * 228 / 9, 46, 2, 6, PAL[C.ink])
        .setOrigin(0, 0.5));
    }
    for (const sx of [GAME_WIDTH / 2 - 123, GAME_WIDTH / 2 + 115]) {
      segs.push(this.add.rectangle(sx, 46, 5, 14, PAL[C.nightSlate]).setStrokeStyle(1, PAL[C.ink]));
      segs.push(this.add.rectangle(sx + 1, 41, 2, 2, PAL[C.amber]));
      segs.push(this.add.rectangle(sx + 1, 49, 2, 2, PAL[C.amber]));
    }
    this.bossName = new PixelText(this, GAME_WIDTH / 2, 33, "", C.amber, "center");
    this.bossPhaseText = new PixelText(this, GAME_WIDTH / 2 + 112, 33, "", C.candleWhite, "right");
    this.bossGroup.add([this.bossBarBg, this.bossBarShadow, this.bossBarFill, ...segs,
      this.bossName, this.bossPhaseText]);

    this.bannerGroup = this.add.container(0, 0).setDepth(95).setVisible(false).setAlpha(0);
    const bg = this.add.nineslice(GAME_WIDTH / 2, 92, "ui_frame", undefined, 300, 48, 8, 8, 8, 8);
    this.bannerText = new PixelText(this, GAME_WIDTH / 2, 84, "", C.lantern, "center").setScale(1);
    this.bannerSub = new PixelText(this, GAME_WIDTH / 2, 98, "", C.bone, "center");
    this.bannerGroup.add([bg, this.bannerText, this.bannerSub]);
  }

  private onBossBanner(data: { name?: string; index?: number }): void {
    this.showBanner(
      data.index === 5 ? "DER HOHE KÖNIG" : (data.name ?? "BOSS").toUpperCase(),
      data.index === 5 ? "3 PHASEN - SIEG BEI SEINEM TOD" : "EIN BOSS ERWACHT",
      C.amber,
    );
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
    this.levelGroup = this.add.container(0, 0).setDepth(100).setVisible(false);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.86).setOrigin(0, 0);
    this.levelGroup.add(dim);
    const frame = this.add.nineslice(GAME_WIDTH / 2, 134, "ui_frame", undefined, 448, 220, 8, 8, 8, 8);
    this.levelGroup.add(frame);
    this.levelTitle = new PixelText(this, GAME_WIDTH / 2, 36, "LEVEL UP", C.lantern, "center").setScale(2);
    this.levelSub = new PixelText(this, GAME_WIDTH / 2, 56, "", C.mist, "center");
    this.levelGroup.add(this.levelTitle);
    this.levelGroup.add(this.levelSub);

    this.cards = [];
    for (let i = 0; i < 3; i++) {
      const cx = 84 + i * 156;
      const bg = this.add.rectangle(cx, 158, 132, 150, PAL[C.nightMid]).setStrokeStyle(2, PAL[C.nightSlate]);
      const slotBg = this.add.rectangle(cx, 112, 60, 60, PAL[C.nightDeep]).setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(cx, 112, "icon_weapon_ember").setScale(3).setVisible(false);
      const divider = this.add.rectangle(cx - 62, 148, 124, 1, PAL[C.nightSlate]);
      const number = new PixelText(this, cx - 60, 88, `${i + 1}`, C.lantern);
      const name = new PixelText(this, cx - 62, 154, "", C.candleWhite);
      const level = new PixelText(this, cx - 62, 166, "", C.amber);
      const desc: PixelText[] = [
        new PixelText(this, cx - 62, 180, "", C.mist),
        new PixelText(this, cx - 62, 192, "", C.mist),
        new PixelText(this, cx - 62, 204, "", C.mist),
      ];
      this.levelGroup.add([bg, slotBg, icon, divider, number, name, level, ...desc]);
      this.cards.push({ bg, icon, number, name, level, desc });
    }
    const hint = new PixelText(this, GAME_WIDTH / 2, 251, "1-3 ODER PFEILE + ENTER", C.fog, "center");
    this.levelGroup.add(hint);
  }

  private createPauseUI(): void {
    this.pauseGroup = this.add.container(0, 0).setDepth(120).setVisible(false);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.8).setOrigin(0, 0);
    this.pauseGroup.add(dim);
    const frame = this.add.nineslice(GAME_WIDTH / 2, 135, "ui_frame", undefined, 360, 220, 8, 8, 8, 8);
    this.pauseGroup.add(frame);
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 36, "PAUSE", C.lantern, "center").setScale(2));
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 54, "DEIN BUILD", C.bone, "center"));
    this.pauseGroup.add(new PixelText(this, 116, 66, "WAFFEN", C.lantern));
    this.pauseGroup.add(new PixelText(this, 266, 66, "POWERUPS", C.lantern));
    this.pauseGroup.add(new PixelText(this, GAME_WIDTH / 2, 238, "ESC = WEITER", C.mist, "center"));
    this.pauseLines = [];
  }

  private createChestUI(): void {
    this.chestGroup = this.add.container(0, 0).setDepth(130).setVisible(false);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, PAL[C.ink], 0.9).setOrigin(0, 0);
    this.chestGroup.add(dim);
    const frame = this.add.nineslice(GAME_WIDTH / 2, 140, "ui_frame", undefined, 452, 244, 8, 8, 8, 8);
    this.chestGroup.add(frame);
    this.chestBeam = this.add.image(GAME_WIDTH / 2, 70, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(0.25)
      .setAlpha(0);
    this.chestGroup.add(this.chestBeam);
    this.chestSprite = this.add.image(GAME_WIDTH / 2, 84, "chest_closed").setScale(2.4);
    this.chestGroup.add(this.chestSprite);
    this.chestTitle = new PixelText(this, GAME_WIDTH / 2, 38, "TRUHE GEÖFFNET", C.lantern, "center").setScale(2);
    this.chestGroup.add(this.chestTitle);
    this.chestGroup.add(new PixelText(this, GAME_WIDTH / 2, 54, "BELOHNUNGEN ROLLEN ...", C.mist, "center"));
    this.chestSlots = [];
    for (let i = 0; i < 5; i++) {
      const x = GAME_WIDTH / 2 + (i - 2) * 86;
      const bg = this.add.rectangle(x, 196, 96, 92, PAL[C.nightMid])
        .setStrokeStyle(2, PAL[C.nightSlate]);
      const slotBg = this.add.rectangle(x, 176, 44, 44, PAL[C.nightDeep])
        .setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(x, 176, "icon_weapon_ember").setScale(2.4).setVisible(false);
      const text = new PixelText(this, x, 202, "", C.candleWhite, "center");
      const text2 = new PixelText(this, x, 213, "", C.candleWhite, "center");
      const level = new PixelText(this, x, 224, "", C.amber, "center");
      this.chestGroup.add([bg, slotBg, icon, text, text2, level]);
      this.chestSlots.push({ bg, slotBg, icon, text, text2, level });
    }
    this.chestGroup.add(new PixelText(this, GAME_WIDTH / 2, 250, "DIE TRUHE IST GEÖFFNET", C.fog, "center"));
  }

  private onChestOpen(result: import("../logic/evolution").ChestResult): void {
    // Ein noch laufender Hide-Timer der vorigen Truhe darf die neue Sequenz nicht ausblenden.
    this.chestHideTimer?.remove(false);
    this.chestHideTimer = undefined;
    this.chestGroup.setVisible(true);
    this.chestTitle.setText("TRUHE");
    this.chestSprite.setTexture("chest_closed").setScale(2.2).setAlpha(1);
    this.chestBeam.setAlpha(0).setScale(0.25);
    const n = result.rewards.length;
    for (let i = 0; i < this.chestSlots.length; i++) {
      const slot = this.chestSlots[i];
      const reward = result.rewards[i];
      const x = GAME_WIDTH / 2 + (i - (n - 1) / 2) * 104;
      slot.bg.setPosition(x, 196).setVisible(Boolean(reward));
      slot.slotBg.setPosition(x, 176).setVisible(Boolean(reward));
      slot.icon.setPosition(x, 176).setVisible(Boolean(reward)).setAlpha(1)
        .setTexture(reward ? iconTextureKey(
          reward.kind === "evolution" ? "evolution" : reward.kind,
          reward.id,
        ) : "icon_weapon_ember");
      slot.text.setPosition(x, 202).setVisible(Boolean(reward)).setAlpha(0).setText("?");
      slot.text2.setPosition(x, 213).setVisible(false).setAlpha(0).setText("");
      slot.level.setPosition(x, 224).setVisible(Boolean(reward)).setAlpha(0).setText("");
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
            const lines = slotNameLines(pickRollName(result.rewards, tick++).toUpperCase());
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
        const lines = slotNameLines(reward.name.toUpperCase());
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
  }

  private spawnChestCoins(): void {
    for (let i = 0; i < 12; i++) {
      const coin = this.add.image(GAME_WIDTH / 2, 96, "fx_coin")
        .setScale(1.4)
        .setBlendMode(Phaser.BlendModes.NORMAL);
      this.chestGroup.add(coin);
      // Deterministisch gestreut (kein Math.random): reproduzierbare GIF-Frames.
      const t = (i * 7) % 12 / 11;
      const angle = -Math.PI / 2 + (t - 0.5) * 2.2;
      const speed = 70 + t * 90;
      const tx = GAME_WIDTH / 2 + Math.cos(angle) * speed;
      const ty = 96 + Math.sin(angle) * speed;
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
    this.refreshHud(s);
    this.refreshBoss(s.boss);

    if (s.levelUpOpen) {
      if (!this.levelGroup.visible) this.showOffers(s.offers, s.level);
      if (this.run.autoPlay) {
        this.autoPickTimer += delta / 1000;
        if (this.autoPickTimer > 0.35) {
          this.autoPickTimer = 0;
          try { this.run.pickLevelUp(chooseBestOffer(s.offers)); } catch { /* Angebot evtl. schon weg */ }
        }
      }
    } else {
      this.autoPickTimer = 0;
      this.levelGroup.setVisible(false);
    }

    const pauseVisible = s.paused && !s.levelUpOpen && !s.chestOpen;
    if (pauseVisible !== this.lastPauseShown) {
      this.lastPauseShown = pauseVisible;
      this.refreshPause();
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
      const lines = wrapText(offer.description, 21);
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
    const visible = s.paused && !s.levelUpOpen && !s.chestOpen;
    this.pauseGroup.setVisible(visible);
    this.lastPauseShown = visible;
    if (!visible) return;
    for (const line of this.pauseLines) line.destroy();
    this.pauseLines = [];
    const addRow = (
      name: string, level: number, color: number,
      x: number, levelRight: number, iconKey: string,
    ): void => {
      const icon = this.add.image(x - 20, y - 4, iconKey).setOrigin(0, 0).setScale(1);
      const left = new PixelText(this, x, y, name.slice(0, 14), color);
      // Feste rechte Spalte, damit alle "LV n" bündig stehen.
      const right = new PixelText(this, levelRight, y, `LV ${level}`, color, "right");
      this.pauseGroup.add([icon, left, right]);
      this.pauseLines.push(icon, left, right);
    };
    let y = 82;
    for (const w of s.weapons) {
      const def = weaponDef(w.id);
      addRow(def?.name.toUpperCase() ?? w.id.toUpperCase(), w.level, C.bone, 116, 238,
        iconTextureKey(isEvolutionWeapon(w.id) ? "evolution" : "weapon", w.id));
      y += 15;
    }
    y = 82;
    for (const p of s.passives) {
      const def = PASSIVES[p.id as keyof typeof PASSIVES];
      addRow(def?.name.toUpperCase() ?? p.id.toUpperCase(), p.level, C.mist, 266, 388,
        iconTextureKey("passive", p.id));
      y += 15;
    }
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
