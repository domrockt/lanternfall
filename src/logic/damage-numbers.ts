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

/**
 * M10-damage-calm: hartes Sichtbar-Cap für Damage-Labels, unabhängig vom Modus
 * (auch im nicht-aggregierten Regime < 120 Gegner fluteten bis zu 24 kleine
 * Einzelwerte den Bildschirm). Reine Anzeige-Planung — es werden keine
 * Schadenswerte geändert und keine Balance berührt; gebündelte Einträge tragen
 * die Summe ihrer Treffer weiter (Summen-Erhalt).
 */

/** Hartes globales Sichtbar-Cap (Krits + Normaltreffer) gleichzeitig sichtbar. */
export const MAX_VISIBLE_LABELS = 12;

/** Max. sichtbare Normaltreffer-Labels je Bildschirmzone (3×3-Raster). */
export const MAX_NORMAL_PER_ZONE = 2;

/** Staffelung: max. NEU aktivierte Labels je Frame (Krits ausgenommen). */
export const LABEL_BURST_PER_FRAME = 3;

/** Ein Kandidat für die Anzeige-Planung (abgeleitet aus einem AggregateEntry). */
export interface LabelCandidate {
  /** View-/Label-Key (Gegner-UID >= 0 oder negierte Zone < 0). */
  key: number;
  /** Bildschirmzone 1..9 (groupZoneFor); 0 = unbekannt (eigenes Budget). */
  zone: number;
  damage: number;
  crit: boolean;
}

/** Ergebnis der Anzeige-Planung für einen Frame. */
export interface LabelPlan {
  /** Keys, die dieser Frame sichtbar sein dürfen (in Prioritätsreihenfolge). */
  visible: number[];
  /**
   * Unterdückte Normaltreffer [fromKey, toKey]: deren Eintrag wird in den
   * Zieleintrag derselben Zone gefaltet (Schaden/Hits/Crit-Flag), damit keine
   * Summe verloren geht.
   */
  foldedInto: Array<[number, number]>;
}

interface PlanOptions {
  maxVisible?: number;
  maxNormalPerZone?: number;
  burstPerFrame?: number;
}

/**
 * Plant, welche Labels dieser Frame sichtbar sein dürfen:
 * - Krits zuerst (groß + hervorgehoben), nur vom globalen Cap begrenzt — sie
 *   unterliegen weder Zonen-Cap noch Burst-Staffelung.
 * - Normaltreffer: je Zone max. `maxNormalPerZone`, global bis zum Rest-Budget,
 *   neue Aktivierungen max. `burstPerFrame` je Frame (Staffelung bei Dichte).
 * - Nicht gewählte Normaltreffer werden in den (nach Schaden größten)
 *   gewählten Eintrag derselben Zone gefaltet; ohne Zieleintrag bleiben sie
 *   in der Warteschlange und erscheinen in einem späteren Frame.
 * Deterministisch: Sortierung nach Schaden absteigend, Gleichstand nach Key —
 * niedrige/älteste Labels werden zuerst ersetzt.
 */
export function planLabels(
  candidates: readonly LabelCandidate[],
  previouslyVisible: readonly number[] = [],
  opts?: PlanOptions,
): LabelPlan {
  const maxVisible = Math.max(1, Math.floor(opts?.maxVisible ?? MAX_VISIBLE_LABELS));
  const maxNormalPerZone = Math.max(1, Math.floor(opts?.maxNormalPerZone ?? MAX_NORMAL_PER_ZONE));
  const burstPerFrame = Math.max(0, Math.floor(opts?.burstPerFrame ?? LABEL_BURST_PER_FRAME));
  const prev = new Set(previouslyVisible);

  const crits: LabelCandidate[] = [];
  const normals: LabelCandidate[] = [];
  for (const c of candidates) (c.crit ? crits : normals).push(c);
  const byDamage = (a: LabelCandidate, b: LabelCandidate) => (b.damage - a.damage) || (a.key - b.key);
  crits.sort(byDamage);
  normals.sort(byDamage);

  const visible: number[] = [];
  let budget = maxVisible;
  // 1) Krits: immer zuerst, unabhängig von Zone/Staffelung.
  for (const c of crits) {
    if (budget <= 0) break;
    visible.push(c.key);
    budget -= 1;
  }
  // 2) Normaltreffer: Zonen-Cap + Rest-Budget + Burst-Staffelung.
  const zoneCount = new Map<number, number>();
  const selectedNormals: LabelCandidate[] = [];
  let burst = burstPerFrame;
  for (const c of normals) {
    if (budget <= 0) break;
    if ((zoneCount.get(c.zone) ?? 0) >= maxNormalPerZone) continue;
    if (!prev.has(c.key)) {
      if (burst <= 0) continue; // Staffelung: neuer Key erst im Folgeframe.
      burst -= 1;
    }
    visible.push(c.key);
    zoneCount.set(c.zone, (zoneCount.get(c.zone) ?? 0) + 1);
    selectedNormals.push(c);
    budget -= 1;
  }
  // 3) Unterdrückte Normaltreffer in den größten gewählten Eintrag derselben
  //    Zone falten (Summen-Erhalt). Ohne Zieleintrag: später erneut versuchen.
  const foldedInto: Array<[number, number]> = [];
  const selectedByZone = new Map<number, number>();
  for (const c of selectedNormals) {
    if (!selectedByZone.has(c.zone)) selectedByZone.set(c.zone, c.key);
  }
  const chosen = new Set(visible);
  for (const c of normals) {
    if (chosen.has(c.key)) continue;
    const target = selectedByZone.get(c.zone);
    if (target === undefined) continue;
    foldedInto.push([c.key, target]);
  }
  return { visible, foldedInto };
}

/**
 * Wendet eine Fold-Liste auf die Einträge an: `fromKey` wird in `toKey`
 * zusammengelegt (Schaden, Treffer, Crit-Flag, Zeitfenster) und entfernt.
 * Summen-Erhalt: die Summe aller `damage` bleibt exakt erhalten. Mutiert die
 * Liste (Swap-Remove) und gibt freigestellte Einträge an den Sink zurück.
 */
export function applyLabelFold(
  entries: AggregateEntry[],
  foldedInto: ReadonlyArray<readonly [number, number]>,
  sink?: EntrySink,
): void {
  for (const [fromKey, toKey] of foldedInto) {
    if (fromKey === toKey) continue;
    const fromIdx = entries.findIndex((e) => entryMatchesKey(e, fromKey));
    if (fromIdx < 0) continue;
    const to = entries.find((e) => entryMatchesKey(e, toKey));
    if (!to) continue;
    const from = entries[fromIdx];
    to.damage += from.damage;
    to.hits += from.hits;
    to.crit = to.crit || from.crit;
    to.lastTime = Math.max(to.lastTime, from.lastTime);
    entries[fromIdx] = entries[entries.length - 1];
    entries.pop();
    sink?.give(from);
  }
}
