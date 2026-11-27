import Phaser from "phaser";
import { PAL } from "../palette";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { createIconTextures } from "./icons";
import { createCharTextures } from "./chars";
import { GEN_UI } from "./gen-ui";
import { GEN_TITLE } from "./gen-title";
import { GEN_PROPS } from "./gen-props";
import { ALL_BOSS_FRAMES, ALL_ENEMY_FRAMES, createBossTextures, createEnemyTextures } from "./enemySprites";
import { createFxTextures } from "./gen-fx";

/** Zeichen → Palettenindex: 0-9 = 0-9, a-z = 10-31, '.' = transparent. */
export function charIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

function hexColor(i: number): string {
  return "#" + PAL[i].toString(16).padStart(6, "0");
}

/** Prüft, dass alle Grid-Zeilen gleich lang sind. */
export function validateGrid(rows: readonly string[], width: number): void {
  for (const r of rows) if (r.length !== width) throw new Error(`grid row length ${r.length} != ${width}: "${r}"`);
}

export function gridRowsToCanvas(rows: readonly string[], width: number, height: number): HTMLCanvasElement {
  validateGrid(rows, width);
  if (rows.length !== height) throw new Error(`grid height ${rows.length} != ${height}`);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = charIndex(rows[y][x]);
      if (i < 0) continue;
      ctx.fillStyle = hexColor(i);
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

export function addGridTexture(
  scene: Phaser.Scene, key: string, rows: readonly string[], width: number, height: number,
): void {
  if (scene.textures.exists(key)) return;
  const canvas = gridRowsToCanvas(rows, width, height);
  scene.textures.addCanvas(key, canvas);
}

/**
 * Platzhalter-Sprites für M1: 16x16, dunkle Kontur, 3+ Schattierungsstufen,
 * Lichtkante oben-links. Alle Pixel aus der 32er-Palette.
 */
export const SPRITE_GRIDS: Record<string, { rows: string[]; w: number; h: number }> = {
  player_mira: {
    w: 16, h: 16,
    rows: [
      "......0000......",
      ".....0pppp0.....",
      "....0poppop0....",
      "....0poppop0....",
      "....0pccccp0....",
      "....0pc00cp0....",
      "....0pcccpp0....",
      ".....0pppp0.....",
      "....05555550....",
      "...0555555550...",
      "...0555555550...",
      "....05555550....",
      "....0c5555c0....",
      ".....055550.....",
      ".....04..40.....",
      ".....00..00.....",
    ],
  },
  player_kael: {
    w: 16, h: 16,
    rows: [
      "......0000......",
      ".....066660.....",
      "....06666660....",
      "....06cccc60....",
      "....06c00c60....",
      "....06666660....",
      "....04444440....",
      "...0445555440...",
      "..045555555540..",
      "..045566655540..",
      "..045555555540..",
      "...0455555540...",
      "....04444440....",
      "....044..440....",
      "....044..440....",
      ".....00..00.....",
    ],
  },
  enemy_bog_rat: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "................",
      "................",
      "......0000......",
      ".....0gggg0.....",
      "....0gggggg0....",
      "...0ggghgggg0...",
      "...0gggggggg0...",
      "...0gggggggg0...",
      "..0gggggggggg0..",
      "..0gggggggggg0..",
      "...0gggggggg0...",
      "....0h0..0h0....",
      ".....0....0.....",
      "................",
    ],
  },
  enemy_bog_rat2: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "................",
      "................",
      "......0000......",
      ".....0gggg0.....",
      "....0gggggg0....",
      "...0ggghgggg0...",
      "...0gggggggg0...",
      "...0gggggggg0...",
      "..0gggggggggg0..",
      "..0gggggggggg0..",
      "...0gggggggg0...",
      "...0h0....0h0...",
      "....0......0....",
      "................",
    ],
  },
  enemy_wisp: {
    w: 16, h: 16,
    rows: [
      "................",
      "......0000......",
      ".....0llll0.....",
      "....0lddddl0....",
      "...0ldddddddl0..",
      "..0ldddddddddl0.",
      "..0ldddddddddl0.",
      "..0llldddddlll0.",
      "...0llldddlll0..",
      "....0lllllll0...",
      ".....0lllll0....",
      "......0lll0.....",
      ".......0l0......",
      ".......000......",
      "................",
      "................",
    ],
  },
  enemy_wisp2: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "......0000......",
      ".....0llll0.....",
      "....0lddddl0....",
      "...0ldddddddl0..",
      "..0ldddddddddl0.",
      "..0ldddddddddl0.",
      "..0llldddddlll0.",
      "...0llldddlll0..",
      "....0lllllll0...",
      ".....0lllll0....",
      "......0lll0.....",
      ".......0l0......",
      ".......000......",
      "................",
    ],
  },
  enemy_bogzombie: {
    w: 16, h: 16,
    rows: [
      "......0000......",
      ".....0uuuu0.....",
      "....0uuuuuu0....",
      "....0uvccvu0....",
      "....0uuc0cu0....",
      "....0uuuuuu0....",
      ".....0uuuu0.....",
      "....0uuuuuu0....",
      "...0uuuuuuuu0...",
      "..0uuuuuuuuuu0..",
      "..0uuuuuuuuuu0..",
      "...0uuuuuuuu0...",
      "....0uuuuuu0....",
      "....0uu00uu0....",
      "....0uu00uu0....",
      ".....00..00.....",
    ],
  },
  enemy_bogzombie2: {
    w: 16, h: 16,
    rows: [
      "......0000......",
      ".....0uuuu0.....",
      "....0uuuuuu0....",
      "....0uvccvu0....",
      "....0uuc0cu0....",
      "....0uuuuuu0....",
      ".....0uuuu0.....",
      "....0uuuuuu0....",
      "...0uuuuuuuu0...",
      "..0uuuuuuuuuu0..",
      "..0uuuuuuuuuu0..",
      "...0uuuuuuuu0...",
      "....0uuuuuu0....",
      "...0uu0..0uu0...",
      "..0uu0....0uu0..",
      "...00......00...",
    ],
  },
  gem_small: {
    w: 7, h: 7,
    // M10-Lesbarkeit: Groesse 1 (XP 2) = Moor-Gruen (PAL 31) mit Glanz (22),
    // 1-px-Tinten-Kontur. Drei Groessen sind farblich eindeutig getrennt.
    rows: [
      "..000..",
      ".0vmv0.",
      "0vmmvv0",
      "0vvvvv0",
      ".0vvv0.",
      "..0v0..",
      "...0...",
    ],
  },
  gem_medium: {
    w: 9, h: 9,
    // Groesse 2 (XP 6) = Bernstein/Gold (PAL 20/21). Nicht in den 6
    // haeufigsten Gegnerfarben -> im Chaos klar getrennt.
    rows: [
      "...000...",
      "..0lll0..",
      ".0llkkk0.",
      "0llkkkkk0",
      "0lkkkkkk0",
      "0llkkkkk0",
      ".0llkkk0.",
      "..0lll0..",
      "...000...",
    ],
  },
  gem_large: {
    w: 11, h: 11,
    // Groesse 3 (XP 18) = Karmesin (PAL 25) mit heisser Kante (26).
    rows: [
      "....000....",
      "...0ppp0...",
      "..0qpppp0..",
      ".0qqppppp0.",
      "0qqqpppppp0",
      "0ppppppppp0",
      "0ppppppppp0",
      ".0ppppppp0.",
      "..0ppppp0..",
      "...0ppp0...",
      "....000....",
    ],
  },
  projectile_ember: {
    w: 7, h: 7,
    // Komet: Schweif oben-links, runder Glutkern unten-rechts (keine Kerbe).
    rows: [
      "...00..",
      "..0h00.",
      "..0hi0.",
      ".0hild0",
      "0hildi0",
      ".0hild0",
      "..0hi0.",
    ],
  },
  projectile_thorn: {
    w: 7, h: 7,
    // Dornenstern mit warmer Glutrampe + Laternen-Spitze; Kontur haelt ihn auf Gras.
    rows: [
      "...0...",
      "..0l0..",
      ".0hih0.",
      "0hildi0",
      ".0hih0.",
      "..0l0..",
      "...0...",
    ],
  },
  flail_ball: {
    w: 9, h: 9,
    // Eisenkugel mit vier 2-px-Spikes; Rampe 5/8/9 statt Weiß-Blob.
    rows: [
      "..0...0..",
      ".0b0.0b0.",
      "..0bbb0..",
      ".0bcccb0.",
      "0bc9c9cb0",
      ".0bcccb0.",
      "..0bbb0..",
      ".0b0.0b0.",
      "..0...0..",
    ],
  },
  /** Kettenglied (2×8): wird als Beam zwischen Spieler und Kugel gestreckt. */
  chain_link: {
    w: 2, h: 8,
    rows: ["08", "88", "80", "08", "88", "80", "08", "88"],
  },
  fx_coin: {
    w: 7, h: 7,
    // Muenze: Rand 18/19, Gesicht 20/21, Glanz 22 oben-links.
    rows: [
      "..000..",
      ".0jjm0.",
      "0jkklj0",
      "0jkllj0",
      "0jkkkj0",
      ".0jjj0.",
      "..000..",
    ],
  },
  fx_spark: {
    w: 5, h: 5,
    // Groesserer Treffer-Funken: heller Kern (12) mit Glutarmen (21/22).
    rows: [
      "..m..",
      ".mlm.",
      "mlclm",
      ".mlm.",
      "..m..",
    ],
  },
  orb_lantern: {
    w: 9, h: 9,
    rows: [
      "...000...",
      "..0kkk0..",
      ".0klllk0.",
      "0kllmllk0",
      "0klddllk0",
      "0kllmllk0",
      ".0klllk0.",
      "..0kkk0..",
      "...000...",
    ],
  },
  projectile_phoenix: {
    w: 13, h: 9,
    rows: [
      "...0.........",
      "..0j0........",
      ".0jll0.......",
      "0jllll0mm0...",
      "0gjlllmm0mmh0",
      "0jllll0mm0...",
      ".0jll0.......",
      "..0j0........",
      "...0.........",
    ],
  },
  projectile_ice: {
    w: 7, h: 7,
    rows: [
      "...0...",
      "..0a0..",
      ".0ab80.",
      "0abc9b0",
      ".0ab80.",
      "..0a0..",
      "...0...",
    ],
  },
  chest_closed: {
    w: 16, h: 16,
    rows: [
      "................",
      "...0000000000...",
      "..0kllllllllk0..",
      "..0khhhhhhhhk0..",
      "..0khhhhhhhhk0..",
      "..0kkkkkkkkkk0..",
      "..0gl5llll5lg0..",
      "..0gh5hhhh5hg0..",
      "..0gh5hhhh5hg0..",
      "..0gh55ll55hg0..",
      "..0gh5kmmk5hg0..",
      "..0gh5hhhh5hg0..",
      "..0gggggggggg0..",
      "...0000000000...",
      "................",
      "................",
    ],
  },
  chest_open: {
    w: 16, h: 16,
    rows: [
      "................",
      "..00000000......",
      ".0kllllllk0.....",
      ".0khhhhhhk0.....",
      ".0khhhhhhk0.....",
      ".0gggggggg0.....",
      "..0gllllllllg0..",
      "..0ghhmmmmhhg0..",
      "..0gh5dddd5hg0..",
      "..0gh5dmmd5hg0..",
      "..0gh55mm55hg0..",
      "..0ghhhhhhhhg0..",
      "..0gggggggggg0..",
      "...0000000000...",
      "................",
      "................",
    ],
  },
  lantern_small: {
    w: 7, h: 9,
    rows: ["..000..", ".0kkk0.", "0klllk0", "0klllk0", "0klllk0", ".0kkk0.", "..0l0..", "..0l0..", "..000.."],
  },
};

