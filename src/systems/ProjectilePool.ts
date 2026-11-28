import Phaser from "phaser";
import type { EnemyRuntime } from "./EnemyPool";
import { DEPTH } from "../gfx/depth";
import { FX_GLOW_DEPTH } from "./FxSystem";
import { applyTexture, makeImage } from "../gfx/atlas";

export interface ProjectileRuntime {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  pierce: number;
  knockback: number;
  radius: number;
  life: number;
  weaponId: string;
  active: boolean;
  /** Getroffene Gegner per Spawn-UID (Pooling-sicher). */
  hit: Set<number>;
  /** Ember zielt schwach auf diesen Gegner (sanftes Homing). */
  target: EnemyRuntime | null;
  targetUid: number;
  /** Trail-Textur + Intervall (s), null = kein Trail. */
  trail: string | null;
  /**
   * Vom Waffenaufruf gewünschter Trail (M10-projectile-cull): `trail` wird im
   * Pool dynamisch abgeschaltet, solange das Projektil weit offscreen ist
   * (unsichtbare Trail-Puffs kosten fx-Slots + Draw), beim Rückkehr ins Bild
   * aber original wiederhergestellt. CombatSystem bleibt NICHT angefasst.
   */
  trailSetpoint: string | null;
  /** Animierte Trail-Frames (4–8) für Glut/Eis/Dorn. */
  trailFrames: string[];
  trailTimer: number;
  trailInterval: number;
  /** Additive Überblendung für magische Projektile. */
  blendAdd: boolean;
  /** Optionaler Flächen-Explosionsradius beim Treffer (Evolution). */
  explodeRadius: number;
}

/** Projektil-Pool. Textur frei wählbar (M2 nutzt dieselbe Infrastruktur). */
export class ProjectilePool {
  active: ProjectileRuntime[] = [];
  private readonly free: ProjectileRuntime[] = [];
  private readonly scene: Phaser.Scene;

