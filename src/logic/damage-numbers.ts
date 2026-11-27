/**
 * Damage-Number-Zusammenfassung: Bei Spam (viele Treffer pro Frame) werden
 * Zahlen desselben Gegners kurz summiert statt einzeln zu fluten. Reine Logik.
 *
 * M10: Einträge lassen sich optional zu einer Gegner-Gruppe zusammenfassen
 * (`group`), damit im 500er-Chaos nicht pro Gegner ein eigener Eintrag/Text
 * entsteht. Zusätzlich merkt sich `LabelMemo` den zuletzt gezeichneten Text:
 * `setText` wird nur noch bei einer echten Wert-/Krit-Änderung aufgerufen.
 */
export interface DamageEvent {
  enemyUid: number;
  damage: number;
  crit: boolean;
  /** Zeitpunkt (s) des Treffers. */
  time: number;
  /** Optionale Gegner-Gruppe (z. B. Bildschirmzone); gleiche Gruppe summiert. */
  group?: number;
  /** Optionale Trefferposition für eine gruppierte Anzeige. */
  x?: number;
  y?: number;
}

export interface AggregateEntry {
  enemyUid: number;
  /** Gegner-Gruppe; 0 = keine Gruppierung (ein Eintrag je Gegner). */
  group?: number;
  damage: number;
  crit: boolean;
  firstTime: number;
  lastTime: number;
  hits: number;
  /** Trefferposition (optional, für gruppierte Anzeige). */
  x?: number;
  y?: number;
  /** Zuletzt gezeichneter Label-Text (Memo gegen redundante setText-Aufrufe). */
  label?: string;
}

export const AGGREGATE_WINDOW = 0.45;
/** Setzt ein recyceltes Aggregat-Objekt vollständig zurück (keine Restfelder). */
export function resetAggregateEntry(e: AggregateEntry): void {
  e.enemyUid = 0;
  e.damage = 0;
  e.crit = false;
  e.firstTime = 0;
  e.lastTime = 0;
  e.hits = 0;
  // M10-Zusatzfelder vollständig entfernen, damit ein recycelter Eintrag
  // keine Gruppierung/Position/Label eines früheren Treffers erbt.
  delete e.group;
  delete e.x;
  delete e.y;
  delete e.label;
}

/**
 * Budget für gleichzeitig sichtbare Damage-Number-Views. Ersetzt das frühere
 * `views.filter(...).length` pro Treffer (Allokation) durch einen Zähler.
 */
export class ViewBudget {
  private active = 0;

  tryActivate(limit: number): boolean {
    if (this.active >= limit) return false;
    this.active += 1;
    return true;
  }

  deactivate(): void {
    this.active = Math.max(0, this.active - 1);
  }

  reset(): void {
    this.active = 0;
  }

  get count(): number {
    return this.active;
  }
}

/**
 * Merkt sich je View-Key den zuletzt gesetzten Text. `needsUpdate` ist genau
 * dann true, wenn sich der sichtbare Text ändert – also der einzige Fall, in
 * dem `setText` auf dem gepoolten Textobjekt nötig ist.
 */
export class LabelMemo {
  private readonly labels = new Map<number, string>();

  needsUpdate(key: number, label: string): boolean {
    const prev = this.labels.get(key);
    if (prev === label) return false;
    this.labels.set(key, label);
    return true;
  }

  forget(key: number): void {
    this.labels.delete(key);
  }

  reset(): void {
    this.labels.clear();
  }

  get size(): number {
    return this.labels.size;
  }
}

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
 * Harte Obergrenze gleichzeitig aktiver Views im Aggregat-Modus. Mehr Labels
 * als das bringen im Chaos keinen Lesbarkeitsgewinn, kosten aber Text-/Fill-Zeit.
 */
export const MAX_VIEWS_AGGREGATE = 10;

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

function blankEntry(): AggregateEntry {
  return {
    enemyUid: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0, hits: 0,
  };
}

