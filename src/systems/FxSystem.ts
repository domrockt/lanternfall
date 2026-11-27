import Phaser from "phaser";
import { DEPTH } from "../gfx/depth";
import { EVOLUTION_SIGNATURES, FX_FRAME_COUNTS, SIGNATURE_FRAME_COUNT, fxFrames, signatureTextureKey, fxAlphaForDpr, glowCapFor, isBossFxKey, GlowBudget, type FxLodLevel } from "../gfx/gen-fx";
import { applyTexture, currentFrame, makeImage } from "../gfx/atlas";
import { ambientBudgetFor, lodFor } from "../logic/lod";
import { RENDER_SCALE } from "../config";

/**
 * M10-A4 (Bedarfsmeldung m10-android-perf, 2026-11-27): ADD-Glows klein halten.
 * Messbasis shots/m10-fx-add-cap-baseline.json (500-Gegner-Frame, 780x360@3):
 * der fx-Pool bringt ~217k Device-Pixel ADD-Overdraw (77 % Bildflaeche) bei nur
 * ~17 Sprites — groszuegige Halo-Groessen plus ausgebrannte Glows (alpha 0,014)
 * kosten volle Fuellrate ohne Sichtbarkeit. Zwei Deckel, beide rein visuell:
 */
/** ADD-Glows unter diesem Alpha sind unsichtbar, aber voll rasterisiert -> frueh freigeben. */
export const ADD_GLOW_ALPHA_FLOOR = 0.04;

/**
 * M10 #5220 (Blocker "Boss-FX-Kontrast"): Mindest-Alpha-Boden fuer Boss-spezifische
 * Effekte (isBossFxKey, nur fx_boss_core). Beim Spawn wird alphaFrom auf >= 0,7
 * geklemmt; Boss-FX sind von fxAlpha-Daempfung, dpr-Alpha und ADD-Glow-Deckel
 * ausgenommen und rendern bewusst NORMAL — unter ADD waere die dunkle Tintenkontur
 * aus Karte #5219 unsichtbar (ADD kann nicht abdunkeln). Der Lifetime-Fade
 * (alphaTo) bleibt wie bei allen FX unveraendert.
 */
export const BOSS_FX_ALPHA_FLOOR = 0.7;

/** Max. Screengroesse (Device-Pixel-Flaeche) je ADD-Glow, solange der Regler gesenkt hat (96x96 @dpr3). */
export const ADD_GLOW_MAX_SCREEN_AREA = 9216;

/**
 * M10-perf-cap-rollback (2026-11-27): der Flaechen-Deckel greift nur noch, wenn
 * der adaptive DPR-Budget-Regler tatsaechlich gesenkt hat (RENDER_SCALE > 1,
 * Android-Sicherheitsnetz). Auf iGPU/GPU bleibt RENDER_SCALE = 1 — grosse Feuer-/
 * Aura-Glows laufen wieder volllaufend (Befund: Deckel kostete Optik ohne
 * FPS-Nutzen, alle iGPU-Läufe vsync-60, siehe docs/lanes/m10-perf-cap-rollback.md).
 * Rein funktional; Laufzeit nutzt das Live-Binding RENDER_SCALE aus config.ts.
 */
export function glowAreaCapForRenderScale(renderScale: number): number {
  if (!Number.isFinite(renderScale)) {
    return renderScale === Number.POSITIVE_INFINITY ? ADD_GLOW_MAX_SCREEN_AREA : Number.POSITIVE_INFINITY;
  }
  return renderScale > 1 ? ADD_GLOW_MAX_SCREEN_AREA : Number.POSITIVE_INFINITY;
}

export interface GlowScaleClamp {
  scaleFrom: number;
  scaleTo: number;
  capped: boolean;
}

/**
 * Skaliert einen ADD-Glow so, dass seine Device-Pixel-Flaeche <= capArea bleibt.
 * texW/texH in Device-Pixel, aspect = scaleX/scaleY-Faktor. Flaeche, nicht Kante:
 * duenne Beams (Blitz/Kette) bleiben lang, nur die Flaeche wird begrenzt.
 * Rein funktional und deterministisch (unit-getestet in tests/fx-add-cap.test.ts).
 */
export function clampGlowScreenArea(
  texW: number,
  texH: number,
  scaleFrom: number,
  scaleTo: number,
  aspect: number,
  capArea: number,
): GlowScaleClamp {
  if (!(capArea > 0) || !Number.isFinite(capArea)) return { scaleFrom, scaleTo, capped: false };
  const w = Math.max(0, texW) * Math.abs(aspect || 1);
  const h = Math.max(0, texH);
  if (!(w > 0) || !(h > 0)) return { scaleFrom, scaleTo, capped: false };
  const worst = Math.max(Math.abs(scaleFrom), Math.abs(scaleTo));
  const area = w * h * worst * worst;
  if (area <= capArea) return { scaleFrom, scaleTo, capped: false };
  const f = Math.sqrt(capArea / area);
  return { scaleFrom: scaleFrom * f, scaleTo: scaleTo * f, capped: true };
}

