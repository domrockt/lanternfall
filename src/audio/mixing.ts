/**
 * Lautstärke-Mixing / Spam-Begrenzung. Reine Zustandslogik, unit-getestet.
 *
 * Priorität (höher gewinnt): Boss/Warnung 3 > Treffer 2 > Waffe 1 > Krit 4.
 * Pro Sound: Cooldown, max. Stimmen. Bei Überschreitung wird der leise/
 * niederpriore Request verworfen, nicht der wichtige.
 */
export interface SoundRequest {
  id: string;
  priority: number;
  cooldown: number;
  maxVoices: number;
  volume: number;
}

export interface MixerState {
  now: number;
  /** id → letzter Startzeitpunkt */
  lastPlayed: Record<string, number>;
  /** id → aktive Stimmen */
  voices: Record<string, number>;
  /** Globale aktive Stimmen */
  totalVoices: number;
}

export const MAX_TOTAL_VOICES = 12;

export function newMixerState(): MixerState {
  return { now: 0, lastPlayed: {}, voices: {}, totalVoices: 0 };
}

/** Entscheidet, ob ein Request spielbar ist (ohne Zustand zu verändern). */
export function canPlay(state: MixerState, req: SoundRequest): boolean {
  if (req.priority < 0) return false;
  if ((state.voices[req.id] ?? 0) >= req.maxVoices) return false;
  const last = state.lastPlayed[req.id];
  if (last !== undefined && state.now - last < req.cooldown) return false;
  // Wichtige Sounds dürfen das globale Stimmen-Budget leicht überschreiten.
  if (state.totalVoices >= MAX_TOTAL_VOICES && req.priority < 3) return false;
  return true;
}

/** Registriert einen abgespielten Sound (mutiert den Zustand). */
export function notePlayed(state: MixerState, req: SoundRequest): MixerState {
  state.lastPlayed[req.id] = state.now;
  state.voices[req.id] = (state.voices[req.id] ?? 0) + 1;
  state.totalVoices += 1;
  return state;
}

/** Gibt eine Stimme frei, wenn sie endet. */
export function releaseVoice(state: MixerState, id: string): MixerState {
  state.voices[id] = Math.max(0, (state.voices[id] ?? 0) - 1);
  state.totalVoices = Math.max(0, state.totalVoices - 1);
  return state;
}

/** Effektive Lautstärke: Master-SFX × Request-Volume × Prioritäts-Boost. */
export function effectiveVolume(master: number, req: SoundRequest): number {
  const boost = req.priority >= 3 ? 1 : req.priority === 2 ? 0.9 : 0.8;
  return Math.max(0, Math.min(1, master * req.volume * boost));
}

export const PRIORITY = {
  weapon: 1,
  hit: 2,
  warning: 3,
  boss: 3,
  crit: 4,
} as const;

// --- Reine Datentabellen (bewusst hier, damit Node-Tools/Messskripte sie ohne
// Phaser importieren können; AudioSystem.ts re-exportiert sie unverändert). ---

/** Alle prozedural erzeugten WAVs (scripts/gen_sfx.py). */
export const SFX_KEYS = {
  ember: "sfx_ember", flail: "sfx_flail", frost: "sfx_frost", thorn: "sfx_thorn",
  storm: "sfx_storm", lantern: "sfx_lantern", phoenix: "sfx_phoenix",
  wrath_pendulum: "sfx_wrath", eternal_winter: "sfx_winter", thorn_storm: "sfx_thornstorm",
  thunder_seal: "sfx_seal", soul_beacon: "sfx_soul",
  hit: "sfx_hit", kill: "sfx_kill", xp: "sfx_xp", levelup: "sfx_levelup",
  chest: "sfx_chest", evolution: "sfx_evolution", bossWarn: "sfx_boss_warn",
  bossDeath: "sfx_boss_death", victory: "sfx_victory", defeat: "sfx_defeat",
} as const;

/** Die 6 Basiswaffen und die 6 Evolutionen, deren Klänge sich hörbar unterscheiden müssen. */
export const WEAPON_SFX_IDS = ["ember", "flail", "frost", "thorn", "storm", "lantern"] as const;
export const EVOLUTION_SFX_IDS = [
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
] as const;

export interface SfxConfig {
  priority: number;
  cooldown: number;
  maxVoices: number;
  volume: number;
}

/** Priorität/Cooldown/Stimmen/Lautstärke je SFX (siehe docs/lanes/m10-audio-distinct.md). */
export const SFX_CONFIG: Record<string, SfxConfig> = {
  ember: { priority: PRIORITY.weapon, cooldown: 0.09, maxVoices: 3, volume: 0.55 },
  flail: { priority: PRIORITY.weapon, cooldown: 0.12, maxVoices: 2, volume: 0.55 },
  frost: { priority: PRIORITY.weapon, cooldown: 0.22, maxVoices: 2, volume: 0.5 },
  thorn: { priority: PRIORITY.weapon, cooldown: 0.12, maxVoices: 2, volume: 0.45 },
  storm: { priority: PRIORITY.weapon, cooldown: 0.16, maxVoices: 2, volume: 0.6 },
  lantern: { priority: PRIORITY.weapon, cooldown: 0.3, maxVoices: 1, volume: 0.4 },
  // Evolutions-Stinger sind 0,6–1,0 s lang: Cooldown >= Länge und eine Stimme,
  // damit ein Dauerfeuer der Evolutionswaffen den Stinger nicht überlagert.
  phoenix: { priority: PRIORITY.weapon, cooldown: 0.9, maxVoices: 1, volume: 0.55 },
  wrath_pendulum: { priority: PRIORITY.weapon, cooldown: 0.85, maxVoices: 1, volume: 0.6 },
  eternal_winter: { priority: PRIORITY.weapon, cooldown: 1.0, maxVoices: 1, volume: 0.45 },
  thorn_storm: { priority: PRIORITY.weapon, cooldown: 0.85, maxVoices: 1, volume: 0.5 },
  thunder_seal: { priority: PRIORITY.weapon, cooldown: 0.85, maxVoices: 1, volume: 0.55 },
  soul_beacon: { priority: PRIORITY.weapon, cooldown: 1.0, maxVoices: 1, volume: 0.5 },
  hit: { priority: PRIORITY.hit, cooldown: 0.05, maxVoices: 4, volume: 0.45 },
  kill: { priority: PRIORITY.hit, cooldown: 0.04, maxVoices: 4, volume: 0.35 },
  xp: { priority: PRIORITY.weapon, cooldown: 0.05, maxVoices: 3, volume: 0.25 },
  levelup: { priority: PRIORITY.boss, cooldown: 0.5, maxVoices: 1, volume: 0.7 },
  chest: { priority: PRIORITY.boss, cooldown: 0.6, maxVoices: 1, volume: 0.65 },
  evolution: { priority: PRIORITY.crit, cooldown: 0.8, maxVoices: 1, volume: 0.85 },
  bossWarn: { priority: PRIORITY.warning, cooldown: 1.2, maxVoices: 1, volume: 0.9 },
  bossDeath: { priority: PRIORITY.warning, cooldown: 1.4, maxVoices: 1, volume: 0.95 },
  victory: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.85 },
  defeat: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.8 },
};