/**
 * Fügt ein Ereignis in die Liste ein. Liegt für denselben Gegner (oder dieselbe
 * Gegner-Gruppe) bereits ein Eintrag innerhalb des Fensters, wird summiert
 * (Krit bleibt erhalten). Ungültiger Schaden (NaN/Infinity/<=0) wird verworfen.
 * Bei Erreichen von MAX_ENTRIES wird der älteste Eintrag verdrängt und (falls
 * ein Sink übergeben wurde) zur Wiederverwendung zurückgegeben.
 */
export function addDamage(
  entries: AggregateEntry[],
  ev: DamageEvent,
  window = AGGREGATE_WINDOW,
  sink?: EntrySink,
): AggregateEntry[] {
  if (!Number.isFinite(ev.damage) || ev.damage <= 0) return entries;
  const group = ev.group ?? 0;
  const existing = entries.find(
    (e) => (group !== 0 ? e.group === group : (e.group ?? 0) === 0 && e.enemyUid === ev.enemyUid)
      && ev.time - e.lastTime <= window,
  );
  if (existing) {
    existing.damage += ev.damage;
    existing.crit = existing.crit || ev.crit;
    existing.lastTime = ev.time;
    existing.hits += 1;
    if (Number.isFinite(ev.x) && Number.isFinite(ev.y)) {
      existing.x = ev.x as number;
      existing.y = ev.y as number;
    }
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
  const entry = sink?.take() ?? blankEntry();
  entry.enemyUid = ev.enemyUid;
  entry.group = group;
  entry.damage = ev.damage;
  entry.crit = ev.crit;
  entry.firstTime = ev.time;
  entry.lastTime = ev.time;
  entry.hits = 1;
  entry.x = Number.isFinite(ev.x) ? (ev.x as number) : 0;
  entry.y = Number.isFinite(ev.y) ? (ev.y as number) : 0;
  entry.label = "";
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

/**
 * View-/Label-Key für einen Treffer: ohne Gruppe die Gegner-UID (Invariante:
 * UIDs sind >= 0), mit Gruppe ein negativer Zonen-Key (Gruppen sind >= 1). So
 * kollidiert eine Zone nie mit einer UID und Eintrag/View lassen sich ohne
 * zusätzliche Map finden.
 */
export function aggregateKey(enemyUid: number, group?: number): number {
  const g = group ?? 0;
  return g !== 0 ? -g : enemyUid;
}

/** Gehört ein Aggregat-Eintrag zu diesem View-Key (UID oder Gegner-Gruppe)? */
export function entryMatchesKey(entry: AggregateEntry, key: number): boolean {
  const group = entry.group ?? 0;
  return key < 0 ? group === -key : group === 0 && entry.enemyUid === key;
}

/** Anzeige-Text: Schaden gerundet, optional mit "!" bei Krit. */
export function damageLabel(entry: AggregateEntry): string {
  const base = String(Math.max(1, Math.round(entry.damage)));
  return entry.crit ? `${base}!` : base;
}

/**
 * Bildschirmzone als Gegner-Gruppe (3x3 = 9 <= MAX_VIEWS_AGGREGATE). Treffer
 * derselben Zone teilen sich einen Eintrag/View, statt pro Gegner einen Text
 * zu erzeugen. Rein rechnerisch, ohne Kamera-Abhängigkeit.
 */
export const GROUP_COLUMNS = 3;
export const GROUP_ROWS = 3;

export function groupZoneFor(screenX: number, screenY: number, width: number, height: number): number {
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY) || width <= 0 || height <= 0) return 0;
  const col = Math.max(0, Math.min(GROUP_COLUMNS - 1, Math.floor((screenX / width) * GROUP_COLUMNS)));
  const row = Math.max(0, Math.min(GROUP_ROWS - 1, Math.floor((screenY / height) * GROUP_ROWS)));
  // +1, damit Zone 0 nicht mit dem Sentinel "keine Gruppe" (0) kollidiert.
  return 1 + row * GROUP_COLUMNS + col;
}

/** Krit-Schwelle: 8 % Chance, mindestens 1.5× Schaden. */
export function rollCrit(roll: number): boolean {
  return roll < 0.08;
}

export function critDamage(base: number): number {
  return Math.max(1, Math.round(base * 1.5));
}
