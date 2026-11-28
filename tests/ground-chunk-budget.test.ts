// M10-ground-chunk-budget (#12436/#12437): reine Helfer des Chunk-Budget-Fixes.
// (a) poolPick/poolStore — Canvas-Textur-Pool des GroundRenderer (Klassen-Schluessel
//     = Animationsstufen-Zahl, Cap je Klasse, LIFO) gegen Allokations-/Upload-Spikes.
// (b) chunkInstallGate — Frame-Budget-Gate: ueberlastete Frames schieben den
//     Chunk-Install in nachfolgende Frames, aber nie laenger als max. Defer-Frames
//     (Stillstands-Schutz). Reihenfolge (naechstgelegener Chunk zuerst) bleibt
//     unangetastet — das Gate entscheidet nur OB, nicht WELCHER.
import { describe, expect, it } from "vitest";
// GroundRenderer importiert Phaser; die getesteten Helfer sind rein.
import { vi } from "vitest";
vi.mock("phaser", () => ({ default: {} }));
import {
  CHUNK_INSTALL_FRAME_BUDGET_MS,
  CHUNK_INSTALL_MAX_DEFER_FRAMES,
  CHUNK_INSTALL_MIN_INTERVAL_MS,
  CHUNK_TEXTURE_POOL_CAP_PER_CLASS,
  chunkInstallDue,
  chunkInstallGate,
  poolPick,
  poolStore,
  type PooledChunkTexture,
} from "../src/gfx/GroundRenderer";

describe("poolPick/poolStore (Canvas-Textur-Pool)", () => {
  it("leerer Pool liefert null (erzeugt neue Textur)", () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    expect(poolPick(pool, 1)).toBeNull();
    expect(poolPick(pool, 3)).toBeNull();
  });

  it("Wiederverwendung nur passender Klasse (Land 1 Stufe, Wasser 3 Stufen)", () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    poolStore(pool, { key: "chunk_1_2", frames: 1 });
    expect(poolPick(pool, 3)).toBeNull(); // Wasser-Chunks bekommen keine Land-Textur
    expect(poolPick(pool, 1)?.key).toBe("chunk_1_2");
    expect(poolPick(pool, 1)).toBeNull(); // entnommen
  });

  it("LIFO: zuletzt gepoolte Textur wird zuerst wiederverwendet", () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    poolStore(pool, { key: "chunk_a", frames: 3 });
    poolStore(pool, { key: "chunk_b", frames: 3 });
    expect(poolPick(pool, 3)?.key).toBe("chunk_b");
    expect(poolPick(pool, 3)?.key).toBe("chunk_a");
  });

  it(`Cap ${CHUNK_TEXTURE_POOL_CAP_PER_CLASS} je Klasse: Ueberschuss wird verworfen (false) — kein unbegrenzter Speicher`, () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    for (let i = 0; i < CHUNK_TEXTURE_POOL_CAP_PER_CLASS; i++) {
      expect(poolStore(pool, { key: `chunk_${i}`, frames: 1 })).toBe(true);
    }
    expect(poolStore(pool, { key: "chunk_ueberlauf", frames: 1 })).toBe(false);
    expect(pool.get(1)!.length).toBe(CHUNK_TEXTURE_POOL_CAP_PER_CLASS);
    // Verworfene Textur ist NICHT im Pool — der Aufrufer (GroundRenderer) ruft
    // dann textures.remove() auf, damit der Key frei bleibt (kein Leak).
    expect(pool.get(1)!.some((e) => e.key === "chunk_ueberlauf")).toBe(false);
  });

  it("Klassen werden getrennt gepoolt (1 und 3 Stufen unabhaengig)", () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    poolStore(pool, { key: "chunk_land", frames: 1 });
    poolStore(pool, { key: "chunk_wasser", frames: 3 });
    expect(poolPick(pool, 1)?.key).toBe("chunk_land");
    expect(poolPick(pool, 3)?.key).toBe("chunk_wasser");
  });

  it("Pool-Zyklus erhält KEINEN Key doppelt (Store nach Pick ist ein anderes Objekt)", () => {
    const pool = new Map<number, PooledChunkTexture[]>();
    poolStore(pool, { key: "chunk_x", frames: 1 });
    const picked = poolPick(pool, 1);
    expect(picked?.key).toBe("chunk_x");
    poolStore(pool, { key: "chunk_y", frames: 1 });
    expect(poolPick(pool, 1)?.key).toBe("chunk_y");
    expect(poolPick(pool, 1)).toBeNull();
  });
});

