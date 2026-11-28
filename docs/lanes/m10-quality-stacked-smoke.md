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

## K2 — Stapel-Caps je Stufe (Commit <k2>, #11853)

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
