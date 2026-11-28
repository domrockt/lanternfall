import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { C, PAL } from "../palette";
import { GLYPHS } from "./glyphs";
import {
  addGridTexture,
  createAllTextures,
  SPRITE_GRIDS,
} from "./textures";
import { createCharTextures } from "./chars";
import { createBossTextures, createEnemyTextures } from "./enemySprites";
import { createFxTextures } from "./gen-fx";
import { createIconTextures } from "./icons";
import { GEN_PROPS } from "./gen-props";
import { GEN_UI } from "./gen-ui";
import { buildRuntimeAtlas } from "./atlas";
import { bakeStaticAtlas } from "./bakeAtlas";
import { warmGlyphs } from "./font";
import { HD_GRIDS } from "../systems/EnemyProjectiles";
import { createTitleTextures } from "../scenes/Boot";
import { ensureTitleRuntimeTextures } from "../scenes/Title";

/**
 * m10-loading-screen K2: Vorab-Erzeugung ALLER Texturen/Atlanten/Glyphen vor dem
 * Titel (Frueher: Boot-Warmup-Haeppchen HINTER dem ersten Titel-Frame ->
 * sichtbares Nachladen, Beleg docs/lanes/m10-boot-startup.md).
 *
 * Der Warmup ist eine Liste kleiner Tasks ("Haeppchen"): Die Loading-Szene
 * fuehrt genau EINEN Task pro Frame aus (time.addEvent), zeigt Fortschritt und
 * bleibt eingabefaehig/renderfaehig zwischen den Haepplchen. Erst wenn ALLES
 * erzeugt ist (inkl. Baked-/Runtime-Atlas und GPU-Warmup), startet der Titel.
 *
 * Alle Creator sind idempotent (textures.exists-Guards) — Reihenfolge und
 * Doppel-Aufrufe sind harmlos; der "derived"-Task (createAllTextures) fuellt
 * gezielt die Reste, die kein eigener Chunk hat (shadow/rings/Gegner-Projektil-
 * Telegraphen + bakeStaticAtlas).
 */

/** Ein Warmup-Haeppchen. `run` ist idempotent und synchron. */
export interface WarmupTask {
  label: string;
  run: (scene: Phaser.Scene) => void;
}

/**
 * Zeichensatz, der vorgewaermt wird: ALLE Zeichen aus GLYPHS (inkl. ä ö ü ß,
 * Ziffern, Satzzeichen) — Space erzeugt bewusst keine Textur (PixelText rendert
 * Leerzeichen als Lücke, ensureGlyph wird dafür nie gerufen).
 */
export const GLYPH_WARMUP_CHARS: readonly string[] = Object.keys(GLYPHS).filter((c) => c !== " ");

/**
 * Farben, für die alle Glyphen vorgewaermt werden: die komplette 32er-Palette.
 * Der statische Scan (docs/lanes/m10-loading-screen.md K1-C) findet 11 feste
 * C.*-Farben PLUS dynamische Farben (DamageNumbers v.color, UI-Banner) —
 * alle 32 Farben abzudecken ist robust und passt in ~1 inkrementelle
 * Baked-Seite (512 px fasst ~2.000 Glyphen à 5x7+Gutter).
 */
export const GLYPH_WARMUP_COLORS: readonly number[] = PAL.map((_, i) => i);

/** Zeichen + Farben, die die Loading-UI selbst braucht (Chunk 0, vor dem ersten Rendern der UI). */
export const LOADING_UI_CHARS = "LADENMOOR .%0123456789";

/** Kleine Laterne (9x14) fuer die Loading-Szene, nur Paletten-Indizes (0-9, a-z). */
export const LOADING_LANTERN: { rows: string[]; w: number; h: number } = {
  w: 9, h: 14,
  rows: [
    "....0....",
    "...0.0...",
    "..00000..",
    "..04440..",
    "..04440..",
    ".0kkkkk0.",
    ".0kjjjk0.",
    ".0kjjjk0.",
    ".0kkkkk0.",
    "..04440..",
    "..04440..",
    ".0444440.",
    "..00000..",
    ".........",
  ],
};

