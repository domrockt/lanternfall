// scripts/m10-v10-release-check.mjs — Release-Prüfwerkzeug für die v1.0-Freigabe (Lane m10-release-check-tool, K1 #13962).
//
// Erzeugt einen 4-Teil-Report (JSON + Konsoletabelle):
//   (a) Gerätetore K1–K5 aus docs/qa/v10-device-acceptance-2026-11-28.md mit aktivem Urteil;
//       K3-Tor zusätzlich gegen den Stand aus docs/lanes/m10-janky-remeasure.md, bewertet mit der
//       Tor-Metrik nach merge-m10-v10-gate-torprio: FPS avg >= 57 (Tor 1), rAF-p95 <= 16 ms (Tor 2),
//       gfxinfo-janky nur Beobachtung (nie allein FAIL).
//   (b) Endabnahme-Beleg docs/qa/v10-final-2026-11-28.md: vorhanden + Urteil; Datei fehlt = OFFEN.
//   (c) latest-build-APK-Alter vs. HEAD (Muster fa-04: APK-Dateiname lanternfall-YYYYMMDD-HHMM-<sha>.apk
//       vs. main-HEAD, Differenz in Minuten).
//   (d) Liste der seit letzter APK gemergten Commits (git log <apkSha>..HEAD --oneline).
//
// Urteile je Teil: PASS | FAIL | OFFEN (fehlender Beleg ist OFFEN, kein FAIL).
// Renderer-String-Pflicht (Regel 6, 28.11.): der Report führt den Renderer-String der Gerätetore;
// Belege mit SwiftShader/llvmpipe werden als ungültig markiert (rendererValid=false).
//
// Exit-Codes: 0 = Report erzeugt (Urteile egal — das Tool berichtet, es entscheidet nicht über den
// Release), 2 = Werkzeugfehler (Dateien unlesbar/Netz/Git fehlgeschlagen).
//
// CLI: node scripts/m10-v10-release-check.mjs [--out <pfad.json>]
//      optional: --repo <dir> --qa-dir <dir> --lane-dir <dir> --github-api <url> (Tests/Probes)

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT_DEFAULT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEVICE_DOC = "docs/qa/v10-device-acceptance-2026-11-28.md";
const JANKY_DOC = "docs/lanes/m10-janky-remeasure.md";
const FINAL_DOC = "docs/qa/v10-final-2026-11-28.md";
const GITHUB_API_DEFAULT = "https://api.github.com/repos/domrockt/lanternfall/releases";
const APK_NAME_RE = /^lanternfall-(\d{8})-(\d{4})-([0-9a-f]{4,12})\.apk$/;

// Tor-Metriken nach merge-m10-v10-gate-torprio (docs/lanes/m10-v10-gate-torprio.md K1):
// Tor 1 fps-avg >= 57, Tor 2 frame-p95 <= 16 ms; gfxinfo-janky >= 10 % nur Warnung.
export const K3_FPS_AVG_TARGET = 57;
export const K3_FRAME_P95_TARGET_MS = 16;
export const K3_JANKY_WARN_PCT = 10;

/** "13,44" / "50,1 ms" → 13.44 / 50.1; sonst null. */
export function num(s) {
  if (s == null) return null;
  const m = String(s).match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  return Number(m[0].replace(",", "."));
}

/** Gerätetore K1–K5 aus der Ergebnis-Tabelle des Abnahme-Docs. */
export function parseDeviceGates(md) {
  const gates = [];
  for (const line of String(md).split("\n")) {
    const m = line.match(/^\|\s*(K[1-5])\s+([^|]*?)\s*\|\s*\*\*(PASS|FAIL|OFFEN)\*\*([^|]*)\|/i);
    if (m) gates.push({ id: m[1].toUpperCase(), label: m[2].trim(), verdict: m[3].toUpperCase(), reason: m[4].replace(/[()]/g, "").trim() });
  }
  return gates;
}