/** M10: aktueller dpr (Geraetepixel/Spielpixel); node-Tests ohne window -> 1. */
function currentDpr(): number {
  return typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
}

/** M10: Ein Glow-Budget pro Szene — FX- und Partikel-Pool teilen sich den
 *  Deckel, damit die Summe aller additiven Sprites begrenzt bleibt. */
const glowBudgets = new WeakMap<Phaser.Scene, GlowBudget>();
function glowBudgetFor(scene: Phaser.Scene): GlowBudget {
  let budget = glowBudgets.get(scene);
  if (!budget) {
    budget = new GlowBudget(glowCapFor("full"));
    glowBudgets.set(scene, budget);
    // M10 (Review K2/S1): Szenen-Shutdown ohne combat.clear() wuerde Slots der
    // alten Run ewig belegen — Budget beim Shutdown freigeben, nicht leaken.
    scene.events?.once?.(Phaser.Scenes.Events.SHUTDOWN, () => budget?.reset());
  }
  return budget;
}

/** Laufzeitdatensatz eines Effekt-Sprites (public fuer Tests). */
export interface FxRuntime {
  sprite: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  scaleFrom: number;
  scaleTo: number;
  /** Seitenverhältnis-Multiplikator: scaleX = scale * aspect (Beams bleiben dünn). */
  aspect: number;
  alphaFrom: number;
  alphaTo: number;
  rotation: number;
  spin: number;
  frames: string[];
  frameRate: number;
  active: boolean;
  additive: boolean;
  /** M10: Evolutions-Signaturen bleiben auch im Minimal-LOD voll sichtbar. */
  alphaScaleExempt: boolean;
  /** M10: Sprite belegt gerade einen Glow-Slot (ADD-Blend) des Overdraw-Deckels. */
  glow: boolean;
}

export interface FxOptions {
  texture: string;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  life?: number;
  scaleFrom?: number;
  scaleTo?: number;
  /** Optionaler Seitenverhältnis-Multiplikator (nur X); Beams nutzen das für dünne Linien. */
  aspect?: number;
  alphaFrom?: number;
  alphaTo?: number;
  rotation?: number;
  spin?: number;
  tint?: number;
  additive?: boolean;
  depth?: number;
  /** Frame-Animation (4–8 handgesetzte Frames); ohne Angabe statische Textur. */
  frames?: string[];
  /** Frames pro Sekunde der Animation (Default 18). */
  frameRate?: number;
  /** M10: von der Endgame-Alpha-Dämpfung ausnehmen (Evolutions-Signaturen). */
  alphaScaleExempt?: boolean;
}

/**
 * Gepoolter Effekt-Pool für Waffen-VFX, Ringe, Blitze und Ereignis-Inszenierung.
 * Bewusst ohne Phaser-Tweens (Massen-VFX bei 500 Gegnern), Update in festen Schritten.
 *
 * Zusätzlich gibt es einen eigenen Partikel-Pool (`ParticleSystem`) mit größerem
 * Cap: die 160er-Grenze gilt nur für große Effekt-Sprites, nicht für Funken.
 */
