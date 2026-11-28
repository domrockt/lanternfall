import Phaser from "phaser";
import { C, PAL } from "../palette";
import { DEPTH } from "../gfx/depth";
import { makeImage } from "../gfx/atlas";
import { hazardBeamRimTexture, hazardBeamTexture, hazardDiscTexture, hazardRingTexture, quantizedBeamLength, quantizedRadius } from "../gfx/hazardDisc";

export interface HazardOptions {
  /** Vorwarnzeit (s), > 0 = Pflicht-Telegraph. */
  warn?: number;
  /** Nachwirkzeit (s); 0 = einmaliger Treffer. */
  linger?: number;
  damage: number;
  radius: number;
  /** Schadenstakt bei Nachwirkzeit (s). */
  tick?: number;
  /** Aktive Bodenoptik (z. B. puddle_poison). */
  activeTexture?: string;
  /** Farbe des Warnrings. */
  color?: number;
  source?: string;
  /** Wird beim Ende der Warnphase ausgelöst (z. B. Beschwörung/Teleport). */
  onTrigger?: () => void;
}

/**
 * M10-Hazard-Fairness: Jede gefährliche Fläche warnt mindestens so lange, dass
 * der Spieler bei 500-Gegner-Schwarm noch reagieren kann (Messung
 * scripts/m10-hazard-fairness.mjs: Exploder lag bei 0.16 s → Trefferquote 100 %
 * bei Ausweichversuch; Rim-Minimum 0.12 las im Schwarm kaum lesbar).
 */
/** Faire Mindest-Warnzeit (s); darunter ist kein echtes Ausweichen möglich. */
export const MIN_WARN_S = 0.45;
/** Minimum des Rim-Puls-Alphas; darunter verschwindet der Rand im Schwarm. */
export const MIN_RIM_ALPHA = 0.3;

/**
 * Wirksame Vorwarnzeit: Werte unter der fairen Mindest-Warnzeit (und unsinnige
 * Werte wie 0/NaN/negativ) werden auf ein faires Minimum angehoben, alles
 * darüber bleibt exakt wie vom Aufrufer gewählt (keine künstlich längeren
 * Boss-Warnungen). Reine Funktion, unit-getestet.
 */
export function effectiveWarn(warn: number | undefined, fallback: number): number {
  const w = warn !== undefined && Number.isFinite(warn) ? warn : fallback;
  return Math.max(MIN_WARN_S, w);
}

/**
 * Rim-Puls-Alpha über der Warnphase: atmet zwischen MIN_RIM_ALPHA und
 * MIN_RIM_ALPHA + 0.35, bleibt also auch im dichten Schwarm sichtbar.
 * `elapsed` = seit Spawn vergangene Warnzeit (s). Reine Funktion.
 */
export function rimPulseAlpha(elapsed: number): number {
  return MIN_RIM_ALPHA + Math.abs(Math.sin(elapsed * 10)) * 0.35;
}

interface HazardRuntime {
  kind: "circle" | "beam";
  x: number;
  y: number;
  /** Beam-Endpunkt. */
  x2: number;
  y2: number;
  width: number;
  radius: number;
  warn: number;
  warnMax: number;
  linger: number;
  lingerMax: number;
  tick: number;
  tickTimer: number;
  damage: number;
  triggered: boolean;
  active: boolean;
  warnSprite?: Phaser.GameObjects.Image;
  /** Rand-Puls: heikle Warnfläche bleibt auch im Schwarm sichtbar. */
  rimSprite?: Phaser.GameObjects.Image;
  activeSprite?: Phaser.GameObjects.Image;
  source: string;
  onTrigger?: () => void;
}

/**
 * Bodenmarkierungen/Warnflächen und einfache Flächenangriffe (Bosse, Exploder,
 * Giftpfützen). Jeder gefährliche Angriff hat eine sichtbare Warnphase.
 */
