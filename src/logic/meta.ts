/**
 * Kleine Meta-Statistik pro Charakter (Bestzeit, Best-Kills, Best-Level,
 * Siege, Runs). Reine Regeln mit injizierbarem Storage, damit Vitest ohne
 * Browser testen kann. Keine Balance-Werte, nur gespeicherte Lauf-Ergebnisse.
 */
import type { CharacterId } from "../data/types";
import type { StorageLike } from "../audio/options";

export interface BestStats {
  /** Längste überlebte Run-Zeit in Sekunden. */
  time: number;
  kills: number;
  level: number;
  victories: number;
  runs: number;
}

export type MetaState = Record<CharacterId, BestStats>;
export type MetaCharacterId = keyof MetaState;

export const META_KEY = "lanternfall-meta-v1";

export interface RunSummaryInput {
  character: CharacterId;
  time: number;
  kills: number;
  level: number;
  victory: boolean;
}

export interface RecordResult {
  meta: MetaState;
  /** true, wenn dieser Lauf einen neuen Bestwert in der Kategorie hat. */
  records: { time: boolean; kills: boolean; level: boolean; victory: boolean };
}

export function emptyBest(): BestStats {
  return { time: 0, kills: 0, level: 0, victories: 0, runs: 0 };
}

export function emptyMeta(): MetaState {
  return { mira: emptyBest(), kael: emptyBest() };
}

function finiteInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function validizeBest(raw: unknown): BestStats {
  const r = (raw ?? {}) as Partial<BestStats>;
  const time = Number(r.time);
  return {
    time: Math.max(0, Number.isFinite(time) ? time : 0),
    kills: finiteInt(r.kills),
    level: finiteInt(r.level),
    victories: finiteInt(r.victories),
    runs: finiteInt(r.runs),
  };
}

/** Prüft, ob ein Lauf Bestwerte schlägt, und liefert den neuen Stand. */
export function recordRun(meta: MetaState, run: RunSummaryInput): RecordResult {
  // Guard: unbekannte Charakter-IDs (z. B. korrupte Runtime-Daten) erzeugen
  // keinen Streu-Eintrag in MetaState, sondern lassen den Stand unverändert.
  if (!Object.hasOwn(emptyMeta(), run.character)) {
    return { meta, records: { time: false, kills: false, level: false, victory: false } };
  }
  // Guard: korrupter In-Memory-Stand (NaN/undefined in BestStats) wird
  // sanitisiert, damit Math.max nicht NaN in die Bestwerte zieht.
  const before = validizeBest(meta[run.character] ?? emptyBest());
  const time = Math.max(0, Number.isFinite(run.time) ? run.time : 0);
  const kills = finiteInt(run.kills);
  const level = finiteInt(run.level);
  const records = {
    time: time > before.time,
    kills: kills > before.kills,
    level: level > before.level,
    victory: Boolean(run.victory) && before.victories === 0,
  };
  const next = {
    time: Math.max(before.time, time),
    kills: Math.max(before.kills, kills),
    level: Math.max(before.level, level),
    victories: before.victories + (run.victory ? 1 : 0),
    runs: before.runs + 1,
  };
  return {
    meta: { ...meta, [run.character]: next } as MetaState,
    records,
  };
}

/** Sekunden als MM:SS (Meta-Bestzeiten sind immer < 100 Minuten). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Kurze Meta Titel-/CharSelect-Zeile: "BEST 12:34 · 456 KILLS · LV 12". */
export function metaLine(best: BestStats | undefined): string {
  const b = best ?? emptyBest();
  if (b.runs === 0) return "NOCH KEIN LAUF";
  return `BEST ${formatDuration(b.time)} · ${b.kills} KILLS · LV${b.level}`;
}

/** Lädt Meta; fehlende/kaputte Daten → Nullstand (kein Crash). */
export function loadMeta(storage: StorageLike | null | undefined): MetaState {
  const base = emptyMeta();
  if (!storage) return base;
  try {
    const raw = storage.getItem(META_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<CharacterId, unknown>>;
    return {
      mira: validizeBest(parsed.mira),
      kael: validizeBest(parsed.kael),
    };
  } catch {
    return base;
  }
}

export function saveMeta(storage: StorageLike | null | undefined, meta: MetaState): void {
  if (!storage) return;
  try {
    storage.setItem(META_KEY, JSON.stringify({
      mira: validizeBest(meta.mira),
      kael: validizeBest(meta.kael),
    }));
  } catch { /* Quota/Privacy-Mode: still ignorieren */ }
}

/** Runtime-Helfer für Szenen (window.localStorage, defensiv). */
export function runtimeStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readMeta(): MetaState {
  return loadMeta(runtimeStorage());
}

export function writeMeta(meta: MetaState): MetaState {
  saveMeta(runtimeStorage(), meta);
  return meta;
}