describe("chunkInstallGate (Frame-Budget, Stillstands-Schutz)", () => {
  const BUDGET = CHUNK_INSTALL_FRAME_BUDGET_MS;
  const MAXDEF = CHUNK_INSTALL_MAX_DEFER_FRAMES;

  it("kein fertiger Chunk -> kein Install, Defer-Zaehler unveraendert", () => {
    expect(chunkInstallGate(0, 1000, 5, 0)).toEqual({ install: false, defers: 0 });
    expect(chunkInstallGate(0, 1000, BUDGET + 10, 2)).toEqual({ install: false, defers: 2 });
  });

  it("Steady-State (1 Chunk) bleibt sofort, solange kein Budget-Druck liegt", () => {
    expect(chunkInstallGate(1, 0, 16.7, 0)).toEqual({ install: true, defers: 0 });
    expect(chunkInstallGate(1, 5000, 16.7, 2)).toEqual({ install: true, defers: 0 });
  });

  it("Budget-UEberschreitung schiebt den Install in nachfolgende Frames (auch Steady-State)", () => {
    expect(chunkInstallGate(1, 0, BUDGET + 1, 0)).toEqual({ install: false, defers: 1 });
    expect(chunkInstallGate(3, 0, BUDGET + 1, 1)).toEqual({ install: false, defers: 2 });
  });

  it(`Stillstands-Schutz: nach ${CHUNK_INSTALL_MAX_DEFER_FRAMES} Defer-Frames wird erzwingend installiert`, () => {
    // defers == MAX -> auch bei Budget-UEberschreitung installieren (defers zurueck auf 0)
    expect(chunkInstallGate(1, 0, BUDGET + 100, MAXDEF)).toEqual({ install: true, defers: 0 });
    // defers > MAX ebenfalls (Robustheit)
    expect(chunkInstallGate(2, 0, BUDGET + 100, MAXDEF + 5)).toEqual({ install: true, defers: 0 });
  });

  it("Rueckstau ohne Budget-Druck: 12-ms-Mindestabstand wie bisher (chunkInstallDue-Semantik)", () => {
    expect(chunkInstallGate(3, CHUNK_INSTALL_MIN_INTERVAL_MS - 1, 16.7, 0)).toEqual({ install: false, defers: 0 });
    expect(chunkInstallGate(3, CHUNK_INSTALL_MIN_INTERVAL_MS, 16.7, 0)).toEqual({ install: true, defers: 0 });
    // Identisch zum bisherigen Gate:
    expect(chunkInstallGate(3, 0, 16.7, 0).install).toBe(chunkInstallDue(3, 0));
  });

  it("Der Gate verschluckt keinen Chunk: jedes 'install:false' mit Backlog wird spaeter installiert", () => {
    // Simulation: 6 fertige Chunks, jedes 2. Frame ueberlastet — nach endlich
    // vielen Frames ist der Rueckstau komplett abgebaut (kein Stillstand).
    let backlog = 6;
    let defers = 0;
    let installed = 0;
    let msSince = 1000;
    for (let frame = 0; frame < 60 && backlog > 0; frame++) {
      const dt = frame % 2 === 0 ? BUDGET + 20 : 16.7; // jedes 2. Frame ueberlastet
      const gate = chunkInstallGate(backlog, msSince, dt, defers);
      defers = gate.defers;
      if (gate.install) {
        installed++;
        backlog--;
        msSince = 0;
      } else {
        msSince += 16.7;
      }
    }
    expect(backlog).toBe(0);
    expect(installed).toBe(6);
  });

  it("Budget ist bewusst knapp ueber dem 60-Hz-Frame (16,7 ms) und unter dem Spike-Niveau (33 ms)", () => {
    expect(BUDGET).toBeGreaterThan(16.7);
    expect(BUDGET).toBeLessThan(33);
  });
});
