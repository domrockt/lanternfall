# Lane m10-acceptance-tor-sync — ACCEPTANCE.md v1.0-Gerätetore auf verbindlichen Stand (2026-11-28)

**NUR-DOKU-Lane:** keine Code-/Skript-Änderung. Ziel: `ACCEPTANCE.md` v1.0-Gerätetore-Abschnitt
(Stand main @ `5664a7fc`) um die späteren verbindlichen Einträge ergänzen, damit
m10-v10-release-prep vollständige Freigabe-Unterlagen hat. Historische Abschnitte bleiben
unangetastet — nur Ergänzungen (Nachtrag-Prinzip wie in allen vorherigen Abnahme-Nachträgen).

Board-Karten: #13726 (K1), #13727 (K2), #13728 (K3), #13729 (K4).

**Supervisor 28.11. — übernommen:** (1) fremde Karte #13283 (GroundRenderer chunk_*) war
fremd in `doing` → zurück nach `todo` (Notiz „wrong lane / zurück in Ready"); diese Lane
arbeitet nur K1–K4. (2) Wünsche-Pfad bestätigt: `/home/ai/games/coding-brain/Lead/Wünsche
von Dom.md`, Tabelle „2026-11-28 17:45Z — TABLET-TOR BESTANDEN" — gelesen, Zahlen mit
Belegverweis in den ACCEPTANCE-Nachtrag übernommen (K2). Kein Block.

## K1 — Bestand aufnehmen (Karte #13726)

Gelesen: `ACCEPTANCE.md` Abschnitt „v1.0 Gerätetore (2026-11-28, Redmi Pad Pro, main @ `5664a7fc`)"
samt Nachabnahme G und allen Nachträgen. Befund je späterem Eintrag:

| Späterer Eintrag | Im ACCEPTANCE-Stand? | Beleg (nur aus Belegen übernommen) | Aktion |
|---|---|---|---|
| **120-Hz-A/B** (Wünsche von Dom.md 17:45Z: 60 Hz 60,0 FPS / p95 16,8 ms / janky 0 %; 120 Hz 118,5 FPS / 8,4 ms / 11,8 %) + Dom-Freigabe „Tablet-Tor bestanden" | **fehlt** | `~/games/coding-brain/Lead/Wünsche von Dom.md`, Abschnitt „2026-11-28 17:45Z — TABLET-TOR BESTANDEN" | K2 ergänzen |
| **torprio-Umstellung** (FPS avg ≥ 57 + rAF-p95 ≤ 16 ms als Tor 1/2; gfxinfo-janky nur Warnung) | **fehlt** | `docs/lanes/m10-v10-gate-torprio.md` (Tor-Tabelle, 24 Unit-Tests in `tests/v10-gate.test.ts`) | K3 ergänzen |
| **v10-gate-rerun-Urteil** (main `11f929c7`: FAIL ausschließlich `js-errors-0`, 13× Texture-key; `fullrun-inhalt` nur Folgetor; frame-p95 2,0/1,9 ms PASS; heap-retained +8,8 % PASS) | **fehlt** | `~/games/.evidence/m10-v10-gate-rerun/run1.json` + `run2.json` (`failures: ['js-errors-0','fullrun-inhalt']`, p95 2,0 / 1,9 ms), Doku `docs/lanes/m10-v10-gate-rerun.md` | K3/K4 ergänzen |
| **heap-gate-recovery G-Zahlen** | **bereits vorhanden** (Nachtrag in „Nachabnahme G", 16:05Z): HARD −25,2 % (endMB 48,5 vs. Minute-1 64,8 MB), Renderer Mesa RPL-S | Gegen `~/games/.evidence/m10-heap-gate-recovery/k1-run1.json` und `k1-run2-retry.json` verifiziert: `gate.endMB=48.5`, `gate.minute1MB=64.8`, `gate.endDeltaPct=-25.2` — Zahlen stimmen | keine Änderung, nur Querverweis (K4) |
| **K3-janky-FAIL der Erstmessung** (13,44 %/13,90 %) | vorhanden (historisch, bleibt stehen) | Kontextualisierung über K2 (120-Hz-Deadline 8,3 ms) und K3 (neue Tor-Lesart) | nur Nachtrag, kein Überschreiben |

Abweichung vom Briefing: der genannte Verweis `docs/lanes/m10-v10-gate.md` existiert nicht —
die Lane-Dokumente heißen `m10-v10-gate-torprio.md` (Tor-Priorität) und
`m10-v10-gate-rerun.md` (Rerun-Urteil); darauf wird verwiesen.

## K2 — 120-Hz-A/B-Nachtrag (Karte #13727)

Ergänzt in `ACCEPTANCE.md` (neuer Nachtrag-Abschnitt nach dem Gerätetore-/G-Kontext):
A/B-Tabelle (60 Hz vs. 120 Hz, Quelle device-bridge Claude-A/B, Minute-25-Dichte,
262–344 Gegner), Dom-Freigabe „Tablet-Tor bestanden" (17:45Z), Standard **60-Hz-Panel +
60-FPS-Cap**, Folgepunkt „Bildrate: max" hebt den 60-Hz-Panel-Wunsch auf (nicht
v1.0-blockierend). Zahlen 1:1 aus „Wünsche von Dom.md" 17:45Z.

## K3 — Blocker-Status / Tor-Priorität (Karte #13728)

Ergänzt in `ACCEPTANCE.md`:
- fps-pacing-Tor-Lesart: **FPS avg ≥ 57 und rAF-p95 ≤ 16 ms als Tor 1/2** (nach
  `merge-m10-v10-gate-torprio`), gfxinfo-janky ≥ 10 % nur Warnung, Rückweg `--janky-as-gate`.
- Befundgrundlage `docs/lanes/m10-janky-remeasure.md`: 0 % janky bei FPS avg 50,1 /
  rAF-p95 33,4 ms (Cap 60 und MAX identisch) → janky allein unbrauchbar als Tor.
- Rerun-Urteil je Tor (Tabelle, main `11f929c7`).
- Der historische K3-FAIL (13,44 %/13,90 %) bleibt als Erstmessungs-Beleg stehen; er wird
  im Nachtrag kontextualisiert, nicht überschrieben.

## K4 — Abgleich + Querverweise (Karte #13729)

Querverweise auf Belege ergänzt (`~/games/.evidence/m10-janky-remeasure/`,
`m10-v10-gate-rerun/`, `m10-v10-gate-torprio/`, `m10-v10-gate-guard/`,
`m10-heap-gate-recovery/`). Alle Zahlen nur aus Belegen/Lane-Dokus übernommen.
Abnahme: `npm test` 0 fail; `git diff` zeigt nur Ergänzungen im v1.0-/G-Kontext.
