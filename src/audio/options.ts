/**
 * Optionen (Musik/SFX/Shake, Damage-Numbers, Skalierung) mit
 * localStorage-Persistenz. Reine Helfer mit injizierbarem Storage, damit
 * Vitest ohne Browser testen kann.
 */
export interface Options {
  music: number;        // 0..1
  sfx: number;          // 0..1
  shake: boolean;
  damageNumbers: boolean;
  /** Alle Audio-Ausgaben stumm (Master-Mute, Vorrang vor Musik/SFX). */
  muted: boolean;
  /** 0 = automatisch (größtes ganzzahliges Vielfaches), 1..3 = fest. */
  scale: number;
}

export const DEFAULT_OPTIONS: Options = {
  music: 0.55,
  sfx: 0.8,
  shake: true,
  damageNumbers: true,
  muted: false,
  scale: 0,
};
export const OPTIONS_KEY = "lanternfall-options-v1";
export const SCALE_MAX = 3;

/** Minimaler Storage-Vertrag (window.localStorage erfüllt ihn). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/** Skalierung: 0 = Auto, sonst ganzzahlig 1..SCALE_MAX. */
export function clampScale(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(SCALE_MAX, Math.round(v)));
}

/**
 * Effektives ganzzahliges CSS-Vielfaches. Auto wählt das größte Vielfache,
 * das vollständig in den Viewport passt (mindestens 1).
 */
export function resolveScale(
  setting: number,
  viewportW: number,
  viewportH: number,
  gameW: number,
  gameH: number,
): number {
  const fixed = clampScale(setting);
  const fit = Math.max(1, Math.floor(Math.min(viewportW / gameW, viewportH / gameH)));
  if (fixed > 0) return Math.min(fixed, Math.max(1, fit));
  return fit;
}

export function scaleLabel(setting: number): string {
  const n = clampScale(setting);
  return n === 0 ? "AUTO" : `${n}X`;
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
      damageNumbers: typeof parsed.damageNumbers === "boolean"
        ? parsed.damageNumbers
        : DEFAULT_OPTIONS.damageNumbers,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_OPTIONS.muted,
      scale: clampScale(Number(parsed.scale ?? DEFAULT_OPTIONS.scale)),
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
      damageNumbers: Boolean(options.damageNumbers),
      muted: Boolean(options.muted),
      scale: clampScale(options.scale),
    }));
  } catch { /* Quota/Privacy-Mode: still ignorieren */ }
}

/** Setzt einen Wert validiert; gibt die neuen Optionen zurück (mutiert nicht). */
export function setOption(options: Options, key: keyof Options, value: number | boolean): Options {
  const next = { ...options };
  if (key === "shake") next.shake = Boolean(value);
  else if (key === "damageNumbers") next.damageNumbers = Boolean(value);
  else if (key === "muted") next.muted = Boolean(value);
  else if (key === "scale") next.scale = clampScale(Number(value));
  else next[key] = clampVolume(Number(value));
  return next;
}

/** Schrittweite für Tastatur-Steuerung. */
export const OPTION_STEP = 0.1;

/** Zeilen des Optionsmenüs (eine Quelle für Titel + Pause + Tests). */
export const OPTION_ROWS = [
  "MUSIK", "SFX", "SCREEN-SHAKE", "DAMAGE-NUMBERS", "MASTER MUTE", "SKALIERUNG", "ZURÜCK",
] as const;

/** Anzeigetext des Werts einer Optionszeile. */
export function optionValueLabel(options: Options, row: number): string {
  switch (row) {
    case 0: return `${Math.round(options.music * 100)}%`;
    case 1: return `${Math.round(options.sfx * 100)}%`;
    case 2: return options.shake ? "AN" : "AUS";
    case 3: return options.damageNumbers ? "AN" : "AUS";
    case 4: return options.muted ? "STUMM" : "AN";
    case 5: return scaleLabel(options.scale);
    default: return "";
  }
}

/** Nächster Wert einer Optionszeile (Tastatur/Maus). */
export function stepOption(options: Options, row: number, delta: number): Options {
  if (row === 0 || row === 1) {
    const key = row === 0 ? "music" : "sfx";
    return setOption(options, key, Math.round((options[key] + delta * OPTION_STEP) * 10) / 10);
  }
  if (row === 2) return setOption(options, "shake", !options.shake);
  if (row === 3) return setOption(options, "damageNumbers", !options.damageNumbers);
  if (row === 4) return setOption(options, "muted", !options.muted);
  if (row === 5) {
    return setOption(options, "scale", options.scale + (delta > 0 ? 1 : -1));
  }
  return options;
}
