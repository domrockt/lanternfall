import Phaser from "phaser";
import { C, PAL } from "../palette";
import { GLYPH_ADVANCE, GLYPH_H, PixelText } from "../gfx/font";
import { GAME_HEIGHT, GAME_WIDTH } from "../config";
import { weaponDef, isEvolutionWeapon } from "../data/weaponIds";
import { iconKeyForOffer, iconTextureKey } from "../gfx/icons";
import { PASSIVES } from "../data/passives";
import type { Offer } from "../logic/levelup";
import { slotNameLines } from "../logic/text";
import { slotLabelLines, wrapHintLines } from "../gfx/text";
import { evolutionReadyList } from "../logic/evolution";
import type { EvolutionDef } from "../data/types";
import { chooseBestOffer } from "../logic/autoplay";
import { OptionsMenu, hoverRowAllowed } from "../ui/options-menu";
import { createMenuButton, MenuFocus, menuRepeatTick, type MenuButton, type MenuRepeatState } from "../ui/menu";
import { InputState, type ActionState } from "../input/InputState";
import { readSceneGamepad } from "../input/Gamepad";
import { TouchControls } from "../input/TouchControls";
import type { HudState, Run } from "./Run";
import { bossHudRects } from "../systems/BossSystem";
import {
  hudSideMargin,
  hudTopMargin,
  insetsOverCanvas,
  insetsToGamePx,
  readDeviceSafeAreaInsets,
  type SafeAreaInsets,
} from "../logic/safearea";

/**
 * Banner-Timing (Dom 4b): kurz einblenden, 2,4 s halten, ausblenden
 * (bannerTimer). Die Messskripte/Tests prüfen die Kette über diese Konstanten.
 */
export const BANNER_FADE_IN_MS = 120;
export const BANNER_HOLD_MS = 2400;
export const BANNER_FADE_OUT_MS = 380;

interface CardView {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  number: PixelText;
  name: PixelText;
  level: PixelText;
  desc: PixelText[];
}

/**
 * M10-hud-wide-anchor: HUD-Anker-Konstanten (Spielpixel), abgeleitet aus der
 * gemessenen 640x360-Referenz (shots/m10-hud-anchor-baseline.json).
 * Safe-Area-Rand: links/rechts 5 px, oben 1 px, unten 7 px. Die Icon-Reihe
 * sitzt 11 px rechts der HP-Leiste; der Evo-Hinweis 13 px hinter der vollen
 * Icon-Reihe. Referenzpfad 640x360 bleibt pixelidentisch (AE = 0), ausser dem
 * hierdurch verankerten Icon-Hintergrund (Basis-Fix, siehe Lane-Doku).
 */
export const HUD_MARGIN_X = 5;
export const HUD_TOP_Y = 1;
export const HUD_HP_X = HUD_MARGIN_X;
export const HUD_HP_W = 106;
export const HUD_ICONS_X = HUD_HP_X + HUD_HP_W + 11; // 122
export const HUD_ICON_PITCH = 17;
export const HUD_MAX_ICONS = 12;
/** 13 px hinter dem Ende der vollen Icon-Reihe (Referenz: x=330). */
export const HUD_EVO_HINT_X = HUD_ICONS_X + (HUD_MAX_ICONS - 1) * HUD_ICON_PITCH + 8 + 13; // 330

/**
 * m10-xp-hud-crisp (menu-art-crisp Befundklasse F1, Beleg
 * shots/m10-xp-hud-before.json): Fuell-Rechtecke (XP-/HP-/Boss-Leiste) wurden
 * mit fraktionalem Scale gefuert — Display-Breite 235.5/81.648/221.374 px,
 * Kante damit zwischen Spielpixeln (fraktionale Kante, 1-px-Schimmer bei
 * jeder Aenderung). Fix: Fuellbreite als GANZZAHLIGE Spielpixel; der Draw-
 * Pfad nutzt 1-px-Basis + ganzzahligen Scale, keine fraktionale Kante mehr.
 */
export function crispFillWidth(baseW: number, ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio));
  return Math.max(0, Math.round(r * baseW));
}

/** Feste HP-Fuellbreite (Spielpixel) der HUD-Leiste. */
export const HUD_HP_FILL_W = 82;

export interface BossBarGeom {
  barW: number;
  left: number;
  fillX: number;
  fillW: number;
  segXs: number[];
  capXs: number[];
}

/**
 * m10-xp-hud-crisp: reine Boss-Leisten-Geometrie (ganzzahlige Spielpixel).
 * Vorher: Segment-x = left + 4 + i*(barW-8)/9 mit (236-8)/9 = 25.333 — alle
 * 8 Trenner saessen auf fraktionalen x-Positionen (before-JSON, left
 * 231.333/256.667/...). Fix: je Segment gerundet; barW/fill/caps ganzzahlig.
 */
export function bossBarGeometry(viewWidth: number): BossBarGeom {
  const barW = Math.round(Math.min(236, Math.max(1, viewWidth - 48)));
  const left = Math.round(viewWidth / 2 - barW / 2);
  const segXs: number[] = [];
  for (let i = 1; i < 9; i++) segXs.push(Math.round(left + 4 + (i * (barW - 8)) / 9));
  return {
    barW,
    left,
    fillX: left + 4,
    fillW: barW - 8,
    segXs,
    capXs: [Math.round(left - 5), Math.round(left + barW - 5)],
  };
}

export interface AnchorBox { x: number; y: number; w: number; h: number }

export interface HudAnchorInput {
  /** Textbreiten worst case in Zeichen (Glyph = 6 px). */
  levelChars?: number;
  timerChars?: number;
  killChars?: number;
  evoHintChars?: number;
  iconCount?: number;
}

/**
 * M10-hud-wide-anchor: reine Anker-Geometrie des HUD-Topstreifens (keine
 * Phaser-Abhaengigkeit, in tests/hud-anchor.test.ts gegen den Safe-Area-Rand
 * je Format geprueft). Alle Werte ganzzahlige Spielpixel.
 */
export function hudAnchorBoxes(width: number, height: number, input: HudAnchorInput = {},
  safe?: Partial<SafeAreaInsets>): Record<string, AnchorBox> {
  const levelChars = input.levelChars ?? 5;   // "LV 40"
  const timerChars = input.timerChars ?? 5;   // "00:00"
  const killChars = input.killChars ?? 10;    // "KILL 99999"
  const evoHintChars = input.evoHintChars ?? 20; // "EVOLUTION BEREIT (2)"
  const iconCount = Math.max(0, Math.min(HUD_MAX_ICONS, input.iconCount ?? HUD_MAX_ICONS));
  const glyph = (chars: number): number => chars * 6;
  // m10-hud-safearea: Geraete-Insets in Spielpixeln (0 = bitgleich zur
  // Referenz). Elemente klemmen an View-Rand MINUS Marge.
  const mLeft = hudSideMargin(HUD_MARGIN_X, safe?.left ?? 0, width);
  const mRight = hudSideMargin(HUD_MARGIN_X, safe?.right ?? 0, width);
  const topY = hudTopMargin(HUD_TOP_Y, safe?.top ?? 0);
  const topOff = topY - HUD_TOP_Y;
  const iconShift = mLeft - HUD_MARGIN_X;
  return {
    level: { x: mLeft, y: topY, w: glyph(levelChars), h: 7 },
    timer: { x: Math.round(width / 2 - glyph(timerChars) / 2), y: topY, w: glyph(timerChars), h: 7 },
    kills: { x: width - mRight - glyph(killChars), y: topY, w: glyph(killChars), h: 7 },
    hp: { x: mLeft, y: 15 + topOff, w: HUD_HP_W, h: 9 },
    xp: { x: mLeft, y: 8 + topOff, w: width - mLeft - mRight, h: 4 },
    "iconrow-bg": { x: HUD_ICONS_X + iconShift - 8, y: 13 + topOff, w: iconCount === 0 ? 0 : 8 + iconCount * HUD_ICON_PITCH, h: 19 },
    icons: { x: HUD_ICONS_X + iconShift, y: 15 + topOff, w: iconCount === 0 ? 0 : (iconCount - 1) * HUD_ICON_PITCH + 16, h: 16 },
    "evo-hint": { x: HUD_EVO_HINT_X + iconShift, y: 15 + topOff, w: glyph(evoHintChars), h: 15 },
  };
}

/**
 * m10-chest-panel-ui: Truhen-Panel-Anker (Spielpixel, Panel-Band 270 px hoch,
 * oy = vertikaler Band-Offset). Der Untertitel haengt an der Titel-Unterkante
 * (GLYPH_H * CHEST_TITLE_SCALE + Gap), nicht an einem Aufloesungs-Hartwert:
 * der alte Hartwert 54+oy lieferte nur 2 px Gap zur Titel-Unterkante
 * (shots/m10-chest-panel-before.json). Icon-/Hint-Werte sind die verifizierten
 * Werte aus der Inszenierung m10-chest-reveal (applyPanelFix) -> nach dem
 * Merge idempotent (dieselben Zahlen, kein visueller Sprung).
 */
