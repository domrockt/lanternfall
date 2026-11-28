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

/**
 * m10-loadscreen-continuity (#12013): gemeinsame Layout-Basis von Boot-Vor-Phase
 * und Ladescreen. Boot zeichnet in preload Laterne + Balken-Rahmen (0%) an
 * EXAKT diese Ankerpunkte, damit der Phasenwechsel boot -> loading ohne
 * Positions-/Stil-Sprung bleibt (Dom-Wunsch 2026-11-28T13:25Z, Punkt 1).
 */
export interface LoadingChrome {
  barFill: Phaser.GameObjects.Graphics;
  pctText: PixelText;
  barX: number;
  barY: number;
}

/**
 * Zeichnet den Ladescreen-Chrome (Hintergrund nightDeep, Laterne, Balken-Rahmen,
 * Prozent-Text, optionaler Label-Zeile ueber dem Balken) in die Szene.
 * Idempotent bzgl. der Laterne (addGridTexture-Guard). Ohne Label (Boot-Vor-Phase)
 * bleibt die Label-Zeile frei — Boot setzt dort seinen eigenen Vor-Text.
 */
export function drawLoadingChrome(scene: Phaser.Scene, label = ""): LoadingChrome {
  const cx = Math.round(GAME_WIDTH / 2);
  const cy = Math.round(GAME_HEIGHT / 2);
  scene.cameras.main.setBackgroundColor(PAL[C.nightDeep]);

  // Laterne (eigene 9x14-Pixel-Textur, nur Palettenfarben), Anker wie im Ladescreen.
  addGridTexture(scene, "loading_lantern", LOADING_LANTERN.rows, LOADING_LANTERN.w, LOADING_LANTERN.h);
  scene.add.image(cx, cy - 28, "loading_lantern").setScale(2).setOrigin(0.5, 0.5);

  // Fortschrittsbalken: Rahmen bone, Flaeche night, Fuellung amber (1-px-Raster).
  const barX = cx - Math.round(BAR_W / 2);
  const barY = GAME_HEIGHT - 44;
  const frame = scene.add.graphics();
  frame.fillStyle(PAL[C.bone], 1);
  frame.fillRect(barX - 1, barY - 1, BAR_W + 2, BAR_H + 2);
  frame.fillStyle(PAL[C.night], 1);
  frame.fillRect(barX, barY, BAR_W, BAR_H);
  const barFill = scene.add.graphics();

  if (label !== "") new PixelText(scene, cx, barY - 16, label, C.mist, "center");
  const pctText = new PixelText(scene, cx, barY + 12, "0%", C.mist, "center");
  return { barFill, pctText, barX, barY };
}

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

    // m10-loadscreen-continuity (#12013): Chrome (BG/Laterne/Balken/Texte) aus der
    // gemeinsamen Layout-Basis — identische Anker wie in der Boot-Vor-Phase.
    const chrome = drawLoadingChrome(this, "LADEN ...");
    this.barFill = chrome.barFill;
    this.pctText = chrome.pctText;
    this.barX = chrome.barX;
    this.barY = chrome.barY;

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