export const SPRITE_FRAMES: Record<string, string[]> = {
  enemy_bog_rat: ["enemy_bog_rat", "enemy_bog_rat2"],
  enemy_wisp: ["enemy_wisp", "enemy_wisp2"],
  enemy_bogzombie: ["enemy_bogzombie", "enemy_bogzombie2"],
  ...ALL_ENEMY_FRAMES,
  ...ALL_BOSS_FRAMES,
};

export type SpriteKey = keyof typeof SPRITE_GRIDS;

/** Erzeugt alle Sprite-Texturen + Licht/Vignette. */
export function createAllTextures(scene: Phaser.Scene): void {
  createCharTextures(scene);
  for (const [key, def] of Object.entries(SPRITE_GRIDS)) {
    addGridTexture(scene, key, def.rows, def.w, def.h);
  }
  createEnemyTextures(scene);
  createBossTextures(scene);
  for (const [key, def] of Object.entries(GEN_TITLE)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  for (const [key, def] of Object.entries(GEN_UI)) {
    def.frames.forEach((rows, i) => {
      addGridTexture(scene, i === 0 ? key : `${key}_${i + 1}`, rows, def.w, def.h);
    });
  }
  for (const [key, def] of Object.entries(GEN_PROPS)) {
    addGridTexture(scene, key, def.frames[0], def.w, def.h);
  }
  createLightTexture(scene);
  createVignetteTexture(scene);
  createShadowTexture(scene);
  createFxTextures(scene);
  createFrostRingTexture(scene);
  createRingTexture(scene, "ring_burst", [17, 19, 21, 13]);
  createRingTexture(scene, "ring_seal", [20, 21, 13]);
  createRingTexture(scene, "ring_soul", [8, 12, 13]);
  createEnemyProjectileTextures(scene);
  createTelegraphTextures(scene);
  createIconTextures(scene);
}

/**
 * Gegner-Projektile: eigene, deutlich andere Optik als Spieler-Feuer —
 * dunkle Kontur, kompakte Formen in Giftgrün/Blutrot/Fahlblau, kein ADD-Blend.
 */
export const ENEMY_PROJECTILES: Record<string, { rows: string[]; w: number; h: number }> = {
  enemy_shot_spit: {
    w: 7, h: 7,
    rows: ["..000..", ".0h3h0.", "0h333h0", "0333330", "0h333h0", ".0h3h0.", "..000.."],
  },
  enemy_shot_bone: {
    w: 9, h: 5,
    rows: ["..00000..", ".0bb0bb0.", "0bab0bab0", ".0bb0bb0.", "..00000.."],
  },
  enemy_shot_fire: {
    w: 7, h: 7,
    rows: ["...0...", "..0j0..", ".0j9j0.", "0j9c9j0", ".0j9j0.", "..0j0..", "...0..."],
  },
  enemy_shot_shadow: {
    w: 7, h: 7,
    rows: ["..000..", ".06660.", "06ccc60", "06cpc60", "06ccc60", ".06660.", "..000.."],
  },
  enemy_shot_thorn: {
    w: 7, h: 7,
    rows: ["..0....", ".0u0...", "0u8u0..", ".0u8u0.", "..0u8u0", "...0u0.", "....0.."],
  },
};

function createEnemyProjectileTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(ENEMY_PROJECTILES)) {
    addGridTexture(scene, key, def.rows, def.w, def.h);
  }
  // Elite-Leuchtrand (additiv als Halo um Elites).
  createRingTexture(scene, "elite_aura", [20, 21, 22, 12]);
}

