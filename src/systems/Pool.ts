/** Generischer Object-Pool für Gegner, Projektile, Gems, Partikel. */
export class Pool<T> {
  private readonly free: T[] = [];
  private readonly activeSet = new Set<T>();

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void = () => {},
    preallocate = 0,
  ) {
    for (let i = 0; i < preallocate; i++) this.free.push(factory());
  }

  obtain(): T {
    const item = this.free.pop() ?? this.factory();
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

  releaseAll(): void {
    for (const item of this.activeSet) {
      this.reset(item);
      this.free.push(item);
    }
    this.activeSet.clear();
  }
}
