#!/usr/bin/env node
// m10-powerup-sfx-wire: Beleg, dass der Powerup-Aufnahme-Moment einen SFX ausloest.
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Laedt PickupSystem.ts
// ueber Vites SSR-Modul-Loader; phaser/gfx-Module sind Stub, src/audio/AudioSystem
// ist ein zaehlender Stub (die WAV-/Mixing-Dateien sind von m10-pickup-sfx-distinct
// geclaimed und werden hier NICHT angefasst). SFX_KEYS wird ebenfalls gestubbt und
// enthaelt "powerup" — das bildet den Stand NACH dem Merge der sfx-distinct-Lane ab.
//
// Metrik: Anzahl der getAudio().play(id)-Calls,
//   - bei playPowerupMoment("boots")  -> Ziel 1 (id "powerup"),
//   - bei playPowerupMoment(<unbekannt>) -> Ziel 0 (kein spec, kein Sound),
//   - ohne Erwerb (nur Konstruktion)   -> Ziel 0.
//
// Aufruf: node scripts/m10-powerup-sfx-wire.mjs --out <pfad.json>
import { createServer } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
const OUT = arg("out", "");

/** Vite-Plugin: ersetzt Phaser und die geclaimten/schweren Module durch Stubs. */
function stubPlugin() {
  const VIRT = "\0powerup-sfx-wire-stub:";
  const stubs = {
    phaser: `const Phaser = { BlendModes: { NORMAL: 0, ADD: 1 } };\nexport default Phaser;`,
    atlas: `export const applyTexture = () => {};\nexport const makeImage = (scene, x, y, key) => ({\n  key, active: true, setDepth() { return this; }, setScale() { return this; },\n  setAlpha() { return this; }, setTintFill() { return this; }, clearTint() { return this; },\n  setPosition() { return this; }, setVisible() { return this; }, setActive() { return this; },\n  destroy() { this.active = false; },\n});`,
    icons: `export const iconKeyForOffer = (kind, id) => \`icon_\${kind}_\${id}\`;`,
    // Zaehlender Audio-Stub — bildet getAudio().play(id) ab, ohne src/audio zu laden.
    // SFX_KEYS = Stand nach Merge der sfx-distinct-Lane (Key "powerup" vorhanden).
    audio: `const calls = [];\nif (typeof globalThis !== "undefined") globalThis.__powerupSfxCalls = calls;\nexport const SFX_KEYS = { hit: "sfx_hit", levelup: "sfx_levelup", powerup: "sfx_powerup" };\nexport function getAudio() {\n  return { play(id) { calls.push(id); return true; } };\n}`,
    // SFX_KEYS-Stand nach Merge der sfx-distinct-Lane (Key "powerup" vorhanden).
    mixing: `export const SFX_KEYS = { hit: "sfx_hit", levelup: "sfx_levelup", powerup: "sfx_powerup" };`,
  };
  return {
    name: "powerup-sfx-wire-stubs",
    enforce: "pre",
    resolveId(id) {
      if (id in stubs) return VIRT + id;
      if (/(^|\/)gfx\/atlas$/.test(id)) return VIRT + "atlas";
      if (/(^|\/)gfx\/icons$/.test(id)) return VIRT + "icons";
      if (/(^|\/)audio\/AudioSystem$/.test(id)) return VIRT + "audio";
      if (/(^|\/)audio\/mixing$/.test(id)) return VIRT + "mixing";
      return null;
    },
    load(id) {
      if (id.startsWith(VIRT)) return stubs[id.slice(VIRT.length)];
      return null;
    },
  };
}

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
  plugins: [stubPlugin()],
});
try {
  globalThis.__powerupSfxCalls = [];
  const mod = await server.ssrLoadModule("/src/systems/PickupSystem.ts");
  const graphics = () => ({
    active: true, setDepth() { return this; }, clear() { return this; },
    lineStyle() { return this; }, strokeRect() { return this; }, strokeCircle() { return this; },
    destroy() { this.active = false; },
  });
  const sys = new mod.PickupSystem({ add: { graphics } }); // add truthig -> Moment wird angelegt

  const callsOf = () => globalThis.__powerupSfxCalls.slice();
  const steps = [];
  const step = (name, before, after) => steps.push({ name, callsBefore: before.length, callsAfter: after.length, added: after.slice(before.length) });

  let calls = callsOf();
  sys.playPowerupMoment("boots", 100, 100);
  let now = callsOf();
  step("moment_boots", calls, now);
  calls = now;

  sys.playPowerupMoment("tome", 100, 100);
  now = callsOf();
  step("moment_tome", calls, now);
  calls = now;

  sys.playPowerupMoment("gibt_es_nicht", 100, 100);
  now = callsOf();
  step("moment_unknown_id", calls, now);
  calls = now;

  // Momente wieder freigeben (Objekt-Stubs, kein Phaser).
  sys.clearMoments();

  const byId = {};
  for (const id of globalThis.__powerupSfxCalls) byId[id] = (byId[id] ?? 0) + 1;
  const result = {
    lane: "m10-powerup-sfx-wire",
    metric: "getAudio().play-Calls durch playPowerupMoment()",
    steps,
    totalCalls: globalThis.__powerupSfxCalls.length,
    byId,
    // Ziel (nach Fix): je gueltigem Moment genau 1 Call id="powerup", unbekannte id 0.
    ok: byId.powerup === 2 && byId.gibt_es_nicht === undefined,
  };
  console.log(JSON.stringify(result, null, 2));
  if (OUT) {
    const path = resolve(OUT);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...result, out: path }, null, 2));
    console.error(`geschrieben: ${path}`);
  }
  process.exitCode = result.ok ? 0 : 1;
} finally {
  await server.close();
}
