/**
 * Laufzeit-Optionen (einmal beim Start geladen, im Speicher gehalten).
 * UI/Debug ändern sie; Änderungen werden sofort persistiert und an
 * interessierte Laufzeit-Hooks (z. B. CSS-Skalierung) gemeldet.
 */
import { DEFAULT_OPTIONS, clampScale, clampVolume, loadOptions, saveOptions, setOption, type Options, type StorageLike } from "./options";
import { clampFpsSetting } from "../logic/fps-cap";

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Normalisiert ein Options-Objekt pro Feld gegen die Defaults (gleiche
 * Semantik wie loadOptions): fehlende/nicht-numerische Zahlen fallen auf den
 * Feld-Default, out-of-range wird geclamped, korrupte Booleans auf Default.
 * Damit kann ein ungepruefter setSettings()-Aufruf (NaN, partial Payload,
 * falsche Typen) den Speicher-Cache nicht vergiften — Konsumenten
 * (AudioSystem, View-Skalierung) sehen immer ein komplettes validiertes
 * Options-Objekt, und Speicher- und Persistenzstand bleiben identisch.
 */
function normalizeOptions(next: Partial<Options>): Options {
  const num = (v: unknown, fallback: number): number => {
    if (v === null || v === undefined) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;
  return {
    music: clampVolume(num(next.music, DEFAULT_OPTIONS.music)),
    sfx: clampVolume(num(next.sfx, DEFAULT_OPTIONS.sfx)),
    shake: bool(next.shake, DEFAULT_OPTIONS.shake),
    damageNumbers: bool(next.damageNumbers, DEFAULT_OPTIONS.damageNumbers),
    muted: bool(next.muted, DEFAULT_OPTIONS.muted),
    scale: clampScale(num(next.scale, DEFAULT_OPTIONS.scale)),
    fps: clampFpsSetting(next.fps),
  };
}

export type SettingsListener = (options: Options) => void;

let current: Options = loadOptions(storage());
const listeners = new Set<SettingsListener>();

/** Abonniert Optionsänderungen (Rückgabe: Abmelden). */
export function onSettingsChanged(fn: SettingsListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(next: Options): void {
  for (const fn of listeners) {
    try { fn(next); } catch { /* ein kaputter Listener darf die UI nicht stoppen */ }
  }
}

export function getSettings(): Options {
  return { ...current };
}

export function setSettings(next: Options): Options {
  current = normalizeOptions(next);
  saveOptions(storage(), current);
  emit(getSettings());
  return getSettings();
}

export function changeSetting(key: keyof Options, value: number | boolean): Options {
  // Gate: unbekannte Schluessel (Tippfehler in Debug-/Test-Aufrufen) werden
  // verworfen, statt via setOption-else-Zweig ein Junk-Feld anzufuegen.
  if (!(key in DEFAULT_OPTIONS)) return getSettings();
  return setSettings(setOption(current, key, value));
}

export function resetSettings(): Options {
  return setSettings({ ...DEFAULT_OPTIONS });
}