export class HazardSystem {
  readonly active: HazardRuntime[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnCircle(x: number, y: number, opts: HazardOptions): HazardRuntime {
    const warn = effectiveWarn(opts.warn, 0.7);
    const linger = opts.linger ?? 0;
    // B3-Fix: Disc/Ring in Sprite-Pixelgroesse gebacken (Draw-Scale 1, gerastert,
    // kein Weich-Gradient). Optik-Aenderung — Warnlogik/Treffer bitgleich.
    const discRadius = quantizedRadius(opts.radius);
    const warnSprite = makeImage(this.scene, Math.round(x), Math.round(y), hazardDiscTexture(this.scene, discRadius))
      .setDepth(DEPTH.hazard)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setScale(1)
      .setAlpha(0.9);
    warnSprite.setTint(PAL[opts.color ?? C.crimson] ?? opts.color ?? PAL[C.crimson]);
    const rimSprite = makeImage(this.scene, Math.round(x), Math.round(y), hazardRingTexture(this.scene, discRadius))
      .setDepth(DEPTH.hazard + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.hotRed])
      .setScale(1)
      .setAlpha(rimPulseAlpha(0));
    const hazard: HazardRuntime = {
      kind: "circle", x, y, x2: x, y2: y, width: 0, radius: opts.radius,
      warn, warnMax: Math.max(0.01, warn), linger, lingerMax: Math.max(0.01, linger),
      tick: opts.tick ?? 0.5, tickTimer: 0, damage: opts.damage, triggered: false,
      active: true, warnSprite, rimSprite, source: opts.source ?? "area", onTrigger: opts.onTrigger,
    };
    if (opts.activeTexture) {
      hazard.activeSprite = makeImage(this.scene, Math.round(x), Math.round(y), opts.activeTexture)
        .setDepth(DEPTH.hazard)
        .setAlpha(0)
        .setScale(Math.max(0.3, opts.radius / 18));
    }
    this.active.push(hazard);
    return hazard;
  }

