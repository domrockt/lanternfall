import Phaser from "phaser";
import { C } from "../palette";
import { PixelText } from "../gfx/font";
import {
  MAX_ENTRIES, MAX_VIEWS_AGGREGATE, ViewBudget, LabelMemo, addDamage, expireDamage, damageLabel,
  aggregateKey, entryMatchesKey, groupZoneFor, resetAggregateEntry, shouldAggregateDamage,
  type AggregateEntry, type EntrySink,
} from "../logic/damage-numbers";
import type { LodState } from "../logic/lod";
import { Pool } from "./Pool";

interface DamageView {
  text: PixelText;
  /** Anzeige-Schlüssel: Gegner-UID (>= 0) oder negierte Bildschirmzone (< 0). */
  key: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  big: boolean;
  active: boolean;
  /** Farbe/Scale ebenfalls nur bei Änderung anwenden. */
  color: number;
  scale: number;
  colorApplied: number;
  scaleApplied: number;
}

/**
 * Gepoolte Damage-Numbers: max. 24 (Aggregat: 10) gleichzeitig, pro Gegner wird
 * innerhalb des Aggregat-Fensters summiert. Nutzt den Bitmap-Font.
 *
 * M10-Batch: `setText` läuft höchstens einmal pro Frame und ausschließlich bei
 * echter Wert-/Krit-Änderung (LabelMemo). Vorher rief jeder einzelne Treffer
 * `setText` erneut auf, auch wenn sich der sichtbare Text nicht änderte.
 */
