# Lane m10-loadscreen-continuity (2026-11-28)

Ziel: Doms Ladescreen-Restpunkt („Wünsche von Dom.md“, 2026-11-28T13:25Z, Punkt 1) — der
Kaltstart zeigt einen **durchgehenden** Ladebildschirm ohne sichtbaren Stilbruch zwischen den
Phasen. Kein neuer Lade-Mechanismus, kein apk/MainActivity (Vera-Infra, siehe escalations).

## Ist-Stand (Vorher)

Gemessene Boot-Phasen auf dem Gerät (Doms Belege, `~/games/.evidence/device/boot/`, 13:14Z):

| Phase | Zeit | Inhalt |
|---|---|---|
| 1 | 0–3,6 s | schwarz (WebView/APK-Start, kein Spielcode) |
| 2 | 3,6–5,2 s | Vor-Text „LADE MOOR …“ links der Mitte, **ohne** Laterne/Balken |
| 3 | 5,2–7,4 s | Laternen-Ladescreen (Laterne + Balken + „LADEN …“) |
| 4 | ab 7,4 s | Titel |

Der Mittig-Anteil von Phase 2 wurde zwischenzeitlich durch die Lane `m10-loadscreen-pretext`
(Commit `04cac82d`, #12352) behoben; offen blieb der **Stilbruch**: Phase 2 zeigte nackten Text
ohne Laterne/Balken.

## Supervisor-Steer (2026-11-28)

Der Supervisor komprimierte den Kartenplan: minimalster Hebel sofort (Vor-Text mittig +
Ladescreen-Stil in der Boot-Phase), Commit auf Karte **#12013**, danach nur noch Guard-Test
(#12684) und Doku/.lane-done (#12685). Die ursprünglich geplanten Messkarten (K1 Vorher-Lauf,
separater K2-Nachher-Lauf) wurden zusammengelegt: Vorher-Beleg = Geräte-Messung oben +
`~/games/.evidence/m10-loadscreen-pretext/desktop-before/`, Nachher-Beleg = ein Kaltstart-Shot
über das bestehende Skript `scripts/m10-loadscreen-pretext.mjs`. Art-director-Kurzsicht entfiel
laut Steer; der Shot wurde stattdessen direkt gesichtet.

## Fix (#12013, Commit `4d2d3a2a`)

- `src/scenes/Loading.ts`: neuer Export **`drawLoadingChrome(scene, label?)`** — gemeinsame
  Layout-Basis (Hintergrund `nightDeep` `#0a0e16` = Laternen-Screen-Ton, Laterne an
  `cy - 28`, Balken-Rahmen an `GAME_HEIGHT - 44`, Prozent-Text, optionale Label-Zeile).
  `Loading.create()` nutzt sie (kein duplizierter Chrome mehr).
- `src/scenes/Boot.ts`: `preload()` ruft `drawLoadingChrome(this)` — die Boot-Vor-Phase
  (WAV-Load) zeigt jetzt **Laterne + Balken-Rahmen (0 %) + „0 %“** im exakt gleichen Layout,
  der Vor-Text „LADE MOOR …“ bleibt mittig über der Laterne (Anker `GAME_WIDTH / 2`, Guard
  `tests/boot-preload.test.ts` unverändert grün). Beim Phasenwechsel boot → loading springt
  nichts mehr: Laterne und Balken stehen ab dem ersten Phaser-Frame an ihren Endpositionen,
  der Balken füllt nur noch.

## Nachher-Beleg

- `~/games/.evidence/m10-loadscreen-continuity/boot-after/` — 34 Frames + Timeline-JSON
  (Kaltstart Desktop 960×540, `--stall-sfx` friert die Boot-Phase ein), **0 JS-Fehler**.
  Sichtung: Vor-Text mittig über Laterne, Balken-Rahmen 0 %, Hintergrund nightDeep —
  durchgehender Ladescreen-Stil.
- Geräte-Verifikation (APK) ist Vera-Infra und nicht Teil dieser Lane; der Fix berührt nur
  Phaser-Szenen und verhält sich view-unabhängig (X an `GAME_WIDTH` gekoppelt, Y-Anker an
  `GAME_HEIGHT`).

## Guards / Tests (#12684, Commit `e27f1f06`)

`tests/loadscreen-continuity.test.ts` (Quelltext-Guards, Muster `boot-preload.test.ts`):
1. Boot.preload nutzt `drawLoadingChrome` (eine Layout-Basis, Import aus `./Loading`).
2. Keine zweite Layout-Basis: Boot.ts enthält kein `fillRect`/`loading_lantern`.
3. Loading.create nutzt den Chrome, Duplikate gezählt (BG/Laterne je 1×).
4. `nightDeep` wird nur in `drawLoadingChrome` gesetzt (beide Phasen teilen den Ton zwangsläufig).
5. Vor-Text-X bleibt an `GAME_WIDTH` gekoppelt, kein 240er-Rest.

Ergebnis: 5/5 grün; Gesamtsuite **2412/2412** grün; `npx tsc --noEmit` grün; `npm run build` grün.

## Gesamt-Kaltstart-Dauer

Kein neuer Lade-Mechanismus: in der Boot-Phase kommen nur eine 9×14-Grid-Textur
(idempotenter Guard) + Graphics-Rahmen + 2 PixelText hinzu — Codepfad im preload, kein
zusätzlicher Task im Warmup. Desktop-Kaltstart im Shot-Lauf unverändert (Titel erreicht,
Timeline-JSON im Belegordner). Ein eigener ±10 %-Langlauf entfiel laut Supervisor-Steer.

## Karten

| # | Inhalt | Status |
|---|---|---|
| #12013 | Fix Vor-Phase im Ladescreen-Stil (Supervisor-Steer) | review |
| #12684 | Guard-Test `tests/loadscreen-continuity.test.ts` | review |
| #12685 | Lane-Doku + `.lane-done` | done |

## Offene Punkte

- Phase 1 (0–3,6 s schwarz vor dem ersten Phaser-Frame) ist WebView/APK-Start (Vera-Infra,
  escalations) — mit Spielcode nicht adressierbar.
- Art-director-Kurzsicht (≥ 4/5) laut Supervisor-Steer entfallen; bei der Merge-/Abnahme-
  Karte nachholen, falls gewünscht.
