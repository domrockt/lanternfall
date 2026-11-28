#!/usr/bin/env node
// m10-audio-music-dawn: Uebergangs-Matrix der Musik-Umschaltung (Titel/Run/Boss/
// Morgendaemmerung-Sieg) x Master-Mute x Reload.
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Es nutzt die ECHTE
// AudioSystem-Klasse aus src/audio/AudioSystem.ts (per --experimental-strip-types)
// mit einem Stub-Game: jedes `game.sound.add/play/stop/destroy` wird als Ereignis
// geloggt. Daraus werden pro SzenezaENARIO gemessen:
//   - maxLiveMusic: max. gleichzeitig lebende Musik-Sounds (Dopplerton => >1)
//   - startBeforeStop: neuer Musik-Start, bevor der alte gestoppt war (Knackser)
//   - redundantRestarts: setMusic(sky=gleiche Stufe) legt den Sound neu an (Glitch)
//   - silentTrackSteps: musicTrack != "none", aber kein Musik-Sound lebt und
//     nicht gemutet (Musik "weg", State luegt)
//   - stuckAfterUnmute: nach Unmute spielt die gemutete Stufe nicht wieder
//   - Chaos (Boss + 500-Gegner-Naehe): SFX-Flood + Musik-Wechsel parallel;
//     Mixer-Voices <= MAX_TOTAL_VOICES, Musik frisst kein SFX-Budget
//
// Akzeptanzgrenzen (VOR der Messung festgelegt, siehe docs/lanes/m10-audio-music-dawn.md):
//   maxLiveMusic <= 1, startBeforeStop = 0, redundantRestarts = 0,
//   stuckAfterUnmute = false, chaos: voices <= 12 && musicDouble = 0,
//   muted: 0 Musik-Starts && SFX geblockt (A7-Kriterien sfxPlayed/voices/musicTrack).
//
// Aufruf: node scripts/m10-music-dawn.mjs --out shots/m10-music-dawn-before.json
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const TMP = join(homedir(), "tmp", "m10-music-dawn");

