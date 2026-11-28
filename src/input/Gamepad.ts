import type Phaser from "phaser";
import type { GamepadSnapshot } from "./InputState";

/** Minimaler Ausschnitt eines Gamepad-Objekts (Phaser-Plugin oder Browser-API). */
interface PadLike {
  axes?: ArrayLike<number>;
  buttons?: ArrayLike<{ pressed?: boolean; value?: number } | null>;
}

/**
 * Wandelt ein Gamepad (Phaser `Phaser.Input.Gamepad.Gamepad` oder das native
 * `Gamepad` aus `navigator.getGamepads()`) in den reinen, testbaren Snapshot
 * der Eingabeschicht um. Defensiv: fehlende/kurze Achsen/Buttons werden zu 0.
 */
export function snapshotFromPad(pad: PadLike | null | undefined): GamepadSnapshot | null {
  if (!pad) return null;
  const axes: number[] = [];
  const buttons: boolean[] = [];
  const rawAxes = pad.axes ?? [];
  for (let i = 0; i < Math.max(2, rawAxes.length); i++) {
    const value = rawAxes[i];
    axes.push(typeof value === "number" && Number.isFinite(value) ? value : 0);
  }
  const rawButtons = pad.buttons ?? [];
  for (let i = 0; i < rawButtons.length; i++) {
    const button = rawButtons[i];
    buttons.push(Boolean(button && (button.pressed || (button.value ?? 0) >= 0.5)));
  }
  return { axes, buttons };
}

/** Erstes verbundenes Pad aus der Browser-API (Fallback für Hotplug/Mocks). */
export function readNavigatorGamepad(): GamepadSnapshot | null {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return null;
  try {
    const pads = navigator.getGamepads();
    if (!pads) return null;
    for (const pad of pads) {
      if (pad && pad.connected !== false) {
        const snap = snapshotFromPad(pad as PadLike);
        return snap ? applyStickFeel(snap) : null;
      }
    }
  } catch {
    // Manche Browser werfen ohne Nutzergeste / ohne sicheren Kontext.
  }
  return null;
}

/**
 * M10-gamepad-stick-feel (K2): wirksame Stick-Deadzone mit Hysterese +
 * 8-Richtungs-Snapping. Android-TV-Pads driften und rauschen im Stillstand
 * (Beleg shots-Baseline, K1: Fehlbewegungs-Quote 33,67 %) und dithern an der
 * Totzonen-Kante sowie an 45°-Sektorgrenzen. Der Filter sitzt im Adapter
 * (read*-Pfad), damit alle Szenen bereinigte Achsen sehen und die Deadzone-
 * Remap in `InputState` unverändert auf stabilen Werten arbeitet:
 *
 * - Engage erst oberhalb STICK_ENGAGE_DEADZONE (radial, 28 %),
 * - Freigabe erst unterhalb STICK_RELEASE_DEADZONE (18 %) — im Band bleibt
 *   der Stick engaged (kein Ein/Aus-Zittern an der Kante),
 * - engaged: Ausgabe ist der auf den Sektor-Mittelpunkt gerasterte
 *   EINHEITSVEKTOR (Sektorbreite 45°, Hysterese-Marge 5,625°) — derselbe
 *   Wert, den das D-Pad via normalizeVector liefert (Diagonale √2/2),
 *   damit Stick und D-Pad konsistente Einheitsvektoren geben,
 * - nicht engaged: exakt (0, 0) — kein Drift/Rauschen im Stillstand.
 */
export const STICK_ENGAGE_DEADZONE = 0.28;
export const STICK_RELEASE_DEADZONE = 0.18;
/** Sektor-Hysterese-Marge: 5,625° (ein Achtel der 45°-Sektorbreite). */
export const STICK_SECTOR_MARGIN = Math.PI / 32;
/** 8 Richtungen (Sektorbreite 45°), Sektormittelpunkte bei k*45°. */
export const STICK_SECTORS = 8;

/** Hysterese-Gedächtnis des Stick-Filters. */
export interface StickFeelState {
  engaged: boolean;
  /** Aktueller Sektor 0..7, oder -1 wenn nicht engaged. */
  sector: number;
}

/** Neuer, neutrale Filterzustand. */
export function freshStickFeelState(): StickFeelState {
  return { engaged: false, sector: -1 };
}

/** Sektor-Index (0..7) des Rohwinkels; (0,0) -> -1. */
export function stickSectorIndex(x: number, y: number): number {
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len <= 1e-9) return -1;
  let a = Math.atan2(y, x);
  if (a < 0) a += Math.PI * 2;
  return Math.round(a / (Math.PI / 4)) % STICK_SECTORS;
}

