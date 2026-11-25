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
