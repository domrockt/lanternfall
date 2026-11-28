import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { PixelText } from "../gfx/font";
import { addGridTexture } from "../gfx/textures";
import { buildWarmupTasks, LOADING_LANTERN, type WarmupTask } from "../gfx/warmup";

/**
 * m10-loading-screen K2: Ladeszene. Der Spieler sieht eine Laterne + Fortschritt,
 * waehrend ALLE prozeduralen Texturen, Atlanten, Glyphen und der GPU-Warmup in
 * Haeppchen (1 Task pro Frame) laufen. Erst danach startet der Titel — kein
 * sichtbares Nachladen mehr dahinter (Dom-Ziel 2026-11-28).
 *
 * Szenen-Fluss: boot (preload WAVs + Titel-Basistexturen) -> loading -> title.
 */
export interface LoadingData {
  seed?: number;
  debug?: boolean;
}

type TaskTiming = { label: string; ms: number };

interface BootTimings {
  loadingStart?: number;
  loadingDone?: number;
  titleRendered?: number;
  /** Kompatible Aliase zum alten Boot-Warmup (scripts/m10-boot-startup.mjs liest sie). */
  warmStart?: number;
  warmTexturesDone?: number;
  warmDone?: number;
  tasks?: TaskTiming[];
}

function timings(): BootTimings {
  const w = window as unknown as { __bootTimings: BootTimings };
  const t = (w.__bootTimings ??= { tasks: [] });
  t.tasks ??= [];
  return t;
}

const BAR_W = 120;
const BAR_H = 5;

export class Loading extends Phaser.Scene {
  private tasks: WarmupTask[] = [];
  private idx = 0;
  private started = false;
  private seed = 0;
  private debug = false;
  private barFill!: Phaser.GameObjects.Graphics;
  private pctText!: PixelText;
  private glow: Phaser.GameObjects.Image | null = null;
  private barX = 0;
  private barY = 0;

  constructor() {
    super("loading");
  }

  create(data: LoadingData = {}): void {
    // Szenen-Instanzen überleben Restarts — Zustand sauber zurücksetzen
    // (Reviewer-Finding: sonst Soft-Lock bei Wiedereintritt).
    this.idx = 0;
    this.started = false;
    this.glow = null;
    this.seed = data.seed ?? 0;
    this.debug = data.debug ?? false;
    timings().loadingStart = performance.now();

    const cx = Math.round(GAME_WIDTH / 2);
    const cy = Math.round(GAME_HEIGHT / 2);
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);

    // Laterne (eigene 9x14-Pixel-Textur, nur Palettenfarben) + sanftes Pulslicht.
    addGridTexture(this, "loading_lantern", LOADING_LANTERN.rows, LOADING_LANTERN.w, LOADING_LANTERN.h);
    this.add.image(cx, cy - 28, "loading_lantern").setScale(2).setOrigin(0.5, 0.5);

    // Fortschrittsbalken: Rahmen bone, Flaeche night, Füllung amber (1-px-Raster).
    this.barX = cx - Math.round(BAR_W / 2);
    this.barY = GAME_HEIGHT - 44;
    const frame = this.add.graphics();
    frame.fillStyle(PAL[C.bone], 1);
    frame.fillRect(this.barX - 1, this.barY - 1, BAR_W + 2, BAR_H + 2);
    frame.fillStyle(PAL[C.night], 1);
    frame.fillRect(this.barX, this.barY, BAR_W, BAR_H);
    this.barFill = this.add.graphics();

    new PixelText(this, cx, this.barY - 16, "LADEN ...", C.mist, "center");
    this.pctText = new PixelText(this, cx, this.barY + 12, "0%", C.mist, "center");

    // Warmup-Haeppchen: genau EIN Task pro Frame (Timer feuert pro rAF), UI bleibt fluessig.
    this.tasks = buildWarmupTasks(this);
    this.time.addEvent({ delay: 1, loop: true, callback: this.runChunk, callbackScope: this });
  }

  private runChunk(): void {
    if (this.idx >= this.tasks.length) {
      this.startTitleOnce();
      return;
    }
    const task = this.tasks[this.idx];
    const t0 = performance.now();
    task.run(this);
    const t = timings();
    t.tasks?.push({ label: task.label, ms: performance.now() - t0 });
    // Kompatible Aliase zum alten Boot-Warmup (Messskript-Kontrakt):
    if (this.idx === 0) t.warmStart = performance.now();
    if (task.label === "derived-atlas") t.warmTexturesDone = performance.now();
    if (task.label === "runtime-atlas") t.warmDone = performance.now();
    this.idx++;

    // Pulslicht hinter der Laterne, sobald light_radius existiert (title-textures-Chunk).
    if (!this.glow && this.textures.exists("light_radius")) {
      const cx = Math.round(GAME_WIDTH / 2);
      this.glow = this.add.image(cx, GAME_HEIGHT / 2 - 28, "light_radius")
        .setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.25).setDepth(-1);
      this.tweens.add({ targets: this.glow, alpha: 0.4, scale: 0.6, duration: 1200, yoyo: true, repeat: -1 });
    }

    const pct = this.idx / this.tasks.length;
    this.barFill.fillStyle(PAL[C.amber], 1);
    this.barFill.fillRect(this.barX, this.barY, Math.round(BAR_W * pct), BAR_H);
    this.pctText.setText(`${Math.round(pct * 100)}%`);
  }

  /** Erst wenn ALLE Tasks gelaufen sind (inkl. GPU-Warmup-Cleanup >= 1 Frame vorher). */
  private startTitleOnce(): void {
    if (this.started) return;
    this.started = true;
    timings().loadingDone = performance.now();
    // titleRendered-Kontrakt des Boot-Messskripts: erster gerendertes Titel-Frame.
    this.scene.get("title").events.once(Phaser.Scenes.Events.RENDER, () => {
      timings().titleRendered = performance.now();
    });
    this.scene.start("title", { seed: this.seed, debug: this.debug });
  }
}