export class FxSystem {
  readonly active: FxRuntime[] = [];
  private readonly free: FxRuntime[] = [];
  private readonly scene: Phaser.Scene;
  /** Obergrenze für große Effekt-Sprites (LOD senkt sie bei Extremlast). */
  private maxActive = 220;
  /** Trails abschaltbar (LOD): spart Draw-Aufrufe bei > 400 Gegnern. */
  trailsEnabled = true;
  /** M6-Endgame-Dämpfung: Alpha-Faktor für alle neuen Effekte (1 = unverändert). */
  alphaScale = 1;
  /** M10-Attribution: kompletter FX-Pool abschaltbar (nur Messung, kein Spielpfad). */
  enabled = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** Effekt-Alpha dämpfen (Endgame): 1 = voll, < 1 = transparenter.
   *  Wirkt auch auf bereits aktive Effekte, damit ein LOD-Wechsel mitten im
   *  Kampf sofort lesbar wird (und Debug-Vorher/Nachher im selben Frame geht). */
  setAlphaScale(scale: number): void {
    const next = Math.max(0.2, Math.min(1, scale));
    if (next === this.alphaScale) return;
    const ratio = next / this.alphaScale;
    this.alphaScale = next;
    const budget = glowBudgetFor(this.scene);
    for (const fx of this.active) {
      if (fx.alphaScaleExempt) continue;
      fx.alphaFrom = Math.max(0, Math.min(1, fx.alphaFrom * ratio));
      fx.sprite.setAlpha(Math.max(0, Math.min(1, fx.sprite.alpha * ratio)));
      const blendAdd = fx.additive && next >= 0.7;
      // M10 (Review K2/K1): Re-Promotion braucht einen echten Glow-Slot —
      // sonst hebelt ein LOD-Rueckwechsel (minimal -> full) den Deckel aus,
      // weil frueher per NORMAL-Fallback abgewiesene Sprites ohne Slot-Request
      // wieder auf ADD gestellt wuerden. Ohne freien Slot bleibt NORMAL.
      if (blendAdd && !fx.glow) fx.glow = budget.request();
      fx.sprite.setBlendMode(fx.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      // M10: faellt ein Glow unter den ADD-Schwellwert, gibt er seinen Slot frei.
      if (!blendAdd && fx.glow) {
        budget.release();
        fx.glow = false;
      }
    }
  }

  setMaxActive(max: number): void {
    this.maxActive = Math.max(24, Math.floor(max));
    // M10: LOD-Stufe aus dem Effekt-Cap ableiten (lod.ts wird nur gelesen) und
    // den geteilten Glow-Deckel anpassen: 180 = full, 90 = reduced, 60 = minimal.
    const level: FxLodLevel = this.maxActive <= 60 ? "minimal" : this.maxActive <= 90 ? "reduced" : "full";
    glowBudgetFor(this.scene).setCap(glowCapFor(level));
  }

  spawn(opts: FxOptions): FxRuntime | null {
    if (!this.enabled) return null;
    if (this.active.length >= this.maxActive) return null;
    const fx = this.free.pop() ?? this.createRuntime();
    fx.x = opts.x;
    fx.y = opts.y;
    fx.vx = opts.vx ?? 0;
    fx.vy = opts.vy ?? 0;
    fx.life = opts.life ?? 0.35;
    fx.maxLife = fx.life;
    fx.scaleFrom = opts.scaleFrom ?? 1;
    fx.scaleTo = opts.scaleTo ?? fx.scaleFrom;
    fx.aspect = opts.aspect ?? 1;
    // Additive Glows stacken auf 255: im Endgame deshalb quadratisch dämpfen,
    // sonst bleibt der weiße Kern trotz Alpha-Faktor stehen.
    // M10 #5220: Boss-spezifische Effekte sind vom gesamten LOD-Pfad ausgenommen
    // (Daempfung, dpr-Alpha, ADD-Glow-Deckel) und bekommen den Mindest-Alpha-Boden.
    const bossFx = isBossFxKey(opts.texture) || (opts.frames !== undefined && isBossFxKey(opts.frames[0]));
    const additive = opts.additive !== false && !bossFx;
    const exempt = opts.alphaScaleExempt === true || bossFx;
    const scaleFactor = exempt ? 1 : this.alphaScale;
    const extra = additive ? scaleFactor : 1;
    // M10: dpr-Skalierung — bei dpr > 2 kostet jedes additive Sprite die volle
    // Device-Flaeche (2,5 Mio px bei 780x360@3), Alpha daher auf 0,6.
    const dprAlpha = additive ? fxAlphaForDpr(currentDpr()) : 1;
    let alphaFrom = (opts.alphaFrom ?? 0.9) * scaleFactor * extra * dprAlpha;
    if (bossFx) alphaFrom = Math.max(alphaFrom, BOSS_FX_ALPHA_FLOOR);
    fx.alphaFrom = alphaFrom;
    fx.alphaScaleExempt = exempt;
    fx.alphaTo = opts.alphaTo ?? 0;
    fx.rotation = opts.rotation ?? 0;
    fx.spin = opts.spin ?? 0;
    fx.frames = opts.frames ?? [opts.texture];
    fx.frameRate = opts.frameRate ?? 18;
    fx.active = true;
    const sprite = fx.sprite;
    applyTexture(sprite, fx.frames[0]);
    sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
    // M10-A4: additive Glows auf Screengroesse cappen — nur wenn der DPR-Budget-
    // Regler gesenkt hat (RENDER_SCALE > 1); auf iGPU unveraendert volllaufend.
    if (additive) {
      const clamped = clampGlowScreenArea(
        sprite.width || 0, sprite.height || 0,
        fx.scaleFrom, fx.scaleTo, fx.aspect,
        glowAreaCapForRenderScale(RENDER_SCALE),
      );
      if (clamped.capped) {
        fx.scaleFrom = clamped.scaleFrom;
        fx.scaleTo = clamped.scaleTo;
      }
    }
    sprite.setScale(fx.scaleFrom * fx.aspect, fx.scaleFrom);
    sprite.setAlpha(fx.alphaFrom);
    sprite.setRotation(fx.rotation);
    sprite.setDepth(opts.depth ?? DEPTH.fxLow);
    fx.additive = additive;
    // Minimal-LOD: grosse additive Flächen auf NORMAL legen, sonst bleibt der
    // Kern trotz Alpha-Dämpfung weiß (additive Sprites stacken auf 255).
    // M10: Deckel — nur Sprites mit echtem ADD-Blend belegen einen Glow-Slot;
    // ueber dem Deckel faellt das Sprite auf NORMAL zurueck (Form bleibt).
    const blendAdd = fx.additive && this.alphaScale >= 0.7;
    const budget = glowBudgetFor(this.scene);
    fx.glow = blendAdd ? budget.request() : false;
    sprite.setBlendMode(fx.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (opts.tint !== undefined) sprite.setTint(opts.tint);
    else sprite.clearTint();
    sprite.setVisible(true).setActive(true);
    this.active.push(fx);
    return fx;
  }

  /** Frame-Animation per Basis-Key (Frame-Anzahl aus FX_FRAME_COUNTS). */
  spawnAnim(base: string, x: number, y: number, opts: Partial<FxOptions> = {}): FxRuntime | null {
    const count = FX_FRAME_COUNTS[base] ?? 1;
    return this.spawn({
      ...(opts as FxOptions),
      texture: base,
      x,
      y,
      frames: opts.frames ?? fxFrames(base, count),
      frameRate: opts.frameRate ?? count / Math.max(0.05, opts.life ?? 0.35),
    });
  }

  /** Kurzer Partikel-Burst (Treffer/Tod), radial gestreut. */
  burst(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    const base = opts as FxOptions;
    const life = opts.life ?? 0.22;
    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2;
      const speed = 24 + this.rand() * 46;
      this.spawn({
        ...base,
        texture,
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: life * (0.7 + this.rand() * 0.6),
        scaleFrom: opts.scaleFrom ?? 1,
        scaleTo: opts.scaleTo ?? 0.2,
        alphaFrom: opts.alphaFrom ?? 0.9,
        alphaTo: 0,
      });
    }
  }

  /**
   * M10: Treffer-/Todes-Signatur einer Evolution. Form, Palette und Lifetime kommen
   * aus `EVOLUTION_SIGNATURES`; die Textur ist bereits in Palettenfarben gebacken.
   * LOD-Garantie: Alpha faellt nie unter 0,5, Blend bleibt NORMAL — die Form und
   * der Haupt-Palettenindex bleiben damit auch bei 300+ Gegnern unterscheidbar.
   * Cooldown pro Evolution+Art verhindert Sprite-Flut in AoE-Kills.
   */
  spawnEvolution(
    evolution: string,
    kind: "hit" | "death",
    x: number,
    y: number,
    opts: Partial<FxOptions> = {},
  ): FxRuntime | null {
    const sig = EVOLUTION_SIGNATURES[evolution];
    if (!sig) return null;
    const key = `${evolution}:${kind}`;
    const now = this.scene.time.now;
    const baseLife = kind === "hit" ? sig.hitLifetime : sig.deathLifetime;
    const last = this.signatureLast.get(key) ?? -1e9;
    if (now - last < baseLife * 450) return null;
    this.signatureLast.set(key, now);
    const texture = signatureTextureKey(evolution, kind);
    // M10-Abnahme: 32x32-Texturen, Hit 3,2–3,6 / Death 4,0–4,6, volle Alpha
    // auch im Minimal-LOD (alphaScaleExempt, Untergrenze effektiv 0,95).
    const spin = sig.shape === "splitter" ? (kind === "hit" ? 2.2 : 1.4) : sig.shape === "cloud" ? 0.7 : 0;
    return this.spawn({
      ...(opts as FxOptions),
      texture,
      frames: opts.frames ?? fxFrames(texture, SIGNATURE_FRAME_COUNT),
      x,
      y,
      life: opts.life ?? baseLife,
      scaleFrom: opts.scaleFrom ?? (kind === "hit" ? 3.2 : 4.0),
      scaleTo: opts.scaleTo ?? (kind === "hit" ? 3.6 : 4.6),
      alphaFrom: opts.alphaFrom ?? 0.95,
      alphaTo: 0,
      additive: false,
      depth: DEPTH.enemyDeath,
      spin: opts.spin ?? spin,
      rotation: opts.rotation ?? (sig.palette[0] % 7) * 0.42,
      alphaScaleExempt: true,
    });
  }

  private signatureLast = new Map<string, number>();

  /** Deterministischer LCG statt Math.random (reproduzierbare VFX-Screenshots). */
  private seq = 0x9e3779b9;
  private rand(): number {
    this.seq = (this.seq * 1664525 + 1013904223) >>> 0;
    return this.seq / 0x100000000;
  }

  /** Linie (Blitz/Speer) als rotiertes Segment. */
  beam(texture: string, x1: number, y1: number, x2: number, y2: number, opts: Partial<FxOptions> = {}): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    // Nur in Y strecken: die Linie bleibt texW Pixel breit statt len/8-fach aufzublähen.
    const stretch = len / 8;
    this.spawn({
      ...(opts as FxOptions),
      texture,
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      rotation: Math.atan2(dy, dx) + Math.PI / 2,
      scaleFrom: stretch,
      scaleTo: stretch,
      aspect: opts.aspect ?? 1 / stretch,
      life: opts.life ?? 0.18,
      alphaFrom: opts.alphaFrom ?? 1,
      alphaTo: 0,
      additive: opts.additive ?? true,
    });
  }

