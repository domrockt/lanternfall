import { describe, expect, it } from "vitest";
import {
  K3_FPS_AVG_TARGET,
  K3_FRAME_P95_TARGET_MS,
  commitsSinceApk,
  judgeApk,
  judgeCommits,
  num,
  parseApkName,
  parseDeviceGates,
  parseFinalVerdict,
  parseK3Stand,
  parseRenderer,
  runCheck,
  selectLatestBuildAsset,
  // @ts-expect-error – reine JS-Prüffunktionen aus dem Release-Check-Skript, keine d.ts vorhanden
} from "../scripts/m10-v10-release-check.mjs";

// Lane m10-release-check-tool, Karte K2 (#13963): Guard-Test für das v1.0-Release-Prüfwerkzeug.
// Alle Urteile werden gegen Fixtures abgeleitet — KEIN Netz, KEIN Device, KEIN echtes git
// (GitHub-API + git laufen über Dependency-Injection).

// Auszug aus docs/qa/v10-device-acceptance-2026-11-28.md (Ergebnis-Tabelle, Stand 28.11.).
const DEVICE_MD = `# v1.0-Gerätetore — Abnahme auf dem Redmi Pad Pro (2026-11-28)
- WebView-Renderer-String \`Adreno (TM) 710\`, Vendor \`Qualcomm\` — kein SwiftShader.

## Ergebnis

| Tor | Urteil |
|---|---|
| K1 6 Evo-Fenster ≥ 60 FPS (Ziel 90) | **PASS** (alle ~120 FPS) |
| K2 Minute-25 ≥ 60 FPS | **PASS** (109,4 FPS) |
| K3 gfxinfo janky < 10 % | **FAIL** (13,44 % / 13,90 %) |
| K4 10-min ohne Thermik-Einbruch | **PASS** (−1,5 %, Thermal 0) |
| K5 Panels lesbar, RENDER_SCALE == 1 | **PASS** |
`;

// Auszug aus docs/lanes/m10-janky-remeasure.md (K4-Kriterien-Tabelle, Stand nach Fix-Schub).
const K3_FAIL_MD = `| Kriterium | Cap 60 (K2) | MAX (K3) | Urteil |
|---|---|---|---|
| gfxinfo janky < 10 % | 0 % | 0 % | **ERFÜLLT** (beide) |
| FPS >= 60 (natural avg) | 50,1 | 50,0 | **NICHT erfüllt** |
| rAF p95 <= 16 ms | 33,4 ms | 33,4 ms | **NICHT erfüllt** |
| Temperatur unauffällig | Thermal 0 | Thermal 0 | erfüllt |
`;
const K3_PASS_MD = K3_FAIL_MD
  .replace("| 50,1 | 50,0 |", "| 60,2 | 59,8 |")
  .replace("| 33,4 ms | 33,4 ms |", "| 15,9 ms | 15,0 ms |");
const K3_LEER_MD = `| Kriterium | Cap 60 | MAX |
|---|---|---|
| gfxinfo janky < 10 % | k.A. | k.A. |
`;

describe("num/parseApkName/parseRenderer — Kleinteile", () => {
  it("num parst deutsche Dezimalkomma-Werte", () => {
    expect(num("13,44")).toBe(13.44);
    expect(num(" 50,1 / 42,3")).toBe(50.1);
    expect(num("k.A.")).toBeNull();
    expect(num(null)).toBeNull();
  });

  it("parseApkName erkennt das fa-04-Muster (Datum, Uhrzeit UTC, gekürzte SHA)", () => {
    const p = parseApkName("lanternfall-20261127-0800-0c525c8.apk");
    expect(p).toEqual({ stamp: "2026-11-27T08:00:00Z", sha: "0c525c8" });
    expect(parseApkName("lanternfall-20261128-1604-0ce7164a.apk")?.sha).toBe("0ce7164a");
    expect(parseApkName("lanternfall.apk")).toBeNull();
    expect(parseApkName("nichtsanderes.zip")).toBeNull();
  });

  it("parseRenderer: echter Geräte-Renderer gültig, SwiftShader/llvmpipe ungültig", () => {
    expect(parseRenderer(DEVICE_MD)).toEqual({ renderer: "Adreno (TM) 710", rendererValid: true });
    expect(parseRenderer("Renderer: SwiftShader")).toEqual({ renderer: "SwiftShader", rendererValid: false });
    expect(parseRenderer("nix")).toEqual({ renderer: null, rendererValid: false });
  });
});

