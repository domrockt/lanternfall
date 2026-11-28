import Phaser from "phaser";
import { ENEMIES, PASSIVES, weaponDef } from "./data";
import type { EnemyId, PassiveId, WeaponAnyId } from "./data/types";
import { hasFlag } from "./logic/rng";
import { TILE, WORLD_SIZE } from "./config";
import { paintTerrain, terrainKindAt, type TileKind } from "./gfx/tiles";
import type { Run } from "./scenes/Run";
import { getAudio, applyOptions } from "./audio/AudioSystem";
import { getSettings, changeSetting } from "./audio/settings";
import { readMeta, writeMeta, emptyMeta } from "./logic/meta";

/**
 * M10 Android/ARM: WebGL-Kontext, Extensions, MAX_TEXTURE_SIZE und Textur-Inventar
 * fuer den Debug-Report. Reine Lesefunktion; keine Spielaenderung.
 */
export interface RendererInfo {
  generatedAt: string;
  context: "webgl2" | "webgl1" | "canvas" | "none";
  version: string;
  shadingLanguage: string;
  renderer: string;
  vendor: string;
  maxTextureSize: number;
  maxTextureImageUnits: number;
  extensions: string[];
  contextAttributes: Record<string, unknown>;
  precision: {
    fragmentHighp: PrecisionFormat | null;
    fragmentMediump: PrecisionFormat | null;
    vertexHighp: PrecisionFormat | null;
  };
  fps: { target: number; limit: number; cappedAt60: boolean };
  powerPreference: string;
  canvas: {
    attrWidth: number;
    attrHeight: number;
    logicalWidth: number;
    logicalHeight: number;
    rendersDevicePixels: boolean;
  };
  textures: {
    count: number;
    pixels: number;
    approxBytes: number;
    maxEdge: number;
    oversized: string[];
  };
}

interface PrecisionFormat { rangeMin: number; rangeMax: number; precision: number }