  /**
   * Gezackter, verzweigter Blitz aus 3–6 Segmenten. Jedes Segment behält die
   * volle Texturbreite (kein aspect-Stauch) und wird nur in Y gestreckt.
   */
  bolt(x1: number, y1: number, x2: number, y2: number, opts: Partial<FxOptions> = {}): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    const nx = -dy / len;
    const ny = dx / len;
    const segments = Math.max(3, Math.min(6, Math.ceil(len / 26)));
    const seed = Math.abs(Math.floor(x1 * 13 + y1 * 7 + x2 * 3 + y2 * 11));
    const life = opts.life ?? 0.3;
    const tint = opts.tint;
    const jitter = (i: number): number => (Math.sin(seed * 0.7 + i * 2.3) * 4.2 + Math.sin(seed + i * 5.1) * 1.8);
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const o0 = i === 0 ? 0 : jitter(i);
      const o1 = i === segments - 1 ? 0 : jitter(i + 1);
      const ax = x1 + dx * t0 + nx * o0;
      const ay = y1 + dy * t0 + ny * o0;
      const bx = x1 + dx * t1 + nx * o1;
      const by = y1 + dy * t1 + ny * o1;
      const segLen = Math.hypot(bx - ax, by - ay) || 1;
      this.spawnAnim("fx_bolt", (ax + bx) / 2, (ay + by) / 2, {
        ...(opts as FxOptions),
        rotation: Math.atan2(by - ay, bx - ax) + Math.PI / 2,
        scaleFrom: segLen / 16,
        scaleTo: segLen / 16,
        life, alphaFrom: opts.alphaFrom ?? 1, alphaTo: opts.alphaTo ?? 0,
        tint,
      });
    }
    // Zwei Seitenäste (verzweigt), nicht nur eine gerade Säule.
    for (let b = 0; b < 2; b++) {
      const t = 0.35 + b * 0.22;
      const ox = x1 + dx * t + nx * jitter(b + 2);
      const oy = y1 + dy * t + ny * jitter(b + 2);
      const side = (b === 0 ? 1 : -1) * (0.55 + (seed % 3) * 0.12);
      const bx = ox + Math.cos(ang + side) * 20;
      const by = oy + Math.sin(ang + side) * 20;
      this.spawnAnim("fx_bolt", (ox + bx) / 2, (oy + by) / 2, {
        ...(opts as FxOptions),
        rotation: Math.atan2(by - oy, bx - ox) + Math.PI / 2,
        scaleFrom: 0.9, scaleTo: 0.9,
        life: life * 0.75, alphaFrom: 0.85, alphaTo: 0, tint,
      });
    }
  }

  /** Boden-Decal (unter Gegnern, Normal-Blend). */
  decal(texture: string, x: number, y: number, opts: Partial<FxOptions> = {}): FxRuntime | null {
    return this.spawn({
      ...(opts as FxOptions),
      texture, x, y,
      depth: DEPTH.decal,
      additive: false,
      alphaFrom: opts.alphaFrom ?? 0.9,
      alphaTo: opts.alphaTo ?? 0,
      life: opts.life ?? 1.2,
    });
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i];
      if (!fx.active) continue;
      fx.life -= dt;
      if (fx.life <= 0) {
        fx.active = false;
        fx.sprite.setVisible(false).setActive(false);
        fx.sprite.clearTint();
        // M10: Glow-Slot freigeben, damit neue additive Sprites den Deckel nutzen.
        if (fx.glow) {
          glowBudgetFor(this.scene).release();
          fx.glow = false;
        }
        this.active.splice(i, 1);
        this.free.push(fx);
        continue;
      }
      const t = 1 - fx.life / fx.maxLife;
      fx.x += fx.vx * dt;
      fx.y += fx.vy * dt;
      fx.rotation += fx.spin * dt;
      const scale = fx.scaleFrom + (fx.scaleTo - fx.scaleFrom) * t;
      const frame = fx.frames[Math.min(fx.frames.length - 1, Math.floor(t * fx.frames.length))];
      if (frame && currentFrame(fx.sprite) !== frame) applyTexture(fx.sprite, frame);
      fx.sprite.setPosition(Math.round(fx.x), Math.round(fx.y));
      fx.sprite.setScale(scale * fx.aspect, scale);
      const alpha = Math.max(0, fx.alphaFrom + (fx.alphaTo - fx.alphaFrom) * t);
      // M10-A4: ausgebrannte ADD-Glows (alpha <= 4 %) kosten volle Fuellrate,
      // sind aber nicht mehr sichtbar -> frueh freigeben statt ausschleichen.
      // Achtung bei kuenftigen Fade-in-Glows (alphaFrom klein): der Boden
      // cuellt sie sofort — Fade-in dann ueber alphaTo/-From >= Floor bauen.
      if (fx.glow && alpha <= ADD_GLOW_ALPHA_FLOOR) {
        fx.active = false;
        fx.sprite.setVisible(false).setActive(false);
        fx.sprite.clearTint();
        glowBudgetFor(this.scene).release();
        fx.glow = false;
        this.active.splice(i, 1);
        this.free.push(fx);
        continue;
      }
      fx.sprite.setAlpha(alpha);
      fx.sprite.setRotation(fx.rotation);
    }
  }

  /** Effekt-Runtimes vor dem ersten Spawn anlegen (Peak-Allokation vermeiden). */
  prewarm(n: number): void {
    while (this.free.length < n) {
      const fx = this.createRuntime();
      fx.active = false;
      fx.sprite.setVisible(false).setActive(false);
      this.free.push(fx);
    }
  }

  private createRuntime(): FxRuntime {
    const sprite = makeImage(this.scene, 0, 0, "fx_spark").setDepth(DEPTH.fxLow);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      scaleFrom: 1, scaleTo: 1, aspect: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0,
      frames: ["fx_spark"], frameRate: 18, active: false, additive: true, alphaScaleExempt: false, glow: false,
    };
  }

  clear(): void {
    for (const fx of this.active) {
      fx.active = false;
      fx.sprite.setVisible(false).setActive(false);
      if (fx.glow) {
        glowBudgetFor(this.scene).release();
        fx.glow = false;
      }
      this.free.push(fx);
    }
    this.active.length = 0;
    this.seq = 0x9e3779b9;
    this.signatureLast.clear();
  }

  get count(): number {
    return this.active.length;
  }

  /** M10-A4: aktueller Glow-Deckel/Beleg (Messung + Abnahme, geteilt je Szene). */
  get glowCap(): number {
    return glowBudgetFor(this.scene).cap;
  }

  get glowUsed(): number {
    return glowBudgetFor(this.scene).current;
  }

  /**
   * M10-A4: Gegnerlast an den Pool melden und die Glow-Slots an den LOD-Cap
   * koppeln (lod.ts wird nur gelesen). Run.applyLod -> CombatSystem.setLod ->
   * setMaxActive treibt denselben Deckel bereits bei jedem LOD-Wechsel; diese
   * Methode macht die Kopplung explizit: ab 250 Gegnern schaltet
   * ambientBudgetFor die Ambient-Glows ganz ab (glow 0) — dann greift fuer
   * FX-Glows der minimale Deckel, sonst glowCapFor der lodFor-Stufe.
   * Drosselt monoton (hebt nie wieder an) — aktuell ohne produktiven Aufrufer;
   * falls verdrahtet, muss der Aufrufer die Last jeden Frame melden, sonst
   * bleibt der Minimal-Deckel nach einer schweren Welle haengen.
   */
  setEnemyLoad(enemies: number): void {
    const level = lodFor(enemies).level;
    const ambient = ambientBudgetFor(enemies);
    const cap = ambient.glow === 0 ? glowCapFor("minimal") : glowCapFor(level);
    const budget = glowBudgetFor(this.scene);
    if (cap < budget.cap) budget.setCap(cap);
  }

  /** Aktive Frame-Key-Liste (Debug/Abnahme). */
  get keys(): string[] {
    return [...new Set(this.active.map((f) => f.frames[0]))];
  }
}