/** Loader-Hook: extensionless TS-Imports auflösen + phaser stubben. */
function ensureHook() {
  mkdirSync(TMP, { recursive: true });
  const hook = `
import { pathToFileURL } from "node:url";
const phaserStub = pathToFileURL(${JSON.stringify(join(TMP, "phaser-stub.mjs"))}).href;
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "phaser") return { url: phaserStub, shortCircuit: true };
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.[tj]s$/.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
  // AudioSystem nutzt Phaser nur zur Laufzeit über game.sound (Stub); der
  // Default-Import wird nie dereferenziert.
  writeFileSync(join(TMP, "phaser-stub.mjs"), "export default {};\n");
  writeFileSync(join(TMP, "lf-hook.mjs"), hook);
  return pathToFileURL(join(TMP, "lf-hook.mjs")).href;
}

// Node < 22.18 braucht das Flag zum Typ-Stripping fuer den AudioSystem-Import.
if (!process.execArgv.some((a) => a.includes("experimental-strip-types"))) {
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", self, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}
if (!process.env.LF_MUSIC_DAWN_HOOK) {
  const hookUrl = ensureHook();
  const r = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--experimental-loader", hookUrl, process.argv[1], ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, LF_MUSIC_DAWN_HOOK: "1" } },
  );
  process.exit(r.status ?? 1);
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
const OUT = arg("out", "shots/m10-music-dawn-before.json");

const { AudioSystem, MUSIC_KEYS } = await import("../src/audio/AudioSystem.ts");
const { SFX_KEYS, MAX_TOTAL_VOICES, SFX_CONFIG } = await import("../src/audio/mixing.ts");

// --- Stub-Game: loggt alle Sound-Ereignisse ---------------------------------
/** WAV-Dauern (Sekunden) aus public/sfx lesen — der Stub endet wie das echte WAV. */
function readDuration(file) {
  const buf = readFileSync(`public/sfx/${file}`);
  if (buf.toString("ascii", 0, 4) !== "RIFF") return undefined;
  let offset = 12;
  let sr = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const len = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") sr = buf.readUInt32LE(offset + 12);
    else if (id === "data") return sr > 0 ? len / 2 / sr : undefined;
    offset += 8 + len + (len % 2);
  }
  return undefined;
}
const DURATIONS = {};
for (const key of Object.values(SFX_KEYS)) DURATIONS[key] = readDuration(`${key}.wav`);

function makeHarness() {
  const events = [];
  const clock = { t: 0 };
  const pending = []; // geplante complete-Ereignisse { at, key, fire }
  const game = {
    sound: {
      add(key) {
        events.push({ ev: "add", key, at: clock.t });
        const listeners = {};
        const sound = {
          key,
          volume: 0,
          setVolume(v) { this.volume = v; },
          play() {
            events.push({ ev: "play", key, at: clock.t });
            const dur = DURATIONS[key];
            if (dur !== undefined && !key.startsWith("music_")) {
              const at = clock.t + dur;
              pending.push({
                at,
                key,
                fire: () => {
                  events.push({ ev: "complete", key, at: clock.t });
                  listeners.complete?.();
                },
              });
            }
            return true;
          },
          stop() { events.push({ ev: "stop", key, at: clock.t }); },
          destroy() { events.push({ ev: "destroy", key, at: clock.t }); },
          once(ev, fn) { listeners[ev] = fn; },
        };
        return sound;
      },
    },
  };
  // Faellige complete-Ereignisse feuern (Voices geben sich frei wie im Spiel).
  const fireCompletions = () => {
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= clock.t) {
        const p = pending.splice(i, 1)[0];
        p.fire();
      }
    }
  };
  return { audio: new AudioSystem(game), events, clock, fireCompletions };
}

const isMusic = (key) => Object.values(MUSIC_KEYS).includes(key);

/** Spielt die Ereignis-Log durch und berechnet die Musik-Metriken. */
function analyze(events) {
  const live = []; // lebende Musik-Sounds (key + Startzeit)
  let maxLiveMusic = 0;
  let startBeforeStop = 0;
  let musicStarts = 0;
  let musicStops = 0;
  for (const e of events) {
    if (!isMusic(e.key)) continue;
    if (e.ev === "play") {
      musicStarts += 1;
      // Knackser-Quelle: ein zweiter Musik-Sound startet, waehrend noch einer lebt.
      if (live.length > 0) startBeforeStop += 1;
      live.push(e.key);
      maxLiveMusic = Math.max(maxLiveMusic, live.length);
    } else if (e.ev === "destroy" || e.ev === "stop") {
      if (e.ev === "destroy") musicStops += 1;
      const i = live.indexOf(e.key);
      if (i >= 0) live.splice(i, 1);
    }
  }
  return { maxLiveMusic, startBeforeStop, musicStarts, musicStops };
}

/** Szenario durchlaufen; nach jedem Schritt Zustand + Live-Musik zaehlen. */
function runScenario(steps, { mutedFromStart = false } = {}) {
  const h = makeHarness();
  let step = 0;
  let redundantRestarts = 0;
  let silentTrackSteps = 0;
  let stuckAfterUnmute = false;
  if (mutedFromStart) h.audio.setMuted(true);
  const liveCount = () => {
    const live = new Set();
    for (const e of h.events) {
      if (!isMusic(e.key)) continue;
      if (e.ev === "play") live.add(e.key);
      if (e.ev === "destroy") live.delete(e.key);
    }
    return live.size;
  };
  for (const s of steps) {
    step += 1;
    h.clock.t = step;
    const before = h.events.filter((e) => e.ev === "play" && isMusic(e.key)).length;
    if (s.op === "music") h.audio.setMusic(s.track);
    else if (s.op === "mute") h.audio.setMuted(true);
    else if (s.op === "unmute") h.audio.setMuted(false);
    else if (s.op === "stop") h.audio.stopMusic();
    else if (s.op === "play") h.audio.play(s.id);
    const after = h.events.filter((e) => e.ev === "play" && isMusic(e.key)).length;
    h.fireCompletions();
    const st = h.audio.debugState();
    const live = liveCount();
    // setMusic(sky=gleiche Stufe) hat einen neuen Sound angelegt => Glitch.
    if (s.op === "music" && st.musicTrack === s.track && after > before && s.repeat === true) {
      redundantRestarts += 1;
    }
    // State behauptet Musik, aber nichts lebt und nicht gemutet.
    if (st.musicTrack !== "none" && live === 0 && !st.muted) silentTrackSteps += 1;
    // Nach Unmute: erwartet, dass die gemerkte Stufe (falls gesetzt) wieder klingt.
    if (s.op === "unmute" && st.musicTrack !== "none") stuckAfterUnmute = live === 0;
  }
  return {
    ...analyze(h.events),
    redundantRestarts,
    silentTrackSteps,
    stuckAfterUnmute,
    finalState: h.audio.debugState(),
    events: h.events,
  };
}

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

// --- Szenarien (Uebergangs-Matrix) ------------------------------------------
// Titel -> Run -> Boss -> Run (Boss 1-4 tot) -> Morgendaemmerung/Sieg (stop+victory).
const dawnSteps = [
  { op: "music", track: "run" },
  { op: "music", track: "boss" },
  { op: "music", track: "run" },
  { op: "play", id: "victory" },
  { op: "stop" },
];

const scenarios = {};

// 1. Normaler Run mit Boss-Wechsel und Sieg, Master-Mute aus.
scenarios.matrix_unmuted = runScenario(dawnSteps);

// 2. dito mit Master-Mute an: 0 Musik-Starts, SFX geblockt (A7).
scenarios.matrix_muted = runScenario(
  [...dawnSteps.map((s) => (s.op === "play" ? { op: "play", id: "hit" } : s))],
  { mutedFromStart: true },
);

// 3. Wiederhol-Start derselben Stufe (z. B. erneutes Run-Betreten): No-op erwartet.
scenarios.repeat_same_track = runScenario([
  { op: "music", track: "run" },
  { op: "music", track: "run", repeat: true },
  { op: "music", track: "run", repeat: true },
  { op: "music", track: "boss" },
  { op: "music", track: "boss", repeat: true },
]);

// 4. Mute mitten im Run, dann Unmute: Musik muss zurueckkehren (naechster Schritt
// oder spaetestens bei erneutem setMusic derselben Stufe).
scenarios.mute_unmute_midrun = runScenario([
  { op: "music", track: "run" },
  { op: "mute" },
  { op: "unmute" },
  { op: "music", track: "run", repeat: true }, // Spiel ruft das NICHT auf -> Bug-Demo
]);

// 5. Reload mit persistiertem Mute (initAudio-Pfad), dann Matrix + Unmute.
scenarios.reload_muted = runScenario(
  [
    { op: "music", track: "run" },
    { op: "unmute" },
    { op: "music", track: "run", repeat: true },
    { op: "music", track: "boss" },
    { op: "mute" },
  ],
  { mutedFromStart: true },
);

// 6. Chaos: SFX-Flood (Boss + 500-Gegner-Naehe) mit Musik-Wechseln parallel.
{
  const h = makeHarness();
  const floodIds = ["ember", "frost", "storm", "hit", "kill", "xp"];
  // P3-Events wie im Spiel: selten (Boss-Warn/-Death/Sieg je einmal, gestaffelt).
  const p3Ids = ["levelup", "chest", "evolution", "bossWarn", "bossDeath", "victory", "defeat"];
  let voices = 0;
  let maxVoices = 0;
  let sfxPlayed = 0;
  const t0 = performance.now();
  const DUR_MS = 1500;
  let i = 0;
  const transitions = ["run", "boss", "run", "none"];
  let tIdx = 0;
  let k3 = 0;
  const { clock } = h;
  while (performance.now() - t0 < DUR_MS) {
    clock.t = performance.now() / 1000;
    h.audio.tick(clock.t * 1000);
    h.fireCompletions();
    h.audio.play(floodIds[i % floodIds.length]);
    if (i === 40 * k3 && k3 < p3Ids.length) { h.audio.play(p3Ids[k3]); k3 += 1; }
    if (i % 120 === 0 && tIdx < transitions.length) {
      h.audio.setMusic(transitions[tIdx]);
      tIdx += 1;
    }
    i += 1;
    const st = h.audio.debugState();
    voices = st.voices;
    maxVoices = Math.max(maxVoices, voices);
    sfxPlayed = st.sfxPlayed;
  }
  const musicEvents = h.events.filter((e) => isMusic(e.key));
  scenarios.chaos_500 = {
    ...analyze(h.events),
    iterations: i,
    maxMixerVoices: maxVoices,
    maxTotalVoicesAllowed: MAX_TOTAL_VOICES,
    sfxPlayed,
    finalState: h.audio.debugState(),
  };
}

// --- Bericht -----------------------------------------------------------------
const gates = {
  maxLiveMusic: "<= 1",
  startBeforeStop: "= 0",
  redundantRestarts: "= 0",
  stuckAfterUnmute: "false",
  chaosVoices: `<= ${MAX_TOTAL_VOICES} + 1 (P3-Bypass, wie tests/audio-mix-chaos)`,
  mutedMusicStarts: "= 0",
};

const fail = (cond, label) => (cond ? [] : [label]);
const failures = [
  ...fail(scenarios.matrix_unmuted.maxLiveMusic <= 1, "matrix_unmuted: Doppel-Musik-Sound"),
  ...fail(scenarios.matrix_unmuted.startBeforeStop === 0, "matrix_unmuted: Start vor Stop (Knackser)"),
  ...fail(scenarios.repeat_same_track.redundantRestarts === 0, "repeat_same_track: Wiederhol-Start legt neu an"),
  ...fail(scenarios.mute_unmute_midrun.stuckAfterUnmute === false, "mute_unmute_midrun: Musik nach Unmute weg (stuck)"),
  ...fail(scenarios.reload_muted.stuckAfterUnmute === false, "reload_muted: Musik nach Unmute weg (stuck)"),
  ...fail(scenarios.matrix_muted.musicStarts === 0, "matrix_muted: Musik startet trotz Mute"),
  ...fail(scenarios.matrix_muted.finalState.sfxPlayed === 0, "matrix_muted: SFX trotz Mute (A7)"),
  ...fail(scenarios.chaos_500.maxMixerVoices <= MAX_TOTAL_VOICES + 1, "chaos_500: Mixer-Voice-Budget ueberschritten (ohne P3-Bypass)"),
  ...fail(scenarios.chaos_500.maxLiveMusic <= 1, "chaos_500: Doppel-Musik-Sound im Chaos"),
];

const report = {
  schema: "m10-audio-music-dawn/v1",
  generatedAt: new Date().toISOString(),
  method: "Echte AudioSystem-Klasse (Node --experimental-strip-types) mit Stub-Game; Ereignis-Log add/play/stop/destroy je Szenario",
  gates,
  scenarios: {},
  pass: failures.length === 0,
  failures,
};
for (const [name, s] of Object.entries(scenarios)) {
  const { events, ...rest } = s;
  report.scenarios[name] = rest;
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`# m10-music-dawn -> ${OUT}`);
for (const [name, s] of Object.entries(report.scenarios)) {
  console.log(
    `${name}: maxLiveMusic=${s.maxLiveMusic} startBeforeStop=${s.startBeforeStop} ` +
      `restarts=${s.redundantRestarts ?? 0} silentTrackSteps=${s.silentTrackSteps ?? 0} ` +
      `stuckAfterUnmute=${s.stuckAfterUnmute ?? "-"} starts=${s.musicStarts}`,
  );
}
console.log(`chaos_500: maxMixerVoices=${scenarios.chaos_500.maxMixerVoices}/${MAX_TOTAL_VOICES} sfxPlayed=${scenarios.chaos_500.sfxPlayed}`);
console.log(`PASS=${report.pass}${failures.length ? " -> " + failures.join("; ") : ""}`);
process.exit(0); // Messskript: FAILs stehen im JSON, kein Exit-Code-Abbruch.
