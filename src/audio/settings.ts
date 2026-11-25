/**
 * Laufzeit-Optionen (einmal beim Start geladen, im Speicher gehalten).
 * UI/Debug ändern sie; Änderungen werden sofort persistiert.
 */
import { DEFAULT_OPTIONS, loadOptions, saveOptions, setOption, type Options, type StorageLike } from "./options";

function storage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

let current: Options = loadOptions(storage());

export function getSettings(): Options {
  return { ...current };
}

export function setSettings(next: Options): Options {
  current = next;
  saveOptions(storage(), current);
  return getSettings();
}

export function changeSetting(key: keyof Options, value: number | boolean): Options {
  return setSettings(setOption(current, key, value));
}

export function resetSettings(): Options {
  return setSettings({ ...DEFAULT_OPTIONS });
}
