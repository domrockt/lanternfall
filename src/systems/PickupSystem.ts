import Phaser from "phaser";
import { GEMS, type GemSize } from "../logic/xp";
import { DEPTH } from "../gfx/depth";
import { applyTexture, makeImage } from "../gfx/atlas";
import { iconKeyForOffer } from "../gfx/icons";
import { C, PAL } from "../palette";

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

/** M10-Draw-Cap: harte Obergrenze sichtbarer Kristalle, unabhängig von der
 *  LOD-Stufe. Mehr als 120 Gems bringen im Chaos keinen Lesbarkeitsgewinn,
 *  kosten aber je ein Draw-Objekt. Überschuss wird verlustfrei verschmolzen. */
export const MAX_VISIBLE_GEMS = 120;

/** Magnetradius als Vielfaches des Pickup-Radius (M10-Messung: siehe Lane-Doku). */
export const MAGNET_RADIUS_FACTOR = 2.2;

/** M10: Zusätzlicher Magnet-Aufschlag bei vollem Feld (0..+50 %), damit
 *  dicht liegende Kristalle trotz Deckel zuverlässig eingesammelt werden. */
export const MAGNET_COUNT_SCALE = 0.5;

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
  /** M10-Draw-Cap: jemals als Drop erzeugte XP (Kontrolle der XP-Erhaltung). */
  spawnedXp: number;
  /** M10-Draw-Cap: tatsächlich an den Spieler gutgeschriebene XP. */
  grantedXp: number;
}

/** Ergebnis einer Verschmelzung: kanonische Größe + Rest-XP. */
export interface GemMerge {
  size: GemSize;
  value: number;
  credited: number;
}

// ── M10-Pickup-Moment (A10-Lesbarkeit, Dom 21:45Z) ─────────────────────────
//
// Das Einsammeln eines Powerups (Level-up-Wahl oder Truhe) war bisher ein
// lautloser Stat-Austausch — im 500er-Chaos geht verloren, WANN welche
// Stärke aktiv wurde. Der Moment ist bewusst kurz (~0,4 s) und wird in
// Zielgröße gezeichnet: Icon 16x16 @ Scale 1, 1-px-Rim/Ring in Ganzzahl-
// schritten, nur Palettenfarben (kein Mixel, nie > 1x hochskaliert).
// Eigene Phaser-Objekte, eigene Uhr in update() — kein FxSystem-Slot,
// keine Tweens im Massenpfad; der Gem-Pfad bleibt unberührt.

/** Gesamtdauer eines Aufnahme-Moments (s). Abnahme: <= 0,5 s. */
export const MOMENT_DURATION = 0.4;
/** Maximal parallele Momente (gekettete Level-ups); Ältester wird beendet. */
export const MAX_MOMENTS = 3;
/** Icon-Größe (Spielpixel) — wird mit Scale 1 gezeichnet (kein Mixel). */
export const MOMENT_ICON_SIZE = 16;
/** Ring-Radius in 1-px-Schritten (Aufblitz-Welle um den Spieler). */
export const MOMENT_RING_FROM = 8;
export const MOMENT_RING_TO = 16;
/** Rim-Breite in px (A10-Vertrag: 1-px-Stufen). */
export const MOMENT_RIM_PX = 1;
/** Rim bleibt bis zu diesem Anteil der Dauer sichtbar (art-director Runde 1:
 *  vorher war der volle Rim exakt während des Aufblitz-Blocks aktiv). */
export const MOMENT_RIM_UNTIL = 0.6;
/** Mindest-Alpha der Ring-Welle — stirbt nicht mehr vor Radius 16. */
export const MOMENT_RING_MIN_ALPHA = 0.45;
/** Aufblitz je Powerup = Akzentfarbe (im spec.flash); Laternenweiß würde in
 *  der hellen Level-up-Säule untergehen, die zur selben Zeit läuft. */
/** Über den Gegner-Projektilen, unter dem Licht — im Chaos lesbar. */
const MOMENT_DEPTH = DEPTH.enemyShot + 1;

/** Paletten-Akzentfarbe je Powerup (sprechbare Unterscheidbarkeit im Chaos). */
export const POWERUP_ACCENT: Record<string, number> = {
  boots: C.marshLight, // Windstiefel — helles Moor-Grün
  tome: C.fogBlue, // Arkanes Buch — Nebelblau
  heart: C.crimson, // Eisenherz — Karmesin
  charm: C.amber, // Magnetamulett — Bernstein
  whetstone: C.paleMist, // Wetzstein — heller Dunst (Eisen)
  hourglass: C.glow, // Sanduhr — Glow-Gold
};

