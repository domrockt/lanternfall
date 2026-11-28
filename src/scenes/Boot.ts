import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GAME_WIDTH, GAME_HEIGHT } from "../config";
import { PixelText } from "../gfx/font";
import { addGridTexture, createAllTextures } from "../gfx/textures";
import { GEN_TITLE } from "../gfx/gen-title";
import { GEN_UI } from "../gfx/gen-ui";
import { buildRuntimeAtlas } from "../gfx/atlas";
import { seedFromUrl, hasFlag } from "../logic/rng";
import { AudioSystem, initAudio } from "../audio/AudioSystem";

/**
 * Licht-Außenkante als diskrete Stufen (m10-boot-glow-local K2 rev., Versuch 2):
 * exakt die Tabelle aus Commit eaf2ab6 (m10-chaos-fix-raster-glow K3) —
 * [r0, r1, alpha]-Bänder mit harten Kanten über den Licht-Radius 0..96
 * (Textur 192 px, Radius 96). Bänder ≥ 6 px breit, Alpha monoton fallend.
 * Der Original-Swap (Import aus src/gfx/textures.ts) ist im aktuellen Base
 * unmoeglich: textures.ts exportiert die Creator nicht UND eaf2ab6 ist noch
 * nicht in main (Bedarfsmeldung .dispatch/requests.md, 2026-11-28). Deshalb
 * Port der Quantisierung in die Local-Kopie; bei Merge+Export diese Tabelle
 * wieder entfernen und importieren (der exists-Guard macht einen Uebergangs-
 * zustand mit beiden Registrationen harmlos).
 */
const LIGHT_EDGE_STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 70, 1],
  [70, 76, 0.66],
  [76, 82, 0.38],
  [82, 88, 0.18],
  [88, 96, 0.08],
];

/**
 * Vignette als diskrete Stufen (gleiche Herkunft wie LIGHT_EDGE_STEPS oben,
 * eaf2ab6): [r0, r1, alpha]-Bänder über den Radius 70..290 des Original-
 * Gradients (Stopps 0 → 0.18 @ 0.7 → 0.72 @ 1), plus Klemm-Band für die
 * Ecken (> 290). 11 Bänder à 20 px, Alpha je Band = Gradientwert am Bandende
 * (auf 2 Stellen gerundet, hart gekantet).
 */
function vignetteSteps(): Array<[number, number, number]> {
  const steps: Array<[number, number, number]> = [];
  const r0 = 70;
  const r1 = 290;
  const bands = 11;
  const alphaAt = (t: number): number =>
    t < 0.7 ? 0.18 * (t / 0.7) : 0.18 + 0.54 * ((t - 0.7) / 0.3);
  for (let i = 0; i < bands; i++) {
    const from = r0 + ((r1 - r0) * i) / bands;
    const to = r0 + ((r1 - r0) * (i + 1)) / bands;
    steps.push([from, to, Math.round(alphaAt((i + 1) / bands) * 100) / 100]);
  }
  steps.push([r1, r1 + 120, 0.72]); // Ecken-Klemme (Gradient ist ab r1 konstant)
  return steps;
}

/**
 * Licht/Vignette lokal erzeugt (einst 1:1 wie createLightTexture/
 * createVignetteTexture in src/gfx/textures.ts, seit K2 rev. mit den harten
 * Alpha-Stufen aus eaf2ab6 — siehe LIGHT_EDGE_STEPS/vignetteSteps oben).
 * Grund für die Local-Kopie: textures.ts ist fremd geclaimed (m10-evo-fx-form-
 * polish) und exportiert die Creator nicht (Bedarfsmeldung .dispatch/requests.md,
 * 2026-11-28). Die Versionen sind idempotent (textures.exists-Guard), der
 * Warmup (createAllTextures) überspringt sie - es gibt keine Doppel- und keine
 * abweichende Erzeugung in einer Session. B2-Ring-Tuning (Kern Amber/Lantern)
 * bleibt bewusst erhalten — kein Rueckfall auf lanternWhite/candle im Kern
 * (Near-White-Fall A7, Guard tests/chaos-glow-runpath.test.ts).
 */