/** Bodenmarkierungen: gestrichelter Warnkreis + Pfütze, voll deckend. */
function createTelegraphTextures(scene: Phaser.Scene): void {
  const ring = "telegraph_disc";
  if (!scene.textures.exists(ring)) {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#" + PAL[25].toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.arc(c, c, 30, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#" + PAL[26].toString(16).padStart(6, "0");
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(c, c, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#" + PAL[13].toString(16).padStart(6, "0");
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c, c, 24, 0, Math.PI * 2); ctx.stroke();
    scene.textures.addCanvas(ring, canvas);
  }

  const puddle = "puddle_poison";
  if (!scene.textures.exists(puddle)) {
    const size = 40;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = "#" + PAL[30].toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.ellipse(c, c, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#" + PAL[31].toString(16).padStart(6, "0");
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(c, c, 17, 11, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#" + PAL[22].toString(16).padStart(6, "0");
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(12 + i * 4, 18 + (i % 2) * 3, 2, 2);
    }
    scene.textures.addCanvas(puddle, canvas);
  }

  const beam = "telegraph_beam";
  if (!scene.textures.exists(beam)) {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#" + PAL[25].toString(16).padStart(6, "0");
    ctx.fillRect(2, 0, 4, 16);
    ctx.fillStyle = "#" + PAL[13].toString(16).padStart(6, "0");
    ctx.fillRect(3, 0, 2, 16);
    scene.textures.addCanvas(beam, canvas);
  }
}

/** Diskretes Ring-Sprite für Pulse/Auren (additive Nutzung, weiche Kante). */
function createRingTexture(scene: Phaser.Scene, key: string, colors: number[]): void {
  if (scene.textures.exists(key)) return;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  // Durchgehendes 2-px-Band (keine gepunkteten Boegen): Distanzbereiche statt
  // Toleranz um einen Radius. Aussen die dunkelste Farbe, innen die hellste.
  const bands: Array<[number, number, number]> = [
    [43, 45, colors[0]],
    [41, 43, colors[1] ?? colors[0]],
    [39, 41, colors[2] ?? colors[0]],
    [37, 39, colors[3] ?? colors[colors.length - 1]],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      for (const [r0, r1, col] of bands) {
        if (d >= r0 && d < r1) {
          ctx.fillStyle = hexColor(col);
          ctx.fillRect(x, y, 1, 1);
          break;
        }
      }
    }
  }
  // Innenkante: 1 px dunkler Schatten unten-rechts, heller Glanz oben-links.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 36.5 && d < 37.5) {
        ctx.fillStyle = hexColor(dx < -4 && dy < -4 ? (colors[colors.length - 1] ?? colors[0]) : colors[0]);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  scene.textures.addCanvas(key, canvas);
}

