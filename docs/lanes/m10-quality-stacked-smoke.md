# Lane m10-quality-stacked-smoke — Integrativer Qualitätsstufen-Smoke (NUR-MESS)

**Ziel:** Ob die in den Merges 11:34–11:56Z gestapelten Qualitätsstufen-Teile
(audioBudgetFor, Hazard-Warn-Disc-Tier, Thermal-Hysterese, Thermal-Wiring, Run-CPU-Budget,
Pause-Footer, Damage-Label) **zusammen** stabil schalten: Drossel → Caps folgen → Erholung
ohne Flapping. Keine Änderungen an `src/**`, `tests/**`, bestehenden Skripten.

**Skript:** `scripts/m10-quality-smoke.mjs` (eigenes Mess-Skript, konsumiert nur `harness.mjs`).
**Belege:** `~/games/.evidence/m10-quality-stacked-smoke/` (nicht im git, Dom-Regel 27.11.).

---

## K1 — Smoke-Lauf (Commit 51e5baf2, #11852)

Planmäßiger Lauf, rc=0, ~8 min, unter `flock /home/ai/games/.lf-perf.lock`.

- **Renderer (Pflicht):** `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — kein SwiftShader, gültiger iGPU-Beleg.
- **FPS-Tore:** Burst (Minute 3, ~452 Gegner) **60 FPS median / min 60** ✓; Minute-25-Referenz (~438 Gegner) **60 FPS median / min 60** ✓ (Gate ≥55).
- **0 JS-Fehler** über den gesamten Lauf.
- **Qualitäts-Kette in EINEM Lauf belegt** (Timeline-Transitions):
  `high → medium (EWMA 46,5) → low (28,5) → thermal → low (50,8) → medium (60) → high (60)`
  CDP-CPU-Drossel 8x für Phase B, danach Erholung. **Kein Flapping:** 0 Tier-Wechsel in der
  Totzone 45–57; thermal→low→medium→high folgte in ~80 s sauber und monoton.
- Timeline: `m10-quality-smoke-timeline-2026-11-28T13-03-48-426Z.json` (478 Samples @1 Hz,
  `__rbDbg` + `__lf.state().quality` + `__lf.audio()` + Szene-Children-Zensus je Sample).

## K2 — Stapel-Caps je Stufe (Commit 21166d39, #11853)

Per-Tier-Auswertung derselben Timeline (kein zweites Messen): `m10-quality-smoke-caps-per-tier.json`.

| Cap | high (n=148) | medium (n=65) | low (n=241) | thermal (n=24) | Budget lt. Code | Wirksam? |
|---|---|---|---|---|---|---|
| Damage-Labels max (Cap 12/8/5/3) | 9 | **8** | **5** | **3** | qualityBudgetFor | ✅ medium/low/thermal exakt am Cap |
| Audio-Stimmen max (16/8/4/?) | 10 | 7 | **4** | **10** | audioBudgetFor | ⚠️ low ✓, **thermal 10 ≫ 4** → Befund B1 |
| ADD-Children median | 19 | 19 | 17 | 17 | glowEnabledFor | siehe Befund B3 (nicht retroaktiv) |
| max ADD-Fläche device-px | 71225 | 71219 | 71223 | 70999 | glowAreaCapForQuality | siehe Befund B3 |
| Warn-Discs sichtbar max | 1 | 0 | 0 | 0 | warnDiscDrawCapForQuality | B2 im Smoke nicht exerciert (s. Befund B5) |

**Rückkehr bitgleich zur Vor-Phase:** `snapshotHighBefore` vs `snapshotHighAfter`
(damageLabels 9/9, ADD-Children 18/18, max ADD-Fläche 71225/71225, voices 10/8 — beides
innerhalb High-Budget 16): nach der Erholung verhält sich die Kette auf High wieder wie vor
der Drosselphase; keine Dauerschäden (keine dauerhaft versteckten Warn-Sprites, `discBudgetHidden`
restore-Pfad griff).

### Laufzeit-Verifikation der Thermal-Lücke im Audio-Budget (B1)

Thermal-Fenster 13:01:17–13:01:40 (23,4 s): Damage-Labels exakt 3 (thermal-Budget greift),
aber Audio-Stimmen bis **10** — während die unmittelbar vorherige low-Phase max **4** zeigte
(low-Budget). Das ist der Laufzeit-Beleg für den Code-Befund: `audioBudgetFor("thermal")`
trifft in `AUDIO_BUDGETS` (nur high/medium/low) nicht und fällt auf **AUDIO_BUDGETS.high**
(16 Stimmen) zurück — der strengste Tier bekommt das großzügigste Audio-Budget.

---

## K3 — Befundliste für Fix-Jobs (Commit #11854 (git log --grep=#11854))

Je Befund: Severity, Beleg, Datei-/Hebel-Pointer. Dora kann daraus Fix-Jobs schneiden;
dieses Smoke-Lauf-Protokoll (`scripts/m10-quality-smoke.mjs`) dient dabei als
Nachmess-Werkzeug — einzelne Fragen NICHT erneut gesondert messen, soweit hier abgedeckt.

### B1 — `audioBudgetFor("thermal")` fällt auf HIGH zurück — **major**
- **Beleg (Code):** `src/audio/mixing.ts:135` — `return AUDIO_BUDGETS[tier] ?? AUDIO_BUDGETS.high;`
  `AUDIO_BUDGETS` kennt nur high/medium/low; `"thermal"` → undefined → high (16 Stimmen).
- **Beleg (Laufzeit):** Thermal-Fenster voices max 10 (median 7) vs. low-Phase max 4 (median 3);
  Damage-Labels zeigten im selben Fenster korrekt 3 → thermal-Budget greift sonst überall.
- **Hebel:** Thermal-Eintrag in `AUDIO_BUDGETS` ergänzen (z. B. 2 Stimmen / 4 Starts/s,
  Band-Verhältnisse 12/12/8 halten) oder `audioBudgetFor` auf `qualityBudgetFor`-Muster
  (`tier === "thermal"` → hartes Budget) ziehen. Owner: audio-designer, Kontrolle: audio-check.
- **Risiko wenn ungefixt:** Unter thermischem Härteläuft der Limiter mit 16 Stimmen — genau
  die Phase, in der das Gerät am wenigsten Kopf für Audio-Mixing hat.

### B2 — Warn-Disc-Draw-Cap und Rim-Puls kennen `"thermal"` nicht — **medium**
- **Beleg (Code):** `src/gfx/hazardDisc.ts:286-288` — `warnDiscDrawCapForQuality` capped nur
  `tier === "low"` (DISC_DRAW_CAP_LOW = 6), `"thermal"` → `Infinity` (uncapped, worse than low);
  `src/gfx/hazardDisc.ts:296-299` — `rimPulsePhaseFractionForQuality("thermal")` → 1 statt 0,5.
  In `src/systems/Hazards.ts:203/272` wird `drawQualityTier(QUALITY)` ungefiltert durchgereicht,
  `QUALITY` kann "thermal" sein (m10-thermal-wiring).
- **Beleg (Laufzeit):** Im Smoke nicht exerciert — warnDiscs max 0 in low/thermal-Phase
  (Bot kitet, Top-up-Spawns sind bog_rats ohne Telegraph). Deshalb Nur-Code-Befund + dedizierter
  Probe nötig: `__lfForceQuality` unterstützt "thermal" nicht (nur low/medium/high,
  `src/gfx/hazardDisc.ts:316`), ein Fix-Job sollte den Force-Override um "thermal" erweitern,
  sonst ist die Stufe nicht proebbar.
- **Hebel:** Beide Funktionen auf `tier !== "high" && tier !== "medium"` bzw. thermal→low-Map
  ziehen; `drawQualityTier`-Force um "thermal" erweitern. Owner: gameplay-dev/vfx-artist,
  Kontrolle: vfx-check.

### B3 — Glow-Flächen-/Slot-Caps wirken nur bei Spawn (nicht retroaktiv) — **minor**
- **Beleg (Laufzeit):** max ADD-Fläche bleibt über ALLE Stufen ~71 000 device-px
  (71225 high / 71223 low / 70999 thermal); `addChildren` median 19→17. Nach dem Downstep
  behalten Alt-Sprites ihre gedeckelte-should-be-Fläche bis zum Recycling.
- **Beleg (Code):** `src/systems/FxSystem.ts:330-340` und `:771-781` — `clampGlowScreenArea`
  greift nur im Spawn-Pfad; kein Clamping bestehender aktiver FX beim Tierwechsel.
- **Hebel:** Beim Tierwechsel down: aktive ADD-Sprites einmalig nachclampen (Scale-Tweens) oder
  dokumentieren, dass der Deckel bewusst nur Neuspawns deckelt (Doku in `quality.ts`). Owner:
  engine-dev/vfx-artist, Kontrolle: perf-check (Overdraw ist der Android-Engpass).

### B4 — Thermal-Guard engagiert mit bis zu ~18 s Lag (auch bei bereits recoverter Last) — **info**
- **Beleg (Laufzeit):** Engage von thermal bei fpsEwma **58,7** (Timeline 13:01:17) — der
  8-s-Median (THERMAL_WINDOW_MS) plus 10-s-Hold (THERMAL_HOLD_MS) schauen in die Vergangenheit;
  im Lauf hatte sich die FPS unter Drossel + low-Budgets schon erholt, als thermal einschlug.
  Danach sauberer Rückweg (20 s recovery → low, 12 s ≥57 → high). **Kein Flapping** beobachtet
  (0 Wechsel in der Totzone 45–57, monotone Kette).
- **Bewertung:** Design-Kompromiss der Hysterese, kein Fix nötig; aber für die
  Spielerwahrnehmung dokumentieren: nach einer Lastspitze kann thermal bis ~18 s NACH der
  Erholung noch zuschlagen. Hebel falls gewünscht: THERMAL_HOLD_MS senken oder engage zusätzlich
  an aktuelles EWMA koppeln (`median < THERMAL_FPS && fpsEwma < THERMAL_FPS`). Owner:
  gameplay-dev, Kontrolle: test-auditor.

### B5 — Deckungslücken des Smoke-Protokolls (für Fix-Jobs: hier nachziehen, nicht neu erfinden) — **info**
- Warn-Disc-Cap (B2) im Lauf nicht exerciert → dedizierter Probe mit `__lfForceQuality` (nach
  B2-Fix inkl. "thermal") + Telegraph-Gegner (toad/witchling/bomber) nötig.
- Glow-Slot-Abbau (B3) nur über ADD-Children-Zensus sichtbar; FxSystem-Interne (`fx.glow`-Slots)
  sind von außen nicht zählbar — ein `debugState()` am FxSystem würde künftige Smokes präziser
  machen (Bedarf, keine Forderung dieser Mess-Lane).

## Ergebnis

Die gestapelte Qualitätsstufen-Kette **schaltet zusammen stabil**: Drossel fährt
high→medium→low→thermal, alle Damage-/Glow-/Audio-Caps folgen dem Tier, Erholung kehrt
bitgleich auf High zurück, kein Flapping. Die zwei echten Löcher sind im **thermal-Tier**
selbst: Audio-Budget (B1, major) und Hazard-Warn-Disc/Rim-Puls (B2, medium) behandeln
"thermal" als unbekanntes Tier bzw. gar nicht.

## Offene Punkte / Grenzen

- B2-Laufzeitbeleg fehlt (s. B5); B1 ist Code + Laufzeit belegt.
- Laufzeit des Smoke: ~8 min bei Minute 25-Last; echte Thermik (10-min-Geräteläufe,
  Thermik-Drossel) ist damit nicht abgedeckt — der CPU-Throttle simuliert nur den
  FPS-Einbruch, nicht das Thermik-Profil des Geräts (Android-Proxy/Telemetrie bleibt
  der echte Beleg, siehe Wissen/Android-Optimierung-Praxis.md).

