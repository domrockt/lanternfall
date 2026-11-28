# Lane m10-boss-spawn-lower — Boss-Spawn-Komposition tiefer / HP-Leiste (A10-Restpunkt)

Board-Karten: #11208 (K1 Vorher-Messung), #11209 (K2 Fix + Test), #11210 (K3 Belege + Doku).
Commits: `ae15b31f` (K1), `2bf89348` (K2), K3 siehe letzter Commit der Lane.

## Auftrag

ACCEPTANCE-Restpunkt (art-director A10): „Boss spawnt am oberen Rand hinter seiner
HP-Leiste — Boss-Spawn-Komposition tiefer / HP-Leiste spaeter“. Fix in
`src/systems/BossSystem.ts` (Hebel `composedBossCenterY` / `BOSS_SAFE_TOP` /
`BOSS_HUD_CLEARANCE`), sodass der Boss-Körper beim Spawn **unter** der HP-Leiste
sichtbar beginnt. Spawn-Zeit, HP, Angriffe und Balance bitgleich unangetastet.

## Messaufbau (K1)

`scripts/m10-boss-spawn-lower.mjs` (Vorlage `m10-boss-shards.mjs`) misst im echten
Spawn-Pfad (`debugSpawnBoss` → `spawnBossAt` → `BossSystem.spawn` + `playBossIntroFx`
+ Banner-Guard) pro rAF das Boss-Sprite-Rect (worldView-Mapping, logische Screen-Pixel)
gegen das HP-Leisten-Rect (`ui.bossBarBg`, Container `bossGroup`). Zwei Szenarien je
Format: `idle` (Spawn ohne Eingabe, Freeze im Intro-Zoom-Peak bei ~180 ms) und
`run-down` (Spawn + 1,2 s Pfeil-runter über echte Tastatur — Kamera-Lerp folgt, der
Boss steigt im Screen-Raum). Formate: 640x360@1 und 780x360@3 (dpr 3; mit
`?rbscale=3` erzwungener Render-Teiler 3, sonst bleibt der Budget-Regler im leeren
Szene-Aufbau auf Teiler 1).

Belege: `~/games/.evidence/m10-boss-spawn-lower/`
(`m10-boss-spawn-lower-before.json` / `-after.json`, PNG-Shots je Szenario/Format,
Peak-Crops der 780er-Shots).

## Befund K1 (vor dem Fix)

1. **Teiler 1 (640x360@1): 0 Überlappung** in allen Frames beider Szenarien.
   Sprite-Top ≥ 161 px, HP-Leiste bottom = 52 px — die Komposition
   (`composedBossCenterY`, Banner-Kette `bossHudRects`) hält, was die Unit-Tests
   versprechen.
2. **Teiler 3 (780x360@3, `?rbscale=3`): Puls-Glitch-Frames.** Im Spawn-Moment
   kämpft der Intro-Zoom-Tween (`Run.ts:1882`, setzt `cam.zoom` **absolut** auf
   1,14) mit `enforceCameraProjection` (`src/config.ts`, setzt pro Frame
   `zoom = 1/Teiler`). Gemessener Zustand beim Peak (t=188 ms): `cam.zoom` liest
   0,333, während `worldView` 228x105 = 260/1,14 x 120/1,14 ist — d. h. es wurde
   ein Frame mit Zoom 1,14 bei Viewport 260x120 gerendert: **logische
   Magnifikation 1,14 · Teiler = 3,42**. In diesen Frames ist die Welt
   fehlskaliert/verschoben (Peak-Shot: Welt nur noch links im Canvas, UI untypisch,
   Boss kann aus dem Bild geflogen oder hinter dem HUD-Band stehen) — genau das
   Bild, das der Art-Director als „Boss am oberen Rand hinter der HP-Leiste“
   gemeldet hat. Der Robustheits-Proxy „780x360@3“ (Tablet unter Last, Teiler 2–3)
   trifft diesen Pfad im echten Lauf bei Minute 5/10/…, weil der Regler unter Last
   hochdreht.
3. Die Komposition selbst rechnete nur für Magnifikation 1,14 (Teiler-1-Annahme):
   `BossSystem.spawn` übergab pauschal `BOSS_INTRO_ZOOM`, nicht die teilerabhängige
   Puls-Magnifikation.

## Fix K2 (`src/systems/BossSystem.ts`, Commit 2bf89348)

`BossSystem.spawn` übergibt `composedBossCenterY` jetzt die **wahre logische
Puls-Magnifikation**:

```ts
const pulseZoom = BOSS_INTRO_ZOOM / (this.camera.zoom || 1); // = 1.14 * Teiler
```

* Teiler 1: `cam.zoom = 1` → `pulseZoom = 1.14` → **bitgleich** zum bisherigen
  Verhalten, solange der Zoom-Zweig nicht bindet (bindet nur bei stark nach oben
  zeigenden Spawn-Winkeln; siehe `BOSS_PULSE_TOP_BUFFER` unten).
* Teiler 3: `pulseZoom = 3.42` → der Zoom-Zweig von `composedBossCenterY` schiebt
  das Spawn-Zentrum so weit nach unten, dass selbst ein Puls-Glitch-Frame die
  Sprite-Oberkante bei ≥ `safeTop` (= Banner-Bottom + `BOSS_HUD_CLEARANCE` = 112,
  damit ≥ 60 px unter dem HP-Leisten-Bottom) hält — der Boss-Körper beginnt beim
  Spawn sichtbar **unter** der HP-Leiste.
