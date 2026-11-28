# Lane m10-release-check-tool — Release-Prüfwerkzeug für die v1.0-Freigabe (2026-11-28)

Teiljob 1 der zerschnittenen `m10-v10-release-prep`: baut das release-check-Skript und beweist es
gegen den IST-Stand. Der Freigabe-Report/README/Tag-Vorschlag folgt im Nachfolger
(`m10-v10-release-prep`, after merge-m10-v10-final-run + merge-m10-release-check-tool).
**Kein push, kein Tag, kein Release-Publish.** Karten #13962 (K1), #13963 (K2), #13964 (K3), #13965 (K4).

## Tool: `scripts/m10-v10-release-check.mjs`

4-Teil-Report (JSON + Konsoletabelle), Urteile je Teil dreistufig **PASS / FAIL / OFFEN**
(fehlender Beleg ist OFFEN, kein FAIL). Exit 0 = Report erzeugt, 2 = Werkzeugfehler.
Reine Prüffunktionen exportiert und per Dependency-Injection (fetch/readText/pathExists/runGit/nowMs)
testbar — der Guard-Test braucht kein Netz/Device/echtes git.

| Teil | Quelle | Urteilslogik |
|---|---|---|
| (a) Gerätetore K1–K5 | `docs/qa/v10-device-acceptance-2026-11-28.md` (Ergebnis-Tabelle) | Urteil je Tor aus dem Doc; **K3** überschrieben aus `docs/lanes/m10-janky-remeasure.md` (Messwerte natural 50,1 FPS / rAF-p95 33,4 ms / janky 0 %), bewertet nach **merge-m10-v10-gate-torprio**: FPS avg ≥ 57 (Tor 1), rAF-p95 ≤ 16 ms (Tor 2), gfxinfo-janky nur Beobachtung (Warnung ≥ 10 %). Renderer-String-Pflicht: Renderer aus dem Beleg extrahiert, SwiftShader/llvmpipe = `rendererValid: false` |
| (b) Endabnahme-Beleg | `docs/qa/v10-final-2026-11-28.md` | vorhanden + Urteilszeile (Urteil/Ergebnis/Fazit + abgenommen/nicht abgenommen/PASS/FAIL); **Datei fehlt = OFFEN** |
| (c) latest-build-APK vs. HEAD | GitHub-Releases (öffentliches API-JSON, kein Secret), Muster fa-04 | Build-ID aus Asset-Namen `lanternfall-YYYYMMDD-HHMM-<sha>.apk` oder (aktuelles Muster, Asset `lanternfall.apk`) aus dem Release-Namen `… (20261128-1714-11f929c)`; PASS nur bei SHA == HEAD, sonst FAIL mit Alter in Minuten |
| (d) Commits seit letzter APK | `git log <apkSha>..HEAD --oneline` | PASS = 0, FAIL = Liste (Nutzen: der Nachfolger sieht sofort, was im APK fehlt) |

## K2: Guard-Test `tests/v10-release-check.test.ts` — 23 Tests grün

Fixtures pinen: K3-Messwerte 50,1/33,4 ms → FAIL, 60,2/15,9 ms → PASS, unparsebar → OFFEN;
fehlende Final-Datei → OFFEN (auch bei sonst grünem Report); APK-Muster fa-04 (44-min-Beleg wie
`docs/qa/final-2026-11-27.md`); GitHub-Asset-Auswahl (Asset-Name- und Release-Name-Muster);
Git-Fehler → count null → OFFEN statt Wurf. `npx vitest run tests/v10-release-check.test.ts`
23/23 grün, `npx tsc --noEmit` rc=0. Kein Netz/Device-Zwang.

## K3: Probe-Lauf auf dem Lane-Stand (main `534141bd` + Lane-Commits) — 2026-11-28T18:59Z

Belege (nicht in git): `~/games/.evidence/m10-release-check-tool/probe.json` (Report-JSON,
identisch zum Probe-Aufruf `--out`), `probe-console.txt` (Konsotabelle). Erwartung bestätigt:

| Teil | Urteil | Befund |
|---|---|---|
| (a) Gerätetore | **FAIL** | K1/K2/K4/K5 PASS; **K3 FAIL**: FPS avg 50.1 < 57, rAF-p95 33.4 ms > 16 ms (janky 0 % nur Beobachtung) — Stand aus m10-janky-remeasure, gate-torprio-Ordnung. Renderer `Adreno (TM) 710`, gültig (kein SwiftShader) |
| (b) Endabnahme | **OFFEN** | `docs/qa/v10-final-2026-11-28.md` fehlt — Endabnahme (v10-final-run) noch nicht gelaufen |
| (c) latest-build vs. HEAD | **FAIL** | Release `latest-build` = Build `2026-11-28T17:14Z`, SHA `11f929c`, **105 min alt** gegenüber HEAD `0c72887` |
| (d) Commits seit APK | **FAIL** | **136 Commits** seit `11f929c` gemerged (Liste im Report-JSON) — u. a. render-1280-gap, particles-hit-wiring, fullrun-renderer-valid, device10min-refresh, panel-hz-pref + die 2 Lane-Commits dieser Lane |

**Nutzen-Nachweis:** der Nachfolger (`m10-v10-release-prep`) sieht aus einem Lauf, dass
(1) der K3-Pacing-Blocker formal weiter besteht (FPS avg 50 < 57), (2) die Endabnahme offen ist,
(3) das `latest-build`-APK ~105 min/136 Commits hinter dem Stand liegt — vor jedem Freigabe-Schritt
ist ein frischer APK-Build + Endabnahme-Lauf nötig.

### Befunde/Hebel bei FAIL (für den Freigabe-Nachfolger)

1. **K3-Tor (a):** Hebelliste steht in `docs/lanes/m10-janky-remeasure.md` K4 (Pacing/Timestep primär,
   ADD-Fläche medium-Tier sekundär); Tor-Definition-Rückweg `--janky-as-gate` dokumentiert in
   `docs/lanes/m10-v10-gate-torprio.md`. Datei/Hebel: `src/main.ts`, `src/logic/fps-cap.ts` (fremde
   Merge-Area — hier nur berichtet).
2. **(c)/(d):** Hebel = Release-Pipeline (stündlicher Main-Build) — APK neu bauen/publishen, sobald
   der Freigabe-Stand steht (Vera-Pipeline; hier kein Build/Publish).
3. **(b):** Endabnahme-Lauf nach K3-Fix fahren; Datei `docs/qa/v10-final-2026-11-28.md` ist der
   erwartete Belegpfad des Tools.

### Hinweise/Abweichungen

- „Muster A13“ aus dem Briefing war im Repo/Doku nicht auffindbar; interpretiert als das
  **fa-04-Muster** (APK mtime/Build-ID + SHA vs. main-HEAD, Differenz in Minuten — exakt die
  Dokumentation aus `docs/qa/final-2026-11-27.md`).
- Das Release-Asset heißt inzwischen `lanternfall.apk` ohne SHA im Namen; die Build-ID steht im
  Release-Namen. Das Tool liest beide Muster (`idSource: "asset-name" | "release-name"`).
- Probe lief auf dem Lane-Worktree (`534141bd` + 2 Lane-Commits = `0c72887`), nicht auf nacktem
  main — für (c)/(d) Follow-up-relevant; der Nachfolger läuft das Tool auf gemergtem main.
- Das Release `created_at` (16:59:28Z) liegt vor dem Build-Stamp im Namen (17:14Z); das Tool
  altert über den Build-Stamp, nicht über `created_at`.