export const CHEST_PANEL_BAND_H = 270;
export const CHEST_TITLE_Y = 38;
export const CHEST_TITLE_SCALE = 2;
export const CHEST_SUBTITLE_GAP_PX = 6;
export const CHEST_ICON_Y = 92;
export const CHEST_ICON_SCALE = 2.6;
export const CHEST_ICON_TEX = 16;
/**
 * m10-chest-icon-crisp (menu-art-crisp Befund F2): Das Panel-Icon wurde mit dem
 * Layout-Wert 2.6 fraktional skaliert — Geraetepixel je Texel 5.2 (640x360@2)
 * bzw. 7.8 (780x360@3), Mixelklasse wie title_background F1. Die Anker-Boxen
 * (chestPanelBoxes, tests/chest-panel-ui.test.ts) bleiben beim Layout-Wert
 * CHEST_ICON_SCALE = 2.6; der Draw-Pfad nutzt die naechste ganzzahlige Stufe.
 * Platz geprueft (tests/chest-icon-crisp.test.ts): 3 px unter dem Untertitel,
 * 6 px ueber dem Hint-Band, innerhalb des Panel-Rahmens.
 */
export const CHEST_ICON_DRAW_SCALE = 3;
export const CHEST_HINT_Y = 122;
export const CHEST_HINT_PITCH = 8;
/** m10-chest-hint-wrap: max. Zeichen je Slot-Label-Zeile (Slot 96 px breit). */
export const CHEST_SLOT_LABEL_CHARS = 13;
export const CHEST_FRAME_W = 452;
export const CHEST_FRAME_H = 244;
export const CHEST_FRAME_CY = 140;
/** Abnahmekriterium: Untertitel-Oberkante >= Titel-Unterkante + 4 px. */
export const CHEST_SUBTITLE_MIN_GAP_PX = 4;
export const CHEST_TITLE_TEXT = "TRUHE GEÖFFNET";
export const CHEST_SUBTITLE_TEXT = "BELOHNUNGEN ROLLEN ...";

/** m10-levelup-panel-crisp: Level-Up-Panel-Konstanten (createLevelUpUI). */
export const LEVELUP_PANEL_BAND_H = 270;
export const LEVELUP_TITLE_Y = 36;
export const LEVELUP_TITLE_SCALE = 2;
export const LEVELUP_TITLE_TEXT = "LEVEL UP";
export const LEVELUP_HINT_Y = 66;
export const LEVELUP_HINT_PITCH = 8;
export const LEVELUP_CARD_GAP = 18;
export const LEVELUP_CARD_CY = 158;
export const LEVELUP_CARD_H = 150;
export const LEVELUP_SLOT_CY = 112;
export const LEVELUP_SLOT_SIZE = 60;
export const LEVELUP_ICON_TEX = 16;
export const LEVELUP_ICON_SCALE = 3;
export const LEVELUP_DIVIDER_Y = 148;
export const LEVELUP_NUMBER_Y = 88;
export const LEVELUP_NAME_Y = 154;
export const LEVELUP_LEVEL_Y = 166;
export const LEVELUP_DESC_Y = 180;
export const LEVELUP_DESC_PITCH = 12;
export const LEVELUP_FOOT_TEXT = "1-3, PFEILE + ENTER ODER MAUS";
/** K3: Fokus-Kontrast gewähltes Angebot vs Karten-Hintergrund (WCAG). */
export const LEVELUP_FOCUS_CONTRAST_MIN = 3;

/**
 * m10-levelup-panel-crisp K4: reine Panel-Box-Mathematik des Level-Up-Panels
 * (keine Phaser-Abhaengigkeit), Spiegel von createLevelUpUI. tests/
 * levelup-panel-crisp.test.ts prueft ganzzahlige Skalen, 0 Ueberlappungen
 * (Karten/Titel/Untertitel/Trennlinien) und Panel-Grenzen je View-Profil;
 * die gemessenen Ist-Werte der Szene liegen in
 * ~/games/.evidence/m10-levelup-panel-crisp/ (Probe scripts/m10-levelup-panel.mjs).
 */
export function levelUpPanelBoxes(width: number, height: number): Record<string, AnchorBox> {
  const oy = Math.round((height - LEVELUP_PANEL_BAND_H) / 2);
  const cx = width / 2;
  const gap = LEVELUP_CARD_GAP;
  const cardW = Math.max(120, Math.min(160, Math.floor((width - 32 - 2 * gap) / 3)));
  const frameW = Math.min(width - 24, cardW * 3 + gap * 2 + 28);
  const glyphW = (chars: number, scale = 1) => (chars * GLYPH_ADVANCE - 1) * scale;
  const box = (x: number, y: number, w: number, h: number): AnchorBox =>
    ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  const titleW = glyphW(LEVELUP_TITLE_TEXT.length, LEVELUP_TITLE_SCALE);
  const subChars = "STUFE 99 - WÄHLE EINE BELOHNUNG".length;
  const hintChars = Math.max(20, Math.floor((frameW - 20) / 6));
  const wrapChars = Math.max(16, Math.floor((cardW - 10) / 6));
  const out: Record<string, AnchorBox> = {
    frame: box(cx - frameW / 2, 134 + oy - 110, frameW, 220),
    title: box(cx - Math.floor(glyphW(LEVELUP_TITLE_TEXT.length) / 2) * LEVELUP_TITLE_SCALE,
      LEVELUP_TITLE_Y + oy, titleW, GLYPH_H * LEVELUP_TITLE_SCALE),
    subtitle: box(cx - Math.floor(glyphW(subChars) / 2), 56 + oy, glyphW(subChars), GLYPH_H),
    "hint-0": box(cx - Math.floor(glyphW(hintChars) / 2), LEVELUP_HINT_Y + oy, glyphW(hintChars), GLYPH_H),
    "hint-1": box(cx - Math.floor(glyphW(hintChars) / 2), LEVELUP_HINT_Y + LEVELUP_HINT_PITCH + oy, glyphW(hintChars), GLYPH_H),
    foot: box(cx - Math.floor(glyphW(LEVELUP_FOOT_TEXT.length) / 2), height - 14, glyphW(LEVELUP_FOOT_TEXT.length), GLYPH_H),
  };
  for (let i = 0; i < 3; i++) {
    const cardX = Math.round(cx + (i - 1) * (cardW + gap));
    const textX = cardX - Math.floor(cardW / 2) + 4;
    out[`card-${i}`] = box(cardX - cardW / 2, LEVELUP_CARD_CY + oy - LEVELUP_CARD_H / 2, cardW, LEVELUP_CARD_H);
    out[`slot-${i}`] = box(cardX - LEVELUP_SLOT_SIZE / 2, LEVELUP_SLOT_CY + oy - LEVELUP_SLOT_SIZE / 2, LEVELUP_SLOT_SIZE, LEVELUP_SLOT_SIZE);
    const iconHalf = (LEVELUP_ICON_TEX * LEVELUP_ICON_SCALE) / 2;
    out[`icon-${i}`] = box(cardX - iconHalf, LEVELUP_SLOT_CY + oy - iconHalf, iconHalf * 2, iconHalf * 2);
    // K2-Fix: Trennlinie links an textX geankert (setOrigin 0/0.5), inset 4 px
    // beidseitig in der eigenen Karte — vorher kreuzte sie Kartenrand/Panelrahmen.
    out[`divider-${i}`] = box(textX, LEVELUP_DIVIDER_Y + oy, cardW - 8, 1);
    out[`number-${i}`] = box(textX + 2, LEVELUP_NUMBER_Y + oy, glyphW(1), GLYPH_H);
    out[`name-${i}`] = box(textX, LEVELUP_NAME_Y + oy, glyphW(wrapChars), GLYPH_H);
    out[`level-${i}`] = box(textX, LEVELUP_LEVEL_Y + oy, glyphW("STUFE 10".length), GLYPH_H);
    for (let li = 0; li < 3; li++) {
      out[`desc-${i}-${li}`] = box(textX, LEVELUP_DESC_Y + li * LEVELUP_DESC_PITCH + oy, glyphW(wrapChars), GLYPH_H);
    }
  }
  return out;
}

/**
 * m10-chest-panel-ui: reine Panel-Box-Mathematik des offenen Truhen-Panels
 * (keine Phaser-Abhaengigkeit, in tests/chest-panel-ui.test.ts gegen
 * Ueberlappung/Panel-Grenzen je Viewport-Profil geprueft).
 */
export function chestPanelBoxes(width: number, height: number): Record<string, AnchorBox> {
  const oy = Math.round((height - CHEST_PANEL_BAND_H) / 2);
  const cx = width / 2;
  const frameW = Math.min(CHEST_FRAME_W, width - 24);
  const glyphW = (chars: number, scale: number) => (chars * GLYPH_ADVANCE - 1) * scale;
  const titleW = glyphW(CHEST_TITLE_TEXT.length, CHEST_TITLE_SCALE);
  const subtitleW = glyphW(CHEST_SUBTITLE_TEXT.length, 1);
  const titleTop = CHEST_TITLE_Y + oy;
  const titleH = GLYPH_H * CHEST_TITLE_SCALE;
  const iconHalf = (CHEST_ICON_TEX * CHEST_ICON_SCALE) / 2;
  const hintW = frameW - 20;
  const box = (x: number, y: number, w: number, h: number): AnchorBox =>
    ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  return {
    frame: box(cx - frameW / 2, CHEST_FRAME_CY + oy - CHEST_FRAME_H / 2, frameW, CHEST_FRAME_H),
    title: box(cx - titleW / 2, titleTop, titleW, titleH),
    subtitle: box(cx - subtitleW / 2, titleTop + titleH + CHEST_SUBTITLE_GAP_PX, subtitleW, GLYPH_H),
    icon: box(cx - iconHalf, CHEST_ICON_Y + oy - iconHalf, iconHalf * 2, iconHalf * 2),
    "hint-0": box(cx - hintW / 2, CHEST_HINT_Y + oy, hintW, GLYPH_H),
    "hint-1": box(cx - hintW / 2, CHEST_HINT_Y + CHEST_HINT_PITCH + oy, hintW, GLYPH_H),
  };
}

