import { CHUNK_SIZE, WORLD_SIZE } from "../config";
import { paintTerrain } from "./tiles";

/**
 * Mal-Arbeiter für Terrain-Chunks. Die per-Pixel-Klassifikation (Noise +
 * Autotiling) kostet ~25–45 ms pro 256-px-Chunk; auf dem Main-Thread erzeugte
 * das alle paar Sekunden einen Einbruch auf ~20 FPS. Der Worker malt den Chunk
 * auf ein OffscreenCanvas und schickt nur das fertige ImageBitmap zurück.
 */
interface ChunkJob {
  cx: number;
  cy: number;
  seed: number;
}

self.onmessage = (event: MessageEvent<ChunkJob>) => {
  const { cx, cy, seed } = event.data;
  const canvas = new OffscreenCanvas(CHUNK_SIZE, CHUNK_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    (self as unknown as Worker).postMessage({ cx, cy, bitmap: null });
    return;
  }
  ctx.imageSmoothingEnabled = false;
  paintTerrain(ctx, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, seed, WORLD_SIZE);
  const bitmap = canvas.transferToImageBitmap();
  (self as unknown as Worker).postMessage({ cx, cy, bitmap }, [bitmap]);
};
