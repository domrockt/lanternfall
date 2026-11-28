import Phaser from "phaser";
import { C } from "../palette";
import { PixelText } from "../gfx/font";
import {
  MAX_ENTRIES, MAX_VIEWS_AGGREGATE, ViewBudget, LabelMemo, addDamage, expireDamage,
  aggregateKey, entryMatchesKey, groupZoneFor, resetAggregateEntry, shouldAggregateDamage,
  planLabels, applyLabelFold, MAX_VISIBLE_LABELS,
  type AggregateEntry, type EntrySink, type LabelCandidate,
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
  /** Grid-Slot, den dieser View beim Aktivieren belegt hat ("cx,cy"). */
  gridKey: string | null;
  /** Farbe/Scale ebenfalls nur bei Änderung anwenden. */
  color: number;
  scale: number;
  colorApplied: number;
  scaleApplied: number;
}

/* ── M10-chaos-fix-dmg-overlap (Befund B4, m10-chaos-legibility-audit) ─────
 * Reine Darstellungs-Helfer: Trefferverhalten und Damage-Berechnung bleiben
 * bitgleich. Drei Hebel:
 *  1. Grid-Offset bei Kollision — Label-Positionen werden auf einem Raster
 *     vergeben; ist der natürliche Slot belegt, wandert das Label um ganze
 *     Zellen weiter (deterministische Spirale), statt sich zu stapeln.
 *  2. Kürzung — Werte >= 100.000 als "184,5k" (max. 6 Zeichen inkl. "!"),
 *     damit 6-stellige Summen nicht den Bildraum dominieren.
 *  3. Anker unterhalb des Gegners (statt über dem Sprite-Zentrum), damit
 *     Sprites nicht verdeckt werden; das Label sinkt von dort nach unten weg.
 * ─────────────────────────────────────────────────────────────────────────── */

/** Max. Zeichen eines Damage-Labels inklusive "!"-Kürzung. */
export const DAMAGE_LABEL_MAX_CHARS = 6;
/** Ab diesem Wert (gerundet) wird im k-Format gekürzt. */
export const DAMAGE_K_THRESHOLD = 100000;

/**
 * Anzeige-Text mit Kürzung: < 100.000 unverändert gerundet (max. 6 Zeichen),
 * darunter im k-Format mit einer Nachkommastelle ("184,5k", deutsches Komma).
 * Krit-"!" zählt mit: passt die Nachkommastelle nicht mehr, wird auf ganze k
 * gerundet ("185k!"). Rein darstellerisch — der Wert im Eintrag bleibt exakt.
 */
export function formatDamageLabel(damage: number, crit: boolean): string {
  const raw = Math.max(1, Math.round(damage));
  const suffix = crit ? "!" : "";
  if (raw < DAMAGE_K_THRESHOLD) return `${raw}${suffix}`;
  const k = raw / 1000;
  let s = k.toFixed(1).replace(".", ",");
  if (s.endsWith(",0")) s = s.slice(0, -2);
  if (`${s}k${suffix}`.length > DAMAGE_LABEL_MAX_CHARS) {
    s = String(Math.round(k));
    // Extremfall >= 1e9 Schaden: notfalls Ziffern absehen (immer noch "…k").
    if (`${s}k${suffix}`.length > DAMAGE_LABEL_MAX_CHARS) {
      s = s.slice(0, DAMAGE_LABEL_MAX_CHARS - 1 - suffix.length);
    }
  }
  return `${s}k${suffix}`;
}

/** Grid-Zellengröße in Spielpixeln: breit genug für 6-Zeichen-Krits (56 px). */
export const DAMAGE_GRID_CELL_W = 64;
/** Hoch genug, damit das Absinken (DAMAGE_SINK_PX) die Nachbarzeile nicht erreicht. */
export const DAMAGE_GRID_CELL_H = 22;
/** Max. Umlauf-Radius in Zellen (Spiralsuche). */
export const DAMAGE_GRID_MAX_CELLS = 3;
/** Anker-Abstand unterhalb des Gegner-Zentrums. */
export const DAMAGE_ANCHOR_BELOW = 12;
/** Wie weit ein Label über seine Lebenszeit nach unten sinkt. */
export const DAMAGE_SINK_PX = 12;