function createLightTextureLocal(scene: Phaser.Scene): void {
  const key = "light_radius";
  if (scene.textures.exists(key)) return;
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rings: { r: number; color: number; alpha: number }[] = [
    // M10-chaos-fix-glow-runpath (B2, Audit docs/lanes/m10-chaos-legibility.md):
    // Rampen-ENDE (Kern) Richtung Amber/Lantern statt lanternWhite — Addierung
    // mit Weiß-Kern ist der Near-White-Fall im Chaos (A7: b >= 150 und r >= 235;
    // Amber 0xffb84d / Lantern 0xffd77a fallen darunter, lanternWhite/candle
    // nicht). Aeusserer Rand bleibt flame.
    // Boot-seitiger Alpha/Blend-Deckel: die Flaeche wird nur ADD gezeichnet
    // (Run.ts), Alpha dort auf RUN_LIGHT_ALPHA_MAX 0,7 gedeckelt (war 0,85);
    // Ring-Alpha hier <= 0,10 pro Ring, Kern summiert <= ~0,25 vor Blend.
    { r: 96, color: 19, alpha: 0.05 },
    { r: 88, color: 19, alpha: 0.05 },
    { r: 80, color: 20, alpha: 0.05 },
    { r: 72, color: 20, alpha: 0.05 },
    { r: 64, color: 21, alpha: 0.06 },
    { r: 56, color: 21, alpha: 0.06 },
    { r: 48, color: 21, alpha: 0.07 },
    { r: 40, color: 21, alpha: 0.07 },
    { r: 32, color: 21, alpha: 0.08 },
    { r: 24, color: 20, alpha: 0.08 },
    { r: 16, color: 20, alpha: 0.09 },
    { r: 8, color: 20, alpha: 0.09 },
  ];
  const c = size / 2;
  for (const ring of rings) {
    ctx.globalAlpha = ring.alpha;
    ctx.fillStyle = "#" + PAL[ring.color].toString(16).padStart(6, "0");
    ctx.beginPath();
    ctx.arc(c, c, ring.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Hart quantisierte Außenkante (K2 rev.2): Stufen-Alpha wird PRO PIXEL auf
  // den gestapelten Ring-Aufbau multipliziert (getImageData/putImageData).
  // Bewusst KEIN destination-in-Band-Stacking (so steht es in eaf2ab6):
  // aufeinanderfolgende destination-in-Fills SCHNEIDEN ihre Masken — Band 2
  // löscht den Kern von Band 1, am Ende bleibt eine vollständig transparente
  // Textur. Befund im Probe-Lauf (A/B: discKeep works, stacked loops leer),
  // Details docs/lanes/m10-boot-glow-local.md. Die Stufen-Tabelle bleibt
  // exakt eaf2ab6; der 4x-Zoom zeigt 1-px-Raster an den Bandkanten.
  const img = ctx.getImageData(0, 0, size, size);
  const pxs = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      let band = 0;
      for (const [r0, r1, stepAlpha] of LIGHT_EDGE_STEPS) {
        if (d > r0 && d <= r1) { band = stepAlpha; break; }
      }
      pxs[(y * size + x) * 4 + 3] = pxs[(y * size + x) * 4 + 3] * band; // U8: clamped+gerundet
    }
  }
  ctx.putImageData(img, 0, 0);
  scene.textures.addCanvas(key, canvas);
}

function createVignetteTextureLocal(scene: Phaser.Scene): void {
  const key = "vignette";
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  // Diskrete Stufen statt Radialgradient (K2 rev., Port von eaf2ab6):
  // gleiche Alpha-Treppe wie der Original-Gradient, aber als harte Bänder —
  // gerastert statt milchig-weich (B3-Stilbruch „Luftbrause").
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2;
  for (const [r0, r1, a] of vignetteSteps()) {
    ctx.fillStyle = `rgba(6,7,12,${a})`;
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.arc(cx, cy, r0, 0, Math.PI * 2, true);
    ctx.fill();
  }
  scene.textures.addCanvas(key, canvas);
}

/**
 * Titel-kritische Texturen: alles, was die Titel-Szene im create() zeichnet
 * (Titelbild, Menü-Rahmen, Licht/Vignette). Font-Glyphen erzeugt PixelText lazy.
 */