* Spawn-Zeit, HP, Angriffe, Balance: unangetastet (nur der Kompositions-Y-Ausdruck;
  Ring-Abstand `bossSpawnDistance`, Leash-Anker = Spawn-Punkt bleiben unverändert).

### Tests (`tests/boss-spawn-composition.test.ts`)

36 neue Invarianz-Fälle (2 Views × 6 Bosse × Magnifikation 1,14·s, s = 1..3 ×
3 Spieler-Screen-Y × 72 Winkel): Sprite-Rect **UNTER** der HP-Leiste
(`rect.y >= hpBar.y + hpBar.h`), kein Schnitt mit HP-Leiste, kein Schnitt mit dem
Banner. `npm test` 2068/2068 grün, `npx tsc --noEmit` grün, `npm run build` rc=0.

## Nachher-Messung (K3)

`m10-boss-spawn-lower-after.json`: **0 Überlappungs-Frames in allen 4
Szenario/Format-Kombinationen** (Abnahmekriterium „0 Überlappung Boss-Sprite/
HP-Leiste im Spawn-Moment in beiden Formaten“ erfüllt; jsErrors=0, Renderer
geprüft). Abnahme-Shots: `shots/abnahme/m10-boss-spawn-lower-after-*.png`
(640 idle/run-down, 780x360@3 idle/run-down), art-director-Sichtung siehe unten.

## Befund für die Run.ts-Besitzer (NICHT in dieser Lane geändert)

Der sichtbare Rest-Artefakt bei Teiler ≥ 2 ist **nicht** in `BossSystem.ts`
heilbar: Im Puls-Frame stimmt die Kameraprojektion nicht (Zoom-Tween gegen
`enforceCameraProjection`), die **gesamte Welt** wird für 1–3 Frames
fehlskaliert/verschoben — das betrifft Spieler, Boden und Gegner gleichrangig.
Empfehlung an die Render-Budget-/Run-Lane: den Intro-Zoom-Puls teilerkompatibel
machen (Ziel-Zoom `1.14 / Teiler` statt absolut `1.14`, oder den Puls über
`window.__rbManual`-ähnliche Kooperation mit dem Regler führen). Bis dahin
dämpft der K2-Fix die Folge für den Boss-Spawn (Körper bleibt unter der Leiste).

## Art-director-Abnahme (K3)

**PASS, Note 4/5** (Ziel ≥ 4/5 erreicht). Einzelsichtung:

| Shot | Note | Befund |
|---|---|---|
| after-640x3601-idle | 5 | Kette Leiste → Banner → Boss sauber, Spawn-Halo, minTopBelowBar 117 px |
| after-640x3601-run-down | 4 | Boss klar unter Banner, 0 Überlappung; rote Top-Figur = Kartendeko (kein Boss) |
| after-780x3603-idle | 3 | Invariante ok (0 Überlappung), aber Boss im Zoom-Peak bei x=-42 teils off-screen — dem bekannten dpr3-Puls-Glitch zuzurechnen, erneute Sichtprüfung nach Run.ts-Klärung gefordert |
| after-780x3603-run-down | 4 | Boss-Gruppe klar unter Banner; Worst-Frame-Marge 0 px (Berührung) über das 1,6-s-Fenster |

Nachbesserungen und Disposition:

1. **Leistenkanten-Puffer (umgesetzt):** `BOSS_PULSE_TOP_BUFFER = 3`
   (`src/systems/BossSystem.ts`) — der Zoom-Zweig der Komposition beginnt jetzt
   3 px unter der sicheren Oberkante statt sie exakt zu berühren. Tests
   (boss-spawn-composition + boss-banner-layout, 88 Fälle) grün.
2. **dpr3-idle Off-screen-Splitter:** Folgeticket für die Run.ts-/Render-Lane
   (Puls-Glitch, siehe oben); erneute art-director-Sichtung genau dieses
   Spawn-Moments nach Klärung, bevor 5/5 möglich ist.
3. **zoom-*after*-Ansichten im Evidence-Ordner:** nachgeliefert
   (`~/games/.evidence/m10-boss-spawn-lower/zoom-m10-boss-spawn-lower-after-*.png`).

Hinweis zur 0-px-Marge im run-down-Fenster: die Komposition governiert nur den
Spawn-Augenblick (Marge dort ≥ 60 px zur Leiste); Frames danach folgen der
Verfolgungsbewegung — ein Boss, der später unter dem HUD-Band entlangläuft, ist
Spiel dynamics, kein Kompositionsfehler. Der 3-px-Puffer sichert zusätzlich die
komponierte Kante.

## Offene Punkte

* Puls-Glitch-Frames bei Teiler ≥ 2 (oben, Run.ts-Frage) — als Bedarf gemeldet,
  nicht in diesem Claim fixbar.
* `debugSpawnBoss` während eines laufenden Intro-Tweens eines anderen Bosses liest
  `cam.zoom > 1/Teiler` und unterschätzt dann die Magnifikation (Seltenfall,
  zwei Bosse spawnen im Spiel ≥ 5 min auseinander).
