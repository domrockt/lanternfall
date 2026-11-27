import Phaser from "phaser";
import { GEMS, type GemSize } from "../logic/xp";
import { DEPTH } from "../gfx/depth";
import { applyTexture, makeImage } from "../gfx/atlas";

interface GemRuntime {
  sprite: Phaser.GameObjects.Image;
  size: GemSize;
  value: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  active: boolean;
  age: number;
}

/** Obergrenze aktiver Kristalle: schützt Frame-Zeit und Bildschirm-Lesbarkeit
 *  bei 30x-Läufen mit zehntausenden Kills. Darüber werden neue Drops verworfen. */
const MAX_GEMS_DEFAULT = 180;

/** Magnetradius als Vielfaches des Pickup-Radius (M10-Messung: siehe Lane-Doku). */
export const MAGNET_RADIUS_FACTOR = 2.2;

/** M10-Messwerte: von der Abnahme über `scene.pickups.stats` gelesen. */
export interface PickupStats {
  /** drop()-Aufrufe insgesamt (inkl. verworfener). */
  dropped: number;
  /** tatsächlich als Kristall angelegte Drops. */
  added: number;
  /** wegen vollem Cap verworfene Drops (XP-Verlust vor der Cap-Härtung). */
  rejected: number;
  /** per Alter (90 s) recycelte Kristalle (XP-Verlust). */
  expired: number;
  /** eingesammelte Kristalle + summierte XP. */
  collected: number;
  collectedXp: number;
  /** M10: bei vollem Cap verschmolzene Drops (statt verworfen). */
  mergedGems: number;
  /** M10: bei der Verschmelzung direkt gutgeschriebene Rest-XP. */
  mergedXp: number;
}

/** Ergebnis einer Verschmelzung: kanonische Größe + Rest-XP. */
export interface GemMerge {
  size: GemSize;
  value: number;
  credited: number;
}

/**
 * M10: Zwei Kristall-Werte verschmelzen, ohne XP zu verlieren.
 * Kanonische Größen bleiben eindeutig (small=2, medium=6, large=18):
 * die größtmögliche Größe <= Summe wird genommen, der Rest wird als
 * `credited` sofort dem Spieler gutgeschrieben. `value + credited` ist
 * immer exakt die Summe der Eingangswerte.
 */
export function mergeGemValues(a: number, b: number): GemMerge {
  const total = Math.max(0, Math.floor(a)) + Math.max(0, Math.floor(b));
  const size: GemSize = total >= GEMS.large.value ? "large" : total >= GEMS.medium.value ? "medium" : "small";
  const value = GEMS[size].value;
  return { size, value, credited: Math.max(0, total - value) };
}

