#!/usr/bin/env node
// M6-Abnahme A3: Inhaltszaehlung automatisch aus src/data (kein Handzaehlen).
// Laedt die TS-Daten ueber Vites SSR-Modul-Loader und gibt die Laengen aus.
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const data = await server.ssrLoadModule("/src/data/index.ts");
  const counts = {
    enemies: Object.keys(data.ENEMIES).length,
    weapons: Object.keys(data.WEAPONS).length,
    powerups: Object.keys(data.PASSIVES).length,
    evolutions: data.EVOLUTIONS.length,
    bosses: data.BOSSES.length,
    characters: Object.keys(data.CHARACTERS).length,
  };
  const expected = { enemies: 30, weapons: 6, powerups: 6, evolutions: 6, bosses: 6, characters: 2 };
  const ok = Object.keys(expected).every((k) => counts[k] === expected[k]);
  console.log(JSON.stringify({ ok, counts, expected }, null, 2));
  process.exitCode = ok ? 0 : 1;
} finally {
  await server.close();
}