  /**
   * M10-projectile-cull: Reuse-/Recycle-Statistik (Abnahme).
   * created bleibt nach dem Warmup flach, wenn Recycling greift.
   */
  readonly stats = { spawned: 0, reused: 0, created: 0, culled: 0, stolen: 0, trailSuppressed: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawn(opts: {
    x: number; y: number; vx: number; vy: number; damage: number;
    pierce: number; knockback: number; life?: number; weaponId?: string;
    texture?: string; radius?: number; target?: EnemyRuntime | null;
    trail?: string | null; trailFrames?: string[]; trailInterval?: number; blendAdd?: boolean; explodeRadius?: number;
    /** Darstellungsgröße (Hitbox bleibt radius). */ scale?: number;
  }): ProjectileRuntime {
    this.stats.spawned += 1;
    let p = this.free.pop();
    if (p) {
      this.stats.reused += 1;
    } else {
      // M10-projectile-cull: kein neues Allozieren bei knappem Pool — zuerst
      // wird ein ohnehin cull-erlaubtes, weit offscreen Projektil gestohlen
      // (exakt das, was compact() beim nächsten Lauf freigegeben hätte).
      const stolen = this.stealCullable();
      if (stolen) {
        this.stats.stolen += 1;
        this.releaseRuntime(stolen);
        p = this.free.pop();
      }
      if (!p) {
        p = this.createRuntime();
        this.stats.created += 1;
      } else {
        this.stats.reused += 1;
      }
    }
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.damage = opts.damage;
    p.pierce = opts.pierce;
    p.knockback = opts.knockback;
    p.radius = opts.radius ?? 4;
    p.life = opts.life ?? 2.4;
    p.weaponId = opts.weaponId ?? "ember";
    p.target = opts.target ?? null;
    p.targetUid = opts.target?.uid ?? 0;
    // M10-projectile-cull: gewünschter Trail wird gemerkt; compact() darf
    // `trail` für offscreen Projektile temporär abschalten (Draw/FX-Ersparnis).
    p.trailSetpoint = opts.trail ?? null;
    p.trail = p.trailSetpoint;
    // trailFrames wird IN PLACE befüllt (kein Array pro Spawn): Churn-Hebel
    // Heap-Margin — das Runtime-Objekt behält seine Array-Identität.
    if (opts.trailFrames) {
      p.trailFrames.length = opts.trailFrames.length;
      for (let i = 0; i < opts.trailFrames.length; i++) p.trailFrames[i] = opts.trailFrames[i];
    } else if (p.trail) {
      p.trailFrames.length = 1;
      p.trailFrames[0] = p.trail;
    } else {
      p.trailFrames.length = 0;
    }
    p.trailTimer = 0;
    p.trailInterval = opts.trailInterval ?? 0.045;
    p.blendAdd = opts.blendAdd ?? false;
    p.explodeRadius = opts.explodeRadius ?? 0;
    p.active = true;
    p.hit.clear();
    applyTexture(p.sprite, opts.texture ?? "projectile_ember");
    p.sprite.setBlendMode(p.blendAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    // M10-tablet-fx-hotspot (K2): ADD-Projektile (Eis-Volley) rendern im gemeinsamen
    // ADD-Band statt als Insel auf DEPTH.death — bleibt unter Gegnern (9).
    p.sprite.setVisible(true).setActive(true).setDepth(p.blendAdd ? FX_GLOW_DEPTH : DEPTH.death);
    p.sprite.setPosition(Math.round(opts.x), Math.round(opts.y));
    p.sprite.setRotation(Math.atan2(opts.vy, opts.vx));
    p.sprite.setScale(opts.scale ?? 1);
    this.active.push(p);
    return p;
  }

  prewarm(n: number): void {
    while (this.free.length < n) {
      const p = this.createRuntime();
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
  }

  private createRuntime(): ProjectileRuntime {
    const sprite = makeImage(this.scene, 0, 0, "projectile_ember").setDepth(DEPTH.death);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, damage: 0, pierce: 0, knockback: 0,
      radius: 4, life: 0, weaponId: "ember", active: false, hit: new Set(), target: null, targetUid: 0,
      trail: null, trailSetpoint: null, trailFrames: [], trailTimer: 0, trailInterval: 0.045, blendAdd: false, explodeRadius: 0,
    };
  }

  // ── M10-projectile-cull: Offscreen-Recycle + Draw/FX-Skip ─────
  // Messung (#5458): Gegner excursieren max. ~270px jenseits des Views; jenseits
  // view+256px gingen im Harness 0 Projektil-Treffer verloren, bei 96px hingegen
  // 325. Die Margin skaliert mit der View-Diagonale (Referenz 640x360), damit
  // breite Formate (780/860) denselben relativen Sicherheitsabstand behalten.
  static readonly CULL_MARGIN_REF = 256;
  static readonly CULL_REF_DIAG = 743.97; // hypot(640, 360)
  /** Sprite-/Trail-Skip dicht außerhalb des Views (ohne Verhaltenseinfluss). */
  static readonly HIDE_MARGIN = 24;

  private viewCache: { x: number; y: number; width: number; height: number } | null = null;
  /**
   * m10-heap-pool-fix: wiederverwendetes Cache-Objekt — das Ergebnis von
   * `view()` darf NICHT über den Frame hinaus gehalten werden (Identität
   * bleibt dieselbe, Werte werden pro Frame in-place neu geschrieben).
   */
  private readonly viewScratch: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private viewCacheFrame = -1;

  /** Sichtbarer Weltbereich; null, wenn keine Kamera vorhanden (Tests). */
  private view(): { x: number; y: number; width: number; height: number } | null {
    const frame = this.scene.game?.loop?.frame;
    // Frame-Cache VOR jeder Allokation prüfen (Review m10-heap-pool-fix:
    // sonst wird pro Aufruf die compute-Closure alloziert).
    if (frame !== undefined && frame === this.viewCacheFrame) return this.viewCache;
    const v = this.scene.cameras?.main?.worldView;
    let result: { x: number; y: number; width: number; height: number } | null;
    if (v && v.width > 0 && v.height > 0) {
      this.viewScratch.x = v.x;
      this.viewScratch.y = v.y;
      this.viewScratch.width = v.width;
      this.viewScratch.height = v.height;
      result = this.viewScratch;
    } else {
      result = null;
    }
    if (frame === undefined) return result; // Testumgebung ohne Loop: frisch rechnen
    this.viewCache = result;
    this.viewCacheFrame = frame;
    return result;
  }

  /** Abnahme-Flag (registry "lf-proj-cull"); default an, 0 = Vorher-Verhalten. */
  private cullEnabled(): boolean {
    const reg = (this.scene as unknown as { registry?: { get(key: string): unknown } }).registry;
    return reg?.get("lf-proj-cull") !== 0;
  }

  private cullMargin(view: { width: number; height: number }): number {
    const diag = Math.hypot(view.width, view.height);
    return Math.max(64, Math.round((ProjectilePool.CULL_MARGIN_REF * diag) / ProjectilePool.CULL_REF_DIAG));
  }

  /** Kann das Projektil noch treffen (Live-Target)? */
  private hasLiveTarget(p: ProjectileRuntime): boolean {
    return p.target !== null && p.target.alive && p.target.uid === p.targetUid;
  }

  /** Fliegt das Projektil vom Sichtzentrum weg (kommt nicht von selbst zurück)? */
  private movingAway(p: ProjectileRuntime, view: { x: number; y: number; width: number; height: number }): boolean {
    const cx = view.x + view.width / 2;
    const cy = view.y + view.height / 2;
    return p.vx * (p.x - cx) + p.vy * (p.y - cy) > 0;
  }

  /** Distanz jenseits des View-Rechtecks (0 = innerhalb). */
  private beyond(view: { x: number; y: number; width: number; height: number }, p: ProjectileRuntime): number {
    // Chebyshev-Distanz zum Rechteck: an den Ecken dadurch etwas konservativer
    // (kleinerer Cull-Bereich) als eine euklidische Skalierung — bewusst so.
    const dx = Math.max(view.x - p.x, p.x - (view.x + view.width), 0);
    const dy = Math.max(view.y - p.y, p.y - (view.y + view.height), 0);
    return Math.max(dx, dy);
  }

  /**
   * Cull-Kandidat für den Notfall-Pool-Diebstahl: weit offscreen, ohne
   * Live-Target, wegfliegend — compact() würde es sowieso freigeben.
   * WICHTIG: ordnungserhaltende Entfernung (splice) — ein Swap-Pop würde die
   * Aktivreihenfolge permutieren und damit die Reihenfolge der Treffer und
   * der Crit-RNG-Streams ändern (Vorher/Nachher-Vergleich bricht).
   */
  private stealCullable(): ProjectileRuntime | null {
    const view = this.view();
    if (!view || !this.cullEnabled()) return null;
    const margin = this.cullMargin(view);
    let best: ProjectileRuntime | null = null;
    let bestD = margin;
    let bestIdx = -1;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p.active || this.hasLiveTarget(p)) continue;
      const d = this.beyond(view, p);
      if (d > bestD && this.movingAway(p, view)) {
        bestD = d;
        best = p;
        bestIdx = i;
      }
    }
    if (!best || bestIdx < 0) return null;
    this.active.splice(bestIdx, 1); // Reihenfolge der übrigen bleibt erhalten
    this.stats.culled += 1;
    return best;
  }

