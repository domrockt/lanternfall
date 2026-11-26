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
 * `window.__lf` laut GAME.md. Immer vorhanden; Cheats nur mit `?debug=1`.
 * Funktionen für spätere Meilensteine (Bosse/Truhen) werfen einen klaren Fehler.
 */
export function installDebugApi(game: Phaser.Game): void {
  const debug = hasFlag("debug");

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

  const api = {
    /** Immer verfügbar. */
    state: () => {
      if (game.scene.isActive("run") || game.scene.isPaused("run")) {
        return (game.scene.getScene("run") as Run).getDebugState();
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
        return (game.scene.getScene("run") as Run).getQuickStats();
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
    spawnEnemy: (id: string, n = 1) => {
      const run = requireRun();
      if (!(id in ENEMIES)) throw new Error(`window.__lf.spawnEnemy: unbekannter Gegner "${id}"`);
      return run.debugSpawnEnemy(id as EnemyId, Math.max(1, Math.floor(finiteNumber("spawnEnemy", n))));
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
