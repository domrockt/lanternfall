// m10-acceptance-doc-lint.mjs — Befund B2 der Nachabnahme G (2026-11-28) dauerhaft absichern.
//
// Hintergrund (docs/qa/acceptance-refresh-g-2026-11-28.md, Befund B2): Bis Nachabnahme F
// war das Heap-Tor der Abnahme das **In-run-Feld** (Heap-Wachstum Minute 1 → 29 im Lauf).
// Dieses Feld ist lauf-streuentransparent instabil (GC-Sägezahn: +10,7 %/+14,9 % bei
// identischem Code). Das Tor ist seit dem Fix-Lauf **retained Heap über Szenen-Teardown**
// (endMB nach Results + GC vs. startMB nach Boot + GC, strikt < +15 %).
//
// Dieses Lint-Skript verhindert mechanisch, dass künftige Abnahme-Dokus (docs/qa/*.md)
// wieder das In-run-Feld als Tor/Urteil zitieren. Historische Dokumente werden NICHT
// umgeschrieben — sie sind Zeitzeugen; der Bericht ist der Beleg.
//
// Verwendung:
//   node scripts/m10-acceptance-doc-lint.mjs                 # scannt docs/qa/*.md, Bericht nach shots/
//   node scripts/m10-acceptance-doc-lint.mjs --fail-on-findings  # Exit 1, wenn Findings
//   node scripts/m10-acceptance-doc-lint.mjs --dir docs/qa --out pfad.json
//
// Bericht: shots/m10-doc-lint-<datum>.json (+ Kopie nach ~/games/.evidence/m10-inrun-tor-sweep/).

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** In-run-Marker: Heap-Wachstum Minute 1 → 29 (bzw. m1→m29) im Lauf. */
export const INRUN_RE =
  /(in-?run|min(?:ute)?\.?\s*1\s*(?:→|->|–|—)\s*(?:minute\s*)?29|m\s*1\s*(?:→|->|–|—)\s*m\s*29)/i;

/** Heap-Wachstum in Prozent (+NN % / +NN,NN %). */
export const PCT_RE = /\+\d+(?:[.,]\d+)?\s*%/i;

/** Tor-/Urteils-Kontext (gleiche Zeile). */
export const GATE_RE = /(\btor[se]?\b|gate|härte|hard|urteil|pass\b|fail\b|≤|\u2264|>\s*\+?\d|grün)/i;

/** Strikte Urteils-Wörter (PASS/FAIL) für die Heap-Tor-Regel. */
export const JUDGE_RE = /\b(pass|fail)\b/i;

/** Zeile zitiert das Heap-Tor als Tor („Heap-Tor/Tore + Prozentwert“). */
export const HEAPTOR_RE = /heap[- ]?tor/i;

/** Das Tor ist als retained (Szenen-Teardown) ausgewiesen → nicht das In-run-Feld. */
export const RETAINED_RE = /retained/i;

/**
 * Whitelist: Zeile weist das In-run-Feld ausdrücklich als Beobachtung/Info aus oder
 * referenziert das alte Tor als historisch (nicht als gültiges Urteil).
 */
export const OBS_RE =
  /(beobachtung|nur info|\|\s*info\s*\||nie wieder als tor|altes?\b[^|]*\btor|historisch)/i;

/** Fenster (Zeilen) für Tor-/Urteils-Kontext um eine Kandidatenzeile. */
export const CONTEXT_WINDOW = 3;

/**
 * Prüft eine einzelne Zeile gegen den Tor-/Urteils-Kontext des umliegenden Textes.
 * @param {string[]} lines Alle Zeilen des Dokuments
 * @param {number} i Index der Kandidatenzeile (0-basiert)
 * @returns {{rule: "in-run-as-gate"|"heap-tor-pct-judgment", match: string} | null}
 */
export function analyzeLine(lines, i) {
  const line = lines[i] ?? "";
  if (OBS_RE.test(line)) return null;

  const hasPct = PCT_RE.test(line);
  if (!hasPct) return null;

  const from = Math.max(0, i - CONTEXT_WINDOW);
  const to = Math.min(lines.length - 1, i + CONTEXT_WINDOW);
  let context = "";
  for (let j = from; j <= to; j++) context += lines[j] + "\n";
  const gateContext = GATE_RE.test(context);

  // Regel A: In-run-Feld (Minute 1 → 29) + Wachstum in % + Tor-/Urteils-Kontext.
  if (INRUN_RE.test(line) && gateContext) {
    return { rule: "in-run-as-gate", match: INRUN_RE.exec(line)[0] };
  }

  // Regel B: „Heap-Tor“ + Prozentwert + PASS/FAIL, ohne retained-Einordnung.
  if (HEAPTOR_RE.test(line) && JUDGE_RE.test(line) && !RETAINED_RE.test(line)) {
    return { rule: "heap-tor-pct-judgment", match: "heap-tor" };
  }

  return null;
}

