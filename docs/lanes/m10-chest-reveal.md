# Lane m10-chest-reveal — Inszenierter Truhen-Moment

Worktree `/home/ai/games/lf-lanes/m10-chest-reveal`, Branch `m10-chest-reveal`.
Briefing (Dom 21:45Z, Punkt 6): Truhe ist funktional, aber klein und nüchtern;
Untertitel wird vom Truhen-Icon überdeckt. Öffnen = Kernmoment des Genres →
Inszenierung: Aufleuchten, Münzen/Funken, Belohnungs-Reveal.

**Tabu-Erweiterung (Supervisor, 27.11.):** Auch `src/scenes/UI.ts` ist für diese
Lane nicht beschreibbar (Briefing nannte UI.ts nicht in der Disponent-Liste;
`git checkout`-Revert aller UI.ts-Änderungen ist belegt). Der Untertitel-Fix
läuft deshalb im **ChestSystem-eigenen Panel-Renderer** (`applyPanelFix`,
Laufzeit-Zugriff auf die existierenden Panel-Objekte — kein Duplikat-Rendering,
kein UI.ts-Edit). Anfrage-Notiz in `/home/ai/games/.dispatch/requests.md`.

## Ergebnis in einem Satz

Die Öffnungs-Sequenz läuft jetzt als getestete 3-Phasen-Inszenierung (Glow →
Partikel → Reveal) aus `src/logic/chest-reveal.ts` mit eigenem Partikel-Pool im
ChestSystem, das Panel-Icon ist größer und der Untertitel hat harte Abstände
(≥ 5 px) zu Titel und Icon — **0 Inhalts-Überlappungen** in open-mid /
open-settled / open-evo bei **640x360 und 780x360@3**, Truhen-Count im
30-min-Sim unverändert **6/6**, 724 Tests grün.

## Karte 1 — Vorher-Beleg (#5958, Commit 9276723)

`timeout 300 node scripts/m10-chest-reveal.mjs` (kein flock — Screenshots/Messung,
kein FPS-Lauf). Rendert Truhen-Moment + Öffnen in 640x360 (dpr 2) und
780x360@3 (dpr 3), misst Panel-Elemente (Texte über exakte Glyph-Metriken,
Images über Bounds) und schreibt:
`shots/m10-chest-reveal-before.png` (Montage), `before.json` (inkl.
iGPU-Renderer-String „ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES
3.2)“), je Viewport `-ground/-open-mid/-open-settled`.

Befund vorher: Untertitel „BELOHNUNGEN ROLLEN …" saß mit **2 px** unter der
Titel-Unterkante und ~5 px über dem Truhen-Icon (16x16 @ 2.2) gequetscht,
Icon klein, Strahl schwach. (Anmerkung: die gerenderten Glyphen überlappten
nicht — der wahrgenommene „Überlapp"-Eindruck kommt von der Quetschung; die
Container-`getBounds()` sind durch Atlas-Frames aufgebläht, deshalb misst das
Skript Glyph-Boxen.)

## Karte 2 — Öffnungs-Sequenz (#5959, Commit 938d9da + Follow-up)

`src/logic/chest-reveal.ts` (neu, rein, ohne Phaser): `chestOpenTimeline`,
`chestBurstSpec`, `chestPanelLayout`, Konstanten. `src/systems/ChestSystem.ts`
ist der Renderer:

- **Phase 1 GLOW (0–280 ms):** Glanz-Animation hoch (Alpha 0.55→1.0, Skalierung
  0.34→0.6 am Welt-Glow).
- **Phase 2 PARTIKEL (280/420 ms):** Deckel (`chest_open`), Münzen-/Funken-Burst
  aus der Truhe — **eigener Partikel-Pool (28 Images)** in ChestSystem, nicht
  FxSystem (Tabu eingehalten). Münzen fächern nach oben, Funken radial ADD.
- **Phase 3 REVEAL (ab 520 ms):** Panel übernimmt; Reveal-Reihenfolge aus der
  Timeline; Welt-Reste werden nach 1600 ms freigegeben.
- **Panel-Renderer `applyPanelFix`:** Untertitel → y 58+oy, Icon → y 92+oy und
  Skalierung 2.6, Evo-Hinweiszeilen → 122/130+oy (unter dem größeren Icon).
  Idempotent, läuft bei jedem Öffnen (onChestOpen setzt Skalierung neu).

Beleg nachher (`shots/m10-chest-reveal-after.json`, `-after.png` Montage,
`-after-open.gif`): **0 Überlappungen** der Inhaltselemente (Titel, Untertitel,
Icon, Evo-Hinweise, Slot-Texte/-Icons) in allen drei Phasen, beide Viewports,
0 JS-Fehler. Abstände: Titel→Untertitel 6 px, Untertitel→Icon 6.2 px,
Icon→Evo-Hinweis 5.7 px.