/**
 * Titel-Laufzeit-Texturen (Kanten-Fuellung, Dim-Lasur, gedimmte Vignette) —
 * Quelle der Wahrheit ist die Export-Funktion in Title.ts (gleiche Keys/Guards
 * wie create(), damit das Warmup und der Szenen-Start bitgleich sind).
 */
function warmTitleRuntime(scene: Phaser.Scene): void {
  ensureTitleRuntimeTextures(scene, GAME_WIDTH, GAME_HEIGHT);
}

/**
 * Vignette-Kanten-Texturen fuer CharSelect/Results/Credits (addVignetteBg,
 * src/gfx/vignette-bg.ts — fremde Datei): gleiche Keys und gleiche
 * exists+Groesse-Guard-Logik wie mk() dort. Bewusst KOPIERT statt exportiert:
 * vignette-bg.ts ist fremd geclaimed; bei Aenderung dort bitte hierher
 * spiegeln (Guard-Test prueft die Key-Konvention).
 */
export function warmVignetteEdges(scene: Phaser.Scene): void {
  const key = "vignette"; // Default-Key von addVignetteBg (CharSelect/Results/Credits rufen ohne key-Arg)
  const source = scene.textures.get(key).getSourceImage() as
    { width: number; height: number } | null;
  if (!source) return;
  const texW = source.width;
  const texH = source.height;
  const mk = (ekey: string, sx: number, sy: number, w: number, h: number): void => {
    const existing = scene.textures.exists(ekey)
      ? (scene.textures.get(ekey).getSourceImage() as { width: number; height: number } | null)
      : null;
    if (existing && existing.width === w && existing.height === h) return;
    if (existing) scene.textures.remove(ekey);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      scene.textures.get(key).getSourceImage() as unknown as CanvasImageSource,
      sx, sy, w, h, 0, 0, w, h,
    );
    scene.textures.addCanvas(ekey, canvas);
  };
  mk(`${key}_col_l`, 0, 0, 1, texH);
  mk(`${key}_col_r`, texW - 1, 0, 1, texH);
  mk(`${key}_row_t`, 0, 0, texW, 1);
  mk(`${key}_row_b`, 0, texH - 1, texW, 1);
  mk(`${key}_px_tl`, 0, 0, 1, 1);
  mk(`${key}_px_tr`, texW - 1, 0, 1, 1);
  mk(`${key}_px_bl`, 0, texH - 1, 1, 1);
  mk(`${key}_px_br`, texW - 1, texH - 1, 1, 1);
}

/**
 * HD-Gegnerprojektile (ensureHdShotTextures im EnemyProjectiles-Konstruktor,
 * src/systems/EnemyProjectiles.ts — fremde Datei): dieselben Keys
 * ("enemy_shot_hd_" + family) und dieselbe Raster-Logik wie addHdShotTexture
 * dort. Der exists-Guard im Original sorgt dafuer, dass im Run NICHT doppelt
 * erzeugt wird — der erste Gegnerschuss zeichnet dann schon warme Texturen.
 * Bei Aenderung an HD_GRIDS/addHdShotTexture bitte hierher spiegeln.
 */
export function warmHdShotTextures(scene: Phaser.Scene): void {
  const prefix = "enemy_shot_hd_"; // muss HD_PREFIX in EnemyProjectiles.ts entsprechen
  for (const [family, rows] of Object.entries(HD_GRIDS)) {
    const key = prefix + family;
    if (scene.textures.exists(key)) continue;
    const h = rows.length;
    const w = rows[0].length;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const map = (ch: string): number => {
      if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
      if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
      return -1;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = map(rows[y][x]);
        if (i < 0) continue;
        ctx.fillStyle = "#" + PAL[i].toString(16).padStart(6, "0");
        ctx.fillRect(x, y, 1, 1);
      }
    }
    scene.textures.addCanvas(key, canvas);
  }
}

/**
 * GPU-Warmup: Jede GL-Textur einmal zeichnen (alpha ~0, offscreen hinter der
 * Loading-UI), damit der Upload auf Mobile-GPUs VOR dem Spiel passiert und der
 * ERSTE Draw im Titel/Run kein Ruckler ist (Briefing K2). Die Images bleiben
 * genau einen Task-Frame lang in der Szene (Cleanup-Task entfernt sie), dann
 * hat der Renderer jede Textur hochgeladen.
 */
