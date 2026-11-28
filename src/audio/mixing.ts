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
  /** Pickup-Klasse (m10-pickup-sfx-distinct): eigenes Band-Kontingent + Dämpfung. */
  pickup?: boolean;
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
  /** 0 = Waffen-Band (Prio < 2), 1 = Treffer-Band (Prio 2), 2 = Prio >= 3, 3 = Pickup-Klasse. */
  band: 0 | 1 | 2 | 3;
}

// M10-audio-quality-budget: Typ-Import (wird zur Laufzeit gestrippt — mixing.ts
// bleibt phaser-/Node-frei und im Messskript ladbar).
import type { QualityTier, ThermalTier } from "../logic/quality";

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
/** Band Pickup-Klasse (xp/powerup, m10-pickup-sfx-distinct): Start-Kontingent pro Sekunde. */
export const PICKUP_BAND_STARTS_PER_SEC = 8;

// --- M10-audio-quality-budget: Budgets je Qualitaetsstufe -------------------
//
// Die Konstanten oben sind die HIGH-Stufe (heutige Werte, bitgleich). Auf
// schwachen Geraeten (Android-Blocker-Runde, Dom 09:25Z) skalieren die
// Stimmen-/Start-Budgets mit dem Qualitaets-Tier (src/logic/quality.ts,
// Regler wechselt nur die Stufe): weniger gleichzeitige Stimmen und weniger
// Voice-Starts/s sparen Audio-Mix-Kosten, ohne dass Musik/SFX ungehoerbar
// werden — der Limiter haelt den Peak weiterhin unter -1 dBFS, und die
// Band-Aufteilung (Waffen/Treffer/Pickup) bleibt erhalten.

/** Stimmen-/Start-Budgets einer Qualitaetsstufe. */
export interface AudioBudget {
  /** Max gleichzeitig aktive Stimmen (Deckel für Prio < 3). */
  maxTotalVoices: number;
  /** Hartes Voice-Starts-Kontingent pro Sekunde (Prio < 3). */
  maxStartsPerSecond: number;
  /** Band Waffen/Evolutionen/XP: Start-Kontingent pro Sekunde. */
  weaponBandStartsPerSec: number;
  /** Band Treffer/Kills: Start-Kontingent pro Sekunde. */
  hitBandStartsPerSec: number;
  /** Band Pickup-Klasse: Start-Kontingent pro Sekunde. */
  pickupBandStartsPerSec: number;
}

/** HIGH = heutige Werte (bitgleich zu den Konstanten oben). */
export const AUDIO_BUDGET_HIGH: AudioBudget = {
  maxTotalVoices: MAX_TOTAL_VOICES,
  maxStartsPerSecond: MAX_STARTS_PER_SECOND,
  weaponBandStartsPerSec: WEAPON_BAND_STARTS_PER_SEC,
  hitBandStartsPerSec: HIT_BAND_STARTS_PER_SEC,
  pickupBandStartsPerSec: PICKUP_BAND_STARTS_PER_SEC,
};

/**
 * Budgets je Stufe. Hoch skaliert runter, Verhältnisse der Bänder zueinander
 * bleiben erhalten (12/12/8), damit die Unterscheidbarkeit der Klänge im
 * Chaos nicht kippt: medium 2/3, low 1/3 der HIGH-Stufe.
 */
export const AUDIO_BUDGETS: Readonly<Record<QualityTier, AudioBudget>> = {
  high: AUDIO_BUDGET_HIGH,
  medium: {
    maxTotalVoices: 8,
    maxStartsPerSecond: 16,
    weaponBandStartsPerSec: 8,
    hitBandStartsPerSec: 8,
    pickupBandStartsPerSec: 6,
  },
  low: {
    maxTotalVoices: 4,
    maxStartsPerSecond: 8,
    weaponBandStartsPerSec: 4,
    hitBandStartsPerSec: 4,
    pickupBandStartsPerSec: 3,
  },
};