## Karte 3 — Reveal-Reihenfolge/Labels (#5960, Commit b214553)

`src/logic/evolution.ts`: `chestRewardLabel` („EVOLUTION" / „STUFE n", ≤ 9
Zeichen) und `revealOrder` (deterministisch: Evolution → Neu → Upgrade,
Gleichstand alphabetisch nach id; Rewards selbst unverändert, Eingabefeld
unangetastet). Tests: alle 6 Waffen- + 6 Powerup-Namen + Evolutionen passen
lesbar in ≤ 2 Zeilen à 13 Zeichen (Slot-Breite).

## Karte 4 — Tests + 6/6 + Doku (#5961, dieser Commit)

`tests/chest-reveal.test.ts` (14 Tests): Timeline 1/3/5 deterministisch in
fester Phasen-Reihenfolge, Klemmung 1..5, Burst-Spec 16+8 deterministisch im
Fächer, Panel-Layout harte Abstände ≥ 2 px (Glyph-Metriken), Labels, Lesbarkeits-
Matrix, chestRewards-Felder unverändert.

**Truhen-Count 6/6 unberührt** (`timeout 320 node scripts/m10-chest-reveal.mjs
--sim`, kein flock — timeScale-30-Sim, kein Echtzeit-FPS-Lauf):
`shots/m10-chest-reveal-sim.json` — Seed 101, Sim-Zeit 1819.7 s,
`bossesDefeated 6`, `chestsDropped 6`, `chestSpawnsRecorded 6`, `count66: true`,
0 JS-Fehler, iGPU-Renderer-String enthalten.

`npx vitest run` → **724/724 grün**, `npx tsc --noEmit` grün, `npm run build` grün.

## Belege (alle im Commit)

| Datei | Inhalt |
|---|---|
| shots/m10-chest-reveal-before.json/-before.png | Vorher + Renderer-String + Quetsch-Befund |
| shots/m10-chest-reveal-after.json/-after.png | Nachher: 0 Überlappungen (3 Phasen × 2 Viewports) |
| shots/m10-chest-reveal-after-*-open-mid/settled/evo/ground.png | Einzelscreenshots 640 + 780@3 |
| shots/m10-chest-reveal-after-open.gif | Öffnungs-Sequenz als Bewegtbild |
| shots/m10-chest-reveal-sim.json | 30-min-Sim: 6/6 Truhen |

## Abnahme (art-director)

- **PASS, Note 4/5** für die Inszenierung. Belege laut Kontrolleur: Vorher/Nachher
  open-settled (6 px Luft statt 2 px Quetschung), Evo-Hinweis kollisionsfrei
  zwischen Icon und Slots, `after.json` mit `overlaps: []` in beiden Viewports,
  GIF liest sich als „ein Moment“ (Dim → Glanz → Burst → Abklingen), Palette
  sauber (warmgold, additives Licht als Latte-Ausnahme).
- Korrekturen umgesetzt (K4): Icon ganzzahlig — Scale 3.0 (48×48), Position
  x=296/366, y=115; Evo-Hinweiszeilen 169/177; Welt-Burst ganzzahlig (Spec-Scale
  1.5 → fx_coin exakt 3 px, Flug-Skalierung in 0.5-Schritten quantisiert).
- Offen (UI.ts-Scope, dokumentiert): die PANEL-Münzen (`spawnChestCoins` in
  UI.ts, Scale-Tween 1.4→0.4) bleiben nicht-ganzzahlig — Schnappen erfordert
  einen UI.ts-Claim. Re-Check beim art-director angefragt.

## Offene Punkte / Hinweise für GAME.md-Merge

- UI.ts bleibt unberührt; das Panel übernimmt die Layout-Positionen zur Laufzeit
  (applyPanelFix). Sauberer Folgeschritt: die Konstanten aus
  `src/logic/chest-reveal.ts` direkt in `createChestUI`/`onChestOpen` nutzen
  (ein kleiner UI-Touch auf einer Karte mit UI.ts-Claim) und `applyPanelFix`
  dann entfernen.
- `revealOrder`/`chestRewardLabel` sind rein und getestet, aber im Panel noch
  nicht verdrahtet (UI.ts tabu) — Panel zeigt weiterhin Evolution zuerst +
  „EVOLUTION"/„STUFE n"-Grammatik, die Reihenfolge der Upgrades kommt aus der
  unveränderten Angebotslogik.
- Run.playChestFx (Welt-Münzen) läuft weiterhin parallel zum
  ChestSystem-Burst; hinter dem 0.9-Dim des Panels nicht sichtbar. Könnte in
  einem Run.ts-Claim eingespart werden.
