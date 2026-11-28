# Lane m10-dom-sight-package (r2/r3) — Doms Sichtungsmaterial

**Auftrag (Dom 06:00Z):** Nach der formalen Abnahme folgt ein Qualitäts-Durchgang
Grafik/Effekte bis zur Sichtabnahme durch Dom — „Doms Auge entscheidet, nicht die
Art-Director-Note"; danach erst v1.0-Markierung. Dieses Paket stellt das
Sichtungsmaterial bereit: **KEINE Code-Änderungen am Spiel** — nur Belege sammeln
+ Anleitung schreiben.

**Karten:** #9983 (K1 Screenshots), #9984 (K2 Katalog), #9985 (K3 Anleitung).
**Vorläufer:** r2 brach nach 2 min ab (Sitzung degenerierte in leere Shell-Aufrufe,
kein Beleg) — r3 unveränderter Neu-Anlauf als main-Job (0 Spielcode-Änderungen,
kein Lane-Bedarf).

## Tooling

`scripts/m10-dom-sight-package.mjs` (Karte #9983):

- `capture` — erzeugt alle K1-Shots je 640x360 **und** 1280x720 (dpr 1) unter
  `~/games/.evidence/dom-sight/` (bewusst ungetrackt, Repo-Hygiene 061e70b), je Shot
  ein JSON-Sidecar mit WebGL-Renderer-String, Szene, Zeit, Gegnerzahl.
  **SwiftShader-Guard:** Software-GL (`SwiftShader|llvmpipe|softpipe|BasicRender`)
  lässt den Lauf fehlschlagen. Boot-Szene über verzögerte sfx-Preload-Route
  sicher sichtbar gemacht.
- `verify` — prüft die Existenz **jedes** im Katalog aufgeführten Belegs
  (Worktree-Datei, Git-Objekt auf Lane-Branch oder Evidence-Datei) + Renderer-Policy
  + 0 JS-Fehler. **Exit != 0 bei fehlender Datei.**

## K1: Selbst erzeugte Sichtungs-Shots (Stand a6613639)

- **Belege:** 13 Motive × 2 Formate = 26 PNG + 26 Sidecar-JSON in
  `~/games/.evidence/dom-sight/` + `dom-sight-manifest.json` (Renderer, Katalog, jsErrors).
- **Renderer (beide Formate):** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`
  — iGPU-Nachweis erfüllt, kein SwiftShader.
- **JS-Fehler:** 0 (Capture- und Verify-Lauf).
- **Motive:** `boot` („LADE MOOR ..."), `title`, `options`, `charselect-kael`,
  `charselect-mira`, `minute-01/05/10/20/30`, `chest-reveal` (Reveal-Animation
  ~0,45 s nach `openChest()`, Minute 10), `pause`, `results`.
- **Sichtprüfung (Lead):** boot zeigt Ladetext; chest-reveal zeigt TRUHE-Panel mit
  Belohnung; minute-30 zeigt Endboss „Der Hohle König" mit Announce-Panel und
  Boss-Kampf in Masse; pause zeigt Pause-/Build-Panel. Formate exakt 640x360/1280x720.

## K2: Katalog bestehender Belege (46 Einträge, Stand siehe Manifest)

Gruppen (Pfade + Stand je Eintrag in `dom-sight-manifest.json` → `catalog`):

| Gruppe | Pfade | Stand |
|---|---|---|
| Waffen-/Evolutions-GIFs (12) | `shots/qa-vfx-{ember,flail,frost,lantern,storm,thorn,eternal_winter,phoenix,soul_beacon,thorn_storm,thunder_seal,wrath_pendulum}.gif` | untracked im main-Worktree (`shots/*` gitignore, kein Commit) |
| Gegner-Galerie (30) | `shots/m10-art-contact-{1x,4x}-enemies-tier{0..4}.png` (10 Kontaktblätter) | main @ cb920c56 (2026-11-28) |
| Boss-Galerie (6) | `shots/m10-art-contact-{1x,4x}-bosses.png` | main @ cb920c56 |
| Helden-Galerie (2) | `shots/m10-art-contact-{1x,4x}-heroes.png` | main @ cb920c56 |
| Evo-After phoenix/winter/winter-w2/soulpyre/zornpendel/gewittersiegel | `shots/m10-evo-fx-<link>-after-640.png` (+ je `.json`) | main @ cb920c56 |
| Evo-After dornensturm | `shots/m10-evo-fx-dornensturm-after-640.png` (+ `-after.gif`) | main @ cb920c56 / f1e0caa2 |
| Evo-After form-polish (6) | `shots/m10-evo-fx-form-polish-after-{phoenix,eternal_winter,soul_beacon,thorn_storm,thunder_seal,wrath_pendulum}-640.png` | **Lane-Branch** `m10-evo-fx-form-polish` @ cd0ecb18 (Merge d73ab80 wurde ohne Lane-Beleg-Shots gemergt) |

## Verify-Beleg

```
$ node scripts/m10-dom-sight-package.mjs verify
ok: alle 46 Katalog-Belege + 26 Shots vorhanden, Renderer iGPU, 0 JS-Fehler   (exit 0)
```

Negativtest des Mechanismus: verify prüft Worktree-, Git-Objekt- und Evidence-Pfade
und meldet Fehlstände mit Exit 1 (z. B. fehlendes Sidecar, Software-GL-Renderer,
JS-Fehler im Capture).

## Offene Restpunkte

- **Halo-Überstrahlung Ember** — bekannter Restpunkt aus Doms Qualitätsliste
  (21:45Z), im QA-Dok als offener Punkt ausgewiesen.
- **form-polish-After-Shots** liegen nur auf dem Lane-Branch (kein main-Commit);
  nachMerge-Rückkehr der Shots in main sollte der Katalog aktualisiert werden.
- **Im Fluss (Stand ~08:00Z):** die 6 auf den Vera-Guard wartenden -r2-Code-Lanes
  (Lane-Branches unter `lf-lanes/`, nicht gemergt); deren Belege sind **nicht Teil
  dieses Pakets** und nach dem Guard ggf. neu zu belegen. Liste maßgeblich in
  `~/games/.dispatch/claims.json` (Disposition).
- Der Boss-Banner-Moment in `minute-30` zeigt den Endboss-Kampf — ein reiner
  „Minute-30-Schwarm"-Shot ohne Boss liegt bei Minute 20 (`minute-20`).

## Abnahme

- Paket-Skript-Verify exit 0 (alle Belege vorhanden, iGPU, 0 JS-Fehler) ✔
- `npm run build` grün, `npx vitest run` 1698/1698 ✔ (Stand a6613639)
- git status nach Abschluss: nur committete Doku; neue Belege ausschließlich
  ungetrackt unter `~/games/.evidence/` ✔ (0 Spielcode-Änderungen, 0 getrackte Shots)
- Worktree dirty=0 ✔
- commit-gate PASS (2026-11-28, ses_dded1a598ffeKhpNtWQ30tmpOk)
