import Phaser from "phaser";
import { C, PAL } from "../palette";
import { applyTexture, makeImage } from "../gfx/atlas";

export interface ChestRuntime {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  age: number;
}

/**
 * Truhen-Drop mit Glanz-Animation und Bildschirmrand-Pfeil, solange die Truhe
 * außerhalb des Kamerabereichs liegt.
 */
export interface ChestSpawnRecord {
  x: number;
  y: number;
  /** Run-Zeit (Sekunden) zum Spawn-Zeitpunkt, aus `lf-elapsed`. */
  at: number;
}

/** Kamera-Stück für das Pfeil-Layout (reine Funktion, unit-testbar). */
export interface ArrowView {
  /** Viewport in Screen-Pixeln (camera.width/height). */
  width: number;
  height: number;
  /** Sichtbarer Weltbereich (camera.worldView). */
  viewX: number;
  viewY: number;
  viewWidth: number;
  viewHeight: number;
  /** Kamera-Zoom (Boss-Intro-Puls 1.14). */
  zoom: number;
}

export interface ArrowLayout {
  visible: boolean;
  /** Renderposition für das scrollFactor-0-Bild (zoom-kompensiert). */
  x: number;
  y: number;
  /** Screen-Rotation (Bogenmaß) in Richtung Truhe. */
  angle: number;
}

/** Einzug, ab dem die Truhe als "im View" gilt (Pfeil aus). */
export const CHEST_ARROW_INSET = 8;
/** Randabstand des Pfeils vom Viewportrand. */
export const CHEST_ARROW_MARGIN = 24;

/**
 * Randpfeil-Layout als reine Funktion:
 * - Screen-Position der Truhe aus der worldView-Mitte × zoom (zoom-fest).
 * - Sichtbarkeits-Check gegen die SICHTBARE Fläche (nicht camera.width).
 * - Randpunkt = Schnitt des Strahls Mitte→Truhe mit dem Margin-Rechteck,
 *   damit der Pfeil in Eckfällen in der echten Richtung liegt.
 * - Renderposition rückgerechnet, weil scrollFactor-0-Objekte in Phaser um
 *   die Kameramitte mit zoom skaliert werden.
 */
export function computeChestArrow(view: ArrowView, chestX: number, chestY: number): ArrowLayout {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const zoom = view.zoom > 0 ? view.zoom : 1;
  const sx = cx + (chestX - (view.viewX + view.viewWidth / 2)) * zoom;
  const sy = cy + (chestY - (view.viewY + view.viewHeight / 2)) * zoom;
  const inside =
    sx > CHEST_ARROW_INSET && sx < view.width - CHEST_ARROW_INSET &&
    sy > CHEST_ARROW_INSET && sy < view.height - CHEST_ARROW_INSET;
  if (inside) return { visible: false, x: cx, y: cy, angle: 0 };
  const dx = sx - cx;
  const dy = sy - cy;
  // Strahl Mitte->Truhe mit dem Margin-Rechteck schneiden. dx/dy koennen
  // nicht beide 0 sein, weil die Truhe dann im View laege.
  const t = Math.min(
    (cx - CHEST_ARROW_MARGIN) / Math.max(1e-6, Math.abs(dx)),
    (cy - CHEST_ARROW_MARGIN) / Math.max(1e-6, Math.abs(dy)),
  );
  const bx = cx + dx * t;
  const by = cy + dy * t;
  return {
    visible: true,
    x: cx + (bx - cx) / zoom,
    y: cy + (by - cy) / zoom,
    angle: Math.atan2(dy, dx),
  };
}

export class ChestSystem {
  readonly chests: ChestRuntime[] = [];
  /** M10-Timing-Beleg: jede Spawn-Zeit wird mitgeschrieben (nur Diagnose). */
  readonly spawns: ChestSpawnRecord[] = [];
  private readonly scene: Phaser.Scene;
  private readonly arrow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.arrow = makeImage(scene, 0, 0, "arrow_chest")
      .setScrollFactor(0)
      .setDepth(92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(1.35)
      .setVisible(false);
  }