/** GEN_UI-Keys, die die Titel-Szene zeichnet (Menü-Rahmen + Logo). */
const TITLE_UI_KEYS = ["ui_frame", "title_logo"] as const;

function createTitleTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(GEN_TITLE)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  for (const key of TITLE_UI_KEYS) {
    const frame = GEN_UI[key];
    addGridTexture(scene, key, frame.frames[0], frame.w, frame.h);
  }
  createLightTextureLocal(scene);
  createVignetteTextureLocal(scene);
}

type BootTimings = Record<string, number>;

function timings(): BootTimings {
  return ((window as unknown as { __bootTimings: BootTimings }).__bootTimings ??= {});
}

/**
 * Boot-Schnellpfad (m10-boot-startup): Vor `scene.start("title")` entstehen nur
 * die Texturen, die die Titel-Szene wirklich zeichnet. Alles andere (Gegner,
 * Bosse, FX, Icons, Projektile, ...) ist für den Titel nicht sichtbar und wird
 * als Warmup hinter dem ersten gerenderten Titel-Frame nachgezogen.
 * Messung (shots/m10-boot-startup-baseline.json + Phasen-Lauf): createAllTextures
 * frisst 533-682 ms von 770-1200 ms Boot-Zeit.
 *
 * Der Warmup ruft `createAllTextures` erneut auf - alle Creator sind idempotent
 * (textures.exists-Guards), d.h. es entstehen nur die noch fehlenden Texturen.
 * `buildRuntimeAtlas` läuft danach, damit der Atlas-Key-Vertrag hält: heiße
 * Klassen (enemy_/boss_/gem_/fx_/...) liegen im Atlas, sobald der Run startet.
 */
export class Boot extends Phaser.Scene {
  constructor() { super("boot"); }

  preload(): void {
    // Prozedural erzeugte WAVs (scripts/gen_sfx.py) aus public/sfx laden.
    const t = timings();
    t.preloadStart = performance.now();
    this.cameras.main.setBackgroundColor(PAL[C.nightDeep]);
    new PixelText(this, 240, 132, "LADE MOOR ...", C.mist, "center");
    AudioSystem.preload(this);
    t.preloadDone = performance.now();
  }

  create(): void {
    const t = timings();
    const mark = (k: string): void => { t[k] = performance.now(); };
    mark("createStart");
    createTitleTextures(this);
    t.titleTextureCount = this.textures.getTextureKeys().length;
    mark("titleTexturesDone");
    initAudio(this.game);
    mark("audioDone");
    const seed = seedFromUrl();
    const debug = hasFlag("debug");
    mark("titleStart");
    this.scene.start("title", { seed, debug });
    this.scheduleWarmup();
  }

  /**
   * Warmup hinter dem ersten gerenderten Titel-Frame: Der CREATE-Event der
   * Title-Szene feuert noch vor dem ersten Rendern (SceneManager.create emittiert
   * synchron am Ende von scene.create), deshalb läuft der Warmup erst im nächsten
   * Makro-Task nach CREATE - das ist nach dem Rendern des ersten Titel-Frames
   * (ein rAF-Frame = ein Task inkl. Render). Zwei Häppchen mit setTimeout(0)
   * dazwischen, damit der Titel zwischen den Blöcken eingabefähig bleibt.
   */
  private scheduleWarmup(): void {
    const t = timings();
    const mark = (k: string): void => { t[k] = performance.now(); };
    const title = this.scene.get("title");
    // Erster gerendertes Titel-Frame = "Titel sichtbar" (RENDER feuert, nachdem
    // die Szene gerendert wurde, im Render-Teil des Frames - vor dem Warmup).
    title.events.once(Phaser.Scenes.Events.RENDER, () => mark("titleRendered"));
    title.events.once(Phaser.Scenes.Events.CREATE, () => {
      window.setTimeout(() => {
        mark("warmStart");
        createAllTextures(this);
        mark("warmTexturesDone");
        window.setTimeout(() => {
          buildRuntimeAtlas(this);
          mark("warmDone");
        }, 0);
      }, 0);
    });
  }
}
