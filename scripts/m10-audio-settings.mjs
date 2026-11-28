#!/usr/bin/env node
// M10-audio-settings-guard: Runtime-Probe des Audio-Einstellungspfads.
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Es nutzt die ECHTE
// settings.ts/options.ts-Logik (per --experimental-strip-types). Jede Phase
// laeuft in einem eigenen Kindprozess = frisches Modul = echter "Reload";
// localStorage wird per StorageLike-Shim ueber eine JSON-Datei simuliert
// (gleicher getItem/setItem-Vertrag wie window.localStorage).
//
// Probiert werden: Defaults bei leerem Storage, Setzen + Clamping im Speicher,
// Persistenz-Roundtrip (Reload), korrupte Payload, out-of-range-Payload,
// direkte setSettings()-Aufrufe mit NaN/partial Payload (Konsumenten-Sicht),
// Junk-Schluessel via changeSetting, Master-Mute-Bit.
//
// Aufruf: node scripts/m10-audio-settings.mjs --out shots/m10-audio-settings-before.json --label before
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Node < 22.18 braucht das Flag zum Typ-Stripping fuer den settings.ts-Import.
if (!process.execArgv.some((a) => a.includes("experimental-strip-types"))) {
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", self, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const OUT = arg("out", "shots/m10-audio-settings-before.json");
const LABEL = arg("label", "before");
const PHASE = arg("phase", "");
// Storage-Shim-Datei (Temp, kein Repo-Hilfsordner).
const TMPDIR = path.join(tmpdir(), "m10-audio-settings-guard");
const STORE = arg("store", path.join(TMPDIR, `store-${process.pid}.json`));

// ---- Kindprozess: eine Phase ausfuehren und ein JSON-Objekt nach stdout ----
if (PHASE) {
  // WICHTIG: Shim VOR dem Modul-Import injizieren — settings.ts laedt die
  // Optionen beim Import (Modul-Level `loadOptions(storage())`).
  const shim = {
    getItem: (k) => {
      try {
        const raw = readFileSync(STORE, "utf8");
        const data = JSON.parse(raw);
        return k in data ? data[k] : null;
      } catch {
        return null;
      }
    },
    setItem: (k, v) => {
      let data = {};
      try { data = JSON.parse(readFileSync(STORE, "utf8")); } catch { data = {}; }
      data[k] = v;
      mkdirSync(path.dirname(STORE), { recursive: true });
      writeFileSync(STORE, JSON.stringify(data));
    },
  };
  // settings.ts liest window.localStorage — im Shim-Kontext injecten wir via
  // globalThis.window (Node hat kein window; settings.storage() faengt das ab).
  globalThis.window = { localStorage: shim };

  const { getSettings, setSettings, changeSetting, resetSettings, onSettingsChanged } =
    await import("../src/audio/settings.ts");
  const { DEFAULT_OPTIONS } = await import("../src/audio/options.ts");

  const full = (o) => ({
    music: o.music, sfx: o.sfx, shake: o.shake,
    damageNumbers: o.damageNumbers, muted: o.muted, scale: o.scale,
  });
  const junkKeys = (o) => Object.keys(o).filter((k) => !(k in DEFAULT_OPTIONS));

  switch (PHASE) {
    case "defaults": {
      rmSync(STORE, { force: true });
      const g = getSettings();
      console.log(JSON.stringify({
        phase: "defaults",
        settings: full(g),
        equalsDefaults: JSON.stringify(full(g)) === JSON.stringify(DEFAULT_OPTIONS),
      }));
      break;
    }
    case "set-clamp": {
      rmSync(STORE, { force: true });
      const events = [];
      onSettingsChanged((o) => events.push(full(o)));
      const afterMusic = full(changeSetting("music", 1.7));
      const afterSfx = full(changeSetting("sfx", -3));
      const afterScale = full(changeSetting("scale", 9));
      const afterMute = full(changeSetting("muted", true));
      const stored = (() => { try { return JSON.parse(readFileSync(STORE, "utf8")); } catch { return null; } })();
      console.log(JSON.stringify({
        phase: "set-clamp",
        afterMusic, afterSfx, afterScale, afterMute,
        listenerEvents: events.length,
        storedPayload: stored ? stored["lanternfall-options-v1"] : null,
      }));
      break;
    }
    case "reload": {
      // Store wird vom Elternteil aus dem set-clamp-Lauf befuellt.
      const g = getSettings();
      console.log(JSON.stringify({ phase: "reload", settings: full(g) }));
      break;
    }
    case "corrupt": {
      const g = getSettings();
      console.log(JSON.stringify({
        phase: "corrupt",
        settings: full(g),
        equalsDefaults: JSON.stringify(full(g)) === JSON.stringify(DEFAULT_OPTIONS),
      }));
      break;
    }
    case "out-of-range": {
      const g = getSettings();
      console.log(JSON.stringify({ phase: "out-of-range", settings: full(g) }));
      break;
    }
    case "direct-set": {
      rmSync(STORE, { force: true });
      // Konsumenten-Risiko: direkte setSettings()-Aufrufe (API-Kontrakt sagt
      // komplettes Options-Objekt, aber Runtime ruft nicht immer sauber auf).
      setSettings({ music: Number.NaN, sfx: 2, muted: "yes" });
      const g = getSettings();
      const stored = (() => { try { return JSON.parse(readFileSync(STORE, "utf8")); } catch { return null; } })();
      console.log(JSON.stringify({
        phase: "direct-set",
        settings: full(g),
        musicIsNumber: Number.isFinite(g.music),
        sfxPresent: typeof g.sfx === "number",
        mutedIsBoolean: typeof g.muted === "boolean",
        storedPayload: stored ? stored["lanternfall-options-v1"] : null,
        memoryStorageDiverge: stored && stored["lanternfall-options-v1"]
          ? JSON.stringify(stored["lanternfall-options-v1"]) !== JSON.stringify({
              music: g.music, sfx: g.sfx, shake: g.shake,
              damageNumbers: g.damageNumbers, muted: g.muted, scale: g.scale,
            })
          : null,
      }));
      break;
    }
    case "partial-set": {
      rmSync(STORE, { force: true });
      setSettings({ music: 0.3 });
      const g = getSettings();
      changeSetting("mute", 1); // absichtlich falsch geschriebener Schluessel
      const g2 = getSettings();
      console.log(JSON.stringify({
        phase: "partial-set",
        settings: full(g),
        sfxPresent: typeof g.sfx === "number",
        afterJunkKey: { ...g2 },
        junkKeys: junkKeys(g2),
      }));
      break;
    }
    case "reset": {
      rmSync(STORE, { force: true });
      changeSetting("music", 0.1);
      const after = full(resetSettings());
      console.log(JSON.stringify({ phase: "reset", settings: after, equalsDefaults: JSON.stringify(after) === JSON.stringify(DEFAULT_OPTIONS) }));
      break;
    }
    default:
      console.error(`unbekannte Phase: ${PHASE}`);
      process.exit(2);
  }
  process.exit(0);
}

// ---- Elternteil: Phasen orchestrieren ----
const parent = async () => {
  mkdirSync(TMPDIR, { recursive: true });
  mkdirSync(path.dirname(OUT), { recursive: true });

  // TS-Resolve-Hook: settings.ts importiert "./options" ohne Endung — Node ESM
  // braucht die .ts-Endung. Hook lebt im Temp-Ordner (kein Repo-Hilfsordner).
  const hookDir = path.join(TMPDIR, "hook");
  mkdirSync(hookDir, { recursive: true });
  writeFileSync(path.join(hookDir, "resolve-ts.mjs"), `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
      try {
        return await nextResolve(specifier + ".ts", context);
      } catch { /* Originalfehler behalten */ }
    }
    throw err;
  }
}
`);
  writeFileSync(path.join(hookDir, "register.mjs"), `
import { register } from "node:module";
register("./resolve-ts.mjs", import.meta.url);
`);

  const runPhase = (phase, setup) => {
    if (setup) setup();
    const r = spawnSync(process.execPath, [
      "--experimental-strip-types",
      "--import", path.join(hookDir, "register.mjs"),
      fileURLToPath(import.meta.url),
      "--phase", phase,
      "--store", STORE,
    ], { encoding: "utf8" });
    if (r.status !== 0) {
      return { phase, error: `rc=${r.status}`, stderr: (r.stderr || "").slice(-400) };
    }
    try {
      return JSON.parse(r.stdout.trim().split("\n").pop());
    } catch {
      return { phase, error: "stdout kein JSON", stdout: r.stdout.slice(-400) };
    }
  };

  const storeContent = (content) => {
    rmSync(STORE, { force: true });
    if (content !== undefined) writeFileSync(STORE, content);
  };

  // set-clamp erzeugt den Store; dessen Dateiinhalt wird fuer "reload" geklont.
  const setClamp = runPhase("set-clamp", () => storeContent());
  const reloadStore = (() => {
    try { return readFileSync(STORE, "utf8"); } catch { return undefined; }
  })();

  const probes = {
    setClamp,
    reload: runPhase("reload", () => storeContent(reloadStore)),
    defaults: runPhase("defaults", () => storeContent()),
    corrupt: runPhase("corrupt", () => storeContent("kein JSON{{{")),
    outOfRange: runPhase("out-of-range", () => storeContent(JSON.stringify({
      "lanternfall-options-v1": JSON.stringify({
        music: 42, sfx: -5, scale: 99, muted: "yes", damageNumbers: null, shake: 1,
      }),
    }))),
    directSet: runPhase("direct-set", () => storeContent()),
    partialSet: runPhase("partial-set", () => storeContent()),
    reset: runPhase("reset", () => storeContent()),
  };

  rmSync(STORE, { force: true });

  const report = {
    label: LABEL,
    generatedAt: new Date().toISOString(),
    script: "scripts/m10-audio-settings.mjs",
    method: "Node --experimental-strip-types, echte settings.ts/options.ts; Kindprozess pro Phase = Modul-Reload; localStorage per StorageLike-Shim (JSON-Datei).",
    probes,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(`[probe] geschrieben: ${OUT}`);
  for (const [k, v] of Object.entries(probes)) {
    if (v.error) console.log(`[probe] Phase ${k}: FEHLER ${v.error}`);
  }
};
await parent();
