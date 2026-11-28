/**
 * M10-panel-hz-pref (Dom-Folgepunkt 17:45Z): Panel-Hz-Wunsch der App.
 *
 * Die APK (MainActivity) clemt beim Start das Display auf 60 Hz (A/B-Tabelle
 * 17:45Z: 60 Hz → 60 FPS / 0 % janky; 120 Hz → 118,5 FPS). Soll der Spieler
 * im Optionsmenü BILDRATE=MAX wählen, muss dieser APK-Lock aufgehoben werden —
 * sonst bringt „max" am Gerät nichts. Rein JS-seitig schreiben wir dafür eine
 * Präferenz in localStorage, die die APK beim nächsten Start über die Bridge
 * (/launch?...&hz=max) lesen kann. Die APK-Seite liegt bei Vera (out of scope).
 *
 * Bewusst eine EIGENE Datei, ohne Import aus src/logic/fps-cap.ts (Datei ist
 * bei der Lane m10-fps-pacing-fix belegt); src/audio/options.ts verdrahtet
 * nur den Hook in setOption().
 */

/** localStorage-Schlüssel, den die APK-Bridge beim Start liest. */
export const PANEL_HZ_KEY = "lfhz_panel";

/** Modus der Präferenz: „max" hebt den 60-Hz-APK-Lock auf, „locked60" ist Default. */
export type PanelHzPrefMode = "locked60" | "max";

/** Wert, den die APK als „Hz-Lock aufheben" interpretiert. */
export const PANEL_HZ_VALUE_MAX = "max";

/** Minimaler Storage-Vertrag (window.localStorage erfüllt ihn). */
interface PanelHzStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Injizierbarer Storage. Default: window.localStorage (lazy, nur im Browser
 * vorhanden); in Node-Tests null → alle Operationen sind sichere No-ops.
 * `null` schaltet explizit ab, `undefined` stellt den Browser-Default wieder her.
 */
let storageOverride: PanelHzStorage | null | undefined;

/** Test-/Verdrahtungs-Hook: Storage für die Präferenz setzen. */
export function setPanelHzStorage(storage: PanelHzStorage | null | undefined): void {
  storageOverride = storage;
}

function activeStorage(): PanelHzStorage | null {
  if (storageOverride !== undefined) return storageOverride;
  const g = globalThis as { localStorage?: PanelHzStorage };
  return g.localStorage ?? null;
}

/** Liest die Präferenz (für Tests/Bridge-Vorbereitung): "max" | "locked60" | null. */
export function readPanelHzPref(storage?: PanelHzStorage | null): PanelHzPrefMode | null {
  const s = storage !== undefined ? storage : activeStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(PANEL_HZ_KEY);
    return raw === PANEL_HZ_VALUE_MAX ? "max" : "locked60";
  } catch {
    return null;
  }
}

/**
 * Schreibt/löscht die Panel-Hz-Präferenz. „max" setzt den Schlüssel, damit die
 * APK beim nächsten Start den 60-Hz-Lock aufhebt; „locked60" löscht ihn
 * (Default = gesperrt), removeItem-Fallback: explizit auf „locked60" schreiben.
 * Fehler (Quota/Privacy-Mode) werden still ignoriert — das Spiel läuft weiter.
 */
export function setPanelHzPref(mode: PanelHzPrefMode): void {
  const s = activeStorage();
  if (!s) return;
  try {
    if (mode === "max") {
      s.setItem(PANEL_HZ_KEY, PANEL_HZ_VALUE_MAX);
    } else if (typeof s.removeItem === "function") {
      s.removeItem(PANEL_HZ_KEY);
    } else {
      s.setItem(PANEL_HZ_KEY, "locked60");
    }
  } catch { /* Quota/Privacy-Mode: still ignorieren */ }
}