/**
 * Frost-Ring: kein dünner additiver Puls, sondern ein klar lesbares Eis-Siegel —
 * 2-px-Band in Mist/PaleMist, weißer Kern und 12 nach außen ragende Eiszacken.
 * Wird mit Normal-Blend gezeichnet, damit die blau-grauen Werte auf Gras stehen.
 */
function createFrostRingTexture(scene: Phaser.Scene): void {
  const key = "ring_frost";
  if (scene.textures.exists(key)) return;
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  // Gerastertes 2-px-Eisband + 12 Zacken, keine geglätteten Vektorbögen.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 43.5 && d <= 45.5) {
        ctx.fillStyle = hexColor(8);
      } else if (d >= 41.5 && d <= 43.5) {
        ctx.fillStyle = hexColor(9);
      } else if (d >= 39.5 && d <= 40.5) {
        ctx.fillStyle = hexColor(12);
      } else {
        continue;
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // 12 Zacken (2-px-Strahlen) von r 43 nach r 47.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const x0 = Math.round(c + Math.cos(a) * 43);
    const y0 = Math.round(c + Math.sin(a) * 43);
    const x1 = Math.round(c + Math.cos(a) * 47);
    const y1 = Math.round(c + Math.sin(a) * 47);
    ctx.fillStyle = hexColor(13);
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= steps; t++) {
      const px = x0 + Math.round((x1 - x0) * (t / Math.max(1, steps)));
      const py = y0 + Math.round((y1 - y0) * (t / Math.max(1, steps)));
      ctx.fillRect(px, py, 1, 1);
      ctx.fillRect(px + 1, py, 1, 1);
    }
  }
  scene.textures.addCanvas(key, canvas);
}