describe("parseDeviceGates — Teil (a) Tore aus dem Abnahme-Doc", () => {
  it("leitet das Urteil je Tor K1–K5 korrekt ab", () => {
    const gates = parseDeviceGates(DEVICE_MD) as Array<{ id: string; verdict: string; reason: string }>;
    expect(gates.map((g) => g.id)).toEqual(["K1", "K2", "K3", "K4", "K5"]);
    expect(gates.map((g) => g.verdict)).toEqual(["PASS", "PASS", "FAIL", "PASS", "PASS"]);
    expect(gates[2].reason).toContain("13,44");
  });

  it("ohne Ergebnis-Tabelle → leere Liste (runCheck stuft dann OFFEN)", () => {
    expect(parseDeviceGates("# kein Tor hier")).toEqual([]);
  });
});

describe("parseK3Stand — K3-Tor nach gate-torprio (FPS avg + rAF-p95 primär)", () => {
  it("gemessener Stand (50,1 / 33,4 ms) = FAIL, janky 0 % bleibt Beobachtung", () => {
    const k3 = parseK3Stand(K3_FAIL_MD);
    expect(k3.fpsAvg).toBe(50.1);
    expect(k3.rafP95Ms).toBe(33.4);
    expect(k3.jankyPct).toBe(0);
    expect(k3.verdict).toBe("FAIL");
    expect(k3.reason).toContain("< 57");
    expect(k3.reason).toContain("> 16");
    expect(k3.reason).toContain("Beobachtung");
    expect(K3_FPS_AVG_TARGET).toBe(57);
    expect(K3_FRAME_P95_TARGET_MS).toBe(16);
  });

  it("grüner Stand (60,2 / 15,9 ms) = PASS", () => {
    expect(parseK3Stand(K3_PASS_MD).verdict).toBe("PASS");
  });

  it("nicht parsebare Werte = OFFEN (kein erratener FAIL)", () => {
    const k3 = parseK3Stand(K3_LEER_MD);
    expect(k3.verdict).toBe("OFFEN");
    expect(k3.fpsAvg).toBeNull();
    expect(k3.rafP95Ms).toBeNull();
  });
});

describe("parseFinalVerdict — Teil (b) Endabnahme-Beleg", () => {
  it("erkennbares Urteil FAIL/nicht abgenommen", () => {
    const v = parseFinalVerdict("## Urteil\nNicht abgenommen — K3-Tor rot.\n");
    expect(v?.verdict).toBe("FAIL");
  });
  it("erkennbares Urteil PASS/abgenommen", () => {
    const v = parseFinalVerdict("## Urteil: abgenommen (5/5 Tore grün, PASS)\n");
    expect(v?.verdict).toBe("PASS");
  });
  it("kein Urteil erkennbar → null (runCheck stuft OFFEN)", () => {
    expect(parseFinalVerdict("nur Fließtext ohne Schlusswort")).toBeNull();
  });
});

