/**
 * Optionen (Musik/SFX/Shake) mit localStorage-Persistenz. Reine Helfer mit
 * injizierbarem Storage, damit Vitest ohne Browser testen kann.
 */
export interface Options {
  music: number; // 0..1
  sfx: number;   // 0..1
  shake: boolean;
}

export const DEFAULT_OPTIONS: Options = { music: 0.55, sfx: 0.8, shake: true };
export const OPTIONS_KEY = "lanternfall-options-v1";

/** Minimaler Storage-Vertrag (window.localStorage erfüllt ihn). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Lädt Optionen; fehlende/kaputte Daten → Defaults (kein Crash). */
export function loadOptions(storage: StorageLike | null | undefined): Options {
  if (!storage) return { ...DEFAULT_OPTIONS };
  try {
    const raw = storage.getItem(OPTIONS_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<Options>;
    return {
      music: clampVolume(Number(parsed.music ?? DEFAULT_OPTIONS.music)),
      sfx: clampVolume(Number(parsed.sfx ?? DEFAULT_OPTIONS.sfx)),
      shake: typeof parsed.shake === "boolean" ? parsed.shake : DEFAULT_OPTIONS.shake,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

export function saveOptions(storage: StorageLike | null | undefined, options: Options): void {
  if (!storage) return;
  try {
    storage.setItem(OPTIONS_KEY, JSON.stringify({
      music: clampVolume(options.music),
      sfx: clampVolume(options.sfx),
      shake: Boolean(options.shake),
    }));
  } catch { /* Quota/Privacy-Mode: still ignorieren */ }
}

/** Setzt einen Wert validiert; gibt die neuen Optionen zurück (mutiert nicht). */
export function setOption(options: Options, key: keyof Options, value: number | boolean): Options {
  const next = { ...options };
  if (key === "shake") next.shake = Boolean(value);
  else next[key] = clampVolume(Number(value));
  return next;
}

/** Schrittweite für Tastatur-Steuerung. */
export const OPTION_STEP = 0.1;
