/**
 * Damage-Number-Zusammenfassung: Bei Spam (viele Treffer pro Frame) werden
 * Zahlen desselben Gegners kurz summiert statt einzeln zu fluten. Reine Logik.
 */
export interface DamageEvent {
  enemyUid: number;
  damage: number;
  crit: boolean;
  /** Zeitpunkt (s) des Treffers. */
  time: number;
}

export interface AggregateEntry {
  enemyUid: number;
  damage: number;
  crit: boolean;
  firstTime: number;
  lastTime: number;
  hits: number;
}

export const AGGREGATE_WINDOW = 0.45;

/**
 * Ab dieser Gegnerzahl werden Damage-Numbers grundsätzlich zusammengefasst
 * (M6-Nachtrag: schon ab ~120 Gegnern statt erst im LOD-Pfad > 250).
 */
export const DAMAGE_AGGREGATE_MIN_ENEMIES = 120;

/** Zusammenfassen, wenn LOD es verlangt oder die Horde groß genug ist. */
export function shouldAggregateDamage(enemies: number, lodAggregate: boolean): boolean {
  return lodAggregate || Math.max(0, Math.floor(enemies)) >= DAMAGE_AGGREGATE_MIN_ENEMIES;
}

/**
 * Harte Obergrenze der gleichzeitig gehaltenen Aggregat-Einträge. Mehr als
 * ~2 Einträge pro sichtbarer Damage-Number bringen keine Anzeige, kosten aber
 * Objekte/Strings im Endgame-Spam.
 */
export const MAX_ENTRIES = 48;

/** Optionaler Objekt-Reuse-Speicher (Pool), damit kein Eintrag neu entsteht. */
export interface EntrySink {
  take(): AggregateEntry;
  give(entry: AggregateEntry): void;
}

/**
 * Fügt ein Ereignis in die Liste ein. Liegt für denselben Gegner bereits ein
 * Eintrag innerhalb des Fensters, wird summiert (Krit bleibt erhalten).
 * Bei Erreichen von MAX_ENTRIES wird der älteste Eintrag verdrängt und (falls
 * ein Sink übergeben wurde) zur Wiederverwendung zurückgegeben.
 */
export function addDamage(
  entries: AggregateEntry[],
  ev: DamageEvent,
  window = AGGREGATE_WINDOW,
  sink?: EntrySink,
): AggregateEntry[] {
  const existing = entries.find(
    (e) => e.enemyUid === ev.enemyUid && ev.time - e.lastTime <= window,
  );
  if (existing) {
    existing.damage += ev.damage;
    existing.crit = existing.crit || ev.crit;
    existing.lastTime = ev.time;
    existing.hits += 1;
    return entries;
  }
  if (entries.length >= MAX_ENTRIES) {
    // Ältesten Eintrag per Swap-Remove verdrängen (O(1) statt splice-Shift).
    let oldest = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].lastTime < entries[oldest].lastTime) oldest = i;
    }
    const victim = entries[oldest];
    entries[oldest] = entries[entries.length - 1];
    entries.pop();
    sink?.give(victim);
  }
  const entry = sink?.take() ?? {
    enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
  };
  entry.enemyUid = ev.enemyUid;
  entry.damage = ev.damage;
  entry.crit = ev.crit;
  entry.firstTime = ev.time;
  entry.lastTime = ev.time;
  entry.hits = 1;
  entries.push(entry);
  return entries;
}

/** Entfernt Einträge, deren Anzeigezeit abgelaufen ist (mutiert die Liste). */
export function expireDamage(
  entries: AggregateEntry[],
  now: number,
  displayTime = 0.8,
  sink?: EntrySink,
): AggregateEntry[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (now - entries[i].lastTime > displayTime) {
      const expired = entries[i];
      entries[i] = entries[entries.length - 1];
      entries.pop();
      sink?.give(expired);
    }
  }
  return entries;
}

/** Anzeige-Text: Schaden gerundet, optional mit "!" bei Krit. */
export function damageLabel(entry: AggregateEntry): string {
  const base = String(Math.max(1, Math.round(entry.damage)));
  return entry.crit ? `${base}!` : base;
}

/** Krit-Schwelle: 8 % Chance, mindestens 1.5× Schaden. */
export function rollCrit(roll: number): boolean {
  return roll < 0.08;
}

export function critDamage(base: number): number {
  return Math.max(1, Math.round(base * 1.5));
}
