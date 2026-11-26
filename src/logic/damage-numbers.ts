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
 * Fügt ein Ereignis in die Liste ein. Liegt für denselben Gegner bereits ein
 * Eintrag innerhalb des Fensters, wird summiert (Krit bleibt erhalten).
 */
export function addDamage(entries: AggregateEntry[], ev: DamageEvent, window = AGGREGATE_WINDOW): AggregateEntry[] {
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
  entries.push({
    enemyUid: ev.enemyUid,
    damage: ev.damage,
    crit: ev.crit,
    firstTime: ev.time,
    lastTime: ev.time,
    hits: 1,
  });
  return entries;
}

/** Entfernt Einträge, deren Anzeigezeit abgelaufen ist (mutiert die Liste). */
export function expireDamage(entries: AggregateEntry[], now: number, displayTime = 0.8): AggregateEntry[] {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (now - entries[i].lastTime > displayTime) entries.splice(i, 1);
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