/**
 * Scannt ein Dokument (Text) auf Befund-B2-Verstöße.
 * @param {string} rel Pfad (für den Bericht)
 * @param {string} text Dokumentinhalt
 */
export function scanDoc(rel, text) {
  const lines = text.split(/\r?\n/);
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const hit = analyzeLine(lines, i);
    if (hit) findings.push({ file: rel, line: i + 1, rule: hit.rule, match: hit.match, text: lines[i].trim() });
  }
  return findings;
}

/** Scannt alle .md-Dateien in einem Verzeichnis (flach). */
export function scanDir(dir) {
  const findings = [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const relBase = basename(dir);
  for (const f of files) {
    const p = join(dir, f);
    findings.push(...scanDoc(join(relBase, f), readFileSync(p, "utf8")));
  }
  return findings;
}

/** Liest die gescannten .md-Dateien eines Verzeichnisses (fehlende Verzeichnisse: klare Meldung). */
export function listMdFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  } catch (err) {
    console.error(`m10-acceptance-doc-lint: Verzeichnis nicht lesbar: ${dir} (${err.message})`);
    process.exit(2);
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function main() {
  const args = process.argv.slice(2);
  const failOnFindings = args.includes("--fail-on-findings");
  const dirIdx = args.indexOf("--dir");
  const outIdx = args.indexOf("--out");
  for (const idx of [dirIdx, outIdx]) {
    if (idx >= 0 && (!args[idx + 1] || args[idx + 1].startsWith("--"))) {
      console.error(`m10-acceptance-doc-lint: Option ${args[idx]} braucht einen Wert.`);
      process.exit(2);
    }
  }
  const dir = dirIdx >= 0 ? args[dirIdx + 1] : "docs/qa";
  const out = outIdx >= 0
    ? args[outIdx + 1]
    : join("shots", `m10-doc-lint-${today()}.json`);

  const absDir = resolve(dir);
  const files = listMdFiles(absDir);
  const relBase = dir; // Berichtspfad = übergebenes Verzeichnis (default: docs/qa)
  const findings = files.flatMap((f) =>
    scanDoc(join(relBase, f), readFileSync(join(absDir, f), "utf8")),
  );
  const report = {
    date: today(),
    tool: "scripts/m10-acceptance-doc-lint.mjs",
    scannedDir: dir,
    filesScanned: files.length,
    criterion:
      "Befund B2 (Nachabnahme G): In-run-Heap (Minute 1→29) darf in Abnahme-Dokus nie wieder als Tor/Urteil zitiert werden; Tor = retained Heap über Szenen-Teardown.",
    findingsCount: findings.length,
    findings,
    note:
      "Historische Dokumente werden nicht umgeschrieben (Zeitzeugen). Funde sind Zitate des alten, instabilen Tors — für künftige Abschnitte gilt: Tor = retained Heap.",
  };

  const absOut = resolve(out);
  mkdirSync(dirname(absOut), { recursive: true });
  writeFileSync(absOut, JSON.stringify(report, null, 2) + "\n");
  // Beleg-Kopie nach ~/games/.evidence/ (überlebt Worktree-Abbau); ohne HOME übersprungen.
  try {
    if (process.env.HOME) {
      const evidenceDir = join(process.env.HOME, "games", ".evidence", "m10-inrun-tor-sweep");
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(join(evidenceDir, basename(absOut)), JSON.stringify(report, null, 2) + "\n");
    }
  } catch {
    // Beleg-Kopie ist best-effort; der Bericht in shots/ zählt.
  }
  console.log(`m10-acceptance-doc-lint: ${report.filesScanned} Dateien, ${findings.length} Fund(e) → ${out}`);
  for (const f of findings) console.log(`  ${f.file}:${f.line} [${f.rule}] ${f.text.slice(0, 100)}`);
  if (failOnFindings && findings.length > 0) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
