/**
 * Lane m10-bundle-chunk-fix (Befund E-3, docs/lanes/m10-acceptance-refresh-e.md).
 *
 * Guard gegen die Chunk-Groessenwarnung des Produktions-Builds:
 * - `vite build` darf keine "larger than 500 kB"-Warnung mehr ausgeben,
 * - jeder Chunk aus SPIELCODE (index, sprites, gfx) bleibt < 500 kB,
 * - der Phaser-Vendor-Chunk bleibt unter dem in vite.config.ts gesetzten
 *   chunkSizeWarningLimit (1250 kB) — sonst waere die Warnung nur verschoben.
 *
 * Der Test baut selbst (vite build, kein tsc — der Typecheck laeuft separat),
 * damit der Guard den echten Build-Output prueft und nicht einen alten
 * dist-Stand. Zulaessige Ausnahme ist nur der phaser-Chunk (einzelnes,
 * vorgebundenes Modul; siehe Kommentar in vite.config.ts).
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt sie bereit.
import { execFileSync } from "node:child_process";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt sie bereit.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Chunks, die aus dem Spielcode bestehen — hartes 500-kB-Limit. */
const GAME_CHUNKS_UNDER_500 = /^(index|sprites|gfx|terrainWorker)-/;
/** Vendor-Ausnahme: Name + Limit aus vite.config.ts (Guard schlaegt bei Drift an). */
const VENDOR_LIMIT_KB = 1250;

describe("bundle chunks (E-3 Guard)", () => {
  let buildOutput = "";
  const chunkKb: Array<{ file: string; kb: number }> = [];

  it("baut ohne Chunk-Groessenwarnung", { timeout: 120_000 }, () => {
    buildOutput = execFileSync("npx", ["vite", "build", "--base", "./"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    expect(buildOutput).not.toMatch(/larger than 500 kB/);
    expect(buildOutput).not.toMatch(/Some chunks are larger/);
  });

  it("alle Spielcode-Chunks < 500 kB, Phaser-Chunk < chunkSizeWarningLimit", () => {
    const assets = readdirSync("dist/assets");
    for (const f of assets) {
      if (!f.endsWith(".js")) continue;
      const kb = statSync(`dist/assets/${f}`).size / 1024;
      chunkKb.push({ file: f, kb: Math.round(kb * 100) / 100 });
    }
    expect(chunkKb.length).toBeGreaterThan(2);
    for (const { file, kb } of chunkKb) {
      if (file.startsWith("phaser-")) {
        expect(kb, `Vendor-Chunk ${file} ueber chunkSizeWarningLimit`).toBeLessThan(VENDOR_LIMIT_KB);
      } else if (GAME_CHUNKS_UNDER_500.test(file)) {
        expect(kb, `Spielcode-Chunk ${file} ueber 500 kB`).toBeLessThan(500);
      }
    }
    expect(chunkKb.some((c) => c.file.startsWith("phaser-"))).toBe(true);
  });

  it("index.html referenziert die Chunks relativ (Android-APK-Preview-Pfad bleibt intakt)", () => {
    const html = readFileSync("dist/index.html", "utf8");
    expect(html).not.toMatch(/src="\/assets\//);
    expect(html).toMatch(/src="\.\/assets\//);
  });
});
