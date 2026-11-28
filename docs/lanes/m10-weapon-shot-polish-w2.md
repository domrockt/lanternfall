# Lane m10-weapon-shot-polish-w2 — Drei optionale Qualitätsreserven (art-director)

**Ziel:** Umsetzung der drei „Optional"-Punkte aus dem art-director-Urteil der Lane
m10-weapon-shot-readability (docs/lanes/m10-weapon-shot-readability.md, PASS 4/5) — reine
Qualitätsreserve, kein Muss. Startete nach Abschluss der Evo-/VFX-Kette
(m10-evo-fx-soulpyre-w2, Kette hat Vorrang auf gen-fx.ts).

**Dateien (Disponent):** `src/gfx/gen-fx.ts`, `tests/weapon-shot-readability.test.ts`,
`docs/lanes/m10-weapon-shot-polish-w2.md`, `shots/m10-weapon-shot-polish-*`, `.lane-done`.

## Messwerkzeug (unverändert genutzt, nicht umgebaut — Lehre 08:18)

`scripts/m10-weapon-shot.mjs --tag=polish` (Playwright, dist-Build, seed=1): 6 Solo-Szenen +
300er-Chaos + Kontaktblatt. Keine FPS-/Echtzeit-Messung → ohne flock. Belege:
`~/games/.evidence/m10-weapon-shot-polish-w2/` (nicht in git; Abnahme-Bilder: `shots/abnahme/`).
Je Karte: Vorher = JSON/PNG des Laufs vor dem Edit (k1-before), Nachher = Lauf nach dem Edit.

## K1 — Thorn: je Spitze +1 px marshLight (#11909, Commit d8200afc)

`thornProjectileFrame()`: nach der dunklen 28er-Spitzenkappe setzt je Speiche ein
marshLight(31)-Glint-Pixel perpendicular neben der Kappe (Seite wechselnd je Speiche, Offset
1.3 — bei 0.9 landet das Glint in der vorhandenen hellen Zone bzw. überschreibt die Kappe,
belegt via Frame-Diff). Die dunkle Kappe bleibt Lesbarkeits-Anker auf hellem Grund; die
Spitzen-Signatur (schwach im Moor-Chaos) wird stärker.

- Tests: 68/68 (weapon-shot-readability 57 + evo-fx-dornensturm 11), tsc rc=0.
- Messung: A7 Textur 0 %, Chaos worst 0,05 % (<= 4,16 %); thorn meanContrast 1,77 → 1,59
  (Chaos-Sampling-Rauschen ±0,3–0,5 über Läufe, kein Trend — Paar-Tests sind das verbindliche
  Trennkriterium). Belege: `k1-before-*` / `k1-after-*`.
