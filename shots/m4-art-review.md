# Lanternfall — M4 Art-Director-Abnahme, Runde 9

**Datum:** 2026-11-25
**Prüfbasis:** GAME.md „Grafik-Qualitätslatte“, ART.md (Rampen, 1-px-Kontur, Licht oben-links, ≥3 Stufen,
kein 1-px-Rauschen, keine Innen-Tinte, Tier-Akzent **2×1 px pro Auge auf Index-2-Höhle**), `src/palette.ts`.
**Neu in Runde 9:** `shots/m4-enemy-bogzombie.png` (8×, 09:45), `shots/m4-sheet-enemies.png` (09:48),
`shots/m4-enemy-roster.png` (09:49), Quelle `scripts/art/gen_enemies.py` und Laufzeit-Grid `src/gfx/gen-enemies.ts`.
Geprüft zusätzlich per ASCII-Dump der Grid-Zeilen (Pixel-Nachbarschaften) und Pixel-/Paletten-Histogramm.
Vergrößerungen (`-filter point`, nichts verzerrt): `shots/tmp/r9/`.

**Palette:** `m4-sheet-enemies.png` 30 Farben, **0 Off-Palette-Pixel**. Das Einzel-PNG enthält nur zusätzlich
transparentes Schwarz (`00000000`, Alpha 0) — kein sichtbarer Off-Palette-Pixel.

**Nicht-Grafik:** Der `gargoyle`-Verify-Flake war ein Messfenster (Orbiter 7 s → 11 s), kein Asset-Problem;
für die Grafikabnahme ohne Belang.

## Rundenhistorie 1–8 (kurz)

| Runde | Unter 4 / Befund | In der Folgerunde behoben |
|---|---|---|
| 1 | Referenz-Assets flach, Kontur/Rauschen, Licht nicht durchgängig | Rampen-/Kontur-Regeln |
| 2 | Re-Check der Referenzen noch nicht Latte | Mira/Leuchte nachgezogen |
| 3 | Tiles mit Rauschen/Nähten, dunkle Gegner, PS flach, Icons unleserlich, FX/UI-Belege fehlten | Tiles-Generator, Aufhellung, erste Boss-/Icon-Ansätze |
| 4 | **Nicht bestanden**, ~8 Assets <4 (u. a. wraith/voidcaller, PS, `p_boots`, `w_flail`, `evo_*`), Boss-Fight-/FX-Belege | Icons neu, Gegner aufgehellt, PS umgebaut, FX exportiert |
| 5 | Re-Check (kein schriftliches Ergebnis abgelegt) | Sheets/Einzelassets neu erzeugt |
| 6 | **Nicht bestanden:** Figuren 3, Gegner 3, PS 3, Tiles 3, In-Game 2; FX/UI 4 | Runde 7 |
| 7 | **Nicht bestanden:** Gegner 3 (`mudling`/`crow`/`bogzombie` 1×1-Akzente, Tier-Labels über den Leisten); alles andere ≥4 | Runde 8 |
| 8 | **Nicht bestanden:** nur `bogzombie` — 2×1-Akzent lag auf der 31-Kopfzeile und war unsichtbar; Layout behoben, `mudling`/`crow` behoben | Runde 9 |

## Runde 9 — Prüfung des Restblockers `bogzombie`

| Punkt | Ergebnis |
|---|---|
| Kopf-Aufbau | **Behoben.** `gen_enemies.py`: Kopf 9 px breit (`ellipse(8, 4-bob, 4, 3, b)` mit Grundton 30), Licht 31 nur als Oberkante (Zeile 0–1), 1-px-Kontur 0 außen. Kopfkante neben dem linken Auge auf 30 gehalten. |
| Augenpaar | **Behoben.** Höhlen `g.rect(6, 4-bob, 2, 2, 2)` / `g.rect(10, 4-bob, 2, 2, 2)` (je 2×2, Index 2), Akzente `(6..7, 4-bob)` und `(10..11, 4-bob)` = **2×1 px 31**. Grid-Nachbarschaft für Frame 0: Akzent `(6,3)=31`, **oben 30**, links 30/Kontur, rechts 30, unten 2 — der Streifen hebt sich vom Kopf-30 ab. Frame 1 analog (Zeile 4). |
| Braue/Block? | **Nein.** Bei 8× (`m4-enemy-bogzombie.png`) und 5× (Bogen) liest jedes Auge als heller 2×1-Streifen mit dunkler 2×1-Höhle darunter, seitlich von Kopf-30 gefasst. Der 31-Streifen ist durch zwei 30-Zeilen von der 31-Oberkante getrennt (kein Zusammenwachsen), kein 2×2-Block. |
| ART.md Regel 10 | **Erfüllt.** 2×1 px Tier-0-Akzent 31 pro Auge, sichtbar, auf Höhle Index 2 (nicht 0); Mundnaht vor den Augen gezeichnet, untere Augenzeile bleibt intakt (Höhle 2×2, nicht angeschnitten). |
| Bogen-Layout | **Ok.** `contact.py` weiter `cells_h=268`, `sy=y+168`; `TIER 3/4` stehen in freiem Raum über den F0–F3-Leisten der Vorzeile, keine Überlappung (6× geprüft), alle 30 Zellen und Leisten vollständig. |
| Roster | **Ok.** Neuer `m4-enemy-roster.png` (09:49, nach der Neugenerierung) zeigt die Gegner in Spiellaute, HUD `LV 1 / 00:00 / KILL 0` vollständig, keine Darstellungsfehler. Die Bogzombie-Akzente sind dort bei 3× klein, aber vorhanden; der 8×-Beleg ist maßgeblich. |
| Randnotiz | Die untere rechte Höhlen-Ecke (11,4) ist Index **1** (Schatten von 2 aus der RAMPS-Tabelle), kein Ink, als Kontur-/Höhlenschatten unkritisch. |