describe("judgeApk/judgeCommits — Teile (c)+(d) latest-build vs. HEAD", () => {
  const apkOld = parseApkName("lanternfall-20261127-0800-0c525c8.apk")!;
  const apkHead = parseApkName("lanternfall-20261128-1847-534141b.apk")!;

  it("APK auf altem Commit = FAIL mit Alter in Minuten", () => {
    const j = judgeApk({
      apk: { ...apkOld, name: "lanternfall-20261127-0800-0c525c8.apk" },
      headSha: "534141bdf6c9baf5b85b8b8035c4fd41163798a3",
      headTimeMs: Date.parse("2026-11-27T08:44:29Z"),
      nowMs: Date.parse("2026-11-27T09:00:00Z"),
    });
    expect(j.verdict).toBe("FAIL");
    expect(j.ageMinutes).toBe(44); // wie fa-04 dokumentiert
    expect(j.reason).toContain("534141b");
  });

  it("APK exakt auf HEAD = PASS", () => {
    const j = judgeApk({
      apk: { ...apkHead, name: "lanternfall-20261128-1847-534141b.apk" },
      headSha: "534141bdf6c9baf5b85b8b8035c4fd41163798a3",
      headTimeMs: Date.parse("2026-11-28T18:47:07Z"),
      nowMs: Date.parse("2026-11-28T19:00:00Z"),
    });
    expect(j.verdict).toBe("PASS");
  });

  it("fehlende APK / fehlende SHA = OFFEN", () => {
    expect(judgeApk({ apk: null, headSha: "abc1234", headTimeMs: 0, nowMs: 0 }).verdict).toBe("OFFEN");
    expect(
      judgeApk({ apk: { ...apkOld, name: "x.apk" }, headSha: null, headTimeMs: 0, nowMs: 0 }).verdict,
    ).toBe("OFFEN");
  });

  it("Commits seit APK: 0 = PASS, > 0 = FAIL mit Liste", () => {
    expect(judgeCommits({ count: 0, from: "0c525c8" }).verdict).toBe("PASS");
    const fail = judgeCommits({ count: 4, from: "0c525c8" });
    expect(fail.verdict).toBe("FAIL");
    expect(fail.reason).toContain("4");
    expect(judgeCommits({ count: null, from: null }).verdict).toBe("OFFEN");
  });

  it("commitsSinceApk nutzt injizierten git-Lauf (kein echtes git im Test)", () => {
    const fake = (_repo: string, args: string[]) =>
      args.includes("--count") ? "2" : "aaaa001 fix a\naaaa002 fix b";
    const r = commitsSinceApk("/irgendwo", "0c525c8", fake);
    expect(r.count).toBe(2);
    expect(r.commits).toEqual(["aaaa001 fix a", "aaaa002 fix b"]);
    expect(commitsSinceApk("/irgendwo", null, fake).count).toBeNull();
    // git-Fehler (z. B. SHA nicht im Repo) → count null, kein Wurf
    const boom = () => { throw new Error("git kaputt"); };
    expect(commitsSinceApk("/irgendwo", "0c525c8", boom).count).toBeNull();
  });
});

describe("selectLatestBuildAsset — GitHub-Releases-JSON", () => {
  it("wählt das neueste lanternfall-APK-Asset (created_at absteigend)", () => {
    const a = selectLatestBuildAsset([
      {
        name: "latest-build",
        created_at: "2026-11-28T09:00:00Z",
        assets: [
          { name: "lanternfall-20261128-0900-11ded2e.apk", created_at: "2026-11-28T09:00:17Z" },
          { name: "checksums.txt", created_at: "2026-11-28T09:00:17Z" },
        ],
      },
      {
        name: "old",
        created_at: "2026-11-27T08:00:00Z",
        assets: [{ name: "lanternfall-20261127-0800-0c525c8.apk", created_at: "2026-11-27T08:00:17Z" }],
      },
    ]);
    expect(a?.name).toBe("lanternfall-20261128-0900-11ded2e.apk");
    expect(a?.sha).toBe("11ded2e");
  });

  it("ohne passendes Asset → null", () => {
    expect(selectLatestBuildAsset([{ name: "r", assets: [{ name: "readme.md" }] }])).toBeNull();
    expect(selectLatestBuildAsset(null)).toBeNull();
  });
});

