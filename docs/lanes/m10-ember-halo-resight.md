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

### Messwerte (verbindlicher Messlauf des eingefrorenen Skripts, „Lauf B“:
### art-director-Frischlauf auf identischem Stand, seed 77, 646 Gegner —
### die auf Platte liegenden Belege; Lauf A (687 Gegner) im WIP-Commit b7290bb2
### dokumentiert, beide PASS)

| Messgröße | Lauf B (Platte) | Lauf A (b7290bb2) | Grenze |
|---|---|---|---|
| projectile_ember: A7 / minRgb200 | 0 % / 0 % | 0 % / 0 % | ≤ 4,16 % |
| fx_ember_muzzle (Textur) | 0 % / 0 % | 0 % / 0 % | ≤ 4,16 % |
| fx_ember_trail (Textur) | 0 % / 0 % | 0 % / 0 % | ≤ 4,16 % |
| Glow-Kleck ADD @0,55 (real) / @0,95 (worst), Footprint 37 px | 0 % / 0 % | 0 % / 0 % | ≤ 4,16 % |
| Einzelprojektil: worst Ember-Fenster | 0 % / 0 % | 0 % / 0 % | ≤ 4,16 % |
| Chaos worst Ember-Fenster (Projektile + Muzzle-Blobs) | 3,36 % / 3,68 % | 0,48 % / 0,48 % | ≤ 4,16 % |
| Chaos Gesamtframe | 0,14 % | 0,14 % | ≤ 4,16 % |
| Off-Palette (Quelltexturen) | 0 | 0 | 0 |
| Binaeres Alpha | ja | ja | ja |
| JS-Fehler | 0 | 0 | 0 |
| Gegner / Ember-Projektile im Chaos | 646 / 4 | 687 / 4 | ≥ 500 / ≥ 4 |
| Renderer | ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2) | dito | kein SwiftShader |

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

- Urteil: **PASS — 4/5** (2026-11-28, Subagent). Belege im Urteil: Chaos-Zoom-Crops
  zeigen das Ember-Projektil als **eigenen Kern** (dunkle Tintenkontur, maroon-
  dunkle Körperzone, orange Mittelstufe, helle Rampe/Spitze), kein ausgebrennter
  Klecks, keine Verwischung mit Heldelicht/Gegner-FX; `projectile_ember`-Textur:
  saubere heiße Orange-Rampe mit flameBright-Spitze + Tintenkontur; kein „muss neu“.
- Nachbessern (Doku-/Beleg-Punkte, keine Grafikdefekte):
  1. Montage-Tile für Chaos-Projektil #3 verfehlt das Subjekt — Ember liegt hinter
     Welt-Prop (Kiste/Pfeiler, korrekte Tiefe). Belege korrigiert: Montage neu
     gebaut (proj0/proj1 28x28, proj2-Wide 48x48 mit zwei Embers, proj3-Wide
     dokumentiert die Verdeckung, Einzelprojektil 48x48).
  2. `fx_ember_muzzle` handwerklich schwach (flacher gelber Kreis ohne Rampe/
     Kontur) — messbar unkritisch (0 % Near-White real + worst-case), Hinweis für
     eine künftige Grafik-Lane; Textur liegt in src/gfx/textures.ts (fremd-claimed,
     hier nicht angefasst).
  3. Streuung: worstEmberWindow schwankt je Lauf (Lauf A 0,48 %, Lauf B 3,36 %) —
     beide ≤ 4,16 %; bei künftigen Glow-Änderungen am Spielerlicht erneut messen.

## K2 — Entscheidung (#12621) — verbindlich

Kriterium: art-director ≥ 4/5 UND Near-White ≤ 4,16 % (Textur + Chaos).
- art-director: **PASS 4/5** ✓
- Near-White: Textur (Projektil, Glow-Klecks, Trail) 0 %; Glow-Kleck additiv
  (real 0,55 + worst 0,95) 0 %; Chaos worst Ember-Fenster 3,36 % A7 / 3,68 %
  min200 (Lauf B, Fenster-Grund dominiert; art-director-Sicht: Ember-Pixel frei
  von Near-White; Lauf A 0,48 %) — alle ≤ 4,16 % ✓

→ **Lane wird beendet, kein K3/K4-Fix.** Der Glow-Kleck (fx_ember_muzzle, ADD,
alphaFrom 0,55, Footprint 37 px) ist in Textur und additiver Komposition bei 0 %
Near-White; die Chaos-Fenster liegen in beiden Läufen ≤ 4,16 % (Lauf B 3,36 %
A7 / 3,68 % min200 — der Anteil stammt nach art-director-Sichtprüfung aus dem
Fenster-Grund [Welt-Props/Heldelichtnähe], nicht vom Ember selbst, dessen Pixel
im Bild frei von Near-White sind; Lauf A 0,48 %). Eine weitere
Dämpfung des additiven Halos würde ohne messbaren Near-White-Gewinn die Kern-
Identität (flameBright-Spitze) riskieren — der Restpunkt „Halo-Überstrahlung Ember“
gilt auf Basis dieser Nachsicht als geschlossen.

- Dom-sight-Kontext: der Restpunkt (docs/qa/dom-sight-package-2026-11-28.md,
  „Offene Restpunkte“) ist damit Nachsicht-belegt geschlossen; das Dokument selbst
  ist Dom-Bewertungskontext und wird nicht umgeschrieben. ACCEPTANCE.md bleibt
  unberührt (fremd-claimed durch merge-m10-acceptance-g-sync).- Offener Hinweis für spätere Balance-/Lesbarkeits-Lanes (kein Befund dieser
  Lane): Hero-Lantern-Licht (light_radius ADD) ist die dominante Near-White-Quelle
  am Spieler (6,8 % im 41x41-Fenster) — hier liegt das nächste Überstrahlungs-
  Potenzial, falls Dom dort etwas sieht.

## Abnahme (Gesamt)

- `node scripts/m10-ember-halo.mjs baseline` → VERDICT: PASS (alle Grenzen oben);
  verbindlicher Messlauf des eingefrorenen Skripts = Lauf B auf Platte (Supervisor-
  Anweisung 2026-11-28; Lauf A im WIP-Commit dokumentiert, Varianz 0,48→3,36 %
  Chaos-Fenster ist Gegner-/Fenstergrund-Streuung, beide Läufe ≤ 4,16 %).
- art-director: **PASS 4/5** (siehe K1-Abschnitt).
- Keine Code-Änderungen an Spiel-Dateien (gen-fx.ts unberührt, K3/K4 entfallen).
- `npx tsc --noEmit` rc=0; `npm run build` grün; Full-Suite `npx vitest run` grün
  (Stand ohne Spielcode-Änderung; vor dem K2-Commit geprüft).
- Belege: `~/games/.evidence/m10-ember-halo-resight/` (Lauf B: JSON + PNGs inkl.
  korrigierter Projekt-Montage). Keine Abnahme-Bilder in shots/abnahme/ nötig
  (kein Fix, nur Nachsicht; dom-sight-Paket dokumentiert die Belegorte).

## Supervisor-Ack (2026-11-28)

- Mess-Skript eingefroren; Tatsachenstand: 5 Edits (alles Mess-Infrastruktur,
  keine Wertepolitur), der letzte Lauf ist der verbindliche Ein-Messlauf.
- Karte #12013 (m10-spawn-view-anchor) ist NICHT Teil dieses Briefings — laut
  Lane-Regeln („Nur Karten des eigenen Lane-Briefings“) wird sie hier nicht
  angenommen; Hinweis zur Kenntnis an Disponent/Supervisor.