export class DamageNumberSystem {
  private readonly scene: Phaser.Scene;
  private readonly entries: AggregateEntry[] = [];
  private readonly views: DamageView[] = [];
  private readonly maxViews = 24;
  /** Reuse-Speicher für Aggregat-Einträge: kein Objekt pro Treffer im Steady State. */
  private readonly entryPool = new Pool<AggregateEntry>(
    () => ({
      enemyUid: 0, group: 0, damage: 0, crit: false, firstTime: 0, lastTime: 0,
      hits: 0, x: 0, y: 0, label: "",
    }),
    resetAggregateEntry,
    MAX_ENTRIES,
  );
  private readonly entrySink: EntrySink = {
    take: () => this.entryPool.obtain(),
    give: (e) => this.entryPool.release(e),
  };
  private readonly viewBudget = new ViewBudget();
  /** Zuletzt gezeichneter Text je View-Key (Gegner-UID im Aggregat-Modus). */
  private readonly labelMemo = new LabelMemo();
  private clock = 0;
  private lod: LodState | null = null;
  private enabled = true;
  /** Endgame-Dämpfung der Zahlen (1 = voll); Hauptteil der hellen Fläche. */
  private dim = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    for (let i = 0; i < this.maxViews; i++) {
      const text = new PixelText(scene, 0, 0, "", C.candleWhite, "center").setDepth(15).setVisible(false);
      this.views.push({
        text, key: 0, x: 0, y: 0, life: 0, maxLife: 0.8, big: false, active: false,
        color: C.candleWhite, scale: 1, colorApplied: C.candleWhite, scaleApplied: 1,
      });
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

  /** Aktive View-Obergrenze: im Aggregat-Modus hart auf MAX_VIEWS_AGGREGATE. */
  private viewLimit(aggregate: boolean): number {
    if (!aggregate) return this.maxViews;
    const lodLimit = this.lod?.level === "minimal" ? 6 : MAX_VIEWS_AGGREGATE;
    return Math.min(lodLimit, MAX_VIEWS_AGGREGATE);
  }

  /**
   * Harte Obergrenze auch beim Wechsel in den Aggregat-Modus durchsetzen:
   * vorher aktivierte Views (bis 24) werden älteste-zuerst stillgelegt, damit
   * nie mehr als `limit` Textobjekte gleichzeitig sichtbar bleiben.
   */
  private enforceViewCap(limit: number): void {
    if (this.viewBudget.count <= limit) return;
    const active = this.views.filter((v) => v.active).sort((a, b) => a.life - b.life);
    for (const v of active) {
      if (this.viewBudget.count <= limit) break;
      v.active = false;
      this.viewBudget.deactivate();
      this.labelMemo.forget(v.key);
      v.text.setVisible(false);
    }
  }

  /** Treffer melden; aggregiert Spam pro Gegner oder Bildschirmzone. */
  report(uid: number, x: number, y: number, damage: number, crit: boolean): void {
    if (!this.enabled) return;
    if (!Number.isFinite(damage) || damage <= 0) return;
    // Nur Gegner im/nahe am Viewport zeigen Zahlen (spart Aufwand im 300er-Lauf).
    const cam = this.scene.cameras?.main;
    let sx = x;
    let sy = y;
    if (cam) {
      sx = x - cam.scrollX;
      sy = y - cam.scrollY;
      if (sx < -24 || sy < -24 || sx > cam.width + 24 || sy > cam.height + 24) return;
    }
    const aggregate = shouldAggregateDamage(this.lod?.enemies ?? 0, this.lod?.damageAggregate ?? false);
    // Im Aggregat-Modus teilen sich alle Treffer einer Bildschirmzone einen
    // Eintrag/View. Der Schlüssel ist negativ, damit Zone 1 nicht mit der
    // Gegner-UID 1 kollidiert, wenn der Modus mitten im Lauf wechselt.
    let key = uid;
    let group: number | undefined;
    if (aggregate && cam) {
      group = groupZoneFor(sx, sy, cam.width, cam.height);
      key = aggregateKey(uid, group);
    }
    // LOD: groesseres Fenster, damit weniger Views entstehen.
    addDamage(
      this.entries,
      { enemyUid: uid, group, damage, crit, time: this.clock, x, y },
      aggregate ? 1.2 : undefined,
      this.entrySink,
    );
    const entry = this.entries.find((e) => entryMatchesKey(e, key));
    if (!entry) return;
    let view = this.views.find((v) => v.active && v.key === key);
    if (!view) view = this.views.find((v) => !v.active);
    if (!view) {
      // Alle belegt: ältesten wiederverwenden (kein Draw-Call-Wachstum).
      view = this.views.reduce((a, b) => (a.life < b.life ? a : b));
    }
    const limit = this.viewLimit(aggregate);
    if (!view.active && !this.viewBudget.tryActivate(limit)) return;
    view.active = true;
    if (view.key !== key) {
      // Recycelter View für einen neuen Gegner/eine neue Zone: Label-Memo neu.
      this.labelMemo.forget(view.key);
      view.key = key;
    }
    view.x = x;
    view.y = y - 8;
    view.life = 0.8;
    view.maxLife = 0.8;
    view.big = crit || (entry.hits > 3 && entry.damage > 20);
    view.color = crit ? C.amber : view.big ? C.lantern : C.candleWhite;
    view.scale = view.big ? 1.6 : 1;
    // Position/Alpha duerfen sofort folgen, der teure Text erst im Flush.
    view.text.setPosition(Math.round(x), Math.round(view.y));
    view.text.setAlpha(1).setVisible(true);
  }

  /** Einmal pro Frame: nur geänderte Labels neu setzen (LabelMemo). */
  private flushLabels(): void {
    for (const v of this.views) {
      if (!v.active) continue;
      const entry = this.entries.find((e) => entryMatchesKey(e, v.key));
      if (!entry) continue;
      const label = damageLabel(entry);
      const labelChanged = this.labelMemo.needsUpdate(v.key, label);
      const colorChanged = v.color !== v.colorApplied;
      const scaleChanged = v.scale !== v.scaleApplied;
      if (colorChanged) {
        // Erst Farbe setzen: setColorIndex zeichnet intern den alten Text neu,
        // das folgende setText schreibt dann den aktuellen Wert (nur bei Änderung).
        v.text.setColorIndex(v.color);
        v.colorApplied = v.color;
      }
      if (scaleChanged) {
        v.text.setScale(v.scale);
        v.scaleApplied = v.scale;
      }
      if (labelChanged) {
        v.text.setText(label);
        entry.label = label;
      }
    }
  }

  update(dt: number, camera?: Phaser.Cameras.Scene2D.Camera): void {
    this.clock += dt;
    const aggregate = shouldAggregateDamage(this.lod?.enemies ?? 0, this.lod?.damageAggregate ?? false);
    expireDamage(this.entries, this.clock, aggregate ? 1.3 : 1.1, this.entrySink);
    if (aggregate) this.enforceViewCap(this.viewLimit(true));
    this.flushLabels();
    for (const v of this.views) {
      if (!v.active) continue;
      v.life -= dt;
      if (v.life <= 0) {
        v.active = false;
        this.viewBudget.deactivate();
        this.labelMemo.forget(v.key);
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
    for (const e of this.entries) this.entryPool.release(e);
    this.entries.length = 0;
    this.viewBudget.reset();
    this.labelMemo.reset();
    for (const v of this.views) {
      v.active = false;
      v.text.setVisible(false);
    }
  }

  get count(): number {
    return this.viewBudget.count;
  }
}