  /** Laufzeiteintrag freigeben (Sprite aus, zurück in den Free-Stack). */
  private releaseRuntime(p: ProjectileRuntime): void {
    p.active = false;
    p.sprite.setVisible(false).setActive(false);
    this.free.push(p);
  }

  compact(): void {
    // M10-projectile-cull: ordnungserhaltende Kompaktion (Write-Index). Der
    // alte Swap-Pop permutierte die Reihenfolge der Aktiven; da hitEnemy pro
    // Treffer den Crit-RNG-Stream konsumiert, hätte jede Permutation die
    // Treffer-/Schadens-Summen Vorher/Nachher verändert. So bleiben die
    // relativen Positionen aller überlebenden Projektile erhalten.
    const view = this.view();
    const cull = view !== null && this.cullEnabled();
    const margin = view ? this.cullMargin(view) : 0;
    const hideMargin = ProjectilePool.HIDE_MARGIN;
    let w = 0;
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];
      if (p.active && view) {
        const d = this.beyond(view, p);
        if (cull && d > margin && !this.hasLiveTarget(p) && this.movingAway(p, view)) {
          // Sofort frei: weit offscreen, ohne Ziel, wegfliegend — kann laut
          // Messung (#5458) keinen Treffer mehr erzielen.
          this.stats.culled += 1;
          p.active = false;
        } else if (cull && d > hideMargin) {
          // Unsichtbar im Hyperraum: Sprite aus (Draw-Skip) und Trail abstellen
          // (offscreen Trail-Puffs kosten fx-Slots). Beim Zurückkommen ins Bild
          // wird beides wiederhergestellt — Treffer-/Bewegungsverhalten bleibt.
          if (p.sprite.visible) p.sprite.setVisible(false).setActive(false);
          if (p.trail !== null) {
            p.trail = null;
            this.stats.trailSuppressed += 1;
          }
        } else {
          // Restore-Zweig läuft auch bei cull=false: ein Umbau des Flags zur
          // Laufzeit (lf-proj-cull 1 -> 0) darf versteckte Sprites/Trails
          // nicht einfrieren (Review-Anmerkung 2026-11-27).
          if (!p.sprite.visible) p.sprite.setVisible(true).setActive(true);
          if (p.trail !== p.trailSetpoint) p.trail = p.trailSetpoint;
        }
      }
      if (!p.active) {
        this.releaseRuntime(p);
      } else {
        this.active[w] = p;
        w += 1;
      }
    }
    this.active.length = w;
  }

  releaseAll(): void {
    for (const p of this.active) {
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
    this.active.length = 0;
  }
}