/** WebGL-Renderer-String aus einem Beleg-Dokument; SwiftShader/llvmpipe = ungültig. */
export function parseRenderer(md) {
  const text = String(md);
  const m = text.match(/(Adreno \(TM\) \d+|SwiftShader|llvmpipe|Mesa Intel[^\s|)\n]*(?: [^\s|)\n]*)?)/);
  const renderer = m ? m[1] : null;
  const invalid = renderer != null && /swiftshader|llvmpipe/i.test(renderer);
  return { renderer, rendererValid: renderer != null && !invalid };
}

/**
 * K3-Tor-Stand aus der Nachmess-Lane (natural = primär), bewertet nach Torprio-Ordnung.
 * Werte-Kontext (docs/lanes/m10-janky-remeasure.md K2–K4): Zeilen der K4-Kriterien-Tabelle.
 */
export function parseK3Stand(md) {
  const text = String(md);
  let fpsAvg = null;
  let rafP95Ms = null;
  let jankyPct = null;
  for (const line of text.split("\n")) {
    if (/FPS\s*>=\s*60\s*\(natural avg\)/i.test(line) && fpsAvg == null) fpsAvg = num(line.split("|")[2]);
    else if (/rAF p95\s*<=\s*16\s*ms/i.test(line) && rafP95Ms == null) rafP95Ms = num(line.split("|")[2]);
    else if (/gfxinfo janky\s*<\s*10\s*%/i.test(line) && jankyPct == null) jankyPct = num(line.split("|")[2]);
  }
  const measured = fpsAvg != null && rafP95Ms != null;
  let verdict = "OFFEN";
  let reason = "K3-Messwerte (FPS avg / rAF-p95) nicht aus docs/lanes/m10-janky-remeasure.md parsebar";
  if (measured) {
    const fpsOk = fpsAvg >= K3_FPS_AVG_TARGET;
    const p95Ok = rafP95Ms <= K3_FRAME_P95_TARGET_MS;
    verdict = fpsOk && p95Ok ? "PASS" : "FAIL";
    reason =
      `Tor-Metrik nach gate-torprio: FPS avg ${fpsAvg} ${fpsOk ? ">=" : "<"} ${K3_FPS_AVG_TARGET} (Tor 1 ` +
      `${fpsOk ? "grün" : "rot"}), rAF-p95 ${rafP95Ms} ms ${p95Ok ? "<=" : ">"} ${K3_FRAME_P95_TARGET_MS} ms ` +
      `(Tor 2 ${p95Ok ? "grün" : "rot"})` +
      (jankyPct != null
        ? `; gfxinfo-janky ${jankyPct} % nur Beobachtung${jankyPct >= K3_JANKY_WARN_PCT ? " (Warnung >= " + K3_JANKY_WARN_PCT + " %)" : ""}`
        : "");
  }
  return { fpsAvg, rafP95Ms, jankyPct, verdict, reason };
}

/** Endabnahme-Urteil aus dem Final-Doc-Text; null, wenn kein Urteil erkennbar. */
export function parseFinalVerdict(md) {
  const lines = String(md).split("\n");
  // Urteil darf auf der Überschrifts-Zeile selbst oder direkt danach stehen.
  let armed = false;
  for (const line of lines) {
    if (/urteil|ergebnis|fazit/i.test(line)) {
      armed = true;
      if (/nicht abgenommen|(^|[^a-z])FAIL/i.test(line)) return { verdict: "FAIL", reason: `Urteilszeile: ${line.trim().slice(0, 160)}` };
      if (/abgenommen|(^|[^a-z])PASS/i.test(line)) return { verdict: "PASS", reason: `Urteilszeile: ${line.trim().slice(0, 160)}` };
      continue;
    }
    if (armed && line.trim()) {
      if (/nicht abgenommen|(^|[^a-z])FAIL/i.test(line)) return { verdict: "FAIL", reason: `Urteilszeile: ${line.trim().slice(0, 160)}` };
      if (/abgenommen|(^|[^a-z])PASS/i.test(line)) return { verdict: "PASS", reason: `Urteilszeile: ${line.trim().slice(0, 160)}` };
    }
  }
  return null;
}

