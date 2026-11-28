import { defineConfig } from "vite";
import { execSync } from "node:child_process";

// Lane m10-device-telemetry (K1): Build-ID (Commit-Hash + Zeit) als globales
// Define, damit Telemetry-Samples jeden Lauf einem Build zuordnen koennen.
// Additiv und ohne Auswirkung auf Chunks/Assets; "dev", wenn git nicht greift.
let lfBuild = "dev";
try {
  const commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString().trim();
  lfBuild = `${commit} ${new Date().toISOString()}`;
} catch { /* kein git (z. B. Export) */ }


// Lane m10-bundle-split (Befund E-3, docs/lanes/m10-acceptance-refresh-e.md):
// Diese Konfiguration trennt NUR die Phaser-Engine in einen eigenen Vendor-Chunk
// ab und den prozeduralen Sprite-Generator-Code (src/gfx/gen-*.ts) in einen
// zweiten Chunk; der Rest des Spielcodes bleibt als kleiner Applikations-Chunk
// zusammen.
//
// chunkSizeWarningLimit: Phaser ist als einziges Paket ein einzelnes, vorgebundenes
// Modul (~1,19 MB) und ohne Abhängigkeits-Änderungen nicht unter 500 kB teilbar.
// Der Limit-Aufschlag deckt AUSSCHLIESSLICH diesen Vendor-Chunk ab; alle
// Spielcode-Chunks bleiben < 500 kB (Guard-Test: tests/bundle-chunks.test.ts).
// Bewusst minimal gehalten: kein dynamisches import(), keine Änderung an
// index.html oder Asset-Pfaden (--base ./ bleibt im build-Skript), damit der
// Android-APK-Preview-Pfad unverändert funktioniert.
//
// K2 (#11659): advancedChunks → codeSplitting migriert (gleiche Gruppen,
// gleiche Semantik) — Rolldown warnt seit v8 "advancedChunks option is
// deprecated, please use codeSplitting instead"; damit ist der Build jetzt
// komplett warnfrei (Belege: ~/games/.evidence/m10-bundle-split/*.json).
export default defineConfig({
  define: {
    __LF_BUILD__: JSON.stringify(lfBuild),
  },
  build: {
    chunkSizeWarningLimit: 1250,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "phaser",
              test: /[\\/]node_modules[\\/]phaser[\\/]/,
              priority: 2,
            },
            {
              name: "gfx",
              test: /[\\/]src[\\/]gfx[\\/]/,
              priority: 1,
            },
            {
              name: "sprites",
              test: /[\\/]src[\\/]gfx[\\/]gen-(title|bosses|enemies|fx|chars|props)\.ts/,
              priority: 3,
            },
          ],
        },
      },
    },
  },
});