/**
 * Budget einer Stufe (mit Rückfall high bei unbekanntem Tier).
 * m10-thermal-tier-types: Signatur QualityTier -> ThermalTier. "thermal" ist
 * bewusst KEIN Audio-Hebel (Status quo, m10-thermal-wiring): AUDIO_BUDGETS hat
 * keinen thermal-Eintrag — bisher lief das über `undefined ?? high`, jetzt
 * explizit (bitgleich: thermal -> high).
 */
export function audioBudgetFor(tier: ThermalTier): AudioBudget {
  if (tier === "thermal") return AUDIO_BUDGETS.high;
  return AUDIO_BUDGETS[tier] ?? AUDIO_BUDGETS.high;
}

function bandOf(priority: number): 0 | 1 | 2 {
  return priority < 2 ? 0 : priority === 2 ? 1 : 2;
}

/** Band eines Requests: Pickup-Klasse hat eigenes Band 3 (eigenes Kontingent). */
function bandOfRequest(req: SoundRequest): 0 | 1 | 2 | 3 {
  return req.pickup ? 3 : bandOf(req.priority);
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
 * `budget` (M10-audio-quality-budget) skaliert die Stimmen-/Start-Deckel je
 * Qualitaetsstufe; Default = HIGH (heutige Werte, bitgleich).
 */
export function planPlay(state: MixerState, req: SoundRequest, budget: AudioBudget = AUDIO_BUDGET_HIGH): PlayPlan {
  if (req.priority < 0) return { allow: false, reason: "priority" };
  if ((state.voices[req.id] ?? 0) >= req.maxVoices) return { allow: false, reason: "perSoundVoices" };
  const last = state.lastPlayed[req.id];
  if (last !== undefined && state.now - last < req.cooldown) return { allow: false, reason: "cooldown" };
  if (req.priority < 3) {
    pruneStarts(state);
    const recent = state.starts.filter((s) => s.band < 2);
    if (req.pickup) {
      // Pickup-Klasse (m10-pickup-sfx-distinct): eigenes Kontingent
      // (Band-Deckel der Stufe, Fair-Share je ID) statt des globalen
      // Waffen-/Treffer-Deckels — Massen-XP wird über pickupDampGain gedämpft
      // statt verhungert (vorher: 622x rateFair bei 900 XP-Requests).
      const bandStarts = state.starts.filter((s) => s.band === 3);
      const distinct = new Set(bandStarts.map((s) => s.id)).size;
      const share = Math.max(1, Math.floor(budget.pickupBandStartsPerSec / Math.max(1, distinct)));
      const own = bandStarts.reduce((n, s) => n + (s.id === req.id ? 1 : 0), 0);
      if (own >= share) return { allow: false, reason: "rateFair" };
    } else {
      // Harte Gesamt-Grenze: maxStartsPerSecond Voice-Starts/s über Waffen-/Treffer-Band.
      if (recent.length >= budget.maxStartsPerSecond) return { allow: false, reason: "rate" };
      // Fair-Anteil je Klang-ID: Band-Deckel / aktive IDs, mindestens 1/s — auch
      // bei vollem Band, damit im Chaos keine Waffe verstummt.
      const band = bandOfRequest(req) as 0 | 1;
      const bandCap = band === 0 ? budget.weaponBandStartsPerSec : budget.hitBandStartsPerSec;
      const bandStarts = recent.filter((s) => s.band === band);
      const distinct = new Set(bandStarts.map((s) => s.id)).size;
      const share = Math.max(1, Math.floor(bandCap / Math.max(1, distinct)));
      const own = bandStarts.reduce((n, s) => n + (s.id === req.id ? 1 : 0), 0);
      if (own >= share) return { allow: false, reason: "rateFair" };
    }
  }
  if (state.totalVoices >= budget.maxTotalVoices && req.priority < 3) {
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
  state.starts.push({ id: req.id, at: state.now, band: bandOfRequest(req) });
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

/**
 * Pickup-Klasse (m10-pickup-sfx-distinct): häufige Aufnahme-Sounds. Priorität 2
 * (wie Treffer): bei vollem Voice-Budget verdrängen sie die älteste Waffenstimme,
 * statt selbst zu verstummen — aber sie laufen im eigenen Band-Kontingent.
 */
export const PRIORITY_PICKUP = PRIORITY.hit;
export const PICKUP_SFX_IDS = ["xp", "powerup"] as const;

/** Pickup-Dämpfung: ab so vielen Starts/s wird gedämpft (Massen-Events). */
export const PICKUP_DAMP_FULL_AT = 4;
/** Pickup-Dämpfung: ab so vielen Starts/s Bodenwert erreicht. */
export const PICKUP_DAMP_MAX_AT = 12;
/** Pickup-Dämpfung: Lautstärke-Bodenwert (nie stumm). */
export const PICKUP_DAMP_FLOOR = 0.45;

/**
 * Dämpfungsfaktor für einen Pickup-Request bei Massen-Events (rein, testbar):
 * 1, solange <= PICKUP_DAMP_FULL_AT Pickup-Starts in der letzten Sekunde liegen,
 * linear abnehmend bis PICKUP_DAMP_FLOOR bei >= PICKUP_DAMP_MAX_AT. Im 500er-
 * Chaos klingt der einzelne XP-Pickup dadurch leiser statt in einem Brei unter-
 * zugehen; Einzel-/Paar-Pickups bleiben ungedämpft voll hörbar.
 */
export function pickupDampGain(state: MixerState, req: SoundRequest): number {
  if (!req.pickup) return 1;
  pruneStarts(state);
  const recent = state.starts.filter((s) => s.band === 3);
  const n = recent.length;
  if (n <= PICKUP_DAMP_FULL_AT) return 1;
  const span = PICKUP_DAMP_MAX_AT - PICKUP_DAMP_FULL_AT;
  const gain = 1 - ((n - PICKUP_DAMP_FULL_AT) / span) * (1 - PICKUP_DAMP_FLOOR);
  return Math.max(PICKUP_DAMP_FLOOR, Math.min(1, gain));
}

/** Alle prozedural erzeugten WAVs (scripts/gen_sfx.py). */
export const SFX_KEYS = {
  ember: "sfx_ember", flail: "sfx_flail", frost: "sfx_frost", thorn: "sfx_thorn",
  storm: "sfx_storm", lantern: "sfx_lantern", phoenix: "sfx_phoenix",
  wrath_pendulum: "sfx_wrath", eternal_winter: "sfx_winter", thorn_storm: "sfx_thornstorm",
  thunder_seal: "sfx_seal", soul_beacon: "sfx_soul",
  hit: "sfx_hit", kill: "sfx_kill",
  // Pickup-Klasse (m10-pickup-sfx-distinct): eigene WAVs, vier getrennte Signaturen.
  xp: "sfx_pickup_xp", powerup: "sfx_pickup_powerup",
  levelup: "sfx_pickup_levelup", chest: "sfx_pickup_chest",
  evolution: "sfx_evolution", bossWarn: "sfx_boss_warn",
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
  xp: { priority: PRIORITY_PICKUP, cooldown: 0.05, maxVoices: 3, volume: 0.25 },
  // Powerup-Moment (passive Aufnahme): ähnlich selten wie levelup, aber eigenständig.
  powerup: { priority: PRIORITY_PICKUP, cooldown: 0.15, maxVoices: 2, volume: 0.5 },
  levelup: { priority: PRIORITY.boss, cooldown: 0.5, maxVoices: 1, volume: 0.7 },
  chest: { priority: PRIORITY.boss, cooldown: 0.6, maxVoices: 1, volume: 0.65 },
  evolution: { priority: PRIORITY.crit, cooldown: 0.8, maxVoices: 1, volume: 0.85 },
  bossWarn: { priority: PRIORITY.warning, cooldown: 1.2, maxVoices: 1, volume: 0.9 },
  bossDeath: { priority: PRIORITY.warning, cooldown: 1.4, maxVoices: 1, volume: 0.95 },
  victory: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.85 },
  defeat: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.8 },
};
