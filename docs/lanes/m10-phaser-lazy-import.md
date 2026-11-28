# Lane m10-phaser-lazy-import — Phaser dynamisch importieren (2026-11-28)

Auftrag: Hebel-Empfehlung aus Bedarfsmeldung m10-bundle-split. Chunk-Split war warnfrei,
aber phaser (1,19 MB raw, gzip ~318 kB) lud weiterhin upfront statisch in `src/main.ts`.
Ziel: Kaltladezeit bis Titel senken, ohne `src/scenes/**`, `src/gfx/**`, `src/systems/**`
(Belegung m10-run-cpu-budget) und ohne `warmup.ts` (m10-loading-screen, Merge steht aus) anzufassen.

## Karten

| Karte | Inhalt | Commit |
|---|---|---|
| #11832 K1 | Probe-Skript `scripts/m10-phaser-lazy.mjs` + Vorher-Messung | 83f096ae |
| #11833 K2 | 2-Phasen-Boot in `src/main.ts`, Fehler-Overlay in `index.html` | c642987e |
| #11834 K3 | Guard-Test `tests/phaser-lazy-import.test.ts` (Quell-Scan) | 2a8e1799 |
| #11835 K4 | After-Messung + diese Doku + `.lane-done` | (dieser Commit) |

## Fix (K2)

`src/main.ts` importiert phaser nicht mehr statisch. Boot-Pfad in zwei Phasen:

- **Phase 1 (blockiert bis Titel):** `Promise.all([import("phaser"), import("./debug"),
  import("./scenes/Boot"), import("./scenes/Title")])` → `new Phaser.Game({ scene: [Boot, Title] })`.
  Statisch bleiben nur phaser-freie Module (`./config`, `./logic/view`, `./audio/settings`);
  `Run` wird nur als `import type` referenziert (buildzeitentfernt).
- **Phase 2 (sofort parallel angestossen, blockiert nicht):** `CharSelect`, `Run`, `UI`,
  `Results`, `Credits` laden per `import()` und werden per `scene.add(key, cls, false)`
  registriert. `scene.start()` in den Szenen löst per Key auf — **keine Änderung an
  src/scenes/\*\*** nötig. Kein Polling: beide Phasen warten auf ihr Promise.
- **Fehlerfall:** `#lf-boot-error`-Overlay in `index.html` + `showBootError()` in main.ts —
  klare Meldung statt weisser Screen.

## Messwerte (Probe `scripts/m10-phaser-lazy.mjs`, je 3 Läufe, frischer Context = kalter Cache)

Belege: `~/games/.evidence/m10-phaser-lazy-import/m10-phaser-lazy-{before,after}.json`.
Renderer in allen Läufen: `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` —
gültig, kein SwiftShader. 0 JS-Fehler in allen Läufen.

| | Vorher | Nachher |
|---|---|---|
| Kaltladezeit bis Titel (avg) | 2070 ms | 2055 ms |
| Kaltladezeit bis Titel (min) | 1946 ms | 1898 ms |
| Entry-Chunk (gzip) | **81,4 kB** (264 kB raw, komplette App) | **4,46 kB** (10,7 kB raw) |
| Chunks gesamt | 6 | 26 |
| Total gzip (alle Chunks) | 471 kB | 483 kB (+Chunk-Overhead) |
| phaser-Chunk | 317,0 kB gzip | 317,0 kB gzip (unverändert, eigener Chunk) |

### Verbindliche Auswertung

1. **Lokal (localhost, Parse-Domäne) ist die Titelzeit ~flach** (2070 → 2055 ms avg, −0,7 %;
   min −2,5 %). Das war zu erwarten nach dem Import-Graph-Befund: **Der Titel braucht Phaser
   zwingend** — die 317 kB gzip Phaser können den Titel-Pfad NICHT verlassen, solange der
   Titel eine Phaser-Szene ist. Die Briefing-Erwartung („signifikanter Teil der 318 kB aus
   dem kritischen Pfad“) ist so nicht haltbar; das ist der zentrale Befund dieser Lane.
