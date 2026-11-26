/**
 * Laufzeit-Optionen (einmal beim Start geladen, im Speicher gehalten).
 * UI/Debug ändern sie; Änderungen werden sofort persistiert und an
 * interessierte Laufzeit-Hooks (z. B. CSS-Skalierung) gemeldet.
 */
import { DEFAULT_OPTIONS, loadOptions, saveOptions, setOption, type Options, type StorageLike } from "./options";

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
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
  current = next;
  saveOptions(storage(), current);
  emit(getSettings());
  return getSettings();
}

export function changeSetting(key: keyof Options, value: number | boolean): Options {
  return setSettings(setOption(current, key, value));
}

export function resetSettings(): Options {
  return setSettings({ ...DEFAULT_OPTIONS });
}