- Hinweis: Der Runner-Checkpoint e99a07f2 (#11909 WIP) enthielt zwischenzeitlich die
  kapppen-destruktive 0.9-Variante; final ist die 1.3-Variante (Kappen intakt, Frame-Diff:
  4 Kappen restauriert, 5 neue Glint-Pixel, 1 Glint überlagert marsh(30) mit marshLight).

## K2 — Storm: Zickzack asymmetrisch staffeln (#11910, Commit e46776a1)

`boltFrame(..., asym = true)`: nur Signaturpfad. Auslenkung asymmetrisch — positive Wellen
(Rechtsbäuche) mit Gain 1.55 + 0.1·(seed%3), negative mit 0.55. Frame 0 (Signatur-Referenz):
Rechtsbäuche +2/+3 px, links nur -1; 7 Zeilen vs. vorher verschoben (Frame-Diff belegt).
Das mechanische Alterniermuster ist gelöst, zusätzliche Trennung vom blassen Flail.
Legacy-Pfad (`shotsig=0`) bleibt bitgleich (`asym=false`).

- Tests: 77/77 (+atlas), tsc rc=0. A7 Textur 0 %, Chaos 0,2 %. Belege: `k2-after-*`,
  Crop `k2-after-sheet-storm-flail-4x.png` (Storm vs. Flail klar getrennt).

## K3 — Ember: 2 hellere Kernpixel unter der A7-Grenze (#11911, Commit d5aaa215)

`projectile_ember` rows[4]: `0fghih0` → `0fghjj0` — zwei flameBright(19)-Pixel (r 239 / g 145,
erfüllt A7 r>=235 aber g<150 → **kein** Near-White) an der Kopfzone. Holt die heiße
Kernidentität zurück, ohne den A7-Trade zu opfern. Kern-Index bleibt 17 (Paar-Tests unangetastet).

- **Dokumentierte Alternative (geprüft, nicht umgesetzt):** vollständiger Kern-Swap auf 19
  wäre mit allen 15 Paaren konform (WCAG/Distanz gegen alle anderen Kerne; 19 teilt keine
  Farbe mit fremden Nicht-Kern-Paletten jenseits Ink) — falls ein künftiges Urteil mehr
  Kernhelligkeit will, ist das der vorbereitete nächste Schritt.
- Tests: 77/77, tsc rc=0. A7 Textur 0 %, Chaos 0 %. Belege: `k3-after-*`,
  `k3-after-sheet-ember-flail-4x.png`.

## Abnahme (Gesamt)

- `npx vitest run` Full-Suite: **2243/2243 grün** (201 Files); `npx tsc --noEmit` rc=0;
  `npm run build` grün.
- 15 Paar-Tests grün (Kern WCAG >= 1,4 ODER RGB-Dist >= 110; geteilte Nicht-Kern-Farben <= 3;
  XOR >= 8 px; Flächen paarweise verschieden). A7-Near-White: Texturen exakt 0 % in allen
  drei Nachher-Läufen; Chaos worst je Lauf 0,05 % / 0,2 % / 0 % (<= 4,16 %).
- Trefferverhalten bitgleich: `CombatSystem.ts`/`ProjectilePool.ts` nicht berührt (git diff
  leer für beide Dateien); nur Textur-Inhalt in gen-fx.ts.
- Belege: `~/games/.evidence/m10-weapon-shot-polish-w2/` (k1-before/k1-after/k2-after/k3-after
  je Chaos300 + Kontaktblatt + 6 Solos + JSON). Abnahme-Bilder in git: `shots/abnahme/`.
- Bekannt, nicht neu: 6 jsErrors `ReferenceError: run is not defined` im Mess-Skript
  (Solo-Szenen) — stehen schon 1:1 in der after.json der Vor-Lane (Skript-Kosmetik).

## art-director-Kurzurteil (2026-11-28)

**PASS — Note 4,5/5.** „Alle drei Optional-Punkte sind optisch gelöst. K1 Thorn: marshLight-Glints
sitzen präzise neben den dunklen 28er-Spitzenkappen … heben die Silhouette klar vom grünen Grund
ab, ohne als Rauschen zu wirken. K2 Storm: Das mechanische Alterniermuster ist weg … klar von
Flail und Frost unterscheidbar. K3 Ember: 2 flameBright-Kernpixel geben heiße Spitze und
Kern-Identität, sauber unter der A7-Grenze. Neue Makel: keine gefunden." Muss neu: — /
nachbessern: — / ok: Thorn, Storm, Ember, Lantern, Frost, Flail.

## Offene Punkte / Hinweise

- Chaos-Kontrast-Schwankungen (±0,3–0,5) zwischen Läufen sind Sampling-Rauschen
  (Gegner-Anordnung/Zentren variieren); verbindlich bleiben die Paar-Tests + A7-Grenzen.
- `SPRITE_GRIDS.projectile_ice` (textures.ts, fremd) weiterhin Alt-Stand — siehe Vor-Lane-Doku.
- Board-Karten: #11909-#11912 (reservierter Block).