/** Warmes Licht als diskrete Palettenringe (additiv). */
function createLightTexture(scene: Phaser.Scene): void {
  const key = "light_radius";
  if (scene.textures.exists(key)) return;
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rings: { r: number; color: number; alpha: number }[] = [
    { r: 96, color: 19, alpha: 0.05 },
    { r: 88, color: 19, alpha: 0.05 },
    { r: 80, color: 20, alpha: 0.05 },
    { r: 72, color: 20, alpha: 0.05 },
    { r: 64, color: 21, alpha: 0.06 },
    { r: 56, color: 21, alpha: 0.06 },
    { r: 48, color: 21, alpha: 0.07 },
    { r: 40, color: 22, alpha: 0.07 },
    { r: 32, color: 22, alpha: 0.08 },
    { r: 24, color: 13, alpha: 0.09 },
    { r: 16, color: 13, alpha: 0.10 },
    { r: 8, color: 13, alpha: 0.10 },
  ];
  const c = size / 2;
  for (const ring of rings) {
    ctx.globalAlpha = ring.alpha;
    ctx.fillStyle = hexColor(ring.color);
    ctx.beginPath();
    ctx.arc(c, c, ring.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // weiche Kante: außen transparent
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(c, c, 10, c, c, 96);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.75, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  scene.textures.addCanvas(key, canvas);
}

function createVignetteTexture(scene: Phaser.Scene): void {
  const key = "vignette";
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  const c = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, 70, GAME_WIDTH / 2, GAME_HEIGHT / 2, 290);
  c.addColorStop(0, "rgba(6,7,12,0)");
  c.addColorStop(0.7, "rgba(6,7,12,0.18)");
  c.addColorStop(1, "rgba(6,7,12,0.72)");
  ctx.fillStyle = c;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  scene.textures.addCanvas(key, canvas);
}

function createShadowTexture(scene: Phaser.Scene): void {
  const key = "shadow";
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement("canvas");
  canvas.width = 14;
  canvas.height = 6;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(6,7,12,0.45)";
  ctx.beginPath();
  ctx.ellipse(7, 3, 6.5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  scene.textures.addCanvas(key, canvas);
}