2. **Realisiert wurde stattdessen:** ~111 kB gzip App-Code sind vom Titel-Pfad abgekoppelt
   (Entry 81→4,5 kB, Run 41,5 kB, UI 11,9 kB, CharSelect 2,2 kB, Results 3,6 kB, Credits 1,3 kB
   kommen jetzt nach/parallel zum Titel). Vorher musste die komplette App (471 kB gzip) vor
   der ersten Code-Ausführung stehen; jetzt ist die App-Shell bei 4,5 kB gzip — First
   Paint/Fehlermeldung kommen deutlich früher, auf dem Android-Zielfunknetz proportional
   zur eingesparten Vorlaufmenge (~111 kB gzip ≈ 0,6 s bei Fast-3G-Bandbreite).
3. Headless-Smoke Titel→CharSelect→Run (Phase-2-Registrierung unter Realbedingungen):
   Szene `run` erreicht, 0 JS-Fehler (Skript `~/tmp/m10-phaser-lazy-import/smoke.mjs`).
4. **Restrisiko Race Titel→CharSelect (dokumentiert, nicht behoben — Szenen sind
   gesperrt):** Der Titel ist interaktiv, bevor Phase 2 `scene.add("charselect")`
   ausführt. Drückt ein Nutzer auf einem langsamen Netz innerhalb dieser Sekunden
   "Start", geht der Klick ins Leere (Phaser-Warnung, Szene fehlt). Lokal und im
   Headless-Smoke nicht reproduzierbar (Phase-2-Chunks kommen lange vor menschlichem
   Input). Mögliche Folgekarte: Retry/Queue im Title-Input oder Szenen-Registrier-
  ung früher abschliessen.

### Mess-Skript-Befund (Bedarf, nicht behoben)

`--throttle` per CDP `Network.emulateNetworkConditions` (Fast 3G) wirkte im Harness **nicht**
auf localhost-Transfers (847 kB music_run.wav in 19 ms ≈ 350 Mb/s; throttled avg 1834 ms <
unthrottled 2070 ms → Beleg invalid). Skript-Edit-Limit (Argus) erreicht, deshalb kein
dritter Versuch. **Bedarf:** echte Netz-/CPU-Drosselung über `scripts/android-proxy.mjs`
bzw. Geräte-Telemetrie (`http://10.10.50.185:5180/latest`), um den Netzgewinn (Punkt 2)
empirisch zu belegen.

## Resthebel (nicht diese Lane)

1. **warmup.ts / Loading-Screen** (m10-loading-screen, bewusst unberührt): kann die
   Wartezeit bis Titel visuell füllen und Phase 2 weiter entschärfen.
2. **Einziger Weg, die vollen 318 kB Phaser wirklich aus dem Titel-Pfad zu nehmen:**
   phaser-freier Titel (DOM/Canvas-Vorspann), Phaser erst beim Spielstart laden —
   grosser Umbau, eigene Lane wert.
3. Vite `manualChunks`: die 26 kleinen Chunks (Retry-/Overhead auf mobil) könnten
   gebündelt werden; Gewinn klein, Risiko für andere Lanes.

## Abnahme

- `npm run build` rc=0, **keine** Chunk-Warnung (vorher wie nachher warnfrei).
- `npm test`: 200 Dateien / 2230 Tests, 0 fail (inkl. 6 neue Guard-Tests).
- Headless-Smoke: Titel lädt, 0 JS-Fehler; Titel→CharSelect→Run ok.
- Kaltladezeit-Zahlen dokumentiert (Tabelle oben); lokal ~flach, Struktur: App-Shell
  81→4,5 kB gzip, ~111 kB gzip vom Titel-Pfad abgekoppelt.
- Grenzen eingehalten: keine Änderungen an `src/scenes/**`, `src/gfx/**`,
  `src/systems/**`, `warmup.ts` oder GAME.md.
