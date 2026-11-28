import Phaser from "phaser";
import { C, PAL } from "../palette";
import { applyTexture, makeImage } from "../gfx/atlas";
import { GAME_HEIGHT, WORLD_SIZE } from "../config";
// M10-chest-reveal: reine Sequenz-/Layout-Teile liegen in src/logic/chest-reveal.ts
// (unit-getestet ohne Phaser); das ChestSystem ist der Renderer dafuer.
import {
  CHEST_OPEN_BURST_MS,
  CHEST_OPEN_LID_MS,
  CHEST_OPEN_REVEAL_MS,
  CHEST_OPENING_TTL_MS,
  chestBurstSpec,
  chestPanelLayout,
  type ChestBurstParticle,
} from "../logic/chest-reveal";

export interface ChestRuntime {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  phase: number;
  age: number;
  /** M10-chest-reveal: Truhe ist geöffnet (Sequenz läuft im Panel). */
  opened: boolean;
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

// ── Laufzeit der Sequenz (ChestSystem-eigener Renderer, kein FxSystem) ──────
//
// M10-chest-reveal (Supervisor 27.11.): UI.ts ist für diese Lane Tabu. Die
// Öffnungs-Sequenz läuft komplett hier, in drei klar getrennten Phasen mit
// festen Zeitstempeln:
//
//   Phase 1 GLOW     0 ms       Aufleuchten: Glanz-Animation hoch (Welt-Glow)
//   Phase 2 PARTIKEL 280/420 ms Deckel + Münzen-/Funken-Burst aus der Truhe
//   Phase 3 REVEAL   520 ms..   Belohnungs-Reveal nacheinander (Timeline)
//
// Die Untertitel-Position im Panel fixt `applyPanelFix` — ebenfalls hier im
// ChestSystem-eigenen Renderer (Laufzeit-Zugriff auf die existierenden Panel-
// Objekte, kein UI.ts-Edit, kein Duplikat-Rendering).

/** Phase 1 Glow endet (ms): Glanz voll hoch. */
export const CHEST_PHASE_GLOW_END_MS = CHEST_OPEN_LID_MS;
/** Phase 2 Partikel: Deckel auf (ms). */
export const CHEST_PHASE_LID_MS = CHEST_OPEN_LID_MS;
/** Phase 2 Partikel: Burst aus der Truhe (ms). */
export const CHEST_PHASE_BURST_MS = CHEST_OPEN_BURST_MS;
/** Phase 2 endet / Phase 3 Reveal beginnt (ms). */
export const CHEST_PHASE_REVEAL_MS = CHEST_OPEN_REVEAL_MS;

/** Poolgröße für den Öffnungs-Burst (16 Münzen + 8 Funken + Puffer). */
export const CHEST_BURST_POOL = 28;

interface ChestOpening {
  sprite: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  ageMs: number;
  lidDone: boolean;
  burstDone: boolean;
}

interface BurstParticleRuntime {
  img: Phaser.GameObjects.Image;
  spec: ChestBurstParticle | null;
  x0: number;
  y0: number;
  t: number;
}

// ── M10-chest-spawn-fair: Fair-Spawn-Regel (reine Funktion) ─────────────────
//
// Truhe = Kernmoment (Dom: "alle 5 min eine Art Boss, der eine Truhe spawnt
// wie in Vampire Survivors"). Vorher spawnte die Truhe exakt an der Boss-Tode-
// position — messbar 5/18 in unfairen Zellen (Moorwasser = 40 % Slow, Kante
// 20 px, v. a. Boss #5). Das Spielfeld hat keine Waende: "Hindernis" ist
// Moorwasser, "Wand/Ecke" ist die Spielfeldkante. Timing und Belohnungen
// bleiben unveraendert — nur die Position wird auf eine freie, erreichbare
// Zelle verschoben (naechste freie Zelle per Spiralsuche als Fallback).

/** Mindestabstand der Truhe zur Spielfeldkante (3 Tiles). */
export const CHEST_EDGE_MARGIN_PX = 48;
/** Raster der Spiral-Fallback-Suche (16-px-Tiles, wie Terrain). */
export const CHEST_SPAWN_TILE_PX = 16;
/** Max. Suchradius der Spiralsuche in Tiles (24 Tiles = 384 px). */
export const CHEST_SPAWN_SEARCH_TILES = 24;

export interface FairChestSpawnOptions {
  /** Spielfeldkante (WORLD_SIZE). */
  worldSize: number;
  /** Zelle unpassierbar/unfair (Moorwasser)? Kante wird intern geprueft. */
  isBlocked: (x: number, y: number) => boolean;
}

export interface FairChestSpawnResult {
  x: number;
  y: number;
  /** Urspruengliche Position. */
  fromX: number;
  fromY: number;
  /** free = unveraendert, edge = in den Kanten-Margin geklemmt,
   *  fallback = auf naechste freie Zelle verschoben (oder Notfall-Klemme). */
  reason: "free" | "edge" | "fallback";
}

/**
 * Verschiebt eine Truhen-Spawn-Position auf eine faire Zelle:
 * 1. Klemme in den Kanten-Margin (niemals naeher als CHEST_EDGE_MARGIN_PX an
 *    der Feldkante).
 * 2. Primärzelle blockiert (Wasser)? → Spiralsuche über 16-px-Tiles, erste
 *    freie Zelle innerhalb des Margins gewinnt (Ring r=1 naeher als r=2, …).
 * 3. Kein Treffer bis CHEST_SPAWN_SEARCH_TILES: Notfall-Klemme (nie schlechter
 *    als der Ist-Zustand).
 * Rein positionell — kein RNG, kein Zeitbezug, Timing bleibt bitgleich.
 */
export function fairChestSpawn(
  x: number,
  y: number,
  opts: FairChestSpawnOptions,
): FairChestSpawnResult {
  const m = CHEST_EDGE_MARGIN_PX;
  const max = Math.max(m, opts.worldSize - m);
  const cx = Math.min(Math.max(x, m), max);
  const cy = Math.min(Math.max(y, m), max);
  if (!opts.isBlocked(cx, cy)) {
    return { x: cx, y: cy, fromX: x, fromY: y, reason: cx === x && cy === y ? "free" : "edge" };
  }
  const free = (px: number, py: number): boolean =>
    px >= m && px <= max && py >= m && py <= max && !opts.isBlocked(px, py);
  const rMax = CHEST_SPAWN_SEARCH_TILES;
  let bx = Number.NaN;
  let by = 0;
  let bd = Number.POSITIVE_INFINITY;
  for (let r = 1; r <= rMax; r++) {
    // Ganzen Ring scannen, besten (Euclid-nächsten) Treffer merken — nicht den
    // zuerst gefundenen (Diagonale zuerst waere bis zu r*sqrt(2) weiter weg).
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Nur der aeussere Ring (innere Ringe sind frueher geprueft).
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = cx + dx * CHEST_SPAWN_TILE_PX;
        const py = cy + dy * CHEST_SPAWN_TILE_PX;
        if (!free(px, py)) continue;
        const d = (px - cx) ** 2 + (py - cy) ** 2;
        if (d < bd) { bd = d; bx = px; by = py; }
      }
    }
    // Frueher Abbruch: Ring r+1 hat mindestens (r+1)*tile Euclid-Abstand —
    // ein gefundener naeherer Treffer kann nicht mehr geschlagen werden.
    if (Math.sqrt(bd) < (r + 1) * CHEST_SPAWN_TILE_PX) break;
  }
  if (!Number.isNaN(bx)) return { x: bx, y: by, fromX: x, fromY: y, reason: "fallback" };
  return { x: cx, y: cy, fromX: x, fromY: y, reason: "fallback" };
}

