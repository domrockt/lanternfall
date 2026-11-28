/**
 * Generischer Object-Pool für Gegner, Projektile, Gems, Partikel und
 * Damage-Number-Einträge. Im Steady State wird kein Objekt neu angelegt:
 * `obtain()` nimmt aus dem Free-Stack, `release()` legt nach Reset zurück.
 * `trim()` BEGRENZT den Free-Stack, ist aktuell aber NICHT verdrahtet: 0 Aufruf-
 * stellen im Run-Pfad (Befund Karte #2438, docs/lanes/m10-pool-trim.md). Der
 * generische Pool hält Overhang daher, bis sein Nutzer trim() ruft oder der
 * Pool selbst garabge wird. Echte Verdrahtung: Karte #2439 (EnemyPool/
 * ProjectilePool führen eigene free-Arrays ohne Trim).
 */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly activeSet = new Set<T>();
  private createdCount = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void = () => {},
    preallocate = 0,
  ) {
    for (let i = 0; i < preallocate; i++) this.free.push(this.grow());
  }

  private grow(): T {
    const item = this.factory();
    this.createdCount += 1;
    return item;
  }

  obtain(): T {
    const item = this.free.pop() ?? this.grow();
    this.activeSet.add(item);
    return item;
  }

  release(item: T): void {
    if (!this.activeSet.has(item)) return;
    this.activeSet.delete(item);
    this.reset(item);
    this.free.push(item);
  }

  get activeCount(): number {
    return this.activeSet.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Wie oft die Factory insgesamt lief (Diagnose: Steady State = konstant). */
  get createdTotal(): number {
    return this.createdCount;
  }

  /** Gibt den aktiven Bestand zurück und leert ihn (Szenen-Ende/Reset). */
  releaseAll(): void {
    for (const item of this.activeSet) {
      this.reset(item);
      this.free.push(item);
    }
    this.activeSet.clear();
  }

  /**
   * Kappt den Free-Stack auf `maxFree` Objekte. Der Rest wird vom GC
   * eingesammelt, damit Peak-Wellen nicht dauerhaft Speicher halten.
   */
  trim(maxFree = 0): number {
    const keep = Math.max(0, Math.floor(maxFree));
    const removed = Math.max(0, this.free.length - keep);
    if (removed > 0) this.free.length = keep;
    return removed;
  }
}
