/**
 * Panel-Refresh im Geräte-10-min-Beleg (Lane m10-device10min-refresh,
 * Karten #13746-#13749): Dom-Freigabe 17:45Z macht die aktive Hz-Zahl zur
 * Pflicht im Beleg (60-Hz-APK-Lock vs hz=max = Entscheidungsfelder des
 * Tablet-Tors).
 * 1) Unit-Tests für parseDisplayDump/panelHzFromRaf — rein per Fixture-String,
 *    KEIN Gerät nötig (Muster: renderer-guard.test.ts).
 * 2) Quell-Guard: m10-v10-device-10min.mjs nutzt die Helfer und schreibt das
 *    refresh-Feld in den Telemetrie-Teil des Output-JSONs, während
 *    renderer/rendererValid/passed unangetastet bleiben.
 */
import { expect, describe, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
// @ts-expect-error – reine JS-Helfer aus dem .mjs-Skript, keine d.ts vorhanden
import { panelHzFromRaf, parseDisplayDump } from "../scripts/m10-device-refresh.mjs";

// Fixture im Stil von `adb shell dumpsys display` (Android 12+:
// mActiveModeId + supportedModes-Liste).
const dump120 = `Display devices:: size=1
  Display 0 (HWC display 0): uniqueId=local:4630946786756352128, port 0
    mIsPrimary=true
    mActiveModeId=2
    mDefaultModeId=1
    supportedModes=[{id=1, width=1200, height=2000, refreshRate=60.0, refreshRateRange=[60.0, 60.0]}, {id=2, width=1200, height=2000, refreshRate=120.000004, refreshRateRange=[120.0, 120.0]}]
    mFrameRateOverrides={}`;

const dump60 = `Display devices:: size=1
  Display 0 (HWC display 0): uniqueId=local:4630946786756352128, port 0
    mActiveModeId=1
    supportedModes=[{id=1, width=1200, height=2000, refreshRate=60.0, refreshRateRange=[60.0, 60.0]}, {id=2, width=1200, height=2000, refreshRate=120.0}]
    mFrameRateOverrides={}`;

describe("parseDisplayDump (Fixture-String, kein Gerät)", () => {
  it("120-Hz-Dump: aktiver Mode 2 -> refreshRate 120, panelMode modeId=2", () => {
    expect(parseDisplayDump(dump120)).toEqual({ refreshRate: 120, panelMode: "modeId=2" });
  });

  it("60-Hz-Dump (APK-Lock auf Mode 1): refreshRate 60, panelMode modeId=1", () => {
    expect(parseDisplayDump(dump60)).toEqual({ refreshRate: 60, panelMode: "modeId=1" });
  });

  it("aktiver Mode entscheidet, nicht die erste refreshRate-Angabe", () => {
    // Beide Dumps listen 60 zuerst — der aktive Mode waehlt die Rate.
    expect(parseDisplayDump(dump120)?.refreshRate).toBe(120);
    expect(parseDisplayDump(dump60)?.refreshRate).toBe(60);
  });

  it("Fallback ohne Mode-Liste: erste refreshRate=-Angabe", () => {
    expect(parseDisplayDump("mState=ON\nrefreshRate=60.0")).toEqual({ refreshRate: 60, panelMode: null });
  });

  it("Fallback DisplayDeviceInfo-Stil: '<f> Hz'", () => {
    expect(parseDisplayDump("DisplayDeviceInfo{... mode 2 ... 120.0 Hz ...}")).toEqual({
      refreshRate: 120,
      panelMode: null,
    });
  });

  it("unsinnige/implausible Werte -> null (nie schweigend ein falsches Hz schreiben)", () => {
    expect(parseDisplayDump("refreshRate=0.0")).toBeNull();
    expect(parseDisplayDump("refreshRate=99999")).toBeNull();
    expect(parseDisplayDump("garbage")).toBeNull();
  });

  it("fehlender/unlesbarer Dump -> null (Feld entfällt, Warnung)", () => {
    expect(parseDisplayDump("")).toBeNull();
    expect(parseDisplayDump("   \n  ")).toBeNull();
    expect(parseDisplayDump(null)).toBeNull();
    expect(parseDisplayDump(undefined)).toBeNull();
    expect(parseDisplayDump(123)).toBeNull();
  });
});

describe("panelHzFromRaf (rAF-FPS -> Panel-Hz-Schaetzung)", () => {
  it("Schwellen wie m10-janky-remeasure.mjs (120/90/60/null)", () => {
    expect(panelHzFromRaf(118.6)).toBe(120);
    expect(panelHzFromRaf(100)).toBe(120);
    expect(panelHzFromRaf(89.9)).toBe(90);
    expect(panelHzFromRaf(60.2)).toBe(60);
    expect(panelHzFromRaf(50)).toBe(60);
    expect(panelHzFromRaf(33.4)).toBeNull(); // 2-Vsync-Pacing: keine Schaetzung
  });

  it("fehlende Werte -> null", () => {
    expect(panelHzFromRaf(null)).toBeNull();
    expect(panelHzFromRaf(undefined)).toBeNull();
    expect(panelHzFromRaf(NaN)).toBeNull();
  });
});

describe("Quell-Guard: Geräte-10-min-Skript trägt die aktive Hz-Zahl im Beleg", () => {
  const src = readFileSync(new URL("../scripts/m10-v10-device-10min.mjs", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../scripts/m10-device-refresh.mjs", import.meta.url), "utf8");

  it("m10-v10-device-10min.mjs: importiert die Refresh-Helfer", () => {
    expect(src).toMatch(/from\s+"\.\/m10-device-refresh\.mjs"/);
    expect(src).toMatch(/parseDisplayDump/);
    expect(src).toMatch(/panelHzFromRaf/);
  });

  it("m10-v10-device-10min.mjs: schreibt refresh in den Telemetrie-Teil (nach start/endStatus)", () => {
    expect(src).toMatch(/\.\.\.\(refresh \? \{ refresh \} : \{\}\)/);
    expect(src.indexOf("startStatus")).toBeLessThan(src.indexOf("...(refresh"));
  });

  it("Parsing-Fehler -> Feld entfällt + Warnung, Lauf faellt NICHT auf FAIL", () => {
    expect(src).toMatch(/refreshWarn/);
    expect(src).toMatch(/refresh-Feld entfaellt/);
    // passed-Ausdruck bleibt bytegleich (nur rendererValidFlag + dropPct + errors):
    expect(src).toMatch(/passed:\s*rendererValidFlag && dropPct <= 20 && errors\.length === 0/);
    expect(src).toMatch(/passed:\s*rendererValidFlag && dropPct <= 20\s*\}/);
  });

  it("Renderer-Guard #13405 unangetastet (renderer + rendererValid weiterhin im JSON)", () => {
    expect(src).toMatch(/renderer,/);
    expect(src).toMatch(/rendererValid:\s*rendererValidFlag/);
    expect(src).toMatch(/from\s+"\.\/lf-renderer\.mjs"/);
  });

  it("Helfer-Modul ist rein (kein fetch/CDP/Import von Mess-Abhängigkeiten)", () => {
    expect(helper).not.toMatch(/fetch\(|connectOverCDP|playwright/);
    expect(helper).not.toMatch(/^import /m);
  });
});
