/**
 * Lautstärke-Mixing / Spam-Begrenzung. Reine Zustandslogik, unit-getestet.
 *
 * Priorität (höher gewinnt): Boss/Warnung 3 > Treffer 2 > Waffe 1 > Krit 4.
 * Pro Sound: Cooldown, max. Stimmen. Bei Überschreitung des globalen Budgets
 * verdrängt eine Anfrage mit Priorität >= 2 die älteste (bei Gleichstand
 * leiseste) niederpriorere aktive Stimme, statt abgelehnt zu werden; reine
 * Waffen-Spam-Anfragen (Priorität 1) werden weiterhin abgelehnt.
 *
 * Chaos-Deckel (m10-audio-mix-chaos): Voice-Starts sind auf 24/s gedeckelt —
 * zwei Bänder (Waffen/XP 12/s, Treffer/Kills 12/s); innerhalb eines Bandes
 * erhält jede Klang-ID einen Fair-Anteil (Deckel / aktive IDs), damit im
 * Massenkampf keine Waffe verstummt. Boss-/Warn-Sounds (Priorität >= 3) sind
 * selten und laufen nie in den Deckel.
 *
 * Limiter: Die Summe der Lautstärken aller aktiven Stimmen bleibt durch einen
 * Normalisierungsfaktor unter TARGET_PEAK (-1 dBFS) — der Mix kann nicht
 * clippen, und ein einzelner Schuss bei wenig Konkurrenz bleibt voll laut.
 */
export interface SoundRequest {
  id: string;
  priority: number;
  cooldown: number;
  maxVoices: number;
  volume: number;
}

/** Eine aktive (amplitudenbekannte) Stimme für Limiter/Verdrängung. */
export interface ActiveVoice {
  id: string;
  priority: number;
  /** Effektive Lautstärke (Master × Volume × Boost × Limiter). */
  volume: number;
  /** Startzeitpunkt (state.now) — älteste Stimme wird verdrängt. */
  startedAt: number;
}

interface StartMark {
  id: string;
  at: number;
  /** 0 = Waffen-Band (Prio < 2), 1 = Treffer-Band (Prio 2), 2 = Prio >= 3. */
  band: 0 | 1 | 2;
}

export interface MixerState {
  now: number;
  /** id → letzter Startzeitpunkt */
  lastPlayed: Record<string, number>;
  /** id → aktive Stimmen */
  voices: Record<string, number>;
  /** Globale aktive Stimmen */
  totalVoices: number;
  /** Aktive Stimmen mit Lautstärke/Start (Limiter + Verdrängung). */
  active: ActiveVoice[];
  /** Start-Marker des letzten Sekundenfensters (Rate-Deckel). */
  starts: StartMark[];
}

export const MAX_TOTAL_VOICES = 12;

/** Ziel-Peak des Gesamtmixes: -1 dBFS linear. */
export const TARGET_PEAK = 10 ** (-1 / 20);
/** Hartes Voice-Starts-Kontingent pro Sekunde (Prio < 3, beide Bänder). */
export const MAX_STARTS_PER_SECOND = 24;
/** Band Waffen/Evolutionen/XP (Priorität < 2): Start-Kontingent pro Sekunde. */
export const WEAPON_BAND_STARTS_PER_SEC = 12;
/** Band Treffer/Kills (Priorität 2): Start-Kontingent pro Sekunde. */
export const HIT_BAND_STARTS_PER_SEC = 12;

function bandOf(priority: number): 0 | 1 | 2 {
  return priority < 2 ? 0 : priority === 2 ? 1 : 2;
}

function pruneStarts(state: MixerState): void {
  if (state.starts.length === 0) return;
  const cutoff = state.now - 1;
  if (state.starts[0].at > cutoff) return;
  state.starts = state.starts.filter((s) => s.at > cutoff);
}

export function newMixerState(): MixerState {
  return { now: 0, lastPlayed: {}, voices: {}, totalVoices: 0, active: [], starts: [] };
}

export interface PlayPlan {
  allow: boolean;
  /** Bei allow mit Verdrängung: die zu stoppende aktive Stimme. */
  evict?: ActiveVoice;
  reason?: "priority" | "perSoundVoices" | "cooldown" | "rate" | "rateFair" | "budget";
}

/**
 * Entscheidet über einen Request (ohne Zustand zu verändern): Freigabe,
 * Freigabe mit Verdrängung einer älteren niederprioreren Stimme oder Ablehnung.
 */