describe("runCheck — Gesamtreport über Dependency-Injection (kein Netz/Device/git-Zwang)", () => {
  const headSha = "534141bdf6c9baf5b85b8b8035c4fd41163798a3";

  function baseDeps(overrides: Record<string, unknown> = {}) {
    const files: Record<string, string> = {
      "docs/qa/v10-device-acceptance-2026-11-28.md": DEVICE_MD,
      "docs/lanes/m10-janky-remeasure.md": K3_FAIL_MD,
      ...((overrides.files as Record<string, string>) ?? {}),
    };
    const deps: Record<string, unknown> = {
      repo: "/repo",
      readText: (p: string) => {
        const rel = p.replace(/^\/repo\//, "");
        if (!(rel in files)) throw new Error("ENOENT: " + rel);
        return files[rel];
      },
      pathExists: (p: string) => p.replace(/^\/repo\//, "") in files,
      fetchImpl: async () => ({
        ok: true,
        json: async () => [
          {
            name: "latest-build",
            created_at: "2026-11-28T09:00:00Z",
            assets: [{ name: "lanternfall-20261128-0900-11ded2e.apk", created_at: "2026-11-28T09:00:17Z" }],
          },
        ],
      }),
      runGit: (repoArg: string, args: string[]) => {
        if (args[0] === "rev-parse") return headSha;
        if (args[0] === "log") return "1795891627";
        if (args[0] === "rev-list") return "3";
        return "aaaa001 fix\naaaa002 fix\naaaa003 fix";
      },
      nowMs: Date.parse("2026-11-28T19:00:00Z"),
    };
    return Object.assign(deps, overrides) as never;
  }

  it("erzeugt den vollständigen 4-Teil-Report mit begründeten Urteilen", async () => {
    const r = await runCheck(baseDeps());
    expect(r.tool.status).toBe("ok");
    // (a): K3-Klammerung über die Messwerte-Lane, Renderer-Pflicht erfüllt
    expect(r.a_deviceGates.verdict).toBe("FAIL");
    expect(r.a_deviceGates.renderer).toBe("Adreno (TM) 710");
    expect(r.a_deviceGates.rendererValid).toBe(true);
    expect(r.a_deviceGates.gates).toHaveLength(5);
    expect(r.a_deviceGates.gates[2].fpsAvg).toBe(50.1);
    expect(r.a_deviceGates.gates[2].rafP95Ms).toBe(33.4);
    expect(r.a_deviceGates.gates[2].source).toBe("docs/lanes/m10-janky-remeasure.md");
    // (b): Datei fehlt → OFFEN, kein FAIL
    expect(r.b_finalAcceptance.verdict).toBe("OFFEN");
    expect(r.b_finalAcceptance.exists).toBe(false);
    // (c)/(d): APK hinter HEAD
    expect(r.c_apkLatestBuild.verdict).toBe("FAIL");
    expect(r.d_commitsSinceApk.verdict).toBe("FAIL");
    expect(r.d_commitsSinceApk.count).toBe(3);
    expect(r.overall.verdict).toBe("FAIL");
    expect(r.overall.failedParts).toEqual(["a_deviceGates", "c_apkLatestBuild", "d_commitsSinceApk"]);
    expect(r.overall.offenParts).toEqual(["b_finalAcceptance"]);
  });

  it("(b) vorhandene Datei mit Urteil FAIL/PASS korrekt abgeleitet", async () => {
    const files = {
      "docs/qa/v10-device-acceptance-2026-11-28.md": DEVICE_MD,
      "docs/lanes/m10-janky-remeasure.md": K3_PASS_MD,
      "docs/qa/v10-final-2026-11-28.md": "## Urteil\nAbgenommen — alle Tore PASS.\n",
    };
    const r = await runCheck(baseDeps({ files }));
    expect(r.b_finalAcceptance.verdict).toBe("PASS");
    // (a) grün + (b) PASS, aber APK alt → overall FAIL nur aus (c)/(d)
    expect(r.a_deviceGates.verdict).toBe("PASS");
    expect(r.overall.verdict).toBe("FAIL");
    expect(r.overall.failedParts).toEqual(["c_apkLatestBuild", "d_commitsSinceApk"]);
  });

  it("GitHub-API nicht erreichbar → (c)/(d) OFFEN statt Werkzeugfehler", async () => {
    const r = await runCheck(
      baseDeps({ fetchImpl: async () => { throw new Error("offline"); } }),
    );
    expect(r.c_apkLatestBuild.verdict).toBe("OFFEN");
    expect(r.d_commitsSinceApk.verdict).toBe("OFFEN");
    expect(r.overall.verdict).toBe("FAIL"); // nur a_deviceGates (K3-FAIL-Fixture)
    expect(r.overall.failedParts).toEqual(["a_deviceGates"]);
  });

  it("alle Belege fehlen → alles OFFEN, overall OFFEN", async () => {
    const r = await runCheck(baseDeps({
      readText: () => { throw new Error("ENOENT"); },
      pathExists: () => false,
      fetchImpl: async () => { throw new Error("offline"); },
    }));
    expect(r.a_deviceGates.verdict).toBe("OFFEN");
    expect(r.b_finalAcceptance.verdict).toBe("OFFEN");
    expect(r.overall.verdict).toBe("OFFEN");
  });
});