/** Eigener Partikel-Pool: Funken/Splitter/Staub, deutlich über dem Effekt-Cap. */
export class ParticleSystem {
  active: FxRuntime[] = [];
  private readonly free: FxRuntime[] = [];
  private readonly scene: Phaser.Scene;
  private maxActive = 360;
  /** M6-Endgame-Dämpfung: Alpha-Faktor für neue Partikel (1 = unverändert). */
  alphaScale = 1;
  /** M10-Attribution: kompletter Partikel-Pool abschaltbar (nur Messung). */
  enabled = true;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setAlphaScale(scale: number): void {
    const next = Math.max(0.2, Math.min(1, scale));
    if (next === this.alphaScale) return;
    const ratio = next / this.alphaScale;
    this.alphaScale = next;
    const budget = glowBudgetFor(this.scene);
    for (const p of this.active) {
      // M10 m10-boss-death-shards (Folgekarte aus m10-boss-fx-contrast, analog
      // #5220 im FxSystem-Pfad): Boss-Partikel sind vom Alpha-LOD-Pfad
      // komplett ausgenommen — weder Daempfung noch Re-Promotion (sie
      // rendern dauerhaft NORMAL, s. spawn()).
      if (isBossFxKey(p.frames[0])) continue;
      p.alphaFrom = Math.max(0, Math.min(1, p.alphaFrom * ratio));
      p.sprite.setAlpha(Math.max(0, Math.min(1, p.sprite.alpha * ratio)));
      const blendAdd = p.additive && next >= 0.7;
      // M10 (Review K2/K1): Re-Promotion wie im FxSystem nur mit Glow-Slot.
      if (blendAdd && !p.glow) p.glow = budget.request();
      p.sprite.setBlendMode(p.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      // M10: faellt ein Glow unter den ADD-Schwellwert, gibt er seinen Slot frei.
      if (!blendAdd && p.glow) {
        budget.release();
        p.glow = false;
      }
    }
  }

  setMaxActive(max: number): void {
    this.maxActive = Math.max(40, Math.floor(max));
    // M10: LOD-Stufe aus dem Partikel-Cap ableiten (lod.ts wird nur gelesen):
    // 280 = full, 140 = reduced, 100 = minimal.
    const level: FxLodLevel = this.maxActive <= 100 ? "minimal" : this.maxActive <= 140 ? "reduced" : "full";
    glowBudgetFor(this.scene).setCap(glowCapFor(level));
  }

  spawn(opts: FxOptions): FxRuntime | null {
    if (!this.enabled) return null;
    if (this.active.length >= this.maxActive) return null;
    const p = this.free.pop() ?? this.createRuntime();
    p.x = opts.x;
    p.y = opts.y;
    p.vx = opts.vx ?? 0;
    p.vy = opts.vy ?? 0;
    p.life = opts.life ?? 0.3;
    p.maxLife = p.life;
    p.scaleFrom = opts.scaleFrom ?? 1;
    p.scaleTo = opts.scaleTo ?? 0.2;
    p.aspect = opts.aspect ?? 1;
    // M10 m10-boss-death-shards (Folgekarte aus m10-boss-fx-contrast): Boss-
    // Partikel (isBossFxKey, aktuell nur fx_boss_core — eine Wahrheit via
    // gen-fx.ts, SYNC-Hinweis im Patch) sind analog #5220 im FxSystem-Pfad vom
    // gesamten LOD-Pfad ausgenommen: keine fxAlpha-/dpr-Daempfung, Mindest-
    // Alpha-Boden 0,7, kein Glow-Slot, bewusst NORMAL — unter ADD waere die
    // dunkle Tintenkontur aus #5219 unsichtbar. Der Lifetime-Fade (alphaTo)
    // bleibt wie bei allen Partikeln unveraendert.
    const bossFx = isBossFxKey(opts.texture) || (opts.frames !== undefined && isBossFxKey(opts.frames[0]));
    const additive = opts.additive !== false && !bossFx;
    const scaleFactor = bossFx ? 1 : this.alphaScale;
    const extra = additive ? scaleFactor : 1;
    // M10: dpr-Skalierung — bei dpr > 2 kostet jedes additive Sprite die volle
    // Device-Flaeche (2,5 Mio px bei 780x360@3), Alpha daher auf 0,6.
    const dprAlpha = additive ? fxAlphaForDpr(currentDpr()) : 1;
    let alphaFrom = (opts.alphaFrom ?? 0.95) * scaleFactor * extra * dprAlpha;
    if (bossFx) alphaFrom = Math.max(alphaFrom, BOSS_FX_ALPHA_FLOOR);
    p.alphaFrom = alphaFrom;
    p.alphaTo = opts.alphaTo ?? 0;
    p.rotation = opts.rotation ?? 0;
    p.spin = opts.spin ?? 0;
    p.frames = opts.frames ?? [opts.texture];
    p.frameRate = opts.frameRate ?? 18;
    p.active = true;
    const s = p.sprite;
    applyTexture(s, p.frames[0]);
    s.setPosition(Math.round(p.x), Math.round(p.y));
    // M10-A4: additive Glows auf Screengroesse cappen — nur wenn der DPR-Budget-
    // Regler gesenkt hat (RENDER_SCALE > 1); auf iGPU unveraendert volllaufend.
    if (additive) {
      const clamped = clampGlowScreenArea(
        s.width || 0, s.height || 0,
        p.scaleFrom, p.scaleTo, p.aspect,
        glowAreaCapForRenderScale(RENDER_SCALE),
      );
      if (clamped.capped) {
        p.scaleFrom = clamped.scaleFrom;
        p.scaleTo = clamped.scaleTo;
      }
    }
    s.setScale(p.scaleFrom * p.aspect, p.scaleFrom);
    s.setAlpha(p.alphaFrom);
    s.setRotation(p.rotation);
    s.setDepth(opts.depth ?? DEPTH.fxLow);
    p.additive = additive;
    // M10: Deckel — geteilt mit FxSystem, nur echte ADD-Sprites belegen Slots.
    // Boss-Partikel sind ab oben non-additiv und belegen deshalb nie einen Slot.
    const blendAdd = p.additive && this.alphaScale >= 0.7 && !bossFx;
    const budget = glowBudgetFor(this.scene);
    p.glow = blendAdd ? budget.request() : false;
    s.setBlendMode(p.glow ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (opts.tint !== undefined) s.setTint(opts.tint);
    else s.clearTint();
    s.setVisible(true).setActive(true);
    this.active.push(p);
    return p;
  }

  /** Radialer Burst mit optionaler Frame-Animation. */
  burst(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + (opts.rotation ?? 0);
      const speed = (opts.vx ?? 33) + this.rand() * 42;
      this.spawn({
        ...(opts as FxOptions),
        texture, x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: (opts.life ?? 0.32) * (0.75 + this.rand() * 0.5),
      });
    }
  }

  /** Zerfalls-Splitter in eine Richtung (Todes-Effekt). */
  shards(texture: string, x: number, y: number, count: number, opts: Partial<FxOptions> = {}): void {
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * Math.PI * 2 + this.rand() * 0.5;
      const speed = 20 + this.rand() * 55;
      this.spawn({
        ...(opts as FxOptions),
        texture, x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: (opts.life ?? 0.4) * (0.7 + this.rand() * 0.6),
        scaleFrom: opts.scaleFrom ?? 1,
        scaleTo: 0.15,
        alphaFrom: opts.alphaFrom ?? 1,
        alphaTo: 0,
      });
    }
  }

