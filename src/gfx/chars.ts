import Phaser from "phaser";
import { PAL } from "../palette";
import { GEN_CHARS } from "./gen-chars";
import type { CharacterId } from "../data/types";

export type WalkDir = "down" | "up" | "side";

export interface PlayerFrameSet {
  /** Lauf-Frames je Richtung (4). */
  walk: Record<WalkDir, string[]>;
  /** Idle-Frames je Richtung (2). */
  idle: Record<WalkDir, string[]>;
  hit: string;
  portrait: string;
}

/** Textur-Keys der Spieleranimationen (alle beim Boot erzeugt). */
export const PLAYER_FRAMES: Record<CharacterId, PlayerFrameSet> = {
  mira: {
    walk: {
      down: [0, 1, 2, 3].map((i) => `player_mira_down_${i}`),
      up: [0, 1, 2, 3].map((i) => `player_mira_up_${i}`),
      side: [0, 1, 2, 3].map((i) => `player_mira_side_${i}`),
    },
    idle: {
      down: [0, 1].map((i) => `player_mira_down_idle_${i}`),
      up: [0, 1].map((i) => `player_mira_up_idle_${i}`),
      side: [0, 1].map((i) => `player_mira_side_idle_${i}`),
    },
    hit: "player_mira_hit",
    portrait: "portrait_mira",
  },
  kael: {
    walk: {
      down: [0, 1, 2, 3].map((i) => `player_kael_down_${i}`),
      up: [0, 1, 2, 3].map((i) => `player_kael_up_${i}`),
      side: [0, 1, 2, 3].map((i) => `player_kael_side_${i}`),
    },
    idle: {
      down: [0, 1].map((i) => `player_kael_down_idle_${i}`),
      up: [0, 1].map((i) => `player_kael_up_idle_${i}`),
      side: [0, 1].map((i) => `player_kael_side_idle_${i}`),
    },
    hit: "player_kael_hit",
    portrait: "portrait_kael",
  },
};

function gridToCanvas(rows: string[]): HTMLCanvasElement {
  const h = rows.length;
  const w = rows[0].length;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const idx = ch >= "0" && ch <= "9" ? ch.charCodeAt(0) - 48 : ch.charCodeAt(0) - 97 + 10;
      ctx.fillStyle = "#" + PAL[idx].toString(16).padStart(6, "0");
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

/** Erzeugt alle Spieler-/Portrait-Texturen einmalig beim Boot. */
export function createCharTextures(scene: Phaser.Scene): void {
  for (const [key, def] of Object.entries(GEN_CHARS)) {
    def.frames.forEach((rows, i) => {
      // Basistextur ohne Suffix (Kompatibilität CharSelect/Run), Frames mit Index.
      const textureKey = def.frames.length === 1 ? key : `${key}_${i}`;
      if (!scene.textures.exists(textureKey)) {
        scene.textures.addCanvas(textureKey, gridToCanvas(rows));
      }
      if (i === 0 && !scene.textures.exists(key)) {
        scene.textures.addCanvas(key, gridToCanvas(rows));
      }
    });
  }
}
