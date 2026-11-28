import { CHUNK_SIZE, WORLD_SIZE } from "../config";
import { WATER_ANIM_STEPS, paintTerrain } from "./tiles";

/**
 * Mal-Arbeiter für Terrain-Chunks. Die per-Pixel-Klassifikation (Noise +
 * Autotiling) kostet ~25–45 ms pro 256-px-Chunk; auf dem Main-Thread erzeugte
 * das alle paar Sekunden einen Einbruch auf ~20 FPS. Der Worker malt den Chunk
 * auf ein OffscreenCanvas und schickt nur die fertigen ImageBitmaps zurück.
 *
 * Wasser-Chunks kommen als alle WATER_ANIM_STEPS Animationsstufen (Wellen-
 * drift, Schaum-Puls, Glisser); Land-Chunks als Einzel-Frame (Speicher).
 */
interface ChunkJob {
  cx: number;
  cy: number;
  seed: number;
  frames?: number;
}

self.onmessage = (event: MessageEvent<ChunkJob>) => {
  const { cx, cy, seed } = event.data;
  const frames = Math.max(1, Math.min(WATER_ANIM_STEPS, event.data.frames ?? 1));
  const bitmaps: ImageBitmap[] = [];
  for (let f = 0; f < frames; f++) {
    const canvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      (self as unknown as Worker).postMessage({ cx, cy, bitmaps: null });
      return;
    }
    ctx.imageSmoothingEnabled = false;
    paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, seed, WORLD_SIZE, f);
    bitmaps.push(canvas.transferToImageBitmap());
  }
  (self as unknown as Worker).postMessage({ cx, cy, bitmaps }, bitmaps);
};