export class ChestSystem {
  readonly chests: ChestRuntime[] = [];
  /** M10-Timing-Beleg: jede Spawn-Zeit wird mitgeschrieben (nur Diagnose). */
  readonly spawns: ChestSpawnRecord[] = [];
  private readonly scene: Phaser.Scene;
  private readonly arrow: Phaser.GameObjects.Image;
  /** M10-chest-reveal: laufende Öffnungs-Sequenzen (Sprite/Glow leben weiter). */
  private readonly openings: ChestOpening[] = [];
  /** M10-chest-reveal: eigener Partikel-Pool für den Öffnungs-Burst (kein FxSystem). */
  private readonly burstPool: BurstParticleRuntime[] = [];
  private readonly burstFree: BurstParticleRuntime[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.arrow = makeImage(scene, 0, 0, "arrow_chest")
      .setScrollFactor(0)
      .setDepth(92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(1.35)
      .setVisible(false);
    for (let i = 0; i < CHEST_BURST_POOL; i++) {
      const img = makeImage(scene, 0, 0, "fx_coin")
        .setDepth(8)
        .setVisible(false);
      const p: BurstParticleRuntime = { img, spec: null, x0: 0, y0: 0, t: 0 };
      this.burstPool.push(p);
      this.burstFree.push(p);
    }
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
    // M10-chest-spawn-fair: Position auf freie, erreichbare Zelle verschieben
    // (Kanten-Margin, Moorwasser-Ausschluss, Spiral-Fallback). Das Spielfeld
    // hat keine Waende — isBlocked kommt aus der Run-Szene (isWaterAt), wenn
    // vorhanden; ohne Szene-Abfrage bleibt die Position unveraendert. Timing
    // (`lf-elapsed`) und Belohnungslogik sind unberuehrt.
    const run = this.scene as unknown as { isWaterAt?: (wx: number, wy: number) => boolean } | null;
    const waterAt = run?.isWaterAt;
    const isBlocked =
      typeof waterAt === "function"
        ? (wx: number, wy: number) => waterAt(wx, wy)
        : () => false;
    const fair = fairChestSpawn(x, y, { worldSize: WORLD_SIZE, isBlocked });
    x = fair.x;
    y = fair.y;
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
    const chest: ChestRuntime = { x, y, sprite, glow, phase: (this.chests.length % 7) * 0.9, age: 0, opened: false };
    this.chests.push(chest);
    return chest;
  }

  /** Glanz-Puls, Öffnungs-Sequenz und Randpfeil zur nächstgelegenen Truhe. */
  update(dt: number, camera: Phaser.Cameras.Scene2D.Camera, playerX: number, playerY: number): void {
    // Öffnungs-Sequenz + Partikel laufen unabhängig von offenen Truhen weiter
    // (updateVisuals läuft auch bei pausierter Sim — Panel offen).
    this.updateOpenings(dt);
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

  /**
   * M10-chest-reveal: Öffnen startet die inszenierte Sequenz. Das Sprite/Glow
   * leben als `opening` weiter (Phase 1 Glow, Phase 2 Deckel + Münzen/Funken
   * aus dem ChestSystem-eigenen Partikel-Pool), sind aber aus `chests` raus —
   * Pfeil, `near()` und Tap reagieren nicht mehr auf sie. Das Panel folgt
   * derselben Timeline aus `chestOpenTimeline`.
   */
  open(chest: ChestRuntime): void {
    const idx = this.chests.indexOf(chest);
    if (idx >= 0) this.chests.splice(idx, 1);
    if (this.chests.length === 0) this.arrow.setVisible(false);
    chest.opened = true;
    this.openings.push({
      sprite: chest.sprite,
      glow: chest.glow,
      x: chest.x,
      y: chest.y,
      ageMs: 0,
      lidDone: false,
      burstDone: false,
    });
    // Panel-Renderer: Untertitel-/Icon-Position fixen, sobald die UI die
    // Sequenz aufgesetzt hat (onChestOpen läuft synchron beim emit).
    this.scene.time.delayedCall(30, () => this.applyPanelFix());
  }

  /**
   * M10-chest-reveal: Untertitel-Position — ChestSystem-eigener Renderer-Fix
   * zur Laufzeit (UI.ts ist für diese Lane Tabu, Supervisor 27.11.). Der
   * Untertitel wird über seinen Text eindeutig identifiziert und auf die
   * überlappungsfreie Position aus `chestPanelLayout` gesetzt; das Truhen-Icon
   * geht auf Layout-Position/-Skalierung (größer, Kernmoment), die Evo-
   * Hinweiszeilen rücken unter das größere Icon. Es wird nur das existierende
   * Objekt umpositioniert — kein Duplikat-Rendering, keine UI.ts-Änderung.
   * Idempotent: onChestOpen setzt Skalierung/Textur bei jeder Truhe neu,
   * deshalb läuft der Fix bei jedem Öffnen.
   */
  private applyPanelFix(): void {
    const ui = this.scene.scene.get("ui");
    const group = ui?.children.getByName("chest-group") as Phaser.GameObjects.Container | null;
    if (!group) return;
    const oy = Math.round((GAME_HEIGHT - 270) / 2);
    const layout = chestPanelLayout(oy);
    for (const obj of group.list) {
      const ch = obj as Phaser.GameObjects.Container & {
        valueText?: string;
        texture?: Phaser.Textures.Texture | null;
      };
      if (typeof ch.valueText === "string" && ch.valueText === "BELOHNUNGEN ROLLEN ...") {
        ch.setName("chest-subtitle");
        ch.setY(layout.subtitleY);
      } else if (ch.texture && String(ch.texture.key).startsWith("chest_")) {
        ch.setName("chest-icon");
        ch.setY(layout.iconY).setScale(layout.iconScale);
      }
    }
    const hints = [group.getByName("chest-hint-0"), group.getByName("chest-hint-1")];
    hints.forEach((t, i) => (t as unknown as { setY(y: number): unknown } | null)?.setY(layout.hintY[i]));
  }

  /** Aufleuchten → Deckel/Burst → Ausklang; deterministisch pro Opening. */
  private updateOpenings(dt: number): void {
    const dtMs = dt * 1000;
    for (let i = this.openings.length - 1; i >= 0; i--) {
      const o = this.openings[i];
      o.ageMs += dtMs;
      // ── Phase 1 GLOW (0..CHEST_PHASE_GLOW_END_MS): Aufleuchten ──────────
      const glowPhase = Math.max(0, Math.min(1, o.ageMs / CHEST_PHASE_GLOW_END_MS));
      o.glow.setAlpha(0.55 + glowPhase * 0.45);
      o.glow.setScale(0.34 + glowPhase * 0.26);
      // Bob ruht während der Sequenz; Sprite steht auf der Basisposition.
      o.sprite.setY(Math.round(o.y));
      // ── Phase 2 PARTIKEL (Deckel 280 ms, Burst 420 ms) ──────────────────
      if (!o.lidDone && o.ageMs >= CHEST_PHASE_LID_MS) {
        o.lidDone = true;
        applyTexture(o.sprite, "chest_open");
      }
      if (!o.burstDone && o.ageMs >= CHEST_PHASE_BURST_MS) {
        o.burstDone = true;
        this.spawnBurst(o.x, o.y - 4);
      }
      // ── Phase 3 REVEAL (ab 520 ms): Panel übernimmt; Ausklang + Freigabe.
      if (o.ageMs >= CHEST_OPENING_TTL_MS) {
        o.sprite.destroy();
        o.glow.destroy();
        this.openings.splice(i, 1);
      }
    }
    this.updateBurst(dt);
  }

  /** Münzen-/Funken-Burst aus dem eigenen Pool (deterministische Spec). */
  private spawnBurst(x: number, y: number): void {
    for (const spec of chestBurstSpec()) {
      const p = this.burstFree.pop();
      if (!p) return; // Pool aus: Rest fällt still weg (Cap, kein Wachstum)
      p.spec = spec;
      p.x0 = x;
      p.y0 = y;
      p.t = -spec.delayMs / 1000;
      p.img.setTexture(spec.kind === "coin" ? "fx_coin" : "fx_spark")
        .setBlendMode(spec.kind === "spark" ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setTint(spec.kind === "spark" ? PAL[C.lantern] : PAL[C.amber])
        .setScale(spec.scale)
        .setAlpha(1)
        .setPosition(Math.round(x), Math.round(y))
        .setVisible(true);
    }
  }

  private updateBurst(dt: number): void {
    for (const p of this.burstPool) {
      if (!p.spec || !p.img.visible) continue;
      p.t += dt;
      if (p.t < 0) continue;
      const life = p.spec.lifeMs / 1000;
      const prog = Math.max(0, Math.min(1, p.t / life));
      const ease = 1 - (1 - prog) ** 3;
      p.img.setPosition(
        Math.round(p.x0 + Math.cos(p.spec.angle) * p.spec.dist * ease),
        Math.round(p.y0 + Math.sin(p.spec.angle) * p.spec.dist * ease - prog * 6),
      ).setAlpha(1 - prog)
        // Pixel-Grid (art-director): Skalierung in 0.5-Schritten (fx_coin ist
        // 2x2) → Partikelbreite bleibt ganzzahlig (1/2/3 px), kein Flackern.
        .setScale(Math.max(0.5, Math.round(p.spec.scale * (1 - prog * 0.6) * 2) / 2));
      if (prog >= 1) {
        p.img.setVisible(false);
        p.spec = null;
        this.burstFree.push(p);
      }
    }
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
    for (const o of this.openings) {
      o.sprite.destroy();
      o.glow.destroy();
    }
    this.openings.length = 0;
    for (const p of this.burstPool) {
      p.img.setVisible(false);
      p.spec = null;
    }
    this.burstFree.length = 0;
    this.burstFree.push(...this.burstPool);
    this.arrow.setVisible(false);
  }

  get count(): number {
    return this.chests.length;
  }
}