export function buildWarmupTasks(scene: Phaser.Scene): WarmupTask[] {
  const tasks: WarmupTask[] = [];

  // 0) Glyphen der Loading-UI zuerst — die UI rendert ab Frame 1 ohne Lazy-Erzeugung.
  tasks.push({
    label: "glyphs-loading-ui",
    run: (s) => {
      for (const ch of LOADING_UI_CHARS) if (ch !== " ") warmGlyphs(s, C.mist, [ch]);
    },
  });

  // Titel-kritisch (Boot.ts: GEN_TITLE + ui_frame/title_logo + light_radius/vignette).
  tasks.push({ label: "title-textures", run: (s) => createTitleTextures(s) });

  // Ein Charakter-Chunk (Sprite-Grids), Gegner, Bosse — die grossen Bloecke einzeln.
  tasks.push({
    label: "chars",
    run: (s) => {
      createCharTextures(s);
      for (const [key, def] of Object.entries(SPRITE_GRIDS)) {
        addGridTexture(s, key, def.rows, def.w, def.h);
      }
    },
  });
  tasks.push({ label: "enemies", run: (s) => createEnemyTextures(s) });
  tasks.push({ label: "bosses", run: (s) => createBossTextures(s) });

  // UI-Frames + Props (alle Frames, wie createAllTextures).
  tasks.push({
    label: "ui-frames",
    run: (s) => {
      for (const [key, def] of Object.entries(GEN_UI)) {
        def.frames.forEach((rows, i) => {
          addGridTexture(s, i === 0 ? key : `${key}_${i + 1}`, rows, def.w, def.h);
        });
      }
    },
  });
  tasks.push({
    label: "props",
    run: (s) => {
      for (const [key, def] of Object.entries(GEN_PROPS)) {
        addGridTexture(s, key, def.frames[0], def.w, def.h);
      }
    },
  });

  tasks.push({ label: "fx", run: (s) => createFxTextures(s) });
  tasks.push({ label: "icons", run: (s) => createIconTextures(s) });

  // Reste + statischer Baked-Atlas (shadows/rings/Telegraphen sind hier privat
  // in textures.ts und laufen ueber den idempotenten Sammel-Aufruf mit).
  tasks.push({ label: "derived-atlas", run: (s) => createAllTextures(s) });

  // Alle 32 Farben x alle Zeichen in Farbe-Chunks (~70 Glyphen je Chunk).
  for (const color of GLYPH_WARMUP_COLORS) {
    tasks.push({
      label: `glyphs-c${color}`,
      run: (s) => warmGlyphs(s, color, GLYPH_WARMUP_CHARS),
    });
  }

  // Runtime-Atlas NACH allen Texturen (Reihenfolge wie im alten Boot-Warmup:
  // erst Texturen, dann Atlas), danach die View-abhaengigen
  // Laufzeit-Texturen — exakt wie heute NACH dem Atlas entstanden (Atlas-Vertrag
  // bleibt unveraendert: dieselben Keys wie in Produktion).
  tasks.push({ label: "runtime-atlas", run: (s) => buildRuntimeAtlas(s) });
  tasks.push({ label: "title-runtime", run: (s) => warmTitleRuntime(s) });
  tasks.push({ label: "menu-vignette-edges", run: (s) => warmVignetteEdges(s) });
  tasks.push({ label: "hd-shots", run: (s) => warmHdShotTextures(s) });

  // GPU-Warmup: add -> (>=1 gerenderter Frame) -> cleanup.
  let warmImages: Phaser.GameObjects.Image[] | null = null;
  tasks.push({
    label: "gpu-warmup",
    run: (s) => {
      warmImages = [];
      for (const key of s.textures.getTextureKeys()) {
        if (key.startsWith("__")) continue; // Phaser-Platzhalter (__DEFAULT/__MISSING)
        warmImages.push(
          s.add.image(0, 0, key).setAlpha(0.0001).setDepth(-1000),
        );
      }
    },
  });
  tasks.push({
    label: "gpu-warmup-cleanup",
    run: () => {
      if (!warmImages) return;
      for (const img of warmImages) img.destroy();
      warmImages = null;
    },
  });

  return tasks;
}