/** XP-Kristalle (3 Größen) + Aufsammelradius/Magnet. */
export class PickupSystem {
  gems: GemRuntime[] = [];
  /** Abnahme-Messwerte (nur zählen, keine Spielwirkung). */
  readonly stats: PickupStats = {
    dropped: 0, added: 0, rejected: 0, expired: 0, mergedGems: 0, mergedXp: 0,
    collected: 0, collectedXp: 0,
  };
  /** Bei vollem Cap gutgeschriebene Rest-XP, die im nächsten update() ankommt. */
  private pendingXp = 0;
  /** Letzter an update() übergebener Pickup-Radius (Abnahme-Messung). */
  lastPickupRadius = 0;
  private readonly free: GemRuntime[] = [];
  private maxGems = MAX_GEMS_DEFAULT;
  /** LOD: Kristalle abdunkeln, damit Gegner-Silhouetten lesbar bleiben. */
  private dim = false;
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  drop(x: number, y: number, size: GemSize, rng: { next(): number }): void {
    this.stats.dropped += 1;
    const meta = GEMS[size];
    if (this.gems.length >= this.maxGems) {
      // M10: Statt den Drop zu verwerfen (XP-Verlust), wird der älteste
      // Kristall mit dem neuen Drop verschmolzen. Die XP-Summe bleibt gleich;
      // ein nicht in eine kanonische Größe passender Rest wird gutgeschrieben.
      const oldest = this.gems.shift();
      if (!oldest) {
        this.stats.rejected += 1;
        return;
      }
      const merged = mergeGemValues(oldest.value, meta.value);
      oldest.size = merged.size;
      oldest.value = merged.value;
      oldest.vx = 0;
      oldest.vy = 0;
      oldest.age = 0;
      oldest.active = true;
      applyTexture(oldest.sprite, `gem_${merged.size}`);
      oldest.sprite.setAlpha(this.dim ? 0.55 : 0.9);
      this.gems.push(oldest);
      this.pendingXp += merged.credited;
      this.stats.mergedGems += 1;
      this.stats.mergedXp += merged.credited;
      return;
    }
    this.stats.added += 1;
    const gem = this.free.pop() ?? this.createRuntime();
    gem.size = size;
    gem.value = meta.value;
    gem.x = x;
    gem.y = y;
    gem.vx = (rng.next() - 0.5) * 30;
    gem.vy = (rng.next() - 0.5) * 30;
    gem.active = true;
    gem.age = 0;
    applyTexture(gem.sprite, `gem_${size}`);
    gem.sprite.setVisible(true).setActive(true).setDepth(DEPTH.gem);
    gem.sprite.setAlpha(this.dim ? 0.55 : 0.9);
    gem.sprite.setPosition(Math.round(x), Math.round(y));
    this.gems.push(gem);
  }

  /** Magnetradius für einen Pickup-Radius (Anziehungsbeginn exakt hier). */
  static magnetRadiusFor(pickupRadius: number): number {
    return Math.max(0, pickupRadius) * MAGNET_RADIUS_FACTOR;
  }

  /** Größe gewichtet würfeln. */
  static rollSize(rng: { next(): number }): GemSize {
    const total = GEMS.small.weight + GEMS.medium.weight + GEMS.large.weight;
    const r = rng.next() * total;
    if (r < GEMS.small.weight) return "small";
    if (r < GEMS.small.weight + GEMS.medium.weight) return "medium";
    return "large";
  }

  prewarm(n: number): void {
    while (this.free.length < n) {
      const g = this.createRuntime();
      g.sprite.setVisible(false).setActive(false);
      this.free.push(g);
    }
  }