  /** Linien-/Strahlangriff mit gestrichelter Warnlinie. */
  spawnBeam(
    x1: number, y1: number, x2: number, y2: number,
    opts: HazardOptions,
  ): HazardRuntime {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    // B3-Fix: Strahl in Sprite-Pixelgroesse gebacken (Draw-Scale 1, nie >1x gestreckt).
    const beamLen = quantizedBeamLength(len);
    const warnSprite = makeImage(this.scene, (x1 + x2) / 2, (y1 + y2) / 2, hazardBeamTexture(this.scene, beamLen))
      .setDepth(DEPTH.hazard)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .setRotation(angle + Math.PI / 2)
      .setScale(1)
      .setAlpha(0.9);
    warnSprite.setTint(PAL[opts.color ?? C.crimson] ?? opts.color ?? PAL[C.crimson]);
    const rimSprite = makeImage(this.scene, (x1 + x2) / 2, (y1 + y2) / 2, hazardBeamRimTexture(this.scene, beamLen))
      .setDepth(DEPTH.hazard + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.hotRed])
      .setRotation(angle + Math.PI / 2)
      .setScale(1)
      .setAlpha(rimPulseAlpha(0));
    const hazard: HazardRuntime = {
      kind: "beam", x: x1, y: y1, x2, y2, width: opts.radius,
      radius: opts.radius, warn: effectiveWarn(opts.warn, 0.9), warnMax: Math.max(0.01, effectiveWarn(opts.warn, 0.9)),
      linger: opts.linger ?? 0, lingerMax: Math.max(0.01, opts.linger ?? 0),
      tick: opts.tick ?? 0.5, tickTimer: 0, damage: opts.damage, triggered: false,
      active: true, warnSprite, rimSprite, source: opts.source ?? "beam", onTrigger: opts.onTrigger,
    };
    this.active.push(hazard);
    return hazard;
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    onPlayerHit: (damage: number, hazard: HazardRuntime) => void,
  ): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const h = this.active[i];
      if (!h.active) continue;
      if (h.warn > 0) {
        h.warn -= dt;
        const pulse = 0.55 + Math.sin((h.warnMax - h.warn) * 22) * 0.35;
        h.warnSprite?.setAlpha(pulse);
        // Rand-Puls-Skalierung: Warnung atmet sichtbar, bleibt aber unter Projektilen.
        h.rimSprite?.setAlpha(rimPulseAlpha(h.warnMax - h.warn));
        if (h.warn > 0) continue;
        // Warnphase beendet → Treffer prüfen und Wirkphase starten.
        h.triggered = true;
        h.onTrigger?.();
        if (this.containsPlayer(h, playerX, playerY)) onPlayerHit(h.damage, h);
        h.warnSprite?.setVisible(false);
        h.rimSprite?.setVisible(false);
        if (h.activeSprite) h.activeSprite.setAlpha(0.9);
        this.impactFx(h);
        if (h.linger <= 0) {
          this.remove(i);
          continue;
        }
        h.tickTimer = h.tick;
      } else {
        h.linger -= dt;
        h.tickTimer -= dt;
        if (h.tickTimer <= 0) {
          h.tickTimer = h.tick;
          if (this.containsPlayer(h, playerX, playerY)) onPlayerHit(h.damage, h);
        }
        if (h.activeSprite) h.activeSprite.setAlpha(Math.max(0, Math.min(0.9, h.linger / h.lingerMax + 0.2)));
        if (h.linger <= 0) {
          this.remove(i);
        }
      }
    }
  }

  private containsPlayer(h: HazardRuntime, px: number, py: number): boolean {
    if (h.kind === "circle") {
      return (px - h.x) ** 2 + (py - h.y) ** 2 <= (h.radius + 5) ** 2;
    }
    const dx = h.x2 - h.x;
    const dy = h.y2 - h.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((px - h.x) * dx + (py - h.y) * dy) / (len * len)));
    const cx = h.x + dx * t;
    const cy = h.y + dy * t;
    return Math.hypot(px - cx, py - cy) <= h.width / 2 + 5;
  }

  private impactFx(h: HazardRuntime): void {
    if (h.kind === "circle") {
      const ring = makeImage(this.scene, h.x, h.y, "ring_burst")
        .setDepth(DEPTH.hazard + 1)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setTint(PAL[C.hotRed])
        .setScale(Math.max(0.2, h.radius / 42))
        .setAlpha(0.9);
      this.scene.tweens.add({
        targets: ring, alpha: 0, scale: h.radius / 30, duration: 320, onComplete: () => ring.destroy(),
      });
    }
    for (let i = 0; i < 5; i++) {
      const spark = makeImage(this.scene, h.x, h.y, "fx_spark")
        .setDepth(DEPTH.hazard + 1)
        .setTint(PAL[C.crimson])
        .setScale(0.8);
      const a = (i / 5) * Math.PI * 2;
      this.scene.tweens.add({
        targets: spark,
        x: h.x + Math.cos(a) * (h.radius * 0.6),
        y: h.y + Math.sin(a) * (h.radius * 0.6),
        alpha: 0, duration: 220, onComplete: () => spark.destroy(),
      });
    }
  }

  private remove(index: number): void {
    const h = this.active[index];
    h.active = false;
    h.warnSprite?.destroy();
    h.rimSprite?.destroy();
    h.activeSprite?.destroy();
    this.active.splice(index, 1);
  }

  clear(): void {
    for (const h of this.active) {
      h.warnSprite?.destroy();
      h.rimSprite?.destroy();
      h.activeSprite?.destroy();
    }
    this.active.length = 0;
  }

  /** Für den Bot: Positionen/Radien aktiver Warnflächen. */
  threats(): { x: number; y: number; radius: number }[] {
    return this.active.filter((h) => h.warn > 0).map((h) => ({
      x: (h.x + h.x2) / 2, y: (h.y + h.y2) / 2, radius: h.kind === "beam" ? h.width : h.radius,
    }));
  }

  get count(): number {
    return this.active.length;
  }
}
