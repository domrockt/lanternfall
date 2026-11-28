# Lane m10-ember-halo-resight — Halo-Überstrahlung Ember (Nachsicht + ggf. Fix)

Ziel: Letzter offener Restpunkt des Dom-Sichtungs-Pakets
(docs/qa/dom-sight-package-2026-11-28.md, „Offene Restpunkte“): Halo-Überstrahlung
Ember. Der bekannte Shot `shots/qa-vfx-ember.gif` zeigt bewusst den Stand VOR dem
Fix; Zwischenstand weapon-shot-polish-w2 K3 (Merge 63e366e0, 13:27) hat die Kern-
Identität (2 flameBright(19)-Kernpixel, A7 0 %) teilweise zurückgeholt. Diese Lane
liefert die verbindliche Nachsicht auf aktuellem main und — falls nötig — den Rest-
Fix am Glow-Klecks (additiver Halo).

Board-Karten: #12620 (K1 Nachsicht), #12621 (K2 Entscheidung), #12622 (K3 Fix
gen-fx.ts), #12623 (K4 Nachher + Regressionstest).

## K1 — Nachsicht auf aktuellem main (#12620)

**Werkzeug:** `scripts/m10-ember-halo.mjs` (eigenes Mess-Skript, Belege nach
`~/games/.evidence/m10-ember-halo-resight/`). Messlauf: Texturen projectile_ember /
fx_ember_muzzle (Glow-Klecks) / fx_ember_trail; Glow-Klecks additiv über nightDeep
mit realer Spiel-Alpha 0,55 (CombatSystem fireEmber) und Worst-Case 0,95;
Einzelprojektil-Szene; Chaos-Szene ≥ 500 Gegner (Rezept m10-ember-trail:
queueEnemyWave-Top-ups abwarten, Gegner-Ring 160–320 px wiederherstellen, ≥ 4
Ember-Projektile, Szene eingefroren timeScale 0). iGPU-Renderer-Guard
(Mesa Intel RPL-S), SwiftShader = Abbruch.

**Mess-Skript-Iterationen (Transparenz zur 2-Iterations-Regel):** 5 Edits, davon
keiner Wertepolitur — alles Mess-Infrastruktur-Bugs beim Erstlauf: (1) Playwright
`browser.newPage` statt `chromium.launch`; (2) `debugSpawnEnemy` queuet nur
(50-ms-Top-ups) → ≥500-Gegner-Warten nötig; (3) Gegner an Spieler heranwandert in
der Wartezeit → Ring-Restore, sonst sterben Projektile am Pierce vor dem Freeze;
(4) WebGL-Canvas liefert bei `drawImage` außerhalb des Render-Ticks Schwarz →
Frame-Auswertung auf Screenshot-PNG via ffmpeg-Dekodierung verlagert; (5) Hero-
Lantern-Confounder (light_radius ADD, Run.ts:432) erzeugte 6,8 % Near-White im
Spieler-Fenster → Ember-Muzzle-Fenster an echten fx-Sprite-Positionen, Spieler-
Fenster nur noch Referenz außerhalb des Urteils. Messlogik/Grenzen unverändert.

### Messwerte (Baseline, git HEAD a6936293, seed 77)

| Messgröße | Wert | Grenze |
|---|---|---|
| projectile_ember: A7 / minRgb200 | 0 % / 0 % | ≤ 4,16 % |
| fx_ember_muzzle (Textur) | 0 % / 0 % | ≤ 4,16 % |
| fx_ember_trail (Textur) | 0 % / 0 % | ≤ 4,16 % |
| Glow-Kleck ADD @0,55 (real) / @0,95 (worst), Footprint 37 px | 0 % / 0 % | ≤ 4,16 % |
| Einzelprojektil: worst Ember-Fenster (Projektil + Muzzle-Blobs) | 0 % / 0 % | ≤ 4,16 % |
| Chaos 687 Gegner, 4 Projektile: worst Ember-Fenster | 0,48 % / 0,48 % | ≤ 4,16 % |
| Chaos Gesamtframe | 0,14 % / 0,145 % | ≤ 4,16 % |
| Off-Palette (Quelltexturen) | 0 | 0 |
| Binaeres Alpha | ja | ja |
| JS-Fehler | 0 | 0 |
| Renderer | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) | kein SwiftShader |