/** Dateiname lanternfall-YYYYMMDD-HHMM-<sha>.apk → { stamp, sha } oder null. Stamp = Buildzeit UTC. */
export function parseApkName(name) {
  const m = String(name).match(APK_NAME_RE);
  if (!m) return null;
  const [, d, t, sha] = m;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`;
  return { stamp: iso, sha };
}

/** Aus GitHub-Releases-JSON: neuestes lanternfall-…-<sha>.apk-Asset (created_at absteigend). */
export function selectLatestBuildAsset(releases) {
  const cands = [];
  for (const rel of Array.isArray(releases) ? releases : []) {
    for (const a of Array.isArray(rel?.assets) ? rel.assets : []) {
      const parsed = parseApkName(a?.name ?? "");
      if (parsed) cands.push({ name: a.name, createdAt: a.created_at ?? rel.created_at ?? null, sha: parsed.sha, stamp: parsed.stamp, release: rel.name ?? rel.tag_name ?? null });
    }
  }
  cands.sort((x, y) => String(y.createdAt ?? "").localeCompare(String(x.createdAt ?? "")));
  return cands[0] ?? null;
}

/**
 * Urteil (c): APK aktuell gegenüber HEAD?
 * PASS nur wenn die APK exakt auf HEAD gebaut wurde; älter = FAIL (Readiness C2).
 */
export function judgeApk({ apk, headSha, headTimeMs, nowMs }) {
  if (!apk) return { verdict: "OFFEN", reason: "latest-build-APK nicht abfragbar (kein Asset passend zum Muster lanternfall-YYYYMMDD-HHMM-<sha>.apk)" };
  if (!/^[0-9a-f]{7,40}$/.test(String(headSha))) return { verdict: "OFFEN", reason: "HEAD-SHA nicht ermittelbar" };
  if (!apk.sha) return { verdict: "OFFEN", reason: apk.note ?? "latest-build-Asset ohne parsebare SHA" };
  const apkBuildMs = Date.parse(apk.stamp);
  const ageMinutes = apkBuildMs != null && headTimeMs != null ? Math.round((headTimeMs - apkBuildMs) / 60000) : null;
  // APK-SHA ist gekürzt (7–12 Zeichen) → Prefix-Vergleich gegen den vollen HEAD-SHA.
  if (String(headSha).startsWith(apk.sha)) {
    return { verdict: "PASS", ageMinutes, reason: `latest-build ${apk.name} entspricht HEAD (${String(headSha).slice(0, 7)})` };
  }
  return {
    verdict: "FAIL",
    ageMinutes,
    reason: `latest-build ${apk.name} (Build ${apk.stamp}, SHA ${apk.sha}) steht hinter HEAD ${String(headSha).slice(0, 7)}` +
      (ageMinutes != null ? ` — ${ageMinutes} min alt` : ""),
  };
}

/** Urteil (d): 0 Commits zwischen APK und HEAD = PASS, sonst FAIL (Liste ist der Nutzen). */
export function judgeCommits({ count, from }) {
  if (count == null) return { verdict: "OFFEN", reason: from == null ? "keine APK-SHA als Basis" : "git rev-list fehlgeschlagen" };
  if (count === 0) return { verdict: "PASS", reason: `keine Commits seit ${from}` };
  return { verdict: "FAIL", reason: `${count} Commit(s) seit APK ${from} gemerged — siehe Liste` };
}

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8", timeout: 15000 }).trim();
}

/** Commits zwischen APK-SHA und HEAD; unknownSha/leer → { count: null }. */
export function commitsSinceApk(repo, apkSha, runGit = git) {
  if (!apkSha) return { count: null, commits: [], from: null };
  try {
    const count = Number(runGit(repo, ["rev-list", "--count", `${apkSha}..HEAD`]));
    const commits = runGit(repo, ["log", "--oneline", "--no-decorate", `${apkSha}..HEAD`]).split("\n").filter(Boolean);
    return { count, commits, from: apkSha };
  } catch {
    return { count: null, commits: [], from: apkSha };
  }
}

/**
 * Gesamter 4-Teil-Report. deps erlaubt Injektion (Tests: kein Netz/Device-Zwang):
 *   fetchImpl, readText(path), pathExists(path), runGit(repo,args), nowMs
 */
export async function runCheck(deps = {}) {
  const repo = deps.repo ?? REPO_ROOT_DEFAULT;
  const readText = deps.readText ?? ((p) => readFileSync(p, "utf8"));
  const pathExists = deps.pathExists ?? existsSync;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const nowMs = deps.nowMs ?? Date.now();
  const githubApi = deps.githubApi ?? GITHUB_API_DEFAULT;
  const runGit = deps.runGit ?? git;

  const p = (rel) => join(repo, rel);
  const head = { sha: null, shaFull: null, timeMs: null };
  try {
    head.shaFull = runGit(repo, ["rev-parse", "HEAD"]);
    head.sha = head.shaFull.slice(0, 7);
    head.timeMs = Number(runGit(repo, ["log", "-1", "--format=%ct"])) * 1000;
  } catch { /* OFFEN-Urteile unten greifen */ }

  // (a) Gerätetore
  let device = { verdict: "OFFEN", gates: [], renderer: null, rendererValid: null, reason: `Datei fehlt/unlesbar: ${DEVICE_DOC}` };
  try {
    const deviceMd = readText(p(DEVICE_DOC));
    const jankyMd = readText(p(JANKY_DOC));
    const gates = parseDeviceGates(deviceMd);
    const k3 = parseK3Stand(jankyMd);
    const r = parseRenderer(deviceMd + "\n" + jankyMd);
    const gateRows = gates.map((g) =>
      g.id === "K3"
        ? { ...g, verdict: k3.verdict, reason: k3.reason, source: JANKY_DOC, fpsAvg: k3.fpsAvg, rafP95Ms: k3.rafP95Ms, jankyPct: k3.jankyPct }
        : { ...g, source: DEVICE_DOC },
    );
    const fail = gateRows.some((g) => g.verdict === "FAIL");
    device = {
      verdict: fail ? "FAIL" : gateRows.length ? "PASS" : "OFFEN",
      gates: gateRows,
      renderer: r.renderer,
      rendererValid: r.rendererValid,
      reason: fail
        ? `Gerätetore mit FAIL: ${gateRows.filter((g) => g.verdict === "FAIL").map((g) => g.id).join(", ")}`
        : "alle dokumentierten Gerätetore PASS",
    };
    if (r.rendererValid === false) device.reason += "; ACHTUNG Renderer-Beleg ungültig (SwiftShader/llvmpipe)";
  } catch (e) {
    device.reason = `${device.reason} (${e?.message ?? e})`;
  }

  // (b) Endabnahme-Beleg
  let final = { verdict: "OFFEN", file: FINAL_DOC, exists: false, reason: `Endabnahme-Beleg fehlt (erwartet ${FINAL_DOC}) — Endabnahme noch nicht gelaufen` };
  try {
    if (pathExists(p(FINAL_DOC))) {
      const md = readText(p(FINAL_DOC));
      const v = parseFinalVerdict(md);
      final = v
        ? { ...final, exists: true, verdict: v.verdict, reason: v.reason }
        : { ...final, exists: true, verdict: "OFFEN", reason: "Datei vorhanden, aber kein erkennbares Urteil (Urteil/abgenommen/FAIL)" };
    }
  } catch (e) {
    final.reason = `Datei unlesbar: ${e?.message ?? e}`;
  }

  // (c) + (d) latest-build-APK vs. HEAD
  let apk = null;
  let fetchNote = null;
  try {
    const res = await fetchImpl(githubApi, { headers: { accept: "application/vnd.github+json" } });
    if (!res.ok) fetchNote = `GitHub-API HTTP ${res.status}`;
    else apk = selectLatestBuildAsset(await res.json());
  } catch (e) {
    fetchNote = `GitHub-API nicht erreichbar: ${e?.message ?? e}`;
  }
  if (!apk) {
    apk = null;
    if (fetchNote) apk = { name: null, createdAt: null, sha: null, stamp: null, release: null, note: fetchNote };
  }
  const cJudge = judgeApk({ apk, headSha: head.shaFull, headTimeMs: head.timeMs, nowMs });
  const dRaw = commitsSinceApk(repo, apk?.sha ?? null, runGit);
  const dJudge = judgeCommits({ count: dRaw.count, from: dRaw.from });

  const parts = { a_deviceGates: device, b_finalAcceptance: final, c_apkLatestBuild: { ...cJudge, asset: apk }, d_commitsSinceApk: { ...dJudge, ...dRaw } };
  const verdicts = Object.values(parts).map((x) => x.verdict);
  const overall = verdicts.includes("FAIL") ? "FAIL" : verdicts.includes("OFFEN") ? "OFFEN" : "PASS";
  const failedParts = Object.entries(parts).filter(([, x]) => x.verdict === "FAIL").map(([k]) => k);
  const offenParts = Object.entries(parts).filter(([, x]) => x.verdict === "OFFEN").map(([k]) => k);

  return {
    tool: { name: "m10-v10-release-check", version: 1, status: "ok", generatedAt: new Date(nowMs).toISOString(), repo },
    head: { sha: head.sha, time: head.timeMs != null ? new Date(head.timeMs).toISOString() : null },
    ...parts,
    overall: { verdict: overall, failedParts, offenParts, note: "OFFEN = Beleg fehlt (kein FAIL). FAIL-Teile begründen die Hebel-/Befundliste in der Lane-Doku." },
  };
}

function consoleTable(report) {
  const lines = [];
  lines.push(`m10-v10-release-check — Stand ${report.tool.generatedAt} (HEAD ${report.head.sha ?? "?"}, ${report.head.time ?? "?"})`);
  lines.push("");
  lines.push("Teil | Urteil | Begründung");
  for (const [key, part] of Object.entries(report).filter(([k]) => k.startsWith("a_") || k.startsWith("b_") || k.startsWith("c_") || k.startsWith("d_"))) {
    lines.push(`${key} | ${part.verdict} | ${part.reason}`);
    if (key === "a_deviceGates") {
      for (const g of part.gates ?? []) lines.push(`   ${g.id} | ${g.verdict} | ${g.label} — ${g.reason}`);
      lines.push(`   Renderer | ${part.renderer ?? "?"} | gültig: ${part.rendererValid ?? "?"} (SwiftShader/llvmpipe = ungültig)`);
    }
    if (key === "d_commitsSinceApk") for (const c of (part.commits ?? []).slice(0, 20)) lines.push(`   commit | - | ${c}`);
  }
  lines.push("");
  lines.push(`GESAMT | ${report.overall.verdict} | FAIL: ${report.overall.failedParts.join(", ") || "—"} / OFFEN: ${report.overall.offenParts.join(", ") || "—"}`);
  return lines.join("\n");
}

function argVal(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

// CLI
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const repo = argVal(argv, "--repo") ?? REPO_ROOT_DEFAULT;
  runCheck({ repo, githubApi: argVal(argv, "--github-api") })
    .then(async (report) => {
      console.log(consoleTable(report));
      console.log(""); // JSON folgt als letzter Block (parsbar)
      console.log(JSON.stringify(report, null, 2));
      const out = argVal(argv, "--out");
      if (out) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
      }
      process.exitCode = 0;
    })
    .catch((e) => {
      console.error(`m10-v10-release-check: Werkzeugfehler: ${e?.message ?? e}`);
      process.exitCode = 2;
    });
}
