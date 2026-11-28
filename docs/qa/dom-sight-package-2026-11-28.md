# Dom-Sichtungs-Paket — Qualitäts-Durchgang Grafik/Effekte (2026-11-28)

Für Dom: Nach der formalen Abnahme folgt dieser Qualitäts-Durchgang bis zur
Sichtabnahme („Doms Auge entscheidet, nicht die Art-Director-Note"); danach erst
v1.0-Markierung. Alles liegt bereit; **bewertet wird, was Du siehst — die Note
dieses Dokuments ist nicht die Abnahme.**

## Wo sind die Belege?

| Block | Ort |
|---|---|
| Frische Sichtungs-Shots (13 Motive × 640x360 **und** 1280x720) | `~/games/.evidence/dom-sight/*.png` (+ je Sidecar-JSON mit Renderer/Szene/Zeit) |
| Gesamtmanifest (Renderer, Katalog aller 72 Belege, JS-Fehler) | `~/games/.evidence/dom-sight/dom-sight-manifest.json` |
| Waffen-/Evo-GIFs (12) | `shots/qa-vfx-*.gif` |
| Gegner-/Boss-/Helden-Galerien | `shots/m10-art-contact-{1x,4x}-*.png` |
| Evo-After-Belege der Kette | `shots/m10-evo-fx-*-after-640.png` |
| form-polish-After-Shots (Lane-Branch, nicht in main) | Git-Objekt `m10-evo-fx-form-polish:shots/m10-evo-fx-form-polish-after-*-640.png` (`git show`) |

Alle selbst erzeugten Shots tragen den iGPU-Renderer-String im Sidecar
(`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`); SwiftShader-Läufe
sind per Skript-Guard ausgeschlossen. Existenz aller Belege prüfbar mit
`node scripts/m10-dom-sight-package.mjs verify` (Exit != 0 bei Fehlendem).

## Dein Bewertungsmaßstab (je Punkt ein konkreter Prüfauftrag)

**(a) Element-Identität ohne Beschriftung.** Öffne je ein 1280x720-GIF der
Elementfamilien (Feuer: `shots/qa-vfx-ember.gif`, `qa-vfx-phoenix.gif`; Eis:
`qa-vfx-frost.gif`, `qa-vfx-eternal_winter.gif`; Blitz: `qa-vfx-thunder_seal.gif`,
`qa-vfx-storm.gif`; Seele: `qa-vfx-soul_beacon.gif`, `qa-vfx-wrath_pendulum.gif`)
und entscheid bei jedem, ob Du ohne Beschriftung das Element nennen kannst.
Prüfauftrag: Wenn zwei Familien bei geblendetem Dateinamen verwechselbar bleiben,
ist das ein Befund (Namen notieren, nicht raten).

**(b) Dither-Disziplin.** Gehe die 4x-Kontaktblätter
`shots/m10-art-contact-4x-enemies-tier0..4.png` und `m10-art-contact-4x-bosses.png`
durch. Prüfauftrag: Dither darf nur an Übergangskanten in 1–2 px Tiefe stehen,
Kerne müssen flächig hell und Formen organisch bleiben — markiere jede Textur, bei
der Dither Flächen füllt statt Kanten zu begleiten.

**(c) Eine Pixelgröße / keine Mixel.** Nutze die 1x-Blätter
(`m10-art-contact-1x-*.png`) gegen die 4x-Blätter desselben Motivs. Prüfauftrag:
Jedes Motiv muss in beiden Blättern aus einer einzigen Texelgröße bestehen; schon
ein fraktionaler Scale-Schritt (Mixel) ist ein Befund — das Zahlformat der
Draw-Metriken dazu steht ggf. im Sidecar-JSON des jeweiligen Motivs.

**(d) Lesbarkeit in Masse.** Öffne `~/games/.evidence/dom-sight/minute-20-*.png`
und `minute-30-*.png` (beide Formate; Minute 30 zeigt den Endboss „Der Hohle
König" im Kampf). Prüfauftrag: Gegner-Silhouetten, Feind-FX und eigener Build
müssen sich im Schwarm ohne Zählen unterscheiden lassen; egal, ob Du erst im
1280er und dann im 640er schaust — im 640er dürfen keine Informationsklasen
verschwimmen, die im 1280er lesbar sind.

**(e) „Kommerziell auslieferbar?".** Danach der Gesamteindruck über Titel
(`title-*.png`), Boot (`boot-*.png`), Charakterauswahl (`charselect-*.png`),
Optionen (`options-*.png`), Pause (`pause-*.png`), Results (`results-*.png`) und
das Truhe-Reveal (`chest-reveal-*.png`). Prüfauftrag: Ein Ja/Nein plus der
eine Satz, was Dich am ehesten am Shippen hindern würde — dieser Satz ist die
v1.0-Entscheidung, nicht eine Summe von Kleinstnoten.

## Offene Restpunkte (bewusst getrennt von den Belegen)

- **Halo-Überstrahlung Ember:** bekannter, noch offener Restpunkt (Qualitätsliste
  21:45Z). Beim Blick auf `shots/qa-vfx-ember.gif` bitte bewertet wissen, dass der
  Fix im Fluss ist — der Shot zeigt den Stand **vor** dem Fix.
- **form-polish-After-Shots** liegen nur auf dem Lane-Branch
  `m10-evo-fx-form-polish` (Merge d73ab80 ohne Lane-Shots); Bewertung dieser
  Evos stützt sich zusätzlich auf die main-Belege `m10-evo-fx-*-after-640.png`.
- **Im Fluss:** die 6 auf den Vera-Guard wartenden -r2-Code-Lanes (Lane-Branches,
  nicht gemergt, maßgebliche Liste in `~/games/.dispatch/claims.json`). Ihre
  Graphik-/FX-Belege sind **nicht** Teil dieses Pakets; nach dem Guard können
  betroffene Motive nachgefordert werden.
- `minute-30` zeigt den Endboss-Kampf (Announce-Panel + Boss); ein schwarmlastiger
  Moment ohne Boss steht bei `minute-20` bereit.

## Ablage-Regeln

Die frischen Shots liegen absichtlich **ungetrackt** unter `~/games/.evidence/`
(Repo-Hygiene 061e70b); im Repo lebt nur Doku + das Beleg-Skript
`scripts/m10-dom-sight-package.mjs` (capture/verify). 0 JS-Fehler in den Läufen,
iGPU-Renderer in jedem Sidecar.