/** Parallele UI-Szene: HUD, Level-up-Dialog, Pause/Build. */
export class UI extends Phaser.Scene {
  private run!: Run;
  private timerText!: PixelText;
  private levelText!: PixelText;
  private killsText!: PixelText;
  private xpFill!: Phaser.GameObjects.Rectangle;
  private xpBg!: Phaser.GameObjects.Rectangle;
  private hpFill!: Phaser.GameObjects.Rectangle;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private hpLabel!: PixelText;
  /** m10-xp-hud-crisp: Basis-Breiten (Spielpixel) fuer crispFillWidth. */
  private xpBaseW = 0;
  private bossFillBaseW = 0;

  private levelGroup!: Phaser.GameObjects.Container;
  private levelTitle!: PixelText;
  private levelSub!: PixelText;
  private cards: CardView[] = [];
  private selected = 0;
  private autoPickTimer = 0;

  private pauseGroup!: Phaser.GameObjects.Container;
  private pauseLines: Phaser.GameObjects.GameObject[] = [];
  private pauseWeaponHead!: PixelText;
  private pausePassiveHead!: PixelText;
  private pauseButtons: MenuButton[] = [];
  /** m10-gamepad-nav-scenes-r2 K5: Kern-MenuFocus über FORTSETZEN/OPTIONEN/AUFGABE. */
  private pauseFocus!: MenuFocus;
  /** K5: Repeat-Kanäle (menuRepeatTick, wie Kern-K2) + Confirm-Flanke. */
  private pausePadRepeat: Record<"up" | "down" | "left" | "right", MenuRepeatState> = {
    up: { held: false, fires: 0, lastFireMs: -1 },
    down: { held: false, fires: 0, lastFireMs: -1 },
    left: { held: false, fires: 0, lastFireMs: -1 },
    right: { held: false, fires: 0, lastFireMs: -1 },
  };
  private pausePrevConfirmHeld = false;
  private lastPauseShown = false;

  private hudIconBg!: Phaser.GameObjects.Rectangle;
  private hudIcons: Phaser.GameObjects.Image[] = [];
  /** M10: Sichtbarer Evolutionspfad im HUD (max. 2 Zeilen, leer = kein Pfad bereit). */
  private hudEvoHint: PixelText[] = [];
  private levelHint: PixelText[] = [];
  private levelHintChars = 16;
  private chestHint: PixelText[] = [];
  private chestHintChars = 16;

  private chestGroup!: Phaser.GameObjects.Container;
  private chestSprite!: Phaser.GameObjects.Image;
  private chestBeam!: Phaser.GameObjects.Image;
  private chestTitle!: PixelText;
  private chestSlots: { bg: Phaser.GameObjects.Rectangle; slotBg: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; text: PixelText; text2: PixelText; level: PixelText }[] = [];
  private chestHideTimer?: Phaser.Time.TimerEvent;
  private chestSkip?: Phaser.GameObjects.Zone;

  private bossGroup!: Phaser.GameObjects.Container;
  private bossName!: PixelText;
  private bossPhaseText!: PixelText;
  private bossBarBg!: Phaser.GameObjects.Rectangle;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private bossBarShadow!: Phaser.GameObjects.Rectangle;
  private bannerGroup!: Phaser.GameObjects.Container;
  private bannerText!: PixelText;
  private bannerSub!: PixelText;
  private bannerTimer?: Phaser.Time.TimerEvent;

  private options!: OptionsMenu;
  /** M8-input: Gamepad-Flanken für Menü-Navigation. */
  private pad = new InputState();
  private touch?: TouchControls;

  /**
   * M10-ui-text-cost: Dirty-Gates. refreshHud/refreshBoss laufen 60x/s; die
   * meisten Werte aendern sich nicht. Nur bei echter Aenderung wird Text
   * gesetzt bzw. neu berechnet.
   */
  private hudCache = {
    level: "",
    timer: "",
    kills: "",
    xpRatio: NaN,
    hpRatio: NaN,
    hpColor: -1,
    buildSig: "",
    iconKeys: [] as string[],
    hintLines: [] as string[],
  };
  private bossCache = {
    hidden: true,
    name: "",
    phase: "",
    ratio: NaN,
    color: -1,
  };

  constructor() { super("ui"); }

  /** M8: Bei View-Wechsel (Resize/Rotation) wird die UI neu aufgebaut. */
  private viewW = 0;
  private viewH = 0;
  /** m10-hud-safearea: Geraete-Insets in Spielpixeln (0 ohne Notch). */
  private safeInset: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  /** m10-hud-safearea: effektive HUD-Margen (HUD-Konvention + Geraete-Inset). */
  private safeMargin = { left: HUD_MARGIN_X, right: HUD_MARGIN_X, top: HUD_TOP_Y };

  create(): void {
    this.run = this.scene.get("run") as Run;
    this.viewW = GAME_WIDTH;
    this.viewH = GAME_HEIGHT;
    // Nach scene.restart() ist das Overlay neu/unsichtbar; der alte Merker
    // wuerde sonst ein erneutes refreshPause() verhindern (Softlock).
    this.lastPauseShown = false;
    // M10-ui-text-cost: neue GameObjects -> Dirty-Caches zuruecksetzen, sonst
    // bleiben frisch erzeugte Texte/Balken auf ihrem Default (leer/1.0).
    this.hudCache = {
      level: "", timer: "", kills: "", xpRatio: NaN, hpRatio: NaN, hpColor: -1,
      buildSig: "", iconKeys: [], hintLines: [],
    };
    this.bossCache = { hidden: true, name: "", phase: "", ratio: NaN, color: -1 };
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);

    // m10-hud-safearea: Geraete-Insets einmalig pro Aufbau lesen (View-Wechsel
    // baut die Szene neu auf). Nur der Inset-Anteil UEBER dem Canvas wirkt
    // (body-Padding rueckt den Canvas bei Geraeten wie Pixel 7 bereits in die
    // Safe-Area -> dort bitgleich). Canvas-CSS-Breite = Masseinheit; ohne
    // Notch bleiben alle Anker bitgleich zur 640x360-Referenz.
    const canvasRect = this.game.canvas?.getBoundingClientRect();
    const screenW = (typeof window !== "undefined" ? window.innerWidth : 0) || GAME_WIDTH;
    const screenH = (typeof window !== "undefined" ? window.innerHeight : 0) || GAME_HEIGHT;
    this.safeInset = insetsToGamePx(
      GAME_WIDTH,
      canvasRect?.width ?? GAME_WIDTH,
      insetsOverCanvas(readDeviceSafeAreaInsets(), canvasRect, screenW, screenH),
    );
    this.safeMargin = {
      left: hudSideMargin(HUD_MARGIN_X, this.safeInset.left, GAME_WIDTH),
      right: hudSideMargin(HUD_MARGIN_X, this.safeInset.right, GAME_WIDTH),
      top: hudTopMargin(HUD_TOP_Y, this.safeInset.top),
    };
    const m = this.safeMargin;
    const topOff = m.top - HUD_TOP_Y;

    // HUD-Leiste oben (volle aktuelle View-Breite).
    this.add.rectangle(0, topOff, GAME_WIDTH, 12, PAL[C.nightDeep], 0.82).setOrigin(0, 0).setDepth(10);
    // Texte auf y=1 (7 px hoch) und Depth 13: der XP-Balken darf keine
    // Glyphenzeile mehr ueberdecken (sonst wird aus "02:02" optisch "07:07").
    this.levelText = new PixelText(this, m.left, m.top, "LV 1", C.lantern).setDepth(13).setName("hud-level");
    this.timerText = new PixelText(this, GAME_WIDTH / 2, m.top, "00:00", C.candleWhite, "center").setDepth(13).setName("hud-timer");
    this.killsText = new PixelText(this, GAME_WIDTH - m.right, m.top, "KILL 0", C.bone, "right").setDepth(13).setName("hud-kills");
    this.xpBg = this.add.rectangle(m.left, 8 + topOff, GAME_WIDTH - m.left - m.right, 4, PAL[C.ink]).setOrigin(0, 0)
      .setStrokeStyle(1, PAL[C.nightSlate]).setDepth(11).setName("hud-xp-bg");
    // m10-xp-hud-crisp: Fuellung mit 1-px-Basis + ganzzahligem Scale
    // (crispFillWidth in refreshHud) — keine fraktionale Display-Breite mehr.
    this.xpBaseW = GAME_WIDTH - m.left - m.right - 2;
    this.xpFill = this.add.rectangle(m.left + 1, 9 + topOff, 1, 2, PAL[C.amber]).setOrigin(0, 0)
      .setScale(1, 1).setDepth(12).setName("hud-xp-fill");
    // Spieler-HP oben links, fester Rahmen + 4-px-Fuellung (ebenso 1-px-Basis).
    this.hpBg = this.add.rectangle(m.left, 15 + topOff, HUD_HP_W, 9, PAL[C.ink]).setOrigin(0, 0)
      .setStrokeStyle(1, PAL[C.nightSlate]).setDepth(11).setName("hud-hp-bg");
    this.hpLabel = new PixelText(this, 9 + (m.left - HUD_MARGIN_X), 16 + topOff, "HP", C.bone).setDepth(12).setName("hud-hp-label");
    this.hpFill = this.add.rectangle(25 + (m.left - HUD_MARGIN_X), 17 + topOff, 1, 4, PAL[C.crimson]).setOrigin(0, 0)
      .setScale(HUD_HP_FILL_W, 1).setDepth(12).setName("hud-hp-fill");
    this.createHudIcons();
    this.createHudEvoHint();