  private seq = 0x1234567;
  private rand(): number {
    this.seq = (this.seq * 1103515245 + 12345) >>> 0;
    return this.seq / 0x100000000;
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.setVisible(false).setActive(false);
        p.sprite.clearTint();
        // M10: Glow-Slot freigeben, damit neue additive Sprites den Deckel nutzen.
        if (p.glow) {
          glowBudgetFor(this.scene).release();
          p.glow = false;
        }
        this.active.splice(i, 1);
        this.free.push(p);
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.max(0, 1 - dt * 2.2);
      p.vy *= Math.max(0, 1 - dt * 2.2);
      p.rotation += p.spin * dt;
      const scale = p.scaleFrom + (p.scaleTo - p.scaleFrom) * t;
      const frame = p.frames[Math.min(p.frames.length - 1, Math.floor(t * p.frames.length))];
      if (frame && currentFrame(p.sprite) !== frame) applyTexture(p.sprite, frame);
      p.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      p.sprite.setScale(scale * p.aspect, scale);
      const alpha = Math.max(0, p.alphaFrom + (p.alphaTo - p.alphaFrom) * t);
      // M10-A4: ausgebrannte ADD-Glows frueh freigeben (Fuellrate ohne Sichtbarkeit).
      if (p.glow && alpha <= ADD_GLOW_ALPHA_FLOOR) {
        p.active = false;
        p.sprite.setVisible(false).setActive(false);
        p.sprite.clearTint();
        glowBudgetFor(this.scene).release();
        p.glow = false;
        this.active.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.sprite.setAlpha(alpha);
      p.sprite.setRotation(p.rotation);
    }
  }