  private createRuntime(): GemRuntime {
    const sprite = makeImage(this.scene, 0, 0, "gem_small").setDepth(DEPTH.gem);
    return { sprite, size: "small", value: 1, x: 0, y: 0, vx: 0, vy: 0, active: false, age: 0 };
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    pickupRadius: number,
    onCollect: (value: number, size: GemSize) => void,
    view?: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const magnetRadius = PickupSystem.magnetRadiusFor(pickupRadius);
    this.lastPickupRadius = pickupRadius;
    if (this.pendingXp > 0) {
      // Rest-XP aus einer Verschmelzung sofort zuschreiben (kein Verlust).
      onCollect(this.pendingXp, "small");
      this.pendingXp = 0;
    }
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.age += dt;
      if (!g.active || g.age > 90) {
        if (g.active) {
          this.stats.expired += 1;
          // M10: Auch beim Alter-Recycling keine XP vernichten: der Wert geht
          // in den nächstgelegenen Kristall über (kanonische Größe + Rest-XP).
          let nearest: GemRuntime | null = null;
          let best = Number.POSITIVE_INFINITY;
          for (const other of this.gems) {
            if (other === g || !other.active) continue;
            const d = (other.x - g.x) ** 2 + (other.y - g.y) ** 2;
            if (d < best) { best = d; nearest = other; }
          }
          if (nearest) {
            const merged = mergeGemValues(nearest.value, g.value);
            nearest.size = merged.size;
            nearest.value = merged.value;
            applyTexture(nearest.sprite, `gem_${merged.size}`);
            this.pendingXp += merged.credited;
            this.stats.mergedGems += 1;
            this.stats.mergedXp += merged.credited;
          }
        }
        g.sprite.setVisible(false).setActive(false);
        this.gems.splice(i, 1);
        this.free.push(g);
        continue;
      }
      const dx = playerX - g.x;
      const dy = playerY - g.y;
      const dist = Math.hypot(dx, dy);
      // Dämpfung frame-/substep-unabhängig (Basis: 60 Hz).
      const damping = Math.pow(0.96, dt * 60);
      if (magnetRadius > 0 && dist > 0 && dist <= magnetRadius + 1e-6) {
        // M10-Magnet: Anziehung beginnt exakt am Radius. Konstante Ziel-
        // Geschwindigkeit = Radius/0.4 s, damit ein Kristall vom äußersten
        // Rand in <= 0,4 s ankommt (Schritt wird auf dist geklemmt, kein
        // Überschwingen). vx/vy nur noch für die Messung mitgeführt.
        const speed = magnetRadius / 0.4;
        const step = Math.min(dist, speed * dt);
        g.vx = (dx / dist) * speed;
        g.vy = (dy / dist) * speed;
        g.x += (dx / dist) * step;
        g.y += (dy / dist) * step;
      } else {
        g.vx *= damping;
        g.vy *= damping;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
      }
      g.sprite.setPosition(Math.round(g.x), Math.round(g.y));
      // Kristalle ausserhalb des Viewports nicht rendern (Entfernen aus dem
      // Render-List spart bei Minute 25 mit bis zu 240 Gems Draw-Aufrufe).
      if (view) {
        const show = g.x >= view.x0 && g.x <= view.x1 && g.y >= view.y0 && g.y <= view.y1;
        if (g.sprite.visible !== show) g.sprite.setVisible(show);
      }
      if (dist < 10) {
        this.stats.collected += 1;
        this.stats.collectedXp += g.value;
        onCollect(g.value, g.size);
        g.active = false;
        g.sprite.setVisible(false).setActive(false);
        this.gems.splice(i, 1);
        this.free.push(g);
      }
    }
  }

  /**
   * LOD-Cap setzen. M10: Überzählige werden nicht verworfen, sondern paarweise
   * verschmolzen (älteste zuerst, kanonische Größe, Rest-XP gutgeschrieben).
   * Danach ist `count <= cap` garantiert.
   */
  setCap(cap: number): void {
    this.maxGems = Math.max(24, Math.floor(cap));
    this.dim = this.maxGems <= 120;
    while (this.gems.length > this.maxGems) {
      const oldest = this.gems.shift();
      if (!oldest) break;
      const next = this.gems.shift();
      if (!next) {
        // Ein einzelner Kristall kann nicht weiter verschmolzen werden.
        oldest.sprite.setVisible(false).setActive(false);
        this.free.push(oldest);
        continue;
      }
      const merged = mergeGemValues(oldest.value, next.value);
      next.sprite.setVisible(false).setActive(false);
      this.free.push(next);
      oldest.size = merged.size;
      oldest.value = merged.value;
      oldest.age = 0;
      applyTexture(oldest.sprite, `gem_${merged.size}`);
      oldest.sprite.setAlpha(this.dim ? 0.55 : 0.9);
      this.gems.push(oldest);
      this.pendingXp += merged.credited;
      this.stats.mergedGems += 1;
      this.stats.mergedXp += merged.credited;
    }
    for (const g of this.gems) g.sprite.setAlpha(this.dim ? 0.55 : 0.9);
  }

  get count(): number {
    return this.gems.length;
  }

  /** Kumulierte XP aller Kristalle + noch nicht gutgeschriebener Rest. */
  get totalXp(): number {
    let sum = this.pendingXp;
    for (const g of this.gems) sum += g.value;
    return sum;
  }

  /** Aktuell wirksame Obergrenze (Abnahme-Messung). */
  get cap(): number {
    return this.maxGems;
  }

  releaseAll(): void {
    for (const g of this.gems) {
      g.sprite.setVisible(false).setActive(false);
      this.free.push(g);
    }
    this.gems.length = 0;
  }
}