/** Datenblatt eines Moments (rein, für Tests + Zeichnen). */
export interface MomentSpec {
  iconKey: string;
  accent: number;
  /** Aufblitz-Farbe (Palette). Default = Akzent; tome liest sich als grau,
   *  dort paleMist + fogBlue-Rim (art-director Runde 1). */
  flash: number;
  /** 1-px dunkle Gegenkontur außen um den Rim (Palette-Ink) — hebt helle/
   *  bodenähnliche Akzente (boots grün auf Moor, whetstone grau auf Skeletten,
   *  tome grau-blau) vom Umfeld ab (art-director Runde 1). */
  edge: number;
  iconSize: number;
  /** Scale des Icons — fest 1: Effekt in Zielgröße, nie hochskaliert. */
  scale: 1;
  ringFrom: number;
  ringTo: number;
  rimPx: 1;
  durationS: number;
}

/** Spezifikation des Moments für ein Powerup (null = unbekannte id). */
export function pickupMomentSpec(id: string): MomentSpec | null {
  const accent = POWERUP_ACCENT[id];
  if (accent === undefined) return null;
  return {
    iconKey: iconKeyForOffer("passive", id),
    accent,
    // tome: fogBlue liest sich als grau — Aufblitz paleMist über fogBlue-Rim
    // macht die blaue Signatur lesbar (art-director Runde 1).
    flash: id === "tome" ? C.paleMist : accent,
    edge: C.ink,
    iconSize: MOMENT_ICON_SIZE,
    scale: 1,
    ringFrom: MOMENT_RING_FROM,
    ringTo: MOMENT_RING_TO,
    rimPx: MOMENT_RIM_PX,
    durationS: MOMENT_DURATION,
  };
}

/** Neue/gestufte Powerups zwischen zwei Passiv-Ständen (rein, für Tests). */
export function diffPassiveAcquisitions(
  prev: readonly { id: string; level: number }[],
  next: readonly { id: string; level: number }[],
): { id: string; kind: "new" | "upgrade" }[] {
  const before = new Map(prev.map((p) => [p.id, p.level]));
  const out: { id: string; kind: "new" | "upgrade" }[] = [];
  for (const p of next) {
    const was = before.get(p.id);
    if (was === undefined) out.push({ id: p.id, kind: "new" });
    else if (p.level > was) out.push({ id: p.id, kind: "upgrade" });
  }
  return out;
}

