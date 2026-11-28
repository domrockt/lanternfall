import { describe, expect, it } from "vitest";
import {
  analyzeLine,
  INRUN_RE,
  PCT_RE,
  scanDoc,
} from "../scripts/m10-acceptance-doc-lint.mjs";

describe("m10-acceptance-doc-lint Heuristik", () => {
  it("erkennt In-run-Marker in den dokumentierten Schreibweisen", () => {
    expect(INRUN_RE.test("In-run m1→m29 (Beobachtung)")).toBe(true);
    expect(INRUN_RE.test("Heap-Detail: Minute 1 → Minute 29 53,4 → 63,1 MB")).toBe(true);
    expect(INRUN_RE.test("Minute 1→29: 31,9 → 38,6 MB")).toBe(true);
    expect(INRUN_RE.test("Min 1→29 +8,7 %")).toBe(true);
    expect(INRUN_RE.test("retained +8,9 % über Szenen-Teardown")).toBe(false);
  });

  it("erkennt Wachstums-Prozentwerte", () => {
    expect(PCT_RE.test("+18,2 %")).toBe(true);
    expect(PCT_RE.test("+21 %")).toBe(true);
    expect(PCT_RE.test("+10,7 %/+14,9 %")).toBe(true);
    expect(PCT_RE.test("43,6 MB")).toBe(false);
  });

  it("POSITIV (Befund B2): Tabelle mit In-run-Heap + % + Tor-Urteil wird gemeldet", () => {
    // Echte Zeile aus docs/qa/reacceptance-c-2026-11-27.md
    const lines = [
      "| Kriterium | Messung | Tor | Urteil |",
      "| Heap (hard) | Minute 1 → 29: 31,9 → 38,6 MB = **+21 %** (endMB 27,1) | ≤ +15 % | **FAIL** |",
    ];
    expect(analyzeLine(lines, 1)).toMatchObject({ rule: "in-run-as-gate" });
  });

  it("POSITIV: Heap-Detail-Absatz (In-run-Basis daneben steht FAIL) wird gemeldet", () => {
    // Echte Struktur aus docs/qa/acceptance-refresh-f-2026-11-28.md
    const lines = [
      "| Zeit (UTC) | Befehl | Ergebnis | Urteil |",
      "",
      "Heap-Detail: Minute 1 → Minute 29 **53,4 → 63,1 MB** (+18,2 %) bzw. **51,5 → 62,2 MB**",
      "(+20,8 %); endMB nach Run-Ende 47,5 MB (GC-Sägezahn-Muster, aber Re-Messung entkräftet",
      "den FAIL diesmal **nicht** — gegen Nachabnahme E (+13,9 % PASS) eine Verschlechterung.",
    ];
    expect(analyzeLine(lines, 2)).toMatchObject({ rule: "in-run-as-gate" });
  });

  it("POSITIV: 'Heap-Tor +NN %' mit PASS/FAIL ohne retained-Einordnung wird gemeldet", () => {
    // Echte Zeile aus docs/qa/acceptance-refresh-f-2026-11-28.md
    const lines = [
      "| 2026-11-28T10:18–10:20Z | `flock … npm run fullrun -- --tag accf` | 6/6 Bosse, 0 JS-Fehler; **Heap-Tor +18,2 % > +15 %** | Inhalt/FPS **PASS**, Heap-Tor **FAIL** |",
    ];
    expect(analyzeLine(lines, 0)).toMatchObject({ rule: "heap-tor-pct-judgment" });
  });

  it("NEGATIV (Whitelist): In-run-Zeile als 'Beobachtung' ausgewiesen wird nicht gemeldet", () => {
    // Echte Zeile aus docs/qa/acceptance-refresh-g-2026-11-28.md (K3-Tabelle)
    const lines = [
      "| retained end−start | +8,9 % (43,6→47,5 MB) | +9,2 % (43,5→47,5 MB) | < +15 % — **PASS beide** |",
      "| In-run m1→m29 (Beobachtung) | +10,7 % (53,5→59,2) | +14,9 % (54,2→62,3) | nur Beobachtung |",
    ];
    expect(analyzeLine(lines, 1)).toBeNull();
  });

  it("NEGATIV (Whitelist): B2-Befundzeile ('nie wieder als Tor', Info-Spalte) wird nicht gemeldet", () => {
    // Echte Zeile aus docs/qa/acceptance-refresh-g-2026-11-28.md (Befundliste)
    const lines = [
      "| B2 | In-run m1→m29 bleibt lauf-streuentransparent instabil (+10,7 %/+14,9 % bei identischem Code). Tor bleibt retained; das In-run-Feld sollte in Abnahme-Dokus nie wieder als Tor zitiert werden. | Info | `scripts/fullrun.mjs` |",
    ];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("NEGATIV (Whitelist): historische Referenz ('altes m1→m29-Tor') wird nicht gemeldet", () => {
    // Echte Zeile aus docs/qa/acceptance-refresh-g-2026-11-28.md (Abweichungen)
    const lines = [
      "1. Heap-Tor: F +18,2/+20,8 % (altes m1→m29-Tor, FAIL) → G +8,9/+9,2 % (retained-Tor, PASS).",
    ];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("NEGATIV: In-run-Beobachtungs-Zeile mit GC-Sägezahn-Einordnung wird nicht gemeldet", () => {
    const lines = [
      "2. In-run-Beobachtung: F +18,2/+20,8 % → G +10,7/+14,9 % (GC-Sägezahn-Streuung).",
    ];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("NEGATIV: retained-Tor-Zeile (aktuelles Tor) wird nicht gemeldet", () => {
    const lines = [
      "| K3 | Heap-Tor 2x fullrun | retained **+8,9 % / +9,2 % < +15 %** in BEIDEN Läufen; 6/6 Bosse+Truhen exakt, Sieg `dawn`, fpsMin 60,4/60,3, 0 JS-Fehler | PASS |",
    ];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("NEGATIV: In-run-Marker ohne Prozentwert wird nicht gemeldet", () => {
    const lines = ["Kein Heap-Delta Minute 1→29 im abgebrochenen Lauf."];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("NEGATIV: Prozentwert ohne In-run-Marker und ohne Heap-Tor wird nicht gemeldet", () => {
    const lines = ["| fullrun (30×, god) | Sieg OK, FPS FAIL | Heap +0,3 % (21,5→30,1 MB), 0 JS-Fehler |"];
    expect(analyzeLine(lines, 0)).toBeNull();
  });

  it("scanDoc: findet beide Regeln mit korrekten Zeilennummern", () => {
    const doc = [
      "# Nachabnahme",
      "",
      "| Kriterium | Messung | Tor | Urteil |",
      "| Heap (hard) | Minute 1 → 29: 31,9 → 38,6 MB = **+21 %** | ≤ +15 % | **FAIL** |",
      "",
      "Tor bleibt retained; das In-run-Feld sollte nie wieder als Tor zitiert werden.",
      "",
      "**Heap-Tor +18,2 % > +15 %** | **FAIL (reproduziert)**",
    ].join("\n");
    const findings = scanDoc("docs/qa/test.md", doc);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ file: "docs/qa/test.md", line: 4, rule: "in-run-as-gate" });
    expect(findings[1]).toMatchObject({ file: "docs/qa/test.md", line: 8, rule: "heap-tor-pct-judgment" });
  });

  it("scanDoc: leeres Dokument, keine Findings", () => {
    expect(scanDoc("docs/qa/leer.md", "# Leer\n\nKein Heap-Zitat.\n")).toEqual([]);
  });
});