/**
 * Sektor mit Hysterese: an der Sektorgrenze bleibt der bisherige Sektor
 * stehen, bis der Rohwinkel mehr als 22,5° + STICK_SECTOR_MARGIN vom
 * bisherigen Mittelpunkt entfernt ist (kein Flackern zwischen Nachbarn).
 */
export function stickSectorWithHysteresis(
  x: number,
  y: number,
  previous: number,
): number {
  const raw = stickSectorIndex(x, y);
  if (raw === -1) return -1;
  if (previous < 0) return raw;
  const center = (previous * Math.PI) / 4;
  let a = Math.atan2(y, x);
  if (a < 0) a += Math.PI * 2;
  let diff = a - center;
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  const halfWidth = Math.PI / 8 + STICK_SECTOR_MARGIN;
  if (Math.abs(diff) <= halfWidth) return previous;
  return raw;
}

/**
 * Reiner Kern des Filters: ein Roh-Achsenpaar + Zustand -> bereinigte
 * Einheitsvektor-Achsen (oder exakt 0) + Folgezustand.
 */
export function cleanStickSample(
  ax: number,
  ay: number,
  state: StickFeelState,
): { x: number; y: number; state: StickFeelState } {
  const x = typeof ax === "number" && Number.isFinite(ax) ? ax : 0;
  const y = typeof ay === "number" && Number.isFinite(ay) ? ay : 0;
  const len = Math.hypot(x, y);

  if (!state.engaged) {
    if (!Number.isFinite(len) || len < STICK_ENGAGE_DEADZONE) {
      return { x: 0, y: 0, state: { engaged: false, sector: -1 } };
    }
    const sector = stickSectorIndex(x, y);
    return { x: Math.cos(sector * Math.PI / 4), y: Math.sin(sector * Math.PI / 4), state: { engaged: true, sector } };
  }
  if (len < STICK_RELEASE_DEADZONE) {
    return { x: 0, y: 0, state: { engaged: false, sector: -1 } };
  }
  const sector = stickSectorWithHysteresis(x, y, state.sector);
  return { x: Math.cos(sector * Math.PI / 4), y: Math.sin(sector * Math.PI / 4), state: { engaged: true, sector } };
}

/** Modulzustand der Read-Pfade (ein Pad, Hysterese über Frames hinweg). */
const stickFeel: StickFeelState = freshStickFeelState();

/** Filterzustand zurücksetzen (Pad-Hotplug, Tests). */
export function resetStickFeel(): void {
  stickFeel.engaged = false;
  stickFeel.sector = -1;
}

/** Wendet den Stick-Filter auf eine Kopie des Snapshots an (nur Achsen 0/1). */
function applyStickFeel(snap: GamepadSnapshot): GamepadSnapshot {
  const cleaned = cleanStickSample(snap.axes[0], snap.axes[1], stickFeel);
  stickFeel.engaged = cleaned.state.engaged;
  stickFeel.sector = cleaned.state.sector;
  const axes = snap.axes.slice();
  axes[0] = cleaned.x;
  axes[1] = cleaned.y;
  return { axes, buttons: snap.buttons.slice() };
}

/**
 * Liest das erste Pad aus dem Phaser-Gamepad-Plugin (in `main.ts` aktiviert).
 * Das Plugin kennt Hotplug; wenn es (noch) kein Pad gemeldet hat (z. B. in
 * Tests mit gemocktem `navigator.getGamepads()`), fällt der Adapter auf die
 * Browser-API zurück. Beide Pfade liefern denselben Snapshot-Typ —
 * Stick-Achsen 0/1 sind dabei über den Stick-Feel-Filter bereinigt
 * (Deadzone-Hysterese + 8-Richtungs-Snapping, siehe oben).
 */
export function readSceneGamepad(scene: Phaser.Scene): GamepadSnapshot | null {
  // Die Browser-API liefert den frischesten Stand (auch bei Hotplug und in
  // Tests mit gemocktem navigator.getGamepads()). Das Phaser-Plugin bleibt als
  // Fallback aktiv, falls die API (z. B. in eingebetteten WebViews) fehlt.
  const native = readNavigatorGamepad();
  if (native) return native;
  try {
    const plugin = scene.input.gamepad as unknown as {
      pad1?: PadLike | null;
      pad2?: PadLike | null;
      pad3?: PadLike | null;
      pad4?: PadLike | null;
    } | null;
    if (plugin) {
      const pad = plugin.pad1 ?? plugin.pad2 ?? plugin.pad3 ?? plugin.pad4;
      const snap = snapshotFromPad(pad);
      return snap ? applyStickFeel(snap) : null;
    }
  } catch {
    // Plugin evtl. noch nicht bereit (Boot/Scene-Wechsel).
  }
  return null;
}
