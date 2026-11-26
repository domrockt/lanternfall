import Phaser from "phaser";
import { C, PAL } from "../palette";
import { PixelText } from "../gfx/font";
import { DEPTH } from "../gfx/depth";
import {
  addDamage, expireDamage, damageLabel, shouldAggregateDamage, type AggregateEntry,
} from "../logic/damage-numbers";
import type { LodState } from "../logic/lod";

interface DamageView {
  text: PixelText;
  uid: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  big: boolean;
  active: boolean;
}

/**
 * Gepoolte Damage-Numbers: max. 24 (LOD: 10) gleichzeitig, pro Gegner wird
 * innerhalb des Aggregat-Fensters summiert. Nutzt den Bitmap-Font.
 */
export class DamageNumberSystem {
  private readonly scene: Phaser.Scene;
  private readonly entries: AggregateEntry[] = [];
  private readonly views: DamageView[] = [];
  private readonly maxViews = 24;
  private clock = 0;
  private lod: LodState | null = null;
  private enabled = true;
  /** Endgame-Dämpfung der Zahlen (1 = voll); Hauptteil der hellen Fläche. */
  private dim = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (let i = 0; i < this.maxViews; i++) {
      const text = new PixelText(scene, 0, 0, "", C.candleWhite, "center").setDepth(15).setVisible(false);
      this.views.push({ text, uid: 0, x: 0, y: 0, life: 0, maxLife: 0.8, big: false, active: false });
    }
  }

  setLod(lod: LodState): void {
    this.lod = lod;
    this.setDim(lod.level === "minimal" ? 0.55 : lod.level === "reduced" ? 0.8 : 1);
  }

  /** Endgame-Dim sofort anwenden (Debug-Vorher/Nachher im gleichen Frame). */
  setDim(value: number): void {
    const next = Math.max(0.2, Math.min(1, value));
    if (next === this.dim) return;
    const ratio = next / this.dim;
    this.dim = next;
    for (const v of this.views) {
      if (v.active) v.text.setAlpha(Math.max(0, Math.min(1, v.text.alpha * ratio)));
    }
  }

  /** Option "Damage-Numbers": aus = keine neuen Zahlen, la sofort ausblenden. */
  setEnabled(value: boolean): void {
    if (value === this.enabled) return;
    this.enabled = value;
    if (!value) this.clear();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Treffer melden; aggregiert Spam pro Gegner. */
  report(uid: number, x: number, y: number, damage: number, crit: boolean): void {
    if (!this.enabled) return;
    if (damage <= 0) return;
    // Nur Gegner im/nahe am Viewport zeigen Zahlen (spart Aufwand im 300er-Lauf).
    const cam = this.scene.cameras?.main;
    if (cam) {
      const sx = x - cam.scrollX;
      const sy = y - cam.scrollY;
      if (sx < -24 || sy < -24 || sx > cam.width + 24 || sy > cam.height + 24) return;
    }
    const aggregate = shouldAggregateDamage(this.lod?.enemies ?? 0, this.lod?.damageAggregate ?? false);
    if (!aggregate) {
      addDamage(this.entries, { enemyUid: uid, damage, crit, time: this.clock });
    } else {
      // LOD: Fenster vergrößern, damit weniger Views entstehen.
      addDamage(this.entries, { enemyUid: uid, damage, crit, time: this.clock }, 1.2);
    }
    const entry = this.entries.find((e) => e.enemyUid === uid);
    if (!entry) return;
    let view = this.views.find((v) => v.active && v.uid === uid);
    if (!view) view = this.views.find((v) => !v.active);
    if (!view) {
      // Alle belegt: ältesten wiederverwenden (kein Draw-Call-Wachstum).
      view = this.views.reduce((a, b) => (a.life < b.life ? a : b));
    }
    const limit = aggregate ? (this.lod?.level === "minimal" ? 6 : 10) : this.maxViews;
    const activeCount = this.views.filter((v) => v.active).length;
    if (!view.active && activeCount >= limit) return;
    view.active = true;
    view.uid = uid;
    view.x = x;
    view.y = y - 8;
    view.life = 0.8;
    view.maxLife = 0.8;
    view.big = crit || (entry.hits > 3 && entry.damage > 20);
    view.text.setText(damageLabel(entry));
    view.text.setColorIndex(crit ? C.amber : view.big ? C.lantern : C.candleWhite);
    view.text.setScale(view.big ? 1.6 : 1);
    view.text.setPosition(Math.round(x), Math.round(view.y));
    view.text.setAlpha(1).setVisible(true);
  }

  update(dt: number, camera?: Phaser.Cameras.Scene2D.Camera): void {
    this.clock += dt;
    const aggregate = shouldAggregateDamage(this.lod?.enemies ?? 0, this.lod?.damageAggregate ?? false);
    expireDamage(this.entries, this.clock, aggregate ? 1.3 : 1.1);
    for (const v of this.views) {
      if (!v.active) continue;
      v.life -= dt;
      if (v.life <= 0) {
        v.active = false;
        v.text.setVisible(false);
        continue;
      }
      const p = 1 - v.life / v.maxLife;
      const y = v.y - p * 18;
      v.text.setPosition(Math.round(v.x), Math.round(y));
      v.text.setAlpha(Math.max(0, 1 - p * p) * this.dim);
      if (camera) {
        const sx = v.x - camera.scrollX;
        const sy = y - camera.scrollY;
        const onScreen = sx > -20 && sy > -20 && sx < camera.width + 20 && sy < camera.height + 20;
        if (v.text.visible !== onScreen && onScreen) v.text.setVisible(true);
        if (!onScreen) v.text.setVisible(false);
      }
    }
  }

  clear(): void {
    this.entries.length = 0;
    for (const v of this.views) {
      v.active = false;
      v.text.setVisible(false);
    }
  }

  get count(): number {
    return this.views.filter((v) => v.active).length;
  }
}