## Notentabelle (final)

| Asset / Gruppe | Note | Begründung (konkret, aus Bögen/Shots) |
|---|---|---|
| **Spielfiguren Mira + Kael** | **4** | 4 Richtungen × 4 echte Laufposen ohne Frame-Gleichheit, 2-px-Hub, Hit mit 2-px-Neigung, Porträts 48 px vollständig, Kael-Bart lesbar. |
| **30 Gegner** | **4** | 30 eindeutige Silhouetten, 2–4 Frames, 3 Töne, Tier-Farben 31/11/20/26/13. Alle drei 16-px-Sprites jetzt mit **sichtbarem** 2×1-Akzent auf dunkler Höhle (`mudling`, `crow`, `bogzombie`); `bogzombie` zusätzlich mit Kopf-Rampe 30/31 und intakter 2×2-Höhle. Slime/Treant/wraith/voidcaller unverändert ≥4-Niveau. Bogen-Layout sauber, 30 Zellen, F0–F3 vollständig. |
| **6 Bosse** | **4** | Sechs klar unterscheidbare Silhouetten, 3 Frames, Wind-up an die Mechanik gekoppelt, PS-Sichel 2-px-Band, Falten keilförmig. PS-Sichelspitze am rechten Auge bleibt kosmetisch (bei 2× ok). |
| **Tiles / Terrain** | **4** | Ruhiges Gras (2×2-Büschel), Weg 17-dominant mit 15/16-Rändern und Kiesgruppen, Ufer 2 px Schlamm + 2 px Schaum, Wasserwellen, Deko in Gruppen, weicher Lichtpool. Politur offen: Schilf-Beleg, große 18-Flächen im Weg. |
| **FX / Projektile** | **4** | Durchgehende 2-px-Ringe, lesbare Projektile/Truhe/Kristalle, palette-rein, keine Innen-Tinte-Probleme. |
| **Icons / UI** | **4** | 18 distinkte 16-px-Icons, 9-Slice-Rahmen mit Goldnieten, Level-up-/Truhen-Panel, Emblem; kosmetisch 1-px-Haken am Emblem, harte Truhen-Ringe. |
| **In-Game-Shots** | **4** | HUD vollständig lesbar (LV/Timer/KILL, XP-Balken unter den Glyphen), Timer 02:00/12:00/22:00, CharSelect ohne Debug-Label, Boss-Fight vollständig im Bild, neuer Roster ohne Fehler. Hinweise: Run-Shots sind debug-gestaged; Boss-Name berührt die Leistenoberkante (Politur); additiver Lichtkreis bleicht Mira im Zentrum. |

## Unter 4 — muss nachgebessert werden

**Keine.** Alle sieben Gruppen erreichen die Latte (Note 4). Es gibt keinen Abnahme-Blocker mehr.

## Abnahme-Urteil

**BESTANDEN.** Die M4-Grafik erfüllt die Qualitätslatte aus GAME.md/ART.md in allen geprüften Gruppen:
Spielfiguren, 30 Gegner, 6 Bosse, Tiles/Terrain, FX/Projektile, Icons/UI und In-Game-Darstellung.
Der letzte Blocker (`bogzombie`-Augenakzent) ist sichtbar behoben (2×1 31 auf 30-Kopf über 2×2-Höhle),
das Bogen-Layout ist entzerrt, und der neue Roster belegt die Gegner in der Spiellaute.

**Restblocker:** keine.

**Politur für später (nicht abnahmerelevant):**
- `pale_shepherd` F0: Sichelspitze 2 px von der Augenpartie wegrücken.
- `UI.ts`: Boss-Name 2 px höher (y=31), damit die Glyphen die Leistenoberkante nicht berühren.
- `tiles.ts`: Schilf am gekrümmten Ufer belegen/erhöhen, große 18-Flächen im Weg in 2×2-Kies auflösen.
- Titel-Emblem: 1-px-Haken als 2-px-Sicheln; Truhen-Glow von drei harten Ringen auf einen 2-px-Ring + ADD-Schein.
- Belege: Run-Shots sind debug-gestaged (kein „echter“ Lauf als Bildbeleg).

**muss neu:** nichts.
**nachbessern:** optional die Politur-Punkte oben.
**ok:** Spielfiguren (4), 30 Gegner (4), 6 Bosse (4), Tiles/Terrain (4), FX/Projektile (4), Icons/UI (4),
In-Game-Shots (4).