export function collectRendererInfo(game: Phaser.Game): RendererInfo {
  const gl = (game.renderer as { gl?: WebGLRenderingContext } | null)?.gl ?? null;
  let context: RendererInfo["context"] = "none";
  if (game.renderer?.type === Phaser.CANVAS) context = "canvas";
  else if (gl) {
    context = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext
      ? "webgl2"
      : "webgl1";
  }

  const extensions: string[] = [];
  let version = "";
  let shadingLanguage = "";
  let renderer = "";
  let vendor = "";
  let maxTextureSize = 0;
  let maxTextureImageUnits = 0;
  let contextAttributes: Record<string, unknown> = {};
  const precision: RendererInfo["precision"] = {
    fragmentHighp: null,
    fragmentMediump: null,
    vertexHighp: null,
  };
  if (gl) {
    version = String(gl.getParameter(gl.VERSION) ?? "");
    shadingLanguage = String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) ?? "");
    maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 0);
    maxTextureImageUnits = Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) ?? 0);
    contextAttributes = { ...(gl.getContextAttributes() ?? {}) };
    try {
      for (const ext of gl.getSupportedExtensions() ?? []) extensions.push(ext);
    } catch { /* Kontext evtl. verloren */ }
    const debugExt = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugExt) {
      renderer = String(gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) ?? "");
      vendor = String(gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) ?? "");
    }
    const readPrecision = (type: number, shader: number): PrecisionFormat | null => {
      try {
        const f = gl.getShaderPrecisionFormat(type, shader);
        return f ? { rangeMin: f.rangeMin, rangeMax: f.rangeMax, precision: f.precision } : null;
      } catch {
        return null;
      }
    };
    precision.fragmentHighp = readPrecision(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    precision.fragmentMediump = readPrecision(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
    precision.vertexHighp = readPrecision(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
  }

  let pixels = 0;
  let maxEdge = 0;
  const oversized: string[] = [];
  let count = 0;
  try {
    for (const key of game.textures.getTextureKeys()) {
      const tex = game.textures.get(key);
      const source = tex?.getSourceImage?.();
      const w = Number(source?.width ?? tex?.source?.[0]?.width ?? 0);
      const h = Number(source?.height ?? tex?.source?.[0]?.height ?? 0);
      if (w <= 0 || h <= 0) continue;
      count++;
      pixels += w * h;
      maxEdge = Math.max(maxEdge, w, h);
      // ARM-Risiko: manche Mali/Adreno zeigen > 2048 px schwarz oder gestaucht.
      if (w > 2048 || h > 2048) oversized.push(`${key} (${w}x${h})`);
    }
  } catch { /* TextureManager noch nicht bereit */ }

  const fpsTarget = Number(game.config.fps?.target ?? 0);
  const fpsLimit = Number(game.config.fps?.limit ?? 0);
  const configuredPower = String(
    (game.config as unknown as { powerPreference?: string }).powerPreference ?? "default",
  );

  return {
    generatedAt: new Date().toISOString(),
    context,
    version,
    shadingLanguage,
    renderer,
    vendor,
    maxTextureSize,
    maxTextureImageUnits,
    extensions,
    contextAttributes,
    precision,
    fps: { target: fpsTarget, limit: fpsLimit, cappedAt60: fpsTarget === 60 && fpsLimit === 60 },
    powerPreference: configuredPower,
    canvas: {
      attrWidth: game.canvas?.width ?? 0,
      attrHeight: game.canvas?.height ?? 0,
      logicalWidth: game.scale?.width ?? 0,
      logicalHeight: game.scale?.height ?? 0,
      rendersDevicePixels:
        (game.canvas?.width ?? 0) !== (game.scale?.width ?? 0) ||
        (game.canvas?.height ?? 0) !== (game.scale?.height ?? 0),
    },
    textures: {
      count,
      pixels,
      approxBytes: pixels * 4,
      maxEdge,
      oversized,
    },
  };
}

/**
 * `window.__lf` laut GAME.md. Immer vorhanden; Cheats nur mit `?debug=1`.
 * Funktionen für spätere Meilensteine (Bosse/Truhen) werfen einen klaren Fehler.
 */
export function installDebugApi(game: Phaser.Game): void {
  const debug = hasFlag("debug");

  const publishRendererInfo = (): RendererInfo => {
    const info = collectRendererInfo(game);
    game.registry.set("lf-render-info", info);
    return info;
  };
  if (game.isBooted) publishRendererInfo();
  else game.events.once(Phaser.Core.Events.READY, publishRendererInfo);

  const runScene = (): Run => {
    if (game.scene.isActive("run") || game.scene.isPaused("run")) {
      return game.scene.getScene("run") as Run;
    }
    throw new Error("window.__lf: Diese Funktion braucht einen aktiven Run");
  };

  const requireDebug = (): void => {
    if (!debug) throw new Error("window.__lf: Cheats nur mit ?debug=1");
  };

  const requireRun = (): Run => {
    requireDebug();
    return runScene();
  };

  const activeScene = (): string => {
    for (const key of ["run", "charselect", "results", "credits", "title", "boot"]) {
      if (game.scene.isActive(key) || game.scene.isPaused(key)) return key;
    }
    return "boot";
  };

  /** Abnahme-Beleg (nur zaehlen): tatsaechliche Spawns je Gegner-ID im Run. */
  const spawnCounts = (): Record<string, number> => {
    const spawner = game.registry.get("lf-spawner") as
      | { spawnCounts?: Record<string, number> }
      | undefined;
    return spawner?.spawnCounts ? { ...spawner.spawnCounts } : {};
  };

  const api = {
    /** Immer verfügbar. */
    state: () => {
      if (game.scene.isActive("run") || game.scene.isPaused("run")) {
        return { ...(game.scene.getScene("run") as Run).getDebugState(), spawnCounts: spawnCounts() };
      }
      return {
        scene: activeScene(),
        time: 0,
        level: 1,
        xp: 0,
        hp: 0,
        maxHp: 0,
        kills: 0,
        enemies: 0,
        weapons: [],
        passives: [],
        bossesDefeated: 0,
        fps: Math.round((game.loop.actualFps ?? 0) * 10) / 10,
        character: null,
      };
    },

    /** Leichtgewichtiges Polling (ohne enemyList): FPS/Zeit/G GC-Druck. */
    stats: () => {
      if (game.scene.isActive("run") || game.scene.isPaused("run")) {
        return { ...(game.scene.getScene("run") as Run).getQuickStats(), spawnCounts: spawnCounts() };
      }
      return {
        scene: activeScene(),
        time: 0,
        level: 1,
        kills: 0,
        enemies: 0,
        fps: Math.round((game.loop.actualFps ?? 0) * 10) / 10,
        weapons: [],
        passives: [],
        bossesDefeated: 0,
        bosses: false,
        character: null,
      };
    },

    /** Endzustand des letzten Runs (Bosse, Truhen, Dämmerung) – auch in Results. */
    finalState: () => game.registry.get("lf-final-state") ?? null,

    setTimeScale: (n: number) => requireRun().setTimeScale(finiteNumber("setTimeScale", n)),
    skipTo: (seconds: number) => requireRun().skipTo(finiteNumber("skipTo", seconds)),
    teleport: (x: number, y: number) =>
      requireRun().teleport(finiteNumber("teleport.x", x), finiteNumber("teleport.y", y)),
    god: (value: boolean) => requireRun().setGod(value),
    giveXp: (n: number) => requireRun().giveXp(finiteNumber("giveXp", n)),
    addWeapon: (id: string, level: number) => {
      const run = requireRun();
      if (!weaponDef(id)) throw new Error(`window.__lf.addWeapon: unbekannte Waffe "${id}"`);
      run.debugAddWeapon(id as WeaponAnyId, finiteLevel("addWeapon", level));
    },
    addPassive: (id: string, level: number) => {
      const run = requireRun();
      if (!(id in PASSIVES)) throw new Error(`window.__lf.addPassive: unbekanntes Powerup "${id}"`);
      run.debugAddPassive(id as PassiveId, finiteLevel("addPassive", level));
    },
    spawnEnemy: (id: string, n = 1, elite = false) => {
      const run = requireRun();
      if (!(id in ENEMIES)) throw new Error(`window.__lf.spawnEnemy: unbekannter Gegner "${id}"`);
      return run.debugSpawnEnemy(
        id as EnemyId,
        Math.max(1, Math.floor(finiteNumber("spawnEnemy", n))),
        Boolean(elite),
      );
    },
    spawnBoss: (index: number) =>
      requireRun().debugSpawnBoss(finiteNumber("spawnBoss", index)),
    openChest: () => requireRun().debugOpenChest(),
    pickLevelUp: (i: number) => {
      const run = requireRun();
      if (!run.levelUpOpen) throw new Error("window.__lf.pickLevelUp: kein Level-Up aktiv");
      run.pickLevelUp(i);
    },
    autoPlay: (value: boolean) => requireRun().setAutoPlay(value),
    /** M6-Abnahme: direkt Lauf ohne direkt beenden (nur debug). */
    finishRun: (reason: string) => {
      if (reason !== "death" && reason !== "dawn" && reason !== "giveup") {
        throw new Error(`window.__lf.finishRun: unbekannter Grund "${reason}"`);
      }
      requireRun().debugFinishRun(reason);
    },
    /** M5: Ereignis-Sequenz für die VFX-Abnahme auslösen. */
    event: (name: string) => requireRun().debugTriggerEvent(String(name)),

    /** M5-Abnahme: Ereignis-Overlays für Waffen-GIFs abschalten. */
    setSuppressFx: (value: boolean) => requireRun().debugSetSuppressFx(Boolean(value)),
    setSuppressLevelUps: (value: boolean) => requireRun().debugSetSuppressLevelUps(Boolean(value)),
    /** M6-Abnahme: Endgame-Effekt-Dämpfung für Vorher/Nachher-Shots schalten. */
    setFxDamping: (value: boolean) => requireRun().setFxDamping(Boolean(value)),

    /** M10 Android: WebGL-Kontext, Extensions, MAX_TEXTURE_SIZE, Textur-Inventar, 60-FPS-Cap. */
    rendererInfo: (): RendererInfo => {
      const cached = game.registry.get("lf-render-info") as RendererInfo | undefined;
      return cached ?? publishRendererInfo();
    },

    /** M5-Audio/Options (immer verfügbar, keine Cheats). */
    audio: () => getAudio().debugState(),
    options: () => getSettings(),
    setOption: (key: string, value: number | boolean) => {
      if (key !== "music" && key !== "sfx" && key !== "shake"
        && key !== "damageNumbers" && key !== "muted" && key !== "scale") {
        throw new Error(`window.__lf.setOption: unbekannter Schlüssel "${key}"`);
      }
      applyOptions(changeSetting(key, value));
      return getSettings();
    },
    meta: () => readMeta(),
    resetMeta: () => {
      requireDebug();
      return writeMeta(emptyMeta());
    },
    setMuted: (value: boolean) => {
      getAudio().setMuted(Boolean(value));
      return getAudio().debugState();
    },

    /** Tileset-Atlas: echte Terrain-Streifen (pixelgenau) + Dekor-Sampler als PNG. */
    tileset: (): string => {
      const cols = 5;
      const cell = TILE;
      const rows = 6;
      const canvas = document.createElement("canvas");
      canvas.width = cols * cell;
      canvas.height = rows * cell;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("window.__lf.tileset: kein 2D-Kontext");
      const seed = 21;
      // Weltstellen je Art suchen (grosszuegiger Scan), dann 80x16-Streifen malen.
      const findSpot = (kind: TileKind): { x: number; y: number } => {
        for (let r = 0; r < 4000; r += 24) {
          for (let a = 0; a < 16; a++) {
            const x = Math.round(Math.cos(a * 0.3927) * r);
            const y = Math.round(Math.sin(a * 0.3927) * r);
            if (terrainKindAt(x, y, seed, WORLD_SIZE) === kind) return { x, y };
          }
        }
        return { x: 0, y: 0 };
      };
      /** Streifen in ein Zwischencanvas malen und in die Atlas-Zeile kopieren. */
      const strip = (x: number, y: number, w: number, h: number, row: number) => {
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext("2d");
        if (!tctx) return;
        paintTerrain(tctx, x, y, w, h, seed, WORLD_SIZE);
        ctx.drawImage(tmp, 0, row * cell);
      };
      const kinds: TileKind[] = ["water", "path", "mud", "grass"];
      kinds.forEach((k, i) => {
        const spot = findSpot(k);
        strip(spot.x - 32, spot.y - 8, cols * cell, cell, i);
      });
      // Weitere Grasvariationen (Reihe 5) statt alter Kachel-Dekors:
      // Requisiten sind eigene jetzt Bild-Sprites (shots/m4b-sheet-props.png).
      const grassSpot = findSpot("grass");
      strip(grassSpot.x - 32, grassSpot.y - 8, cols * cell, 2 * cell, 4);
      return canvas.toDataURL("image/png");
    },
  };

  (window as unknown as { __lf: typeof api }).__lf = api;
  (window as unknown as { __game: Phaser.Game }).__game = game;
}

function finiteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new Error(`window.__lf.${name}: erwartet eine endliche Zahl`);
  return value;
}

function finiteLevel(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 1) throw new Error(`window.__lf.${name}: Level muss eine Zahl >= 1 sein`);
  return Math.floor(value);
}
