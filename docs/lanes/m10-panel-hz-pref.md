# Lane m10-panel-hz-pref — Panel-Hz-Präferenz für BILDRATE=MAX (Dom-Folgepunkt 17:45Z)

## Ziel
Menü-Option „BILDRATE: max" soll den 60-Hz-Panel-Wunsch der App (APK-Lock aus
MainActivity, 15:20Z) aufheben — sonst bringt „max" am Gerät nichts. Umsetzung
rein JS-seitig: beim Setzen von fps=0 (MAX) wird ein Panel-Hz-Präferenz-Flag
geschrieben, das die APK beim nächsten Start über die Bridge (`/launch?...&hz=max`)
lesen kann. APK-/Bridge-Seite bewusst out of scope (Vera-Eskalation durch Dora angelegt).

## Umsetzung (Karten, je ein Commit)
- **K1 (#13766, Commit 7192e2b9):** Neue reine Datei `src/logic/panel-hz.ts`.
  - Key `lfhz_panel` (localStorage), API `setPanelHzPref(mode: 'locked60' | 'max')`,
    Lesehelfer `readPanelHzPref`, injizierbarer Storage (`setPanelHzStorage`),
    Default lazy `window.localStorage`, ohne Storage alles sichere No-op.
  - `max` → `setItem("lfhz_panel", "max")`; `locked60` → `removeItem`
    (Fallback ohne removeItem: explizit `"locked60"` schreiben). Fehler (Quota/
    Privacy-Mode) werden still ignoriert.
  - Kein Import aus `src/logic/fps-cap.ts` (Datei bei Lane m10-fps-pacing-fix
    belegt — NICHT angefasst).
- **K2 (#13767, Commit 47355683):** Hook in `src/audio/options.ts` `setOption`
  (`key === "fps"`): `fps=0` (FPS_MAX) → `setPanelHzPref('max')`, sonst
  (`60`/AUTO) → `setPanelHzPref('locked60')`. Semantik/BILDRATE-Anzeige
  bitgleich, Options-Persistenz (saveOptions/loadOptions) unverändert —
  OPTIONS_KEY enthält kein Zusatzfeld.
- **K3 (#13768, Commit 003f165e):** `tests/panel-hz.test.ts` (7 Tests):
  MAX schreibt `max`; 60/AUTO löscht/auf locked60; kein NaN (clampt auf AUTO);
  stepOption-Zyklus schreibt mit; removeItem-Fallback; No-op ohne Storage;
  Persistenz-Expecteds unangetastet (`tests/meta-persist.test.ts` bleibt grün).
- **K4 (#13769):** Diese Doku + `.lane-done`.

## Kontext / A/B-Tabelle (17:45Z)
Warum die Präferenz nötig ist — Dom-Messung 17:45Z am Geräteknoten:

| Panel-Hz | FPS | janky-Frames |
|---|---|---|
| 60 Hz (APK-Lock) | 60,0 | 0 % |
| 120 Hz | 118,5 | — |

Die APK clemt deshalb beim Start auf 60 Hz. Hebt der Spieler im Menü auf
BILDRATE=MAX, schreibt der JS-Teil ab sofort `lfhz_panel=max`; die APK kann
beim nächsten Start über die Bridge (`/launch?...&hz=max`) den Lock aufheben.

## Offen / out of scope
- **APK-Seite liegt bei Vera:** MainActivity liest `lfhz_panel` beim Start und
  mappt `max` → kein Display-Lock (Eskalation durch Dora angelegt). Bis dahin
  schaltet MAX am Gerät zwar das Frame-Cap ab (JS-seitig wirksam), der
  60-Hz-Panel-Lock bleibt aber bestehen — das ist der bekannte Rest.
- `src/logic/fps-cap.ts` wurde nicht angefasst (belegte Datei der Lane
  m10-fps-pacing-fix); `main.ts`/`UI.ts` ebenfalls nicht.

## Abnahme (Belege)
- `npx tsc --noEmit` → rc=0 (nach K1, K2, K3 jeweils).
- `npx vitest run tests/panel-hz.test.ts tests/meta-persist.test.ts tests/options-focus.test.ts tests/mobile-fps-cap.test.ts` → 55 passed, 0 fail.
- Optionsmenü weiterhin 8 Zeilen (`OPTION_ROWS` unverändert, BILDRATE = Zeile 6).
- Kein Touch an `fps-cap.ts`, `main.ts`, `UI.ts` (nur Lese-Import der bestehenden
  Konstante `FPS_MAX` in `options.ts` erweitert).
- Build/Tests: `npm run build` + `npm test` einmal vor `.lane-done` (siehe Commit #13769).