/** Grid-Zellen-Schlüssel einer Bildschirmposition. */
export function gridCellKey(screenX: number, screenY: number): string {
  return `${Math.round(screenX / DAMAGE_GRID_CELL_W)},${Math.round(screenY / DAMAGE_GRID_CELL_H)}`;
}

/**
 * Freier Grid-Slot für ein Label an der natürlichen Bildschirmposition:
 * unbelegt -> Position bleibt exakt am Gegner; belegt -> Umlauf um ganze
 * Zellen in fester Spiralen-Reihenfolge (deterministisch, kein Flackern,
 * gleiche Eingaben => gleicher Slot). Im Sättigungsfall (alle Zellen im
 * Radius belegt) natürliche Position mit eigenem Schlüssel.
 */
export function pickGridSlot(
  baseScreenX: number,
  baseScreenY: number,
  occupied: ReadonlySet<string>,
): { x: number; y: number; key: string } {
  const bx = Math.round(baseScreenX / DAMAGE_GRID_CELL_W);
  const by = Math.round(baseScreenY / DAMAGE_GRID_CELL_H);
  for (let r = 0; r <= DAMAGE_GRID_MAX_CELLS; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const k = `${bx + dx},${by + dy}`;
        if (occupied.has(k)) continue;
        return r === 0
          ? { x: baseScreenX, y: baseScreenY, key: k }
          : { x: baseScreenX + dx * DAMAGE_GRID_CELL_W, y: baseScreenY + dy * DAMAGE_GRID_CELL_H, key: k };
      }
    }
  }
  return { x: baseScreenX, y: baseScreenY, key: `sat,${bx},${by},${occupied.size}` };
}