export function planPlay(state: MixerState, req: SoundRequest): PlayPlan {
  if (req.priority < 0) return { allow: false, reason: "priority" };
  if ((state.voices[req.id] ?? 0) >= req.maxVoices) return { allow: false, reason: "perSoundVoices" };
  const last = state.lastPlayed[req.id];
  if (last !== undefined && state.now - last < req.cooldown) return { allow: false, reason: "cooldown" };
  if (req.priority < 3) {
    pruneStarts(state);
    // Harte Gesamt-Grenze: 24 Voice-Starts/s über beide Bänder (Prio < 3).
    const recent = state.starts.filter((s) => s.band < 2);
    if (recent.length >= MAX_STARTS_PER_SECOND) return { allow: false, reason: "rate" };
    // Fair-Anteil je Klang-ID: Band-Deckel / aktive IDs, mindestens 1/s — auch
    // bei vollem Band, damit im Chaos keine Waffe verstummt.
    const band = bandOf(req.priority);
    const bandCap = band === 0 ? WEAPON_BAND_STARTS_PER_SEC : HIT_BAND_STARTS_PER_SEC;
    const bandStarts = recent.filter((s) => s.band === band);
    const distinct = new Set(bandStarts.map((s) => s.id)).size;
    const share = Math.max(1, Math.floor(bandCap / Math.max(1, distinct)));
    const own = bandStarts.reduce((n, s) => n + (s.id === req.id ? 1 : 0), 0);
    if (own >= share) return { allow: false, reason: "rateFair" };
  }
  if (state.totalVoices >= MAX_TOTAL_VOICES && req.priority < 3) {
    if (req.priority >= 2) {
      // Älteste (bei Gleichstand leiseste) niederpriorere Stimme verdrängen.
      let evict: ActiveVoice | null = null;
      for (const v of state.active) {
        if (v.priority >= req.priority) continue;
        if (
          evict === null ||
          v.startedAt < evict.startedAt ||
          (v.startedAt === evict.startedAt && v.volume < evict.volume)
        ) {
          evict = v;
        }
      }
      if (evict) return { allow: true, evict };
    }
    return { allow: false, reason: "budget" };
  }
  return { allow: true };
}

/** Entscheidet, ob ein Request spielbar ist (ohne Zustand zu verändern). */
export function canPlay(state: MixerState, req: SoundRequest): boolean {
  return planPlay(state, req).allow;
}

export interface NoteOptions {
  /** Endgültige (limiter-behandelte) Lautstärke der neuen Stimme. */
  volume?: number;
  /** Faktor < 1: alle bisher aktiven Stimmen equally zurücknehmen (Limiter). */
  scaleExisting?: number;
}

/** Registriert einen abgespielten Sound (mutiert den Zustand). */
export function notePlayed(state: MixerState, req: SoundRequest, opts?: NoteOptions): MixerState {
  if (opts?.scaleExisting !== undefined && opts.scaleExisting !== 1) {
    for (const v of state.active) v.volume *= opts.scaleExisting;
  }
  state.lastPlayed[req.id] = state.now;
  state.voices[req.id] = (state.voices[req.id] ?? 0) + 1;
  state.totalVoices += 1;
  state.active.push({
    id: req.id,
    priority: req.priority,
    volume: opts?.volume ?? req.volume,
    startedAt: state.now,
  });
  state.starts.push({ id: req.id, at: state.now, band: bandOf(req.priority) });
  pruneStarts(state);
  return state;
}

/** Gibt eine Stimme frei, wenn sie endet (entfernt die älteste aktive von `id`). */
export function releaseVoice(state: MixerState, id: string): MixerState {
  state.voices[id] = Math.max(0, (state.voices[id] ?? 0) - 1);
  state.totalVoices = Math.max(0, state.totalVoices - 1);
  const idx = state.active.findIndex((v) => v.id === id);
  if (idx >= 0) state.active.splice(idx, 1);
  return state;
}

/** Summe der Lautstärken aller aktiven Stimmen (Limiter-Eingangsgröße). */
export function activeVolumeSum(state: MixerState): number {
  let sum = 0;
  for (const v of state.active) sum += v.volume;
  return sum;
}

/**
 * Limiter-Faktor für eine einlaufende Stimme: 1, solange der Ziel-Peak
 * eingehalten wird, sonst `target / (sum + incoming)` — alle aktiven Stimmen
 * werden mit demselben Faktor multipliziert (inklusive der neuen), sodass die
 * Gesamtlautstärke exakt am Ziel-Peak sitzt. Gleichmäßige, hörbare Rücknahme
 * statt Stummschaltung; der Faktor ist nie 0.
 */
export function limiterGain(sum: number, incoming: number, target: number = TARGET_PEAK): number {
  if (incoming <= 0) return 1;
  if (sum + incoming <= target) return 1;
  return target / (sum + incoming);
}

/** Effektive Lautstärke: Master-SFX × Request-Volume × Prioritäts-Boost. */
export function effectiveVolume(master: number, req: SoundRequest): number {
  const boost = req.priority >= 3 ? 1 : req.priority === 2 ? 0.9 : 0.8;
  return Math.max(0, Math.min(1, master * req.volume * boost));
}

// --- Reine Datentabellen (bewusst hier, damit Node-Tools/Messskripte sie ohne
// Phaser importieren können; AudioSystem.ts re-exportiert sie unverändert). ---

export const PRIORITY = {
  weapon: 1,
  hit: 2,
  warning: 3,
  boss: 3,
  crit: 4,
} as const;

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
