# Lane m10-chest-reveal-staging — Truhen-Inszenierung: Erledigt-Prüfung (K1-Befund)

Bedarf (Doms Freigabe 21:45Z, Punkt 6, via `/home/ai/games/.dispatch/requests.md`,
Eintrag m10-chest-reveal 2026-11-27):

1. **Untertitel-Position im Truhen-Panel fixen** — 0 Überlappung
   (Beleg `shots/m10-chest-reveal-before.json`: Titel-Unterkante schnitt
   Untertitel-Oberkante um ~2 px, beide Viewports).
2. **Inszenierung des Öffnungs-Moments** — Panel-Strahl, Icon-Größe,
   Münzen/Funken.

Der Job wurde als Lane `m10-chest-reveal-staging` (after merge-m10-mobile-fps-cap,
da UI.ts dort belegt) angelegt. **K1-Ergebnis: beide Punkte sind inzwischen über
Merges auf main gelandet — die Lane schließt mit Doku-Befund, keine src-Änderung.**

## Befund: Wo der UI-Teil gelandet ist (main, Commits)

| Teil | Commit (main) | Inhalt |
|---|---|---|
| Untertitel-Fix UI.ts | `295ea32a` (m10-chest-panel-ui, #6579) | Untertitel-Anker an der Titel-Unterkante + `CHEST_SUBTITLE_GAP_PX = 6` (vorher Hartwert 54+oy mit ~2 px Gap → Überlappung); AC `CHEST_SUBTITLE_MIN_GAP_PX = 4` in `src/scenes/UI.ts`, reine Box-Mathematik `chestPanelBoxes()` |
| Icon-Größe (crisp) | `2e30dc3a` (m10-chest-icon-crisp, #7459) | Panel-Icon auf ganzzahliger Draw-Stufe `CHEST_ICON_DRAW_SCALE = 3` (Layout 2.6 bleibt in den Anker-Boxen), Fit unter Untertitel/über Hint-Band geprüft |
| Inszenierung Öffnungs-Moment | `a1de89f9` (Merge m10-chest-reveal, #5958–#5961) | Öffnungs-Sequenz Glow→Partikel→Reveal: Panel-Strahl (`light_radius`, Tween alpha 0.9 / scale 1.15 / 520 ms), 12 Münzen (`fx_coin`, deterministisch gestreut) + Funken (`fx_spark`, ADD-Blend, amber) aus dem bestehenden FX-Vokabular, Reveal-Reihenfolge in `src/logic/chest-reveal.ts` |
| Regression-Guards | `295ea32a`/`2e30dc3a`/`a1de89f9` | `tests/chest-panel-ui.test.ts`, `tests/chest-icon-crisp.test.ts`, `tests/chest-reveal.test.ts` |

Palette-/A7-Grenzen: die Inszenierung nutzt nur bestehende Texturen
(`light_radius`, `fx_coin`, `fx_spark`) und Palettenfarben (`PAL[C.lantern]`,
`PAL[C.amber]`) — keine neuen Farben.

## Frische Messung des Ist-Stands (dieser Lane, 2026-11-28)

Mess-Skript: `scripts/m10-chest-reveal-staging.mjs` (Pixel-Sampling-Vertrag wie
`m10-chest-reveal.mjs`; kein flock — Screenshot-Messung, kein FPS-Lauf).

- JSON-Beleg: `~/games/.evidence/m10-chest-reveal-staging/m10-chest-reveal-staging-audit.json`
- **Überlappungen: 0 px²** in beiden Viewports (640×360@2, 780×360@3) und allen
  drei Phasen (open-mid, open-settled, open-evo mit Evo-Hinweiszeilen).
- Inszenierung gemessen: Panel-Strahl `light_radius` alpha 0.9 / scale 1.15,
  Icon `chest_open` scaleX 3 (ganzzahlig), 12 `fx_coin` in der Roll-Phase
  (Funken laufen als Welt-Burst aus ChestSystem, nicht als Panel-Kinder).
- 0 JS-Fehler; Renderer-String `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S),
  OpenGL ES 3.2)` — kein SwiftShader, Beleg gültig.
- Abnahme-Bilder (in git): `shots/abnahme/m10-chest-reveal-staging-<fmt>-open-{mid,settled,evo}.png`
  — Sichtprüfung 2x nearest: Titel/Untertitel mit klarem Gap, Strahl hinter dem
  Icon, Slots rollen, Fuß-Hinweis lesbar.

## Checks

- `npx tsc --noEmit` → rc 0
- `npx vitest run tests/chest-panel-ui.test.ts tests/chest-icon-crisp.test.ts tests/chest-reveal.test.ts` → 46/46 grün
- Full-Suite + Build: einmal vor dem K1-Commit (siehe Commit-Nachricht)
- art-director zu den Abnahme-Shots: siehe Abschnitt unten

## Konsequenz für die Karten

- **K2 (Untertitel-Fix)**: entfällt — Fix ist über `295ea32a` auf main,
  0-Überlappungs-Vertrag von `tests/chest-panel-ui.test.ts` + frischer Messung
  gedeckt.
- **K3 (Inszenierung)**: entfällt — Strahl/Icon/Münzen/Funken sind über
  `a1de89f9` (m10-chest-reveal) + `2e30dc3a` (m10-chest-icon-crisp) auf main;
  art-director-Urteil 4/5 aus jener Lane (Commit `2783b0de`), frische
  Sichtprüfung dieser Lane bestätigt.
- **K4 (Nachher + Guard)**: entfällt als Code-Karte — Regression-Tests existieren
  auf main (46 Tests, siehe oben), Mess-/Shot-Belege in dieser Doku.
- Lane endet mit `.lane-done`, keine src-Änderung.

## art-director-Verlauf (frische Abnahme dieser Lane)

- **Runde 1 — FAIL (conditional), Umsetzungsnote 4/5:** Typografie, Icon-Crisp,
  Strahl, Evo-Layout, Palette, Footer alles PASS. Einziger Muss-Punkt: im
  open-mid-Shot (1000 ms nach openChest) waren keine Münzen sichtbar — Bild
  widersprach dem Messwert „12 fx_coin“.
- **Ursache (kein src-Fehler, Capture-Fehler):** Der Panel-Coin-Tween läuft
  700–1050 ms und blendet zum Ende auf alpha 0 aus. Bei 1000 ms hatten alle
  12 `fx_coin` alpha ≤ 0,05 (Mess-JSON Runde 1) — der Shot lag hinter dem
  Tween-Ende. Mess-Skript auf 400 ms korrigiert (Roll-Phase, Flugstart);
  `settled`/`evo` bleiben bei denselben Gesamtzeitpunkten wie zuvor.
- **Runde 2 — PASS, Note 4,5/5 (Abnahmeziel ≥ 4/5 erfüllt):** Neue mid-Shots
  bei 400 ms zeigen 12 `fx_coin` mit alpha 0.87–0.91 als lesbare goldene
  Silhouetten an der Kiste (Flugstart), konsistent zwischen beiden Viewports
  und mit dem Audit-JSON; Staging-Kohärenz im 400-ms-Moment (Typewriter-Titel
  „TRUHE“, Slots ohne Labels, Strahl im Aufbau) ohne Zustandsbruch. Alle
  PASS-Punkte aus Runde 1 weiter gültig. Klein-Punkt „ARKANES BUCH“
  (0 px Innenabstand) dokumentiert, kein FAIL-Grund → evtl. spätere
  UI-Politur-Karte. Hinweis für künftige Shots dieser Szene: Roll-Phase mit
  ≤ 500 ms Capture-Zeit (alpha-Fade ab ~700 ms).