    this.createLevelUpUI();
    this.createPauseUI();
    this.createChestUI();
    this.createBossUI();
    this.options = new OptionsMenu(this, 125, () => {});
    // M8: Nach einem Resize-Restart die offene Truhe rekonstruieren, sonst
    // bleibt Run.chestOpen ohne UI-Timer fuer immer true (Softlock).
    if (this.run.chestOpen && this.run.chestResult) this.onChestOpen(this.run.chestResult);
    // M8-input: Touch-Overlay liegt über allen Menüs und liefert den Joystick-Vektor
    // an die globale TouchState (vom Run gelesen). Der Pause-Puls wird dort von Run
    // über InputState entgegengenommen.
    this.pad.reset();
    this.touch = new TouchControls(this, { canMove: () => this.canTouchMove() });

    this.input.keyboard!.removeAllListeners("keydown");
    this.input.keyboard!.on("keydown", (ev: KeyboardEvent) => this.onKey(ev));
    this.run.events.on("levelup", this.onLevelUp, this);
    this.run.events.on("levelupClosed", this.onLevelUpClosed, this);
    this.run.events.on("pauseChanged", this.onPauseChanged, this);
    this.run.events.on("chestOpen", this.onChestOpen, this);
    this.run.events.on("chestClosed", this.onChestClosed, this);
    this.run.events.on("bossSpawn", this.onBossBanner, this);
    this.run.events.on("bossDefeated", this.onBossDefeated, this);
    this.run.events.on("bossPhase", this.onBossPhase, this);
    this.run.events.on("dawn", this.onDawn, this);
    this.run.events.on("evolution", this.onEvolution, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onScaleResize, this);
      this.touch?.destroy();
      this.touch = undefined;
      this.pad.reset();
      this.run.events.off("levelup", this.onLevelUp, this);
      this.run.events.off("levelupClosed", this.onLevelUpClosed, this);
      this.run.events.off("pauseChanged", this.onPauseChanged, this);
      this.run.events.off("chestOpen", this.onChestOpen, this);
      this.run.events.off("chestClosed", this.onChestClosed, this);
      this.run.events.off("bossSpawn", this.onBossBanner, this);
      this.run.events.off("bossDefeated", this.onBossDefeated, this);
      this.run.events.off("bossPhase", this.onBossPhase, this);
      this.run.events.off("dawn", this.onDawn, this);
      this.run.events.off("evolution", this.onEvolution, this);
    });
  }

  /** M8: Nach Resize/Rotation die komplette UI neu aufbauen (View ist dann neu gesetzt). */
  private onScaleResize(): void {
    if (this.viewW === GAME_WIDTH && this.viewH === GAME_HEIGHT) return;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.restart();
    });
  }

  private createHudIcons(): void {
    const iconShift = this.safeMargin.left - HUD_MARGIN_X;
    const topOff = this.safeMargin.top - HUD_TOP_Y;
    this.hudIconBg = this.add.rectangle(HUD_ICONS_X + iconShift - 8, 13 + topOff, 4, 19, PAL[C.nightDeep], 0.6)
      .setOrigin(0, 0).setDepth(10).setVisible(false).setName("hud-icons-bg");
    this.hudIcons = [];
    for (let i = 0; i < HUD_MAX_ICONS; i++) {
      const img = this.add.image(HUD_ICONS_X + iconShift + i * HUD_ICON_PITCH, 15 + topOff, "icon_weapon_ember")
        .setOrigin(0, 0).setDepth(11).setVisible(false).setName(`hud-icon-${i}`);
      this.hudIcons.push(img);
    }
  }

  /**
   * M10: HUD-Zeile „EVOLUTION BEREIT“ rechts neben den Icons (ab x=330).
   * Bewusst ohne Grafik-Rahmen, damit keine Hit-/Fokusfläche verändert wird.
   */
  private createHudEvoHint(): void {
    const iconShift = this.safeMargin.left - HUD_MARGIN_X;
    const topOff = this.safeMargin.top - HUD_TOP_Y;
    this.hudEvoHint = [0, 1].map((i) => new PixelText(this, HUD_EVO_HINT_X + iconShift, 15 + topOff + i * 8, "", C.lantern)
      .setDepth(12).setVisible(false).setName(`hud-evo-hint-${i}`));
  }

  private createBossUI(): void {
    // m10-xp-hud-crisp: Geometry aus der reinen, ganzzahligen Ankerfunktion
    // (bossBarGeometry) — Segmente/Caps saessen vorher auf fraktionalen x.
    const g = bossBarGeometry(GAME_WIDTH);
    const cx = GAME_WIDTH / 2;
    const left = g.left;
    this.bossGroup = this.add.container(0, 0).setDepth(90).setVisible(false);
    this.bossBarBg = this.add.rectangle(left, 46, g.barW, 12, PAL[C.ink], 0.95)
      .setOrigin(0, 0.5).setStrokeStyle(1, PAL[C.amber]);
    this.bossFillBaseW = g.fillW;
    this.bossBarFill = this.add.rectangle(g.fillX, 46, 1, 6, PAL[24])
      .setOrigin(0, 0.5).setScale(g.fillW, 1);
    this.bossBarShadow = this.add.rectangle(g.fillX, 48, g.fillW, 2, PAL[23])
      .setOrigin(0, 0.5);
    // Segmente + Endkappen mit 2x2-Amberpunkten (ganzzahlige x-Positionen).
    const segs: Phaser.GameObjects.Rectangle[] = [];
    for (let i = 0; i < g.segXs.length; i++) {
      segs.push(this.add.rectangle(g.segXs[i], 46, 2, 6, PAL[C.ink])
        .setOrigin(0, 0.5));
    }
    for (const sx of g.capXs) {
      // m10-xp-hud-crisp: 5 px breite Kappe mit Origin (0,0.5) am Anker sx-3 —
      // vorher Origin 0.5 -> Kanten bei sx-2.5 (fraktionale Kante, before-JSON).
      segs.push(this.add.rectangle(sx - 3, 46, 5, 14, PAL[C.nightSlate])
        .setOrigin(0, 0.5).setStrokeStyle(1, PAL[C.ink]));
      segs.push(this.add.rectangle(sx + 1, 41, 2, 2, PAL[C.amber]));
      segs.push(this.add.rectangle(sx + 1, 49, 2, 2, PAL[C.amber]));
    }
    this.bossName = new PixelText(this, cx, 33, "", C.amber, "center");
    this.bossPhaseText = new PixelText(this, g.left + g.barW - 6, 33, "", C.candleWhite, "right");
    this.bossGroup.add([this.bossBarBg, this.bossBarShadow, this.bossBarFill, ...segs,
      this.bossName, this.bossPhaseText]);

    // Banner fest unter der HP-Leiste: Position/Größe kommen aus der
    // bossHudRects-Kette (Dom 4b), damit UI-Rect und safeTop-Kette immer
    // dasselbe Rect sehen — kein freier Mittelwert mehr.
    const bannerRect = bossHudRects(GAME_WIDTH).banner;
    this.bannerGroup = this.add.container(0, 0).setDepth(95).setVisible(false).setAlpha(0);
    const bg = this.add.nineslice(cx, bannerRect.y + bannerRect.h / 2, "ui_frame", undefined,
      bannerRect.w, bannerRect.h, 8, 8, 8, 8).setName("hud-banner-bg");
    this.bannerText = new PixelText(this, cx, bannerRect.y + 16, "", C.lantern, "center").setScale(1).setName("hud-banner-title");
    this.bannerSub = new PixelText(this, cx, bannerRect.y + 30, "", C.bone, "center").setName("hud-banner-sub");
    this.bannerGroup.add([bg, this.bannerText, this.bannerSub]);
  }

  private onBossBanner(data: { name?: string; index?: number }): void {
    this.showBanner(
      data.index === 5 ? "DER HOHE KÖNIG" : (data.name ?? "BOSS").toUpperCase(),
      data.index === 5 ? "3 PHASEN - SIEG BEI SEINEM TOD" : "EIN BOSS ERWACHT",
      C.amber,
    );
  }

  private onBossDefeated(data: { name?: string; index?: number }): void {
    this.showBanner(`${(data.name ?? "BOSS").toUpperCase()} BESIEGT`, "EINE TRUHE ERSCHEINT", C.amber);
  }

  private onEvolution(data: { name?: string }): void {
    this.showBanner("EVOLUTION", (data.name ?? "").toUpperCase(), C.lantern);
  }

  private onBossPhase(data: { index: number; phase: number }): void {
    if (data.index !== 5) return;
    this.showBanner(`PHASE ${data.phase}`, data.phase === 3 ? "DER KÖNIG BRENNT" : "NEUE ANGRIFFE", C.amber);
  }

  private onDawn(): void {
    this.showBanner("MORGENDÄMMERUNG", "DU HAST ÜBERLEBT", C.lantern);
  }

  private showBanner(title: string, sub: string, color: number): void {
    this.bannerTimer?.remove(false);
    // Laufenden Fade-Out killen: sonst konkurrieren zwei Alpha-Tweens und das
    // Banner bleibt halbtransparent haengen (Dom 4b: "halbtransparent").
    this.tweens.killTweensOf(this.bannerGroup);
    this.bannerText.setColorIndex(color).setText(title);
    this.bannerSub.setText(sub);
    this.bannerGroup.setVisible(true).setAlpha(0).setY(-6);
    // Kurzer Fade-In (120 ms): das Banner ist nur minimal halbtransparent,
    // damit es nicht als durchsichtiges Panel im Spielfeld wirkt (Dom 4b).
    this.tweens.add({ targets: this.bannerGroup, alpha: 1, y: 0, duration: BANNER_FADE_IN_MS, ease: "Quad.Out" });
    this.bannerTimer = this.time.delayedCall(BANNER_HOLD_MS, () => {
      this.tweens.add({
        targets: this.bannerGroup, alpha: 0, y: -6, duration: BANNER_FADE_OUT_MS,
        onComplete: () => this.bannerGroup.setVisible(false),
      });
    });
  }

  private createLevelUpUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    // Overlays behalten ihre 270er-Proportionen, werden aber mittig in die
    // aktuelle 360er-Hoehe gesetzt (+45 px) und in der Breite zentriert.
    const oy = Math.round((H - 270) / 2);
    const gap = 18;
    const cardW = Math.max(120, Math.min(160, Math.floor((W - 32 - 2 * gap) / 3)));
    const frameW = Math.min(W - 24, cardW * 3 + gap * 2 + 28);
    this.levelGroup = this.add.container(0, 0).setDepth(100).setVisible(false).setName("levelup-group");
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.86).setOrigin(0, 0);
    this.levelGroup.add(dim);
    const frame = this.add.nineslice(cx, 134 + oy, "ui_frame", undefined, frameW, 220, 8, 8, 8, 8).setName("levelup-frame");
    this.levelGroup.add(frame);
    this.levelTitle = new PixelText(this, cx, 36 + oy, "LEVEL UP", C.lantern, "center").setScale(2).setName("levelup-title");
    this.levelSub = new PixelText(this, cx, 56 + oy, "", C.mist, "center").setName("levelup-sub");
    this.levelGroup.add(this.levelTitle);
    this.levelGroup.add(this.levelSub);
    // M10: Evolutionspfad-Zeile zwischen Untertitel und Karten (max. 2 Zeilen).
    this.levelHintChars = Math.max(20, Math.floor((frameW - 20) / 6));
    this.levelHint = [0, 1].map((i) => new PixelText(this, cx, 66 + i * 8 + oy, "", C.lantern, "center")
      .setVisible(false).setName(`levelup-hint-${i}`));
    this.levelGroup.add(this.levelHint);

    this.cards = [];
    for (let i = 0; i < 3; i++) {
      const cardX = Math.round(cx + (i - 1) * (cardW + gap));
      const textX = cardX - Math.floor(cardW / 2) + 4;
      const bg = this.add.rectangle(cardX, 158 + oy, cardW, 150, PAL[C.nightMid]).setStrokeStyle(2, PAL[C.nightSlate])
        .setName(`levelup-card-${i}`);
      bg.setInteractive({ useHandCursor: true });
      bg.on("pointerover", (pointer: Phaser.Input.Pointer) => {
        if (!this.run?.levelUpOpen) return;
        // m10-levelup-panel-crisp K3 (Muster options-touch-focus): ein
        // stillstehender Zeiger waehlt beim Erscheinen des Panels nichts;
        // FokusStart bleibt je Eingabeart Karte 0.
        if (!hoverRowAllowed(pointer, this.levelOpenPointer)) return;
        this.selected = i;
        this.highlight();
      });
      bg.on("pointerdown", () => {
        if (!this.run?.levelUpOpen) return;
        this.selected = i;
        this.highlight();
        this.pick(i);
      });
      const slotBg = this.add.rectangle(cardX, 112 + oy, 60, 60, PAL[C.nightDeep]).setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(cardX, 112 + oy, "icon_weapon_ember").setScale(3).setVisible(false);
      const divider = this.add.rectangle(textX, 148 + oy, cardW - 8, 1, PAL[C.nightSlate]).setOrigin(0, 0.5);
      const number = new PixelText(this, textX + 2, 88 + oy, `${i + 1}`, C.lantern);
      const name = new PixelText(this, textX, 154 + oy, "", C.candleWhite);
      const level = new PixelText(this, textX, 166 + oy, "", C.amber);
      const desc: PixelText[] = [
        new PixelText(this, textX, 180 + oy, "", C.mist),
        new PixelText(this, textX, 192 + oy, "", C.mist),
        new PixelText(this, textX, 204 + oy, "", C.mist),
      ];
      this.levelGroup.add([bg, slotBg, icon, divider, number, name, level, ...desc]);
      this.cards.push({ bg, icon, number, name, level, desc });
    }
    this.levelWrapChars = Math.max(16, Math.floor((cardW - 10) / 6));
    // Hinweis am unteren Rand, nicht auf einer festen 270er-Koordinate.
    const hint = new PixelText(this, cx, H - 14, "1-3, PFEILE + ENTER ODER MAUS", C.fog, "center").setName("levelup-foot");
    this.levelGroup.add(hint);
    this.setLevelCardsEnabled(false);
  }

  /** Zeichen pro Kartenzeile, abhaengig von der aktuellen View-Breite. */
  private levelWrapChars = 21;

  /** Verhindert, dass unsichtbare Level-up-Karten Mausklicks schlucken. */
  private setLevelCardsEnabled(value: boolean): void {
    for (const card of this.cards) {
      if (value) card.bg.setInteractive({ useHandCursor: true });
      else card.bg.disableInteractive();
    }
  }

  /** K3 Hover-Guard: Zeigerposition beim Öffnen des Level-Up-Panels. */
  private levelOpenPointer: { x: number; y: number } | null = null;

  private createPauseUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    const ox = Math.round(cx - 240);
    this.pauseGroup = this.add.container(0, 0).setDepth(120).setVisible(false);
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.8).setOrigin(0, 0);
    this.pauseGroup.add(dim);
    const frame = this.add.nineslice(cx, 135 + oy, "ui_frame", undefined, Math.min(384, W - 24), 232, 8, 8, 8, 8);
    this.pauseGroup.add(frame);
    this.pauseGroup.add(new PixelText(this, cx, 28 + oy, "PAUSE", C.lantern, "center").setScale(2));
    this.pauseGroup.add(new PixelText(this, cx, 46 + oy, "DEIN BUILD", C.bone, "center"));
    this.pauseWeaponHead = new PixelText(this, 84 + ox, 62 + oy, "", C.lantern);
    this.pausePassiveHead = new PixelText(this, 234 + ox, 62 + oy, "", C.lantern);
    this.pauseGroup.add([this.pauseWeaponHead, this.pausePassiveHead]);

    const resume = createMenuButton(this, 108 + ox, 201 + oy, 108, "FORTSETZEN", () => this.run.resumeRun(), { height: 20, depth: 1 });
    const options = createMenuButton(this, cx, 201 + oy, 96, "OPTIONEN", () => this.options.open(), { height: 20, depth: 1 });
    const giveUp = createMenuButton(this, 368 + ox, 201 + oy, 92, "AUFGABE", () => this.run.giveUp(), { height: 20, depth: 1 });
    this.pauseButtons = [resume, options, giveUp];
    // m10-gamepad-nav-scenes-r2 K5: Fokus-Kreis der Kern-API; Startfokus auf
    // FORTSETZEN (Index 0). Fokus sieht wie Hover aus; Hover übernimmt nur den
    // Index (AE=0). Ein Pad-Frame löst maximal EINE Aktion aus (siehe handlePad).
    this.pauseFocus = new MenuFocus(this.pauseButtons);
    this.pauseButtons.forEach((b, i) => {
      const hit = b.container.list[b.container.list.length - 1] as
        Phaser.GameObjects.Zone | undefined;
      hit?.on("pointerover", () => this.pauseFocus.setIndex(i));
    });
    for (const b of this.pauseButtons) {
      b.setEnabled(false);
      this.pauseGroup.add(b.container);
    }
    this.pauseGroup.add(new PixelText(this, cx, 222 + oy, "ESC = WEITER - O = OPTIONEN - Q = AUFGABE", C.mist, "center"));
    this.pauseGroup.add(new PixelText(this, cx, 234 + oy, "PFEILE + ENTER ODER MAUS", C.fog, "center"));
    this.pauseLines = [];
  }

  private activatePauseButton(): void {
    const i = this.pauseFocus?.currentIndex ?? 0;
    if (i === 0) this.run.resumeRun();
    else if (i === 1) this.options.open();
    else this.run.giveUp();
  }

  /** K5: Repeat-/Flanken-Zustand zurücksetzen (beim Pause-Öffnen/Schließen). */
  private resetPausePadRepeat(): void {
    for (const key of ["up", "down", "left", "right"] as const) {
      this.pausePadRepeat[key] = { held: false, fires: 0, lastFireMs: -1 };
    }
    this.pausePrevConfirmHeld = false;
  }

  private createChestUI(): void {
    const W = GAME_WIDTH;
    const H = GAME_HEIGHT;
    const cx = W / 2;
    const oy = Math.round((H - 270) / 2);
    this.chestGroup = this.add.container(0, 0).setDepth(130).setVisible(false).setName("chest-group");
    const dim = this.add.rectangle(0, 0, W, H, PAL[C.ink], 0.9).setOrigin(0, 0);
    this.chestGroup.add(dim);
    const frame = this.add.nineslice(cx, CHEST_FRAME_CY + oy, "ui_frame", undefined, Math.min(CHEST_FRAME_W, W - 24), CHEST_FRAME_H, 8, 8, 8, 8);
    this.chestGroup.add(frame);
    this.chestBeam = this.add.image(cx, 70 + oy, "light_radius")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(PAL[C.lantern])
      .setScale(0.25)
      .setAlpha(0);
    this.chestGroup.add(this.chestBeam);
    // m10-chest-panel-ui: Panel-Layout-Werte wie in der verifizierten Inszenierung
    // m10-chest-reveal (applyPanelFix): Untertitel 58+oy, Icon 92+oy, Evo-Hinweise
    // 122/130+oy. Anker unverändert (Layout-Wert CHEST_ICON_SCALE = 2.6); der
    // Draw-Pfad nutzt die ganzzahlige Stufe CHEST_ICON_DRAW_SCALE (m10-chest-icon-crisp).
    this.chestSprite = this.add.image(cx, CHEST_ICON_Y + oy, "chest_closed").setScale(CHEST_ICON_DRAW_SCALE);
    this.chestGroup.add(this.chestSprite);
    this.chestTitle = new PixelText(this, cx, 38 + oy, "TRUHE GEÖFFNET", C.lantern, "center").setScale(2).setName("chest-title");
    this.chestGroup.add(this.chestTitle);
    // m10-chest-panel-ui: Untertitel aus der Titel-Unterkante ableiten (Glyph-Höhe
    // x Scale + fester Gap >= 4 px) statt Hartwert 54+oy — der saß nur 2 px unter
    // der Titel-Unterkante (shots/m10-chest-panel-before.json). Anker ist die
    // Panel-relative Titel-Position, gilt daher in jedem Viewport unverändert.
    const chestTitleBottom = CHEST_TITLE_Y + oy + GLYPH_H * this.chestTitle.scale;
    this.chestGroup.add(new PixelText(this, cx, chestTitleBottom + CHEST_SUBTITLE_GAP_PX, "BELOHNUNGEN ROLLEN ...", C.mist, "center")
      .setName("chest-subtitle"));
    const chestFrameW = Math.min(452, W - 24);
    this.chestHintChars = Math.max(24, Math.floor((chestFrameW - 20) / 6));
    this.chestHint = [0, 1].map((i) => new PixelText(this, cx, CHEST_HINT_Y + i * CHEST_HINT_PITCH + oy, "", C.lantern, "center")
      .setVisible(false).setName(`chest-hint-${i}`));
    this.chestGroup.add(this.chestHint);
    this.chestSlots = [];
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 86;
      const bg = this.add.rectangle(x, 196 + oy, 96, 92, PAL[C.nightMid])
        .setStrokeStyle(2, PAL[C.nightSlate]);
      const slotBg = this.add.rectangle(x, 176 + oy, 44, 44, PAL[C.nightDeep])
        .setStrokeStyle(2, PAL[C.ink]);
      const icon = this.add.image(x, 176 + oy, "icon_weapon_ember").setScale(2.4).setVisible(false);
      const text = new PixelText(this, x, 202 + oy, "", C.candleWhite, "center");
      const text2 = new PixelText(this, x, 213 + oy, "", C.candleWhite, "center");
      const level = new PixelText(this, x, 224 + oy, "", C.amber, "center");
      this.chestGroup.add([bg, slotBg, icon, text, text2, level]);
      this.chestSlots.push({ bg, slotBg, icon, text, text2, level });
    }
    this.chestGroup.add(new PixelText(this, cx, H - 14, "TIPPE ODER A = ÜBERNEHMEN", C.fog, "center").setName("chest-foot"));
    // M8-input: Truhe per Tippen/Bestaetigen uebernehmen (Belohnungen werden
    // sofort angewendet). Die automatische Sequenz bleibt unveraendert.
    // M10-input-fix: erst bei pointerup uebernehmen. Bei pointerdown haette
    // derselbe Touchstart die Truhe geschlossen, bevor TouchControls ihn als
    // Joystick ablehnt (canTouchMove() waere dann schon true) -> Spieler laeuft.
    const skip = this.add.zone(cx, H / 2, W, H);
    skip.setInteractive();
    skip.disableInteractive();
    skip.on("pointerup", () => {
      if (this.run?.chestOpen) this.run.finishChest();
    });
    this.chestGroup.add(skip);
    this.chestSkip = skip;
  }

  private onChestOpen(result: import("../logic/evolution").ChestResult): void {
    // Ein noch laufender Hide-Timer der vorigen Truhe darf die neue Sequenz nicht ausblenden.
    this.chestHideTimer?.remove(false);
    this.chestHideTimer = undefined;
    this.chestGroup.setVisible(true);
    this.chestSkip?.setInteractive();
    this.chestTitle.setText("TRUHE");
    // M10: Die Truhe erklaert in einem Satz, was evolviert (nur bei Evo-Reward).
    const evoReward = result.rewards[0]?.kind === "evolution" ? result.rewards[0].evolution : undefined;
    const sentence = evoReward
      ? evolutionSentence(evoReward, this.chestHintChars)
      : [];
    this.chestHint.forEach((t, i) => {
      t.setText(sentence[i] ?? "");
      t.setVisible(Boolean(sentence[i]));
    });
    this.chestSprite.setTexture("chest_closed").setScale(CHEST_ICON_DRAW_SCALE).setAlpha(1);
    this.chestBeam.setAlpha(0).setScale(0.25);
    const n = result.rewards.length;
    const cx = GAME_WIDTH / 2;
    const oy = Math.round((GAME_HEIGHT - 270) / 2);
    // m10-chest-panel-ui: Panel-Icon jedes Öffnen auf den verifizierten Anker
    // (CHEST_ICON_Y+oy) zurücksetzen — Sprite-Position/-Skalierung sind Laufzeit-Zustand.
    this.chestSprite.setPosition(cx, CHEST_ICON_Y + oy);
    for (let i = 0; i < this.chestSlots.length; i++) {
      const slot = this.chestSlots[i];
      const reward = result.rewards[i];
      // 5 Karten à 96 px muessen in den 452-px-Rahmen passen (#321: kein Overhang).
      const x = cx + (i - (n - 1) / 2) * 86;
      slot.bg.setPosition(x, 196 + oy).setVisible(Boolean(reward));
      slot.slotBg.setPosition(x, 176 + oy).setVisible(Boolean(reward));
      slot.icon.setPosition(x, 176 + oy).setVisible(Boolean(reward)).setAlpha(1)
        .setTexture(reward ? iconTextureKey(
          reward.kind === "evolution" ? "evolution" : reward.kind,
          reward.id,
        ) : "icon_weapon_ember");
      slot.text.setPosition(x, 202 + oy).setVisible(Boolean(reward)).setAlpha(0).setText("?");
      slot.text2.setPosition(x, 213 + oy).setVisible(false).setAlpha(0).setText("");
      slot.level.setPosition(x, 224 + oy).setVisible(Boolean(reward)).setAlpha(0).setText("");
    }
    // Deckel öffnen + Lichtstrahl.
    this.time.delayedCall(280, () => this.chestSprite.setTexture("chest_open"));
    this.time.delayedCall(360, () => {
      this.tweens.add({ targets: this.chestBeam, alpha: 0.9, scale: 1.15, duration: 520, ease: "Sine.Out" });
    });
    // Münzen-Partikel.
    this.time.delayedCall(420, () => this.spawnChestCoins());
    // Slot-Rollen: zufällige Namen, dann feste Belohnung.
    this.time.delayedCall(520, () => {
      this.chestTitle.setText("TRUHE GEÖFFNET");
      for (let i = 0; i < result.rewards.length; i++) {
        const slot = this.chestSlots[i];
        slot.text.setAlpha(1);
        slot.text2.setVisible(false);
        let tick = 0;
        this.time.addEvent({
          delay: 95,
          repeat: 7,
          callback: () => {
            // Rollnamen wie die ausgerollten Namen vollständig auf 2 Zeilen verteilen
            // (m10-chest-hint-wrap: Umbruch an Wortgrenze bzw. mit Trennstrich).
            const lines = slotLabelLines(pickRollName(result.rewards, tick++).toUpperCase(), CHEST_SLOT_LABEL_CHARS);
            slot.text.setText(lines[0] ?? "").setAlpha(1);
            slot.text2.setText(lines[1] ?? "").setVisible(Boolean(lines[1])).setAlpha(1);
          },
        });
      }
    });
    // Settle nacheinander.
    for (let i = 0; i < result.rewards.length; i++) {
      const reward = result.rewards[i];
      this.time.delayedCall(1450 + i * 220, () => {
        const slot = this.chestSlots[i];
        // m10-chest-hint-wrap: kein mid-word Cut — Wortgrenze oder Trennstrich.
        const lines = slotLabelLines(reward.name.toUpperCase(), CHEST_SLOT_LABEL_CHARS);
        slot.text.setText(lines[0] ?? "");
        slot.text2.setText(lines[1] ?? "").setVisible(Boolean(lines[1])).setAlpha(1);
        slot.level.setText(reward.kind === "evolution" ? "EVOLUTION" : `STUFE ${reward.level}`);
        slot.bg.setStrokeStyle(2, PAL[reward.iconColor] ?? PAL[C.lantern]);
        slot.icon.setAlpha(1);
        slot.text.setAlpha(1);
        slot.text2.setAlpha(1);
        slot.level.setAlpha(1);
      });
    }
    const finishAt = 1650 + result.rewards.length * 220;
    this.time.delayedCall(finishAt, () => {
      this.run.finishChest();
    });
    this.chestHideTimer = this.time.delayedCall(finishAt + 260, () => this.chestGroup.setVisible(false));
  }

  private onChestClosed(): void {
    this.chestHideTimer?.remove(false);
    this.chestHideTimer = undefined;
    this.chestGroup.setVisible(false);
    this.chestSkip?.disableInteractive();
    for (const t of this.chestHint) {
      t.setText("").setVisible(false);
    }
  }

  private spawnChestCoins(): void {
    for (let i = 0; i < 12; i++) {
      const oy = Math.round((GAME_HEIGHT - 270) / 2);
      const cx = GAME_WIDTH / 2;
      const coin = this.add.image(cx, 96 + oy, "fx_coin")
        .setScale(1.4)
        .setBlendMode(Phaser.BlendModes.NORMAL);
      this.chestGroup.add(coin);
      // Deterministisch gestreut (kein Math.random): reproduzierbare GIF-Frames.
      const t = (i * 7) % 12 / 11;
      const angle = -Math.PI / 2 + (t - 0.5) * 2.2;
      const speed = 70 + t * 90;
      const tx = cx + Math.cos(angle) * speed;
      const ty = 96 + oy + Math.sin(angle) * speed;
      this.tweens.add({
        targets: coin,
        x: tx,
        y: ty,
        alpha: 0,
        scale: 0.4,
        duration: 700 + t * 350,
        ease: "Cubic.Out",
        onComplete: () => coin.destroy(),
      });
    }
  }

  update(_time: number, delta: number): void {
    if (!this.run || !this.run.scene.isActive()) return;
    const s = this.run.getHudState();
    this.registry.set("lf-options-open", this.options.visible);
    this.touch?.update();
    this.handlePad(s);
    this.refreshHud(s);
    this.refreshBoss(s.boss);

    if (s.levelUpOpen) {
      if (!this.levelGroup.visible) this.showOffers(s.offers, s.level);
      if (this.run.autoPlay) {
        this.autoPickTimer += delta / 1000;
        if (this.autoPickTimer > 0.35) {
          this.autoPickTimer = 0;
          try { this.run.pickLevelUp(chooseBestOffer(s.offers, { weapons: s.weapons, passives: s.passives, startingWeapon: this.run.character.startWeapon })); } catch { /* Angebot evtl. schon weg */ }
        }
      }
    } else {
      this.autoPickTimer = 0;
      if (this.levelGroup.visible) {
        this.levelGroup.setVisible(false);
        this.setLevelCardsEnabled(false);
      }
    }

    const pauseVisible = s.paused && !s.levelUpOpen && !s.chestOpen;
    // Auch ein sichtbarkeits-Drift (z. B. nach Restart) repariert den Zustand.
    if (pauseVisible !== this.lastPauseShown || pauseVisible !== this.pauseGroup.visible) {
      this.lastPauseShown = pauseVisible;
      this.refreshPause();
      if (!pauseVisible && this.options.visible) this.options.close();
    }
  }

  /** Touch-Overlay nur, wenn eine Bewegung jetzt moeglich ist. */
  private canTouchMove(): boolean {
    if (!this.run || !this.run.scene.isActive()) return false;
    const s = this.run.getHudState();
    return !s.paused && !s.levelUpOpen && !s.chestOpen && !this.options.visible;
  }

  /**
   * M8-input: Gamepad bedient alle Menüs. Start/Pause wird im Run
   * verarbeitet (InputState-Bewegungsframe); hier nur Fokus/Bestaetigen/Zurueck.
   * Fokus entsteht aus dem bestehenden setFocused/selected-Pfad und ist sichtbar.
   */
  private handlePad(s: HudState): void {
    const a: ActionState = this.pad.update({ gamepad: readSceneGamepad(this) }).actions;
    // K5 (Review-Fix Probe): Confirm-Flanke und Repeat-Kanäle werden JEDEN Frame
    // gepflegt — auch wenn ein Overlay (Options) den Frame konsumiert oder keine
    // Aktion gehalten ist. Sonst bleibt die Flanke/der Kanal „sticky“ (belegt:
    // Confirm nach Options-Close tot, Probe pausePrevConfirmHeld=true).
    const confirmEdge = a.confirm === true && !this.pausePrevConfirmHeld;
    this.pausePrevConfirmHeld = a.confirm === true;
    const fire = (dir: "up" | "down" | "left" | "right"): boolean =>
      menuRepeatTick(this.pausePadRepeat[dir], a[dir] === true, performance.now());
    const fired = { up: fire("up"), down: fire("down"), left: fire("left"), right: fire("right") };
    const any = a.up || a.down || a.left || a.right || a.confirm || a.back;
    if (!any) return;
    if (this.options.visible) {
      this.options.handlePad(a);
      return;
    }
    if (s.levelUpOpen) {
      const count = Math.max(1, s.offers.length);
      if (a.left || a.up) {
        this.selected = (this.selected + count - 1) % count;
        this.highlight();
      } else if (a.right || a.down) {
        this.selected = (this.selected + 1) % count;
        this.highlight();
      } else if (a.confirm) {
        if (this.selected < s.offers.length) this.pick(this.selected);
      }
      return;
    }
    if (s.chestOpen) {
      if (a.confirm || a.back) this.run.finishChest();
      return;
    }
    if (s.paused) {
      // K5: ein Pad-Frame = maximal EINE Aktion (Priorität back > up > down >
      // left > right > confirm), Repeat-Debounce über menuRepeatTick wie Kern-K2.
      if (a.back === true) { this.run.resumeRun(); return; }
      if (fired.up) { this.pauseFocus.moveFocus(-1); return; }
      if (fired.down) { this.pauseFocus.moveFocus(1); return; }
      if (fired.left) { this.pauseFocus.moveFocus(-1); return; }
      if (fired.right) { this.pauseFocus.moveFocus(1); return; }
      if (confirmEdge) this.activatePauseButton();
    }
  }

  private refreshBoss(boss: import("./Run").HudState["boss"]): void {
    if (!boss) {
      if (!this.bossCache.hidden) {
        this.bossGroup.setVisible(false);
        this.bossCache.hidden = true;
      }
      return;
    }
    if (this.bossCache.hidden) {
      this.bossGroup.setVisible(true);
      this.bossCache.hidden = false;
    }
    const name = boss.name.toUpperCase();
    if (name !== this.bossCache.name) {
      this.bossName.setText(name);
      this.bossCache.name = name;
    }
    const phase = boss.phase > 1 ? `PHASE ${boss.phase}` : "";
    if (phase !== this.bossCache.phase) {
      this.bossPhaseText.setText(phase);
      this.bossCache.phase = phase;
    }
    const ratio = Math.max(0.001, boss.ratio);
    if (ratio !== this.bossCache.ratio) {
      // m10-xp-hud-crisp: ganzzahlige Fuellbreite (1-px-Basis + Scale).
      this.bossBarFill.setScale(crispFillWidth(this.bossFillBaseW, ratio), 1);
      this.bossCache.ratio = ratio;
    }
    const color = boss.color;
    if (color !== this.bossCache.color) {
      this.bossBarFill.setFillStyle(PAL[color] ?? PAL[C.crimson]);
      this.bossCache.color = color;
    }
  }

  private refreshHud(s: HudState): void {
    const level = `LV ${s.level}`;
    if (level !== this.hudCache.level) {
      this.levelText.setText(level);
      this.hudCache.level = level;
    }
    const total = Math.max(0, Math.floor(s.time));
    const timer = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    if (timer !== this.hudCache.timer) {
      this.timerText.setText(timer);
      this.hudCache.timer = timer;
    }
    const kills = `KILL ${s.kills}`;
    if (kills !== this.hudCache.kills) {
      this.killsText.setText(kills);
      this.hudCache.kills = kills;
    }
    const xpRatio = Math.max(0.001, s.xpRatio);
    if (xpRatio !== this.hudCache.xpRatio) {
      // m10-xp-hud-crisp: ganzzahlige Fuellbreite statt fraktionaler Scale
      // (before: displayW 235.5/341.333/209.333 -> fraktionale Kante).
      this.xpFill.setScale(crispFillWidth(this.xpBaseW, xpRatio), 1);
      this.hudCache.xpRatio = xpRatio;
    }
    const hpRatio = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp)));
    const hpColor = hpRatio < 0.3 ? C.hotRed : hpRatio < 0.6 ? C.amber : C.crimson;
    if (hpRatio !== this.hudCache.hpRatio) {
      this.hpFill.setScale(crispFillWidth(HUD_HP_FILL_W, hpRatio), 1);
      this.hudCache.hpRatio = hpRatio;
    }
    if (hpColor !== this.hudCache.hpColor) {
      this.hpFill.setFillStyle(PAL[hpColor]);
      this.hudCache.hpColor = hpColor;
    }

    // Icons und Evolutionspfad haengen nur an Waffen/Powerups (ID + Stufe).
    // Signatur statt evolutionReadyList jeden Frame neu auszuwerten.
    const buildSig = s.weapons.map((w) => `${w.id}:${w.level}`).join(",")
      + "|" + s.passives.map((p) => `${p.id}:${p.level}`).join(",");
    if (buildSig !== this.hudCache.buildSig) {
      this.hudCache.buildSig = buildSig;
      const keys = [
        ...s.weapons.map((w) => iconTextureKey(isEvolutionWeapon(w.id) ? "evolution" : "weapon", w.id)),
        ...s.passives.map((p) => iconTextureKey("passive", p.id)),
      ].slice(0, this.hudIcons.length);
      this.hudCache.iconKeys = keys;
      this.hudIcons.forEach((img, i) => {
        const key = keys[i];
        if (!key) { img.setVisible(false); return; }
        if (img.texture.key !== key) img.setTexture(key);
        img.setVisible(true);
      });
      const width = keys.length === 0 ? 0 : 8 + keys.length * HUD_ICON_PITCH;
      this.hudIconBg.setSize(width, 19).setVisible(keys.length > 0);

      // M10: Evolutionspfad im HUD sichtbar machen (max. 2 Zeilen).
      const ready = evolutionReadyList(s.weapons, s.passives);
      const hintLines = ready.length === 0 ? [] : hudEvolutionHint(ready);
      this.hudCache.hintLines = hintLines;
      this.hudEvoHint.forEach((t, i) => {
        t.setText(hintLines[i] ?? "");
        t.setVisible(Boolean(hintLines[i]));
      });
    }
  }

  private onPauseChanged(): void {
    this.pauseFocus?.setIndex(0);
    this.resetPausePadRepeat();
    this.refreshPause();
  }

  private onLevelUp(data: { offers: Offer[]; level: number }): void {
    this.selected = 0;
    this.autoPickTimer = 0;
    this.showOffers(data.offers, data.level);
  }

  private onLevelUpClosed(): void {
    this.levelGroup.setVisible(false);
    this.setLevelCardsEnabled(false);
    this.selected = 0;
    this.levelOpenPointer = null;
  }

  private showOffers(offers: Offer[], level: number): void {
    if (offers.length === 0) {
      this.levelGroup.setVisible(false);
      return;
    }
    this.levelSub.setText(`STUFE ${level} - WÄHLE EINE BELOHNUNG`);
    const s = this.run.getHudState();
    const ready = evolutionReadyList(s.weapons, s.passives);
    const hintLines = ready.length === 0 ? [] : levelUpEvolutionHint(ready, this.levelHintChars);
    this.levelHint.forEach((t, i) => {
      t.setText(hintLines[i] ?? "");
      t.setVisible(Boolean(hintLines[i]));
    });
    this.selected = Math.min(this.selected, offers.length - 1);
    offers.forEach((offer, i) => {
      const card = this.cards[i];
      if (!card) return;
      card.bg.setVisible(true);
      card.icon.setVisible(true).setTexture(iconKeyForOffer(offer.kind, offer.id));
      card.number.setVisible(true);
      card.number.setText(`${i + 1}`);
      card.name.setVisible(true).setText(offer.name.toUpperCase());
      card.level.setVisible(true).setText(`${offer.isNew ? "NEU" : "STUFE"} ${offer.level}`);
      const lines = wrapText(offer.description, this.levelWrapChars);
      card.desc.forEach((t, li) => {
        t.setText(lines[li] ?? "");
        t.setVisible(Boolean(lines[li]));
      });
    });
    for (let i = offers.length; i < 3; i++) {
      const card = this.cards[i];
      card.bg.setVisible(false);
      card.icon.setVisible(false);
      card.number.setVisible(false);
      card.name.setVisible(false);
      card.level.setVisible(false);
      card.desc.forEach((t) => t.setVisible(false));
    }
    this.highlight();
    // K3: Zeigerposition beim Öffnen merken — stillstehender Zeiger darf beim
    // Erscheinen des Panels keine Karte anwählen (Muster options-touch-focus).
    const p = this.input.activePointer;
    this.levelOpenPointer = { x: p.x, y: p.y };
    this.levelGroup.setVisible(true);
    this.setLevelCardsEnabled(true);
  }

  private highlight(): void {
    this.cards.forEach((card, i) => {
      card.bg.setStrokeStyle(i === this.selected ? 2 : 1, i === this.selected ? PAL[C.lantern] : PAL[C.nightSlate]);
    });
  }

  private onKey(ev: KeyboardEvent): void {
    if (!this.run || ev.repeat) return;
    const key = ev.key.toLowerCase();
    if (this.options?.visible) {
      this.options.handleKey(ev);
      return;
    }
    if (ev.key === "Escape") { this.run.togglePause(); return; }
    if (key === "o" && this.run.getHudState().paused && !this.run.levelUpOpen && !this.run.chestOpen) {
      this.options.open();
      return;
    }
    const hud = this.run.getHudState();
    if (hud.paused && !hud.levelUpOpen && !hud.chestOpen) {
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp" || key === "a" || key === "w") {
        this.pauseFocus?.moveFocus(-1);
        return;
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown" || key === "d" || key === "s") {
        this.pauseFocus?.moveFocus(1);
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") { this.activatePauseButton(); return; }
      if (key === "q") { this.run.giveUp(); return; }
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
        this.pauseFocus.setIndex(Number(ev.key) - 1);
        return;
      }
    }
    if (this.run.levelUpOpen) {
      const offers = this.run.currentOffers;
      if (ev.key === "1" || ev.key === "2" || ev.key === "3") {
        const idx = Number(ev.key) - 1;
        if (idx < offers.length) this.pick(idx);
        return;
      }
      if (ev.key === "ArrowLeft" || ev.key === "ArrowUp" || ev.key === "a" || ev.key === "w") {
        this.selected = (this.selected + offers.length - 1) % offers.length;
        this.highlight();
        return;
      }
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown" || ev.key === "d" || ev.key === "s") {
        this.selected = (this.selected + 1) % offers.length;
        this.highlight();
        return;
      }
      if (ev.key === "Enter" || ev.key === " ") {
        this.pick(this.selected);
        return;
      }
    }
  }

  private pick(index: number): void {
    try {
      this.run.pickLevelUp(index);
    } catch (err) {
      console.warn("[Lanternfall] pickLevelUp:", err);
    }
  }

  private refreshPause(): void {
    const s = this.run.getHudState();
    const ox = Math.round(GAME_WIDTH / 2 - 240);
    const visible = s.paused && !s.levelUpOpen && !s.chestOpen;
    this.pauseGroup.setVisible(visible);
    this.lastPauseShown = visible;
    for (const b of this.pauseButtons) b.setEnabled(visible);
    if (!visible) return;
    for (const line of this.pauseLines) line.destroy();
    this.pauseLines = [];
    const addRow = (
      name: string, level: number, color: number,
      x: number, levelRight: number, iconKey: string,
    ): void => {
      const icon = this.add.image(x + ox - 20, y - 4, iconKey).setOrigin(0, 0).setScale(1);
      const left = new PixelText(this, x + ox, y, name, color);
      // Feste rechte Spalte, damit alle "LV n" bündig stehen.
      const right = new PixelText(this, levelRight + ox, y, `LV ${level}`, color, "right");
      this.pauseGroup.add([icon, left, right]);
      this.pauseLines.push(icon, left, right);
    };
    const oy = Math.round((GAME_HEIGHT - 270) / 2);
    let y = 76 + oy;
    for (const w of s.weapons) {
      const def = weaponDef(w.id);
      addRow(def?.name.toUpperCase() ?? w.id.toUpperCase(), w.level, C.bone, 84, 212,
        iconTextureKey(isEvolutionWeapon(w.id) ? "evolution" : "weapon", w.id));
      y += 15;
    }
    y = 76 + oy;
    for (const p of s.passives) {
      const def = PASSIVES[p.id as keyof typeof PASSIVES];
      addRow(def?.name.toUpperCase() ?? p.id.toUpperCase(), p.level, C.mist, 234, 386,
        iconTextureKey("passive", p.id));
      y += 15;
    }
    this.pauseWeaponHead.setText(`WAFFEN ${s.weapons.length}/6`);
    this.pausePassiveHead.setText(`POWERUPS ${s.passives.length}/6`);
  }
}