/** Laufzeitdatensatz eines aktiven Aufnahme-Moments (public für Tests/Messung). */
export interface PowerupMoment {
  id: string;
  icon: Phaser.GameObjects.Image;
  fx: Phaser.GameObjects.Graphics;
  /** Verstrichene Zeit (s). */
  t: number;
  /** Weltbasisposition (Spieler beim Erwerb). */
  x: number;
  y: number;
  /** Icon-Grundlinie (ganzzahlig), inkl. Staffelung bei Parallelen. */
  baseY: number;
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
    collected: 0, collectedXp: 0, spawnedXp: 0, grantedXp: 0,
  };
  /** Bei vollem Cap gutgeschriebene Rest-XP, die im nächsten update() ankommt. */
  private pendingXp = 0;
  /** Letzter an update() übergebener Pickup-Radius (Abnahme-Messung). */
  lastPickupRadius = 0;
  private readonly free: GemRuntime[] = [];
  private maxGems = Math.min(MAX_GEMS_DEFAULT, MAX_VISIBLE_GEMS);
  /** LOD: Kristalle abdunkeln, damit Gegner-Silhouetten lesbar bleiben. */
  private dim = false;
  private readonly scene: Phaser.Scene;

  // ── M10-Aufnahme-Moment ──
  /** Aktive Momente (Ältester zuerst). */
  readonly moments: PowerupMoment[] = [];
  /** Abnahme-Messung: je Powerup ausgelöste Momente. */
  readonly momentStats = { triggered: 0, byId: {} as Record<string, number> };
  /** Passiv-Stand des letzten update()-Durchlaufs (Erkennung neu/Upgrade). */
  private lastPassives: { id: string; level: number }[] = [];
  /** Erstes update() liefert nur den Grundzustand (kein Moment beim Run-Start). */
  private hasPassiveSnapshot = false;
  /** levelSys-Referenz wird lazily gelesen (Run-Szene); null = nicht vorhanden. */
  private levelRef: { passives: { id: string; level: number }[] } | null | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  drop(x: number, y: number, size: GemSize, rng: { next(): number }): void {
    this.stats.dropped += 1;
    const meta = GEMS[size];
    // Jeder Drop erzeugt XP, die irgendwo im Feld oder beim Spieler landen muss.
    this.stats.spawnedXp += meta.value;
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

  /** Magnetradius für einen Pickup-Radius (Anziehungsbeginn exakt hier).
   *  M10-Draw-Cap: Bei vollem Feld wächst der Radius mit der Gem-Zahl
   *  (bis +50 %), damit der Deckel die Sammelrate nicht ausbremst. */
  static magnetRadiusFor(pickupRadius: number, gemCount = 0): number {
    const filled = Math.min(MAX_VISIBLE_GEMS, Math.max(0, gemCount)) / MAX_VISIBLE_GEMS;
    return Math.max(0, pickupRadius) * MAGNET_RADIUS_FACTOR * (1 + filled * MAGNET_COUNT_SCALE);
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

  // ── M10-Aufnahme-Moment: API + Zeichnen ────────────────────────────────────

  /** Startet den Aufnahme-Moment für ein Powerup an der Spielerposition. */
  playPowerupMoment(id: string, x: number, y: number): void {
    const spec = pickupMomentSpec(id);
    if (!spec || !this.scene?.add) return;
    if (this.moments.length >= MAX_MOMENTS) this.finishMoment(this.moments[0]);
    // Bei Parallelen (gekettete Level-ups) leicht staffeln, sonst Full-Overlap.
    const baseY = Math.round(y) - 20 - this.moments.length * 6;
    const icon = makeImage(this.scene, Math.round(x), baseY, spec.iconKey)
      .setDepth(MOMENT_DEPTH)
      .setScale(spec.scale)
      .setAlpha(1);
    icon.setTintFill(PAL[spec.flash]); // Phase 1: Aufblitz
    const fx = this.scene.add.graphics().setDepth(MOMENT_DEPTH);
    this.moments.push({ id, icon, fx, t: 0, x, y, baseY });
    this.momentStats.triggered += 1;
    this.momentStats.byId[id] = (this.momentStats.byId[id] ?? 0) + 1;
  }

  /** Beendet einen Moment sofort (Objekte weg, Slot frei). */
  private finishMoment(moment: PowerupMoment): void {
    const i = this.moments.indexOf(moment);
    if (i >= 0) this.moments.splice(i, 1);
    moment.icon.destroy();
    moment.fx.destroy();
  }

  /** Eigene Uhr des Moments: 1-px-Schritte, Palette, kein Mixel. */
  private updateMoments(dt: number): void {
    for (let i = this.moments.length - 1; i >= 0; i--) {
      const m = this.moments[i];
      if (!m.icon.active || !m.fx.active) {
        // Szenen-Restart: Phaser hat die Objekte entsorgt — Slot verwerfen.
        this.moments.splice(i, 1);
        continue;
      }
      m.t += dt;
      const p = m.t / MOMENT_DURATION;
      if (p >= 1) {
        this.finishMoment(m);
        continue;
      }
      const spec = pickupMomentSpec(m.id)!;
      // Icon steigt in 1-px-Schritten, letzte 25 % ausblenden.
      const ix = Math.round(m.x);
      const iy = m.baseY - Math.round(p * 6);
      m.icon.setPosition(ix, iy);
      if (p < 0.15) m.icon.setTintFill(PAL[spec.flash]);
      else if (m.icon.tintFill) m.icon.clearTint();
      m.icon.setAlpha(p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25);
      // 1-px-Grafik: Gegenkontur + Rim um das Icon, Ring-Welle am Spieler.
      const g = m.fx;
      g.clear();
      if (p < MOMENT_RIM_UNTIL) {
        // Dunkle Gegenkontur außen (Palette-Ink) — trennt den Akzent vom Boden.
        g.lineStyle(MOMENT_RIM_PX, PAL[spec.edge], p < 0.4 ? 1 : 0.5);
        g.strokeRect(ix - MOMENT_ICON_SIZE / 2 - 2, iy - MOMENT_ICON_SIZE / 2 - 2,
          MOMENT_ICON_SIZE + 4, MOMENT_ICON_SIZE + 4);
        // Akzent-Rim: volle Alpha bis 40 %, danach halbe (art-director Runde 1:
        // volle Rim-Präsenz nicht mehr im Aufblitz-Block "verschenken").
        g.lineStyle(MOMENT_RIM_PX, PAL[spec.accent], p < 0.4 ? 1 : 0.5);
        g.strokeRect(ix - MOMENT_ICON_SIZE / 2 - 1, iy - MOMENT_ICON_SIZE / 2 - 1,
          MOMENT_ICON_SIZE + 2, MOMENT_ICON_SIZE + 2);
      }
      const r = MOMENT_RING_FROM + Math.floor(p * (MOMENT_RING_TO - MOMENT_RING_FROM));
      // Welle läuft sichtbar bis Radius 16 (Mindest-Alpha, statt (1-p)*0.9).
      g.lineStyle(MOMENT_RIM_PX, PAL[spec.accent], Math.max(MOMENT_RING_MIN_ALPHA, 1 - p) * 0.9);
      g.strokeCircle(ix, Math.round(m.y), r);
    }
  }

  /**
   * Erkennt Powerup-Erwerb (neu/Upgrade) ohne Eingriff in Run.ts/UI.ts:
   * levelSys.passives wird pro Frame gelesen und differenziert. Level-ups und
   * Truhen landen beide in applyOffer — der Diff deckt beide Pfade ab. Das
   * erste update() liefert nur den Grundzustand.
   */
  private detectPowerupMoments(playerX: number, playerY: number): void {
    if (this.levelRef === undefined) {
      const run = this.scene as unknown as { levelSys?: { passives: { id: string; level: number }[] } } | null;
      this.levelRef = run?.levelSys?.passives ? run.levelSys : null;
    }
    const passives = this.levelRef?.passives;
    if (!passives) return;
    if (!this.hasPassiveSnapshot) {
      this.lastPassives = passives.map((p) => ({ id: p.id, level: p.level }));
      this.hasPassiveSnapshot = true;
      return;
    }
    // Billiger Vorvergleich ohne Allokation (läuft pro Frame im 500er-Chaos):
    // passives-Änderungen kommen addPassive-seitig (Append/Level-Set/Entfernung),
    // Reihenfolge ist stabil — Länge + id/level genügen als Änderungssignal.
    const prev = this.lastPassives;
    let changed = prev.length !== passives.length;
    if (!changed) {
      for (let i = 0; i < passives.length; i++) {
        if (prev[i].id !== passives[i].id || prev[i].level !== passives[i].level) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    const acquired = diffPassiveAcquisitions(prev, passives);
    this.lastPassives = passives.map((p) => ({ id: p.id, level: p.level }));
    for (const a of acquired) this.playPowerupMoment(a.id, playerX, playerY);
  }

  /** Aktive Momente beenden (Run-Neustart/Shutdown). */
  clearMoments(): void {
    while (this.moments.length > 0) this.finishMoment(this.moments[0]);
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    pickupRadius: number,
    onCollect: (value: number, size: GemSize) => void,
    view?: { x0: number; y0: number; x1: number; y1: number },
  ): void {
    const magnetRadius = PickupSystem.magnetRadiusFor(pickupRadius, this.gems.length);
    this.lastPickupRadius = pickupRadius;
    // M10-Aufnahme-Moment: Erwerb erkennen + eigene Uhr laufen lassen.
    // Reine Zusatz-Pfade — der Gem-/XP-Pfad unten bleibt unverändert.
    this.detectPowerupMoments(playerX, playerY);
    this.updateMoments(dt);
    if (this.pendingXp > 0) {
      // Rest-XP aus einer Verschmelzung sofort zuschreiben (kein Verlust).
      this.stats.grantedXp += this.pendingXp;
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
        this.stats.grantedXp += g.value;
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
    // M10-Draw-Cap: nie über die harte Sichtbarkeitsgrenze hinaus, auch wenn
    // die LOD-Stufe (full) mehr erlauben würde.
    this.maxGems = Math.max(24, Math.min(MAX_VISIBLE_GEMS, Math.floor(cap)));
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
    this.clearMoments();
    for (const g of this.gems) {
      g.sprite.setVisible(false).setActive(false);
      this.free.push(g);
    }
    this.gems.length = 0;
  }
}
