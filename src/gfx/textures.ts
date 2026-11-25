import Phaser from "phaser";
import { PAL } from "../palette";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { createIconTextures } from "./icons";

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
    rows: ["..000..", ".0vvv0.", "0vccvv0", "0vccvv0", "0vvccv0", ".0vvv0.", "..000.."],
  },
  gem_medium: {
    w: 9, h: 9,
    rows: [
      "...000...",
      "..0mmm0..",
      ".0mmcmm0.",
      "0mmcccmm0",
      "0mccccmm0",
      "0mmcccmm0",
      ".0mmcmm0.",
      "..0mmm0..",
      "...000...",
    ],
  },
  gem_large: {
    w: 11, h: 11,
    rows: [
      "....000....",
      "...0ppp0...",
      "..0ppcppo..",
      ".0ppcccpp0.",
      "0ppcccccpp0",
      "0ppcccccpp0",
      "0ppcccccpp0",
      ".0ppcccpp0.",
      "..0ppcpp0..",
      "...0ppp0...",
      "....000....",
    ],
  },
  projectile_ember: {
    w: 7, h: 7,
    rows: ["..000..", ".0klm0.", "0klmmd0", "0lmmmd0", "0kmmmd0", ".0lmd0.", "..000.."],
  },
  projectile_thorn: {
    w: 7, h: 7,
    rows: ["..000..", ".0sss0.", "0stsus0", ".0svs0.", "..0s0..", "...0...", "......."],
  },
  flail_ball: {
    w: 9, h: 9,
    rows: [
      "...000...",
      "..0bbb0..",
      ".0bcccb0.",
      "0bcc9ccb0",
      "0bc9c9cb0",
      "0bcc9ccb0",
      ".0bcccb0.",
      "..0bbb0..",
      "...000...",
    ],
  },
  /** Kettenglied (2×8): wird als Beam zwischen Spieler und Kugel gestreckt. */
  chain_link: {
    w: 2, h: 8,
    rows: ["07", "07", "07", "70", "07", "07", "07", "70"],
  },
  orb_lantern: {
    w: 9, h: 9,
    rows: [
      "...000...",
      "..09990..",
      ".09ccc90.",
      "09cmmmc90",
      "09cmmmc90",
      "09cmmmc90",
      ".09ccc90.",
      "..09990..",
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
      "..090..",
      ".09c90.",
      "09cmc90",
      ".09c90.",
      "..090..",
      "...0...",
    ],
  },
  orb_soul: {
    w: 9, h: 9,
    rows: [
      "...000...",
      "..08880..",
      ".08ccc80.",
      "08cmmmc80",
      "08cmmmc80",
      "08cmmmc80",
      ".08ccc80.",
      "..08880..",
      "...000...",
    ],
  },
  arrow_chest: {
    w: 9, h: 9,
    rows: [
      ".....0...",
      "....0m0..",
      "...0mm0..",
      "..0mmm0..",
      ".0mmmm0..",
      "..0mmm0..",
      "...0mm0..",
      "....0m0..",
      ".....0...",
    ],
  },
  fx_coin: {
    w: 5, h: 5,
    rows: [
      ".000.",
      "0mmm0",
      "0mcm0",
      "0mmm0",
      ".000.",
    ],
  },
  fx_spark: {
    w: 3, h: 3,
    rows: [".m.", "mmm", ".m."],
  },
  bolt_seg: {
    w: 2, h: 8,
    rows: ["0m", "0m", "0m", "0m", "0m", "0m", "0m", "0m"],
  },
  chest_closed: {
    w: 16, h: 16,
    rows: [
      "................",
      "................",
      "..000000000000..",
      ".0cccccccccccc0.",
      ".0cbbbbbbbbbbc0.",
      ".0cb77777777bc0.",
      ".0cb77777777bc0.",
      ".0cb77777777bc0.",
      ".0cb77777777bc0.",
      ".0cbbbbbbbbbbc0.",
      ".0cbbbb00bbbbc0.",
      ".0cbbbb00bbbbc0.",
      ".0cccccccccccc0.",
      "..000000000000..",
      "................",
      "................",
    ],
  },
  chest_open: {
    w: 16, h: 16,
    rows: [
      "..000000000000..",
      ".0cccccccccccc0.",
      ".0cbbbbbbbbbbc0.",
      ".0cb77777777bc0.",
      "..000000000000..",
      "................",
      ".0cccccccccccc0.",
      ".0cbbbbbbbbbbc0.",
      ".0cb77777777bc0.",
      ".0cb77777777bc0.",
      ".0cbbbbbbbbbbc0.",
      ".0cbbbb00bbbbc0.",
      ".0cccccccccccc0.",
      "..000000000000..",
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
};

export type SpriteKey = keyof typeof SPRITE_GRIDS;

/** Erzeugt alle Sprite-Texturen + Licht/Vignette. */
export function createAllTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(SPRITE_GRIDS)) {
    addGridTexture(scene, key, def.rows, def.w, def.h);
  }
  createLightTexture(scene);
  createVignetteTexture(scene);
  createShadowTexture(scene);
  createFrostRingTexture(scene);
  createRingTexture(scene, "ring_burst", [17, 19, 21, 13]);
  createRingTexture(scene, "ring_seal", [20, 21, 13]);
  createRingTexture(scene, "ring_soul", [8, 12, 13]);
  createIconTextures(scene);
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
  // vier konzentrische 1-px-Ringe, außen dunkler
  for (let i = 0; i < 4; i++) {
    ctx.globalAlpha = 0.55 - i * 0.11;
    ctx.strokeStyle = hexColor(colors[Math.min(i, colors.length - 1)]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c, 42 - i * 2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
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
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = hexColor(8);   // mist
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(c, c, 44, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = hexColor(9);   // paleMist
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(c, c, 41, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = hexColor(12);  // candleWhite
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(c, c, 38, 0, Math.PI * 2); ctx.stroke();
  // Eiszacken: kurze Strahlen von r 40 nach r 47
  ctx.globalAlpha = 1;
  ctx.strokeStyle = hexColor(13);
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 40, c + Math.sin(a) * 40);
    ctx.lineTo(c + Math.cos(a) * 47, c + Math.sin(a) * 47);
    ctx.stroke();
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
