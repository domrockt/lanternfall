import { describe, expect, it } from "vitest";
import { needsChunkRedraw, type ChunkRedrawState } from "../src/gfx/groundRedraw";

const base = (): ChunkRedrawState => ({ minCx: 2, maxCx: 5, minCy: 3, maxCy: 6, version: 10 });

describe("M10-ground-cost: needsChunkRedraw", () => {
  it("zeichnet beim ersten Frame (kein Cache)", () => {
    expect(needsChunkRedraw(null, base())).toBe(true);
  });

  it("kein Redraw, solange Ausschnitt und Chunk-Version unveraendert sind", () => {
    expect(needsChunkRedraw(base(), base())).toBe(false);
    // Neues Objekt mit gleichen Werten darf ebenfalls keinen Redraw ausloesen.
    const copy = { ...base() };
    expect(needsChunkRedraw(base(), copy)).toBe(false);
  });

  it("invalidiert bei Dirty-Chunk (Version steigt: Chunk gebaut/freigegeben)", () => {
    const next = { ...base(), version: 11 };
    expect(needsChunkRedraw(base(), next)).toBe(true);
  });

  it("invalidiert bei Seam-/Nahtwechsel in jeder Achse", () => {
    expect(needsChunkRedraw(base(), { ...base(), minCx: 3 })).toBe(true);
    expect(needsChunkRedraw(base(), { ...base(), maxCx: 6 })).toBe(true);
    expect(needsChunkRedraw(base(), { ...base(), minCy: 4 })).toBe(true);
    expect(needsChunkRedraw(base(), { ...base(), maxCy: 7 })).toBe(true);
  });

  it("kein Redraw bei unveraenderter Nachbarschaft trotz gleicher Version", () => {
    const left = { minCx: 2, maxCx: 5, minCy: 3, maxCy: 6, version: 42 };
    const right = { minCx: 2, maxCx: 5, minCy: 3, maxCy: 6, version: 42 };
    expect(needsChunkRedraw(left, right)).toBe(false);
  });
});
