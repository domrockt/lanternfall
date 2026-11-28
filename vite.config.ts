import { defineConfig } from "vite";

// Lane m10-bundle-chunk-fix (Befund E-3, docs/lanes/m10-acceptance-refresh-e.md):
// Der Build lief bisher als ein einziger Chunk (~1,95 MB: Phaser-Engine + Spielcode)
// und warf die Vite-Warnung "> 500 kB". Diese Konfiguration trennt NUR die
// Phaser-Engine in einen eigenen Vendor-Chunk ab und den prozeduralen
// Sprite-Generator-Code (src/gfx/gen-*.ts) in einen zweiten Chunk; der Rest des
// Spielcodes bleibt als kleiner Applikations-Chunk zusammen.
//
// chunkSizeWarningLimit: Phaser ist als einziges Paket ein einzelnes, vorgebundenes
// Modul (~1,19 MB) und ohne Abhängigkeits-Änderungen nicht unter 500 kB teilbar.
// Der Limit-Aufschlag deckt AUSSCHLIESSLICH diesen Vendor-Chunk ab; alle
// Spielcode-Chunks bleiben < 500 kB (Guard-Test: tests/bundle-chunks.test.ts).
// Bewusst minimal gehalten: kein dynamisches import(), keine Änderung an
// index.html oder Asset-Pfaden (--base ./ bleibt im build-Skript), damit der
// Android-APK-Preview-Pfad unverändert funktioniert.
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1250,
    rolldownOptions: {
      output: {
        advancedChunks: {
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
