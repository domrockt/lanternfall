// m10-ground-chunk-tex-dup (#13283): Guard gegen den Regression-Spam
// „Texture key already in use: chunk_*" (seit m10-ground-chunk-budget,
// Merge 39d1efe8). Phaser-TextureManager-Mimik: createCanvas auf belegtem
// Key warnt und liefert null — genau das erzeugte die Spam-Zeilen, die in
// den Mess-Skripten als JS-Fehler zaehlen (Balance-JSON accepted:false).
// Der Fix (acquireChunkCanvas) waendet scene.textures auf eine kleine
// Registry-Schnittstelle ab und wiederverwendet existierende Canvas-
// Texturen derselben Klasse statt Doppel-Add; getestet wird an BEIDEN
// Verwendungspfad-Nachbildungen (Async-Install buildChunkTexture und
// Sync-Fallback createChunk teilen die Logik).
import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: {} }));
import {
  acquireChunkCanvas,
  type ChunkCanvasLike,
  type ChunkCanvasRegistryLike,
} from "../src/gfx/GroundRenderer";

/** Phaser-Mimik: createCanvas auf belegtem Key → console.warn + null. */
class FakeTextureRegistry implements ChunkCanvasRegistryLike {
  readonly warnings: string[] = [];
  private readonly map = new Map<string, ChunkCanvasLike & { id: number }>();
  private nextId = 1;

  exists(key: string): boolean {
    return this.map.has(key);
  }

  get(key: string): (ChunkCanvasLike & { id: number }) | null {
    return this.map.get(key) ?? null;
  }

  createCanvas(key: string, frames: number): unknown {
    if (this.map.has(key)) {
      this.warnings.push(`Texture key already in use: ${key}`);
      return null;
    }
    const texture = { isCanvas: true, frames, id: this.nextId++ };
    this.map.set(key, texture);
    return texture;
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  /** Nur Tests: Fremd-Textur (z. B. Nicht-Canvas) direkt in die Registry legen. */
  mapSetForTest(key: string, texture: ChunkCanvasLike & { id: number }): void {
    this.map.set(key, texture);
  }

  /** Warnung nur bei echtem Phaser-Verstoß relevant — console.warn im Test stumm. */
  expectNoWarnings() {
    expect(this.warnings).toEqual([]);
  }
}

describe("acquireChunkCanvas (Doppel-Add-Schutz chunk_*)", () => {
  it("erstes Anlegen erzeugt Textur (reused=false), Registry hat genau einen Key", () => {
    const reg = new FakeTextureRegistry();
    const res = acquireChunkCanvas(reg, "chunk_8_12", 1);
    expect(res.reused).toBe(false);
    expect((res.texture as { id: number }).id).toBe(1);
    expect(reg.exists("chunk_8_12")).toBe(true);
    reg.expectNoWarnings();
  });

  it("Wiederaufbau desselben Chunks (Async-Pfad, buildChunkTexture): 0 'already in use', Textur-Identität bleibt", () => {
    const reg = new FakeTextureRegistry();
    acquireChunkCanvas(reg, "chunk_8_12", 1);
    const first = reg.get("chunk_8_12")!;
    for (let i = 0; i < 50; i++) {
      const res = acquireChunkCanvas(reg, "chunk_8_12", 1);
      expect(res.reused).toBe(true);
      expect((res.texture as { id: number }).id).toBe(first.id);
    }
    reg.expectNoWarnings();
  });

  it("Sync-Fallback (createChunk) denselben Key erneut: 0 'already in use'", () => {
    const reg = new FakeTextureRegistry();
    acquireChunkCanvas(reg, "chunk_10_8", 3); // Wasser-Chunk, 3 Stufen
    for (let i = 0; i < 50; i++) {
      const res = acquireChunkCanvas(reg, "chunk_10_8", 3);
      expect(res.reused).toBe(true);
    }
    expect(reg.get("chunk_10_8")!.frames).toBe(3);
    reg.expectNoWarnings();
  });

  it("Klassen-Wechsel (Land 1 → Wasser 3 Stufen): Neuanlage nach remove(), ohne Warnung", () => {
    const reg = new FakeTextureRegistry();
    const before = acquireChunkCanvas(reg, "chunk_5_5", 1);
    const after = acquireChunkCanvas(reg, "chunk_5_5", 3);
    expect(after.reused).toBe(false);
    expect((after.texture as { id: number }).id).not.toBe((before.texture as { id: number }).id);
    expect(reg.get("chunk_5_5")!.frames).toBe(3);
    reg.expectNoWarnings();
  });

  it("Fremd-Textur unter dem Key (kein Canvas): Key wird freigegeben und neu angelegt", () => {
    const reg = new FakeTextureRegistry();
    reg.mapSetForTest("chunk_2_2", { isCanvas: false, frames: 1, id: 99 });
    const res = acquireChunkCanvas(reg, "chunk_2_2", 1);
    expect(res.reused).toBe(false);
    expect((res.texture as { id: number }).id).toBeGreaterThan(0);
    reg.expectNoWarnings();
  });

  it("dropPooled wird beim Wieder-/Entfern-Kontakt gerufen — Pool vergibt die aktive Textur nicht doppelt", () => {
    const reg = new FakeTextureRegistry();
    const dropped: string[] = [];
    acquireChunkCanvas(reg, "chunk_1_1", 1);
    acquireChunkCanvas(reg, "chunk_1_1", 1, (key) => dropped.push(key));
    expect(dropped).toEqual(["chunk_1_1"]);
    reg.expectNoWarnings();
  });
});
