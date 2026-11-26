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
      if (pad && pad.connected !== false) return snapshotFromPad(pad as PadLike);
    }
  } catch {
    // Manche Browser werfen ohne Nutzergeste / ohne sicheren Kontext.
  }
  return null;
}

/**
 * Liest das erste Pad aus dem Phaser-Gamepad-Plugin (in `main.ts` aktiviert).
 * Das Plugin kennt Hotplug; wenn es (noch) kein Pad gemeldet hat (z. B. in
 * Tests mit gemocktem `navigator.getGamepads()`), fällt der Adapter auf die
 * Browser-API zurück. Beide Pfade liefern denselben Snapshot-Typ.
 */
export function readSceneGamepad(scene: Phaser.Scene): GamepadSnapshot | null {
  try {
    const plugin = scene.input.gamepad as unknown as {
      pad1?: PadLike | null;
      pad2?: PadLike | null;
      pad3?: PadLike | null;
      pad4?: PadLike | null;
    } | null;
    if (plugin) {
      const pad = plugin.pad1 ?? plugin.pad2 ?? plugin.pad3 ?? plugin.pad4;
      const snapshot = snapshotFromPad(pad);
      if (snapshot) return snapshot;
    }
  } catch {
    // Plugin evtl. noch nicht bereit (Boot/Scene-Wechsel).
  }
  return readNavigatorGamepad();
}