function pickRollName(rewards: { name: string }[], tick = 0): string {
  return rewards[tick % Math.max(1, rewards.length)]?.name ?? "???";
}

/** M10: HUD-Zeile(n) fuer bereite Evolutionen (max. 2 Zeilen). */
function hudEvolutionHint(ready: EvolutionDef[]): string[] {
  if (ready.length === 1) return ["EVOLUTION BEREIT", ready[0].name.toUpperCase()];
  return [`EVOLUTION BEREIT (${ready.length})`, `U.A. ${ready[0].name.toUpperCase()}`];
}

/** M10: Panel-Zeile(n) fuer bereite Evolutionen, verlustfrei auf max. 2 Zeilen. */
function levelUpEvolutionHint(ready: EvolutionDef[], maxChars: number): string[] {
  if (ready.length === 1) {
    return slotNameLines(`EVOLUTION BEREIT: ${ready[0].name.toUpperCase()}`, maxChars);
  }
  return [`EVOLUTION BEREIT (${ready.length})`, `U.A. ${ready[0].name.toUpperCase()}`];
}

/** M10: Ein Satz, was evolviert: Basis + Powerup werden zur Evolution. */
function evolutionSentence(evo: EvolutionDef, maxChars: number): string[] {
  const sentence = `AUS ${evo.description.toUpperCase()} WIRD ${evo.name.toUpperCase()}.`;
  // m10-chest-hint-wrap: verlustfrei an Wortgrenzen auf beide Hint-Zeilen
  // verteilt (beide Zeilen sichtbar, kein Satz-Abbruch via slice).
  return wrapHintLines(sentence, maxChars);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}