  prewarm(n: number): void {
    while (this.free.length < n) {
      const p = this.createRuntime();
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      this.free.push(p);
    }
  }

  private createRuntime(): FxRuntime {
    const sprite = makeImage(this.scene, 0, 0, "fx_spark").setDepth(DEPTH.fxLow);
    return {
      sprite, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1,
      scaleFrom: 1, scaleTo: 1, aspect: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0,
      frames: ["fx_spark"], frameRate: 18, active: false, additive: true, alphaScaleExempt: false, glow: false,
    };
  }

  clear(): void {
    for (const p of this.active) {
      p.active = false;
      p.sprite.setVisible(false).setActive(false);
      if (p.glow) {
        glowBudgetFor(this.scene).release();
        p.glow = false;
      }
      this.free.push(p);
    }
    this.active.length = 0;
  }

  get count(): number {
    return this.active.length;
  }

  /** M10-A4: aktueller Glow-Deckel/Beleg (Messung + Abnahme, geteilt je Szene). */
  get glowCap(): number {
    return glowBudgetFor(this.scene).cap;
  }

  get glowUsed(): number {
    return glowBudgetFor(this.scene).current;
  }

  /** M10-A4: Gegnerlast melden — Deckel wie FxSystem.setEnemyLoad (lod.ts nur gelesen,
   *  monoton, aktuell ohne produktiven Aufrufer). */
  setEnemyLoad(enemies: number): void {
    const level = lodFor(enemies).level;
    const ambient = ambientBudgetFor(enemies);
    const cap = ambient.glow === 0 ? glowCapFor("minimal") : glowCapFor(level);
    const budget = glowBudgetFor(this.scene);
    if (cap < budget.cap) budget.setCap(cap);
  }
}
