// M10-device10min-refresh (Lane m10-device10min-refresh): reine Helfer für die
// aktive Panel-Refresh-Rate im Geräte-10-min-Beleg.
// Anforderung: Dom-Freigabe 17:45Z — die aktive Hz-Zahl ist Pflicht im Beleg
// (60-Hz-APK-Lock vs hz=max sind die Entscheidungsfelder des Tablet-Tors).
// Rein prüfbar per Fixture-String, kein Gerät nötig (Muster: lf-renderer.mjs).

/** rAF-FPS -> Panel-Hz-Schätzung (Schwellen wie m10-janky-remeasure.mjs). */
export const panelHzFromRaf = (fps) => {
  if (!Number.isFinite(fps)) return null;
  if (fps >= 100) return 120;
  if (fps >= 85) return 90;
  if (fps >= 50) return 60;
  return null;
};

const plausibleHz = (n) => (Number.isFinite(n) && n >= 24 && n <= 1000 ? Math.round(n) : null);

/**
 * `dumpsys display`-Text -> { refreshRate, panelMode } | null.
 *
 * Erkennt (tolerant über Android-Versionen):
 * 1) mActiveModeId=<id> + supportedModes=[{id=<id>, ..., refreshRate=<f>}, ...]
 * 2) erste refreshRate=<f> / "refreshRate <f>"-Angabe im Text
 * 3) "<f> Hz" im Text (DisplayDeviceInfo-Stil)
 * Nicht lesbar -> null (Aufrufer: refresh-Feld entfällt + Warnung).
 */
export const parseDisplayDump = (text) => {
  if (typeof text !== "string" || !text.trim()) return null;
  const activeId = text.match(/activeModeId\s*=\s*(\d+)/i)?.[1] ?? null;
  // Mode-Liste: id->refreshRate je {}-Eintrag (z. B. supportedModes=[{id=1, ..., refreshRate=60.0}, ...]).
  const modes = new Map();
  const entry = /id\s*=\s*(\d+)[^{}]*?refreshRate\s*=\s*([\d.]+)/g;
  let m;
  while ((m = entry.exec(text)) !== null) modes.set(m[1], Number(m[2]));
  if (activeId !== null && modes.has(activeId)) {
    const r = plausibleHz(modes.get(activeId));
    if (r !== null) return { refreshRate: r, panelMode: `modeId=${activeId}` };
  }
  const any = text.match(/refreshRate\s*[=:]\s*([\d.]+)/);
  if (any) {
    const r = plausibleHz(Number(any[1]));
    if (r !== null) return { refreshRate: r, panelMode: activeId !== null ? `modeId=${activeId}` : null };
  }
  const hz = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*Hz\b/);
  if (hz) {
    const r = plausibleHz(Number(hz[1]));
    if (r !== null) return { refreshRate: r, panelMode: null };
  }
  return null;
};