  /**
   * M10-chest-arrow: Layout des Randpfeils als reine Funktion (unit-getestet).
   *
   * Vorher zwei Fehler: (1) `Clamp` pro Achse — bei Truhe diagonal hinter einer
   * Ecke lag der Pfeil in der Ecke, zeigte aber bis ~19° daneben; (2) die
   * worldView-Koordinaten wurden gegen `camera.width` geprueft und die Position
   * ohne Zoom-Kompensation gesetzt — beim Boss-Intro-Zoom (1.14) blieb der
   * Pfeil verborgen, obwohl die Truhe off-screen war.
   */
  computeArrowLayout(camera: Phaser.Cameras.Scene2D.Camera, chestX: number, chestY: number): ArrowLayout {
    return computeChestArrow(
      {
        width: camera.width,
        height: camera.height,
        viewX: camera.worldView.x,
        viewY: camera.worldView.y,
        viewWidth: camera.worldView.width,
        viewHeight: camera.worldView.height,
        zoom: camera.zoom,
      },
      chestX,
      chestY,
    );
  }

  spawn(x: number, y: number): ChestRuntime {
    const at = Number(this.scene.registry.get("lf-elapsed") ?? 0);
    this.spawns.push({ x: Math.round(x), y: Math.round(y), at: Math.round(at * 1000) / 1000 });
    const sprite = makeImage(this.scene, Math.round(x), Math.round(y), "chest_closed")
      .setDepth(7)
      .setScale(1);
    const glow = this.scene.add.image(Math.round(x), Math.round(y), "light_radius")
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.amber])
      .setScale(0.34)
      .setAlpha(0.55);
    const chest: ChestRuntime = { x, y, sprite, glow, phase: (this.chests.length % 7) * 0.9, age: 0 };
    this.chests.push(chest);
    return chest;
  }

  /** Glanz-Puls und Randpfeil zur nächstgelegenen Truhe. */
  update(dt: number, camera: Phaser.Cameras.Scene2D.Camera, playerX: number, playerY: number): void {
    if (this.chests.length === 0) {
      this.arrow.setVisible(false);
      return;
    }
    for (const chest of this.chests) {
      chest.age += dt;
      const pulse = 0.75 + Math.sin(chest.age * 3.4 + chest.phase) * 0.23;
      chest.glow.setAlpha(0.38 + pulse * 0.2);
      chest.glow.setScale(0.3 + pulse * 0.08);      chest.sprite.setY(Math.round(chest.y + Math.sin(chest.age * 2.2 + chest.phase) * 1.5));
    }
    // Pfeil nur, wenn die nächste Truhe außerhalb des Views liegt; Layout
    // (Randprojektion entlang der echten Truchenrichtung, zoom-kompensiert)
    // kommt aus der reinen Funktion.
    let nearest = this.chests[0];
    let best = Number.POSITIVE_INFINITY;
    for (const chest of this.chests) {
      const d = (chest.x - playerX) ** 2 + (chest.y - playerY) ** 2;
      if (d < best) { best = d; nearest = chest; }
    }
    const layout = this.computeArrowLayout(camera, nearest.x, nearest.y);
    if (!layout.visible) {
      this.arrow.setVisible(false);
      return;
    }
    this.arrow.setVisible(true)
      .setPosition(Math.round(layout.x), Math.round(layout.y))
      .setRotation(layout.angle);
  }

  /** Nächstgelegene Truhe in Reichweite (px) oder null. */
  near(playerX: number, playerY: number, range = 16): ChestRuntime | null {
    let found: ChestRuntime | null = null;
    let best = range * range;
    for (const chest of this.chests) {
      const d = (chest.x - playerX) ** 2 + (chest.y - playerY) ** 2;
      if (d <= best) { best = d; found = chest; }
    }
    return found;
  }

  open(chest: ChestRuntime): void {
    applyTexture(chest.sprite, "chest_open");
    this.remove(chest);
  }

  remove(chest: ChestRuntime): void {
    const idx = this.chests.indexOf(chest);
    if (idx >= 0) this.chests.splice(idx, 1);
    chest.sprite.destroy();
    chest.glow.destroy();
    if (this.chests.length === 0) this.arrow.setVisible(false);
  }

  clear(): void {
    for (const chest of this.chests) {
      chest.sprite.destroy();
      chest.glow.destroy();
    }
    this.chests.length = 0;
    this.spawns.length = 0;
    this.arrow.setVisible(false);
  }

  get count(): number {
    return this.chests.length;
  }
}