/**
 * Gepoolte Damage-Numbers: Anzeige ueber planLabels gedeckelt (max.
 * MAX_VISIBLE_LABELS=12 sichtbar, je Bildschirmzone max. 2 Normaltreffer,
 * max. 3 neue Labels je Frame), pro Gegner/Zone wird innerhalb des
 * Aggregat-Fensters summiert. Nutzt den Bitmap-Font.
 *
 * M10-Batch: `setText` läuft höchstens einmal pro Frame und ausschließlich bei
 * echter Wert-/Krit-Änderung (LabelMemo). Vorher rief jeder einzelne Treffer
 * `setText` erneut auf, auch wenn sich der sichtbare Text nicht änderte.
 *
 * M10-damage-calm: report() meldet nur noch; die Anzeige wird einmal pro Frame
 * geplant (Cap je Zone/Frame, Krits groß priorisiert, Summen-Erhalt durch
 * Falten) — kein Tween-Neustart mehr je Treffer.
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
        text, key: 0, x: 0, y: 0, life: 0, maxLife: 0.8, big: false, active: false, gridKey: null,
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
    if (!aggregate) return Math.min(this.maxViews, MAX_VISIBLE_LABELS);
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

  /** Deaktiviert einen View sauber (Budget, Memo, Sichtbarkeit). */
  private deactivateView(v: DamageView): void {
    v.active = false;
    v.gridKey = null;
    this.viewBudget.deactivate();
    this.labelMemo.forget(v.key);
    v.text.setVisible(false);
  }

  /**
   * Treffer melden; aggregiert Spam pro Gegner oder Bildschirmzone. M10-damage-calm:
   * report() berührt KEINE Views mehr — die Anzeige plant einmal pro Frame in
   * update(). Damit startet ein Treffer keinen Tween neu und die Anzeige-Caps
   * (Zone/Frame) gelten pro Frame statt pro Treffer.
   */
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
    let group: number | undefined;
    if (aggregate && cam) {
      group = groupZoneFor(sx, sy, cam.width, cam.height);
    }
    // LOD: groesseres Fenster, damit weniger Views entstehen.
    addDamage(
      this.entries,
      { enemyUid: uid, group, damage, crit, time: this.clock, x, y },
      aggregate ? 1.2 : undefined,
      this.entrySink,
    );
  }

  /**
   * Einmal pro Frame: Anzeige-Plan (planLabels) anwenden — Cap je Zone/Frame,
   * Krits zuerst groß, unterdrückte Normaltreffer in den Zieleintrag falten
   * (Summen-Erhalt). Älteste/niedrigste Labels werden zuerst ersetzt (Sortierung
   * in planLabels). Aktivierung setzt Tween/Position nur beim ersten Aufblitzen.
   */
  private applyDisplayPlan(aggregate: boolean, displayTime: number, camera?: Phaser.Cameras.Scene2D.Camera): void {
    const cam = camera ?? this.scene.cameras?.main;
    const candidates: LabelCandidate[] = [];
    for (const e of this.entries) {
      // Ohne Kamera keine Zone (0 = eigenes Budget) und keine Position: nur
      // planen, wenn der Eintrag eine Position hat (immer der Fall, s. addDamage).
      const zone = cam
        ? groupZoneFor((e.x ?? 0) - cam.scrollX, (e.y ?? 0) - cam.scrollY, cam.width, cam.height)
        : 0;
      candidates.push({ key: aggregateKey(e.enemyUid, e.group), zone, damage: e.damage, crit: e.crit });
    }
    const previouslyVisible = this.views.filter((v) => v.active).map((v) => v.key);
    const limit = this.viewLimit(aggregate);
    const plan = planLabels(candidates, previouslyVisible, { maxVisible: limit });
    if (plan.foldedInto.length > 0) {
      applyLabelFold(this.entries, plan.foldedInto, this.entrySink);
    }
    const visibleSet = new Set(plan.visible);
    for (const v of this.views) {
      if (v.active && !visibleSet.has(v.key)) this.deactivateView(v);
    }
    if (!cam) return;
    for (const key of plan.visible) {
      let view = this.views.find((v) => v.active && v.key === key);
      const fresh = !view;
      if (!view) view = this.views.find((v) => !v.active);
      if (!view) continue; // Slots belegt — durch die Caps praktisch ausgeschlossen.
      const entry = this.entries.find((e) => entryMatchesKey(e, key));
      if (!entry) continue;
      if (fresh) {
        if (!this.viewBudget.tryActivate(limit)) continue;
        view.active = true;
        // Tween/Position nur beim (Erst-)Aufblitzen setzen — kein Neustart je Treffer.
        view.key = key;
        this.labelMemo.forget(key);
        // Anker UNTERHALB des Gegners (B4: Labels verdeckten Sprite-Zentren);
        // Grid-Slot verhindert Stapeln/Überlappen mit bereits sichtbaren Labels.
        const baseSx = (entry.x ?? 0) - cam.scrollX;
        const baseSy = (entry.y ?? 0) - cam.scrollY + DAMAGE_ANCHOR_BELOW;
        const occupied = new Set<string>();
        for (const other of this.views) {
          if (other !== view && other.active && other.gridKey) occupied.add(other.gridKey);
        }
        const slot = pickGridSlot(baseSx, baseSy, occupied);
        view.gridKey = slot.key;
        view.x = slot.x + cam.scrollX;
        view.y = slot.y + cam.scrollY;
        view.life = displayTime;
        view.maxLife = displayTime;
        view.text.setPosition(Math.round(view.x), Math.round(view.y));
        view.text.setAlpha(1).setVisible(true);
      }
      // Groesse/Farbe je Frame aus dem (ggf. gefalteten) Eintrag ableiten:
      // Krit bleibt gross + hervorgehoben, Normaltreffer klein.
      view.big = entry.crit || (entry.hits > 3 && entry.damage > 20);
      view.color = entry.crit ? C.amber : view.big ? C.lantern : C.candleWhite;
      view.scale = view.big ? 1.6 : 1;
    }
  }

  /** Einmal pro Frame: nur geänderte Labels neu setzen (LabelMemo). */
  private flushLabels(): void {
    for (const v of this.views) {
      if (!v.active) continue;
      const entry = this.entries.find((e) => entryMatchesKey(e, v.key));
      if (!entry) continue;
      const label = formatDamageLabel(entry.damage, entry.crit);
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
    const displayTime = aggregate ? 1.3 : 1.1;
    expireDamage(this.entries, this.clock, displayTime, this.entrySink);
    if (aggregate) this.enforceViewCap(this.viewLimit(true));
    this.applyDisplayPlan(aggregate, displayTime, camera);
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
      // Anker liegt unterhalb des Gegners: Label sinkt nach unten WEG vom
      // Sprite (statt aufsteigend über das Sprite-Zentrum zu ziehen).
      const y = v.y + p * DAMAGE_SINK_PX;
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
