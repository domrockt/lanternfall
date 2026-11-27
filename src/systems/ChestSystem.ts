import Phaser from "phaser";
import { C, PAL } from "../palette";
import { applyTexture, makeImage } from "../gfx/atlas";
import { GAME_HEIGHT } from "../config";

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

// ── M10-chest-reveal: Öffnungs-Sequenz ──────────────────────────────────────
//
// Das Öffnen ist ein Kernmoment des Genres und bekommt eine inszenierte
// Sequenz mit klarer Reihenfolge: Aufleuchten (Glanz hoch) → Deckel →
// Lichtstrahl → Münzen/Funken aus der Truhe → Belohnungs-Reveal nacheinander.
// Die Zeiten sind EINE Quelle für Welt-Sequenz (ChestSystem) und Panel (UI) —
// reine Funktion, unit-getestet (tests/chest-reveal.test.ts).

export type ChestOpenStepName =
  | "shine"        // Glanz-Animation hoch (Welt + Panel-Strahl-Vorbereitung)
  | "lid"          // Deckel öffnet
  | "beam"         // Lichtstrahl aus der Truhe
  | "burst"        // Münzen-/Funken-Partikel aus der Truhe
  | "reveal"       // Roll-Phase der Belohnungen beginnt
  | "revealSettle" // eine Belohnung settlebt lesbar (Name + Label + Icon)
  | "finish";      // Sequenz zuende (Panel übernimmt/schließt)

export interface ChestOpenStep {
  step: ChestOpenStepName;
  /** Millisekunden nach Öffnung der Truhe. */
  at: number;
  /** Nur bei `revealSettle`: Index der Belohnung (0-basiert). */
  rewardIndex?: number;
}

/** Basiszeiten der Sequenz (ms). Von der bisherigen Panel-Sequenz übernommen — bewährtes Timing, jetzt geprüft und getestet. */
export const CHEST_OPEN_LID_MS = 280;
export const CHEST_OPEN_BEAM_MS = 360;
export const CHEST_OPEN_BURST_MS = 420;
export const CHEST_OPEN_REVEAL_MS = 520;
export const CHEST_SETTLE_BASE_MS = 1450;
export const CHEST_SETTLE_STAGGER_MS = 220;
export const CHEST_FINISH_BASE_MS = 1650;

/**
 * Reveal-Reihenfolge als reine Funktion: aufsteigende Zeiten, Deckel vor
 * Strahl vor Partikeln vor Reveal; die Belohnungen settleben nacheinander
 * (i*220 ms), `finish` liegt nach dem letzten Settle. rewardCount wird auf
 * 1..5 geklemmt (Truhen geben 1/3/5 Belohnungen).
 */
export function chestOpenTimeline(rewardCount: number): ChestOpenStep[] {
  const n = Math.max(1, Math.min(5, Math.round(rewardCount)));
  const steps: ChestOpenStep[] = [
    { step: "shine", at: 0 },
    { step: "lid", at: CHEST_OPEN_LID_MS },
    { step: "beam", at: CHEST_OPEN_BEAM_MS },
    { step: "burst", at: CHEST_OPEN_BURST_MS },
    { step: "reveal", at: CHEST_OPEN_REVEAL_MS },
  ];
  for (let i = 0; i < n; i++) {
    steps.push({ step: "revealSettle", at: CHEST_SETTLE_BASE_MS + i * CHEST_SETTLE_STAGGER_MS, rewardIndex: i });
  }
  steps.push({ step: "finish", at: CHEST_FINISH_BASE_MS + n * CHEST_SETTLE_STAGGER_MS });
  return steps;
}

/** Ein Partikel des Öffnungs-Bursts (deterministisch, kein RNG). */
export interface ChestBurstParticle {
  kind: "coin" | "spark";
  /** Absprungwinkel (Bogenmaß); Münzen fächern nach oben, Funken radial. */
  angle: number;
  /** Distanz in px (Skalierung macht der Aufrufer: Welt vs. Panel). */
  dist: number;
  /** Startverzögerung in ms (gestaffelt, keine Wand). */
  delayMs: number;
  lifeMs: number;
  scale: number;
}

/**
 * Münzen-/Funken-Burst aus der Truhe. Deterministisch über den Index (i*7 /
 * i*5-Streuung wie die bewährten Panel-Münzen), damit GIF-Frames und Screenshots
 * reproduzierbar sind. Münzen: enger Fächer nach oben (Inszenierung "Schatz
 * springt heraus"), Funken: kurze radiale Glitzer (ADD-Blend beim Renderer).
 */
export function chestBurstSpec(coinCount = 16, sparkCount = 8): ChestBurstParticle[] {
  const out: ChestBurstParticle[] = [];
  for (let i = 0; i < coinCount; i++) {
    const t = coinCount > 1 ? (i * 7) % coinCount / (coinCount - 1) : 0.5;
    out.push({
      kind: "coin",
      angle: -Math.PI / 2 + (t - 0.5) * 2.2,
      dist: 70 + t * 90,
      delayMs: (i % 4) * 18,
      lifeMs: 700 + Math.round(t * 350),
      scale: 1.4,
    });
  }
  for (let i = 0; i < sparkCount; i++) {
    const t = sparkCount > 1 ? (i * 5) % sparkCount / (sparkCount - 1) : 0.5;
    out.push({
      kind: "spark",
      angle: (i / sparkCount) * Math.PI * 2 - Math.PI / 2,
      dist: 26 + t * 22,
      delayMs: 40 + (i % 3) * 24,
      lifeMs: 380 + Math.round(t * 160),
      scale: 1.1,
    });
  }
  return out;
}

// ── M10-chest-reveal: Panel-Layout (Überlappungsfreiheit als reine Funktion) ─
export interface ChestPanelLayout {
  titleY: number;
  subtitleY: number;
  beamY: number;
  iconY: number;
  iconScale: number;
  hintY: [number, number];
}

/** Glyphenhöhe des Bitmap-Fonts in px (GLYPH_H) — Basis der Abstands-Prüfung. */
export const CHEST_PANEL_GLYPH_H = 7;

/**
 * Y-Positionen des Truhen-Panels (Spielpixel). Vorher kollidierte der
 * Untertitel mit der Unterkante des doppelt hoch skalierten Titels (belegt in
 * shots/m10-chest-reveal-before.json, beide Viewports). Jetzt:
 * - Untertitel 1 Zeile tiefer, Unterkante clearing der Titel-Unterkante,
 * - Truhen-Icon etwas tiefer und größer (2.6 statt 2.2/2.4 — Kernmoment),
 * - Evo-Hinweiszeilen unter dem größeren Icon, über den Slots.
 * Alle vertikalen Abstände zwischen Titel / Untertitel / Icon / Hinweis
 * sind > 0 (geprüft in tests/chest-reveal.test.ts und per Pixel-Messung).
 */
export function chestPanelLayout(oy: number): ChestPanelLayout {
  return {
    titleY: 38 + oy,
    subtitleY: 58 + oy,
    beamY: 74 + oy,
    iconY: 92 + oy,
    iconScale: 2.6,
    hintY: [122 + oy, 130 + oy],
  };
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
/** Nach dieser ms-Zahl ist die Welt-Sequenz zuende und die Überreste werden freigegeben. */
export const CHEST_OPENING_TTL_MS = 1600;

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
        .setScale(p.spec.scale * (1 - prog * 0.6));
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
