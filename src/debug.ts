import Phaser from "phaser";
import { ENEMIES, PASSIVES, weaponDef } from "./data";
import type { EnemyId, PassiveId, WeaponAnyId } from "./data/types";
import { hasFlag } from "./logic/rng";
import type { Run } from "./scenes/Run";

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
    for (const key of ["run", "charselect", "results", "title", "boot"]) {
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

    /** Endzustand des letzten Runs (Bosse, Truhen, Dämmerung) – auch in Results. */
    finalState: () => game.registry.get("lf-final-state") ?? null,

    setTimeScale: (n: number) => requireRun().setTimeScale(finiteNumber("setTimeScale", n)),
    skipTo: (seconds: number) => requireRun().skipTo(finiteNumber("skipTo", seconds)),
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