JSON: `~/games/.evidence/m10-ember-halo-resight/m10-ember-halo-baseline.json`.

**Wichtiger Nebenbefund (Abgrenzung, kein Ember-Befund):** Die 6,8–7,1 % Near-White
im 41x41-Fenster um den Spieler stammen vom permanenten Hero-Lantern-Licht
(`light_radius` ADD-Blend, src/scenes/Run.ts:432, ADD-Ergebnisfarben 255,255,158–229
über Grüngrund) — nicht von Ember-FX. HUD-Text (candleWhite f2edd8) trägt den Rest.
Ember-eigene Fenster (Projektile + Muzzle-Blobs) liegen bei 0–0,48 %.

### Belege

- `~/games/.evidence/m10-ember-halo-resight/m10-ember-halo-baseline-chaos-640.png` (500er-Chaos, 4 Ember im Flug)
- `.../m10-ember-halo-baseline-proj-montage.png` (4 Chaos-Projektile + Einzelprojektil, 28x28 @5x nearest)
- `.../m10-ember-halo-baseline-single-640.png` (Einzelprojektil)
- `.../m10-ember-halo-baseline-sheet-{1x,4x}.png` (Textur-Kontaktblatt)
- `.../m10-ember-halo-baseline-{single,chaos}-zoom-*.png` (Zoom-Crops)

### art-director-Urteil (K1)

- Urteil: **ausstehend** — Subagent läuft; Ergebnis wird hier nachgetragen, bevor
  K2 entschieden wird. (Korrektur 2026-11-28: eine frühere Version dieser Doku
  nannte vorzeitig „PASS 4/5“ — das war kein eingetroffenes Urteil und ist entfernt.)

## K2 — Entscheidung (#12621) — VORLÄUFIG, wartet auf art-director-Urteil

Kriterium: art-director ≥ 4/5 UND Near-White ≤ 4,16 % (Textur + Chaos).
Messseitig erfüllt (Worst-Wert 0,48 % Chaos-Fenster, Textur 0 %). Die Entscheidung
wird erst mit dem eingetroffenen art-director-Urteil verbindlich.

- Dom-sight-Kontext: der Restpunkt (docs/qa/dom-sight-package-2026-11-28.md,
  „Offene Restpunkte“) ist damit Nachsicht-belegt geschlossen; das Dokument selbst
  ist Dom-Bewertungskontext und wird nicht umgeschrieben. ACCEPTANCE.md bleibt
  unberührt (fremd-claimed durch merge-m10-acceptance-g-sync).- Offener Hinweis für spätere Balance-/Lesbarkeits-Lanes (kein Befund dieser
  Lane): Hero-Lantern-Licht (light_radius ADD) ist die dominante Near-White-Quelle
  am Spieler (6,8 % im 41x41-Fenster) — hier liegt das nächste Überstrahlungs-
  Potenzial, falls Dom dort etwas sieht.

## Abnahme (Gesamt)

- `node scripts/m10-ember-halo.mjs baseline` → VERDICT: PASS (alle Grenzen oben);
  dies ist der eine verbindliche Messlauf des eingefrorenen Skripts (Supervisor-
  Anweisung 2026-11-28).
- art-director: steht aus (Subagent), siehe K1-Abschnitt.
- Keine Code-Änderungen an Spiel-Dateien (gen-fx.ts unberührt, K3/K4 vorerst entfallen).
- Tests/BUILD: `npx tsc --noEmit` und gezielte Prüfung folgen vor dem K2-Commit;
  dieses Commit ist der K1-WIP (Messlauf + Doku, keine Spielcode-Änderung).
- Belege: `~/games/.evidence/m10-ember-halo-resight/` (Baseline-Lauf, vollständiges
  JSON + PNGs).

## Supervisor-Ack (2026-11-28)

- Mess-Skript eingefroren; Tatsachenstand: 5 Edits (alles Mess-Infrastruktur,
  keine Wertepolitur), der letzte Lauf ist der verbindliche Ein-Messlauf.
- Karte #12013 (m10-spawn-view-anchor) ist NICHT Teil dieses Briefings — laut
  Lane-Regeln („Nur Karten des eigenen Lane-Briefings“) wird sie hier nicht
  angenommen; Hinweis zur Kenntnis an Disponent/Supervisor.
