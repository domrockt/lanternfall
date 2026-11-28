import { describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_ENDPOINT,
  TELEMETRY_INTERVAL_MS,
  TelemetryCollector,
  telemetryEnabled,
  installTelemetry,
  type TelemetryEnv,
  type TelemetryStatic,
} from "../src/telemetry";

/**
 * K2: Aktivierung (?telemetry=1 / APK / Desktop-aus) und Drosselung
 * (max. 1 Request / 5 s, Fehler still schlucken).
 */

const env: TelemetryEnv = { ua: "test", dpr: 2, screenW: 800, screenH: 360 };
const statics: TelemetryStatic = { renderer: "Mali-G52", vendor: "ARM", build: "abc1234 2026-11-28" };

describe("telemetryEnabled (Aktivierung)", () => {
  it("?telemetry=1 aktiviert immer (auch Desktop)", () => {
    expect(telemetryEnabled("?telemetry=1", "localhost", "Mozilla/5.0 X11")).toBe(true);
    expect(telemetryEnabled("?debug=1&telemetry=1&seed=1", "10.10.50.185", "Mozilla/5.0 X11")).toBe(true);
  });

  it("?telemetry=0 gewinnt ueber alles (auch im APK)", () => {
    expect(telemetryEnabled("?telemetry=0", "127.0.0.1", "Mozilla/5.0 (Linux; Android 13)")).toBe(false);
    expect(telemetryEnabled("?telemetry=1&telemetry=0", "127.0.0.1", "Mozilla/5.0 (Linux; Android 13)")).toBe(false);
  });

  it("APK: Host 127.0.0.1 + Android-UA aktiviert ohne Param", () => {
    expect(telemetryEnabled("", "127.0.0.1", "Mozilla/5.0 (Linux; Android 14; SM-T580) AppleWebKit")).toBe(true);
    expect(telemetryEnabled("?seed=1", "127.0.0.1", "Mozilla/5.0 (Linux; Android 14) Chrome/120")).toBe(true);
  });

  it("Desktop-Spieler senden nichts (kein Param)", () => {
    expect(telemetryEnabled("", "10.10.50.185", "Mozilla/5.0 X11; Linux x86_64")).toBe(false);
    expect(telemetryEnabled("", "localhost", "Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
    // Host 127.0.0.1 allein reicht nicht — Desktop-UA:
    expect(telemetryEnabled("", "127.0.0.1", "Mozilla/5.0 X11; Linux x86_64")).toBe(false);
    // Android-UA allein reicht nicht — rig-/LAN-Host:
    expect(telemetryEnabled("", "10.10.50.185", "Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });

  it("installTelemetry ohne Browser-Umfeld (Node) sendet nichts", () => {
    // location/navigator fehlen im Node-Testlauf → aktivierung schlaegt zu.
    expect(installTelemetry({ events: { on: vi.fn() } } as never, () => undefined)).toBeNull();
  });
});

function makeCollector(overrides: {
  send?: (url: string, body: string) => Promise<unknown>;
  now?: () => number;
  intervalMs?: number;
}): { c: TelemetryCollector; sent: { url: string; body: string }[] } {
  const sent: { url: string; body: string }[] = [];
  const c = new TelemetryCollector(
    { events: { on: vi.fn() }, scene: null, loop: { actualFps: 60 }, renderer: null, canvas: null } as never,
    env,
    statics,
    {
      intervalMs: overrides.intervalMs ?? TELEMETRY_INTERVAL_MS,
      now: overrides.now,
      send: overrides.send ?? (async (url, body) => { sent.push({ url, body }); }),
    },
  );
  return { c, sent };
}

describe("Drosselung (max 1 Request / Intervall)", () => {
  it("zweiter Flush im selben Intervall wird gedrosselt, danach erlaubt", async () => {
    let t = 0;
    const { c, sent } = makeCollector({ now: () => t });
    c.sample();
    expect(await c.flush()).toBe(true);
    expect(sent.length).toBe(1);
    c.sample();
    expect(await c.flush()).toBe(false); // < 5 s -> gedrosselt
    expect(sent.length).toBe(1);
    t = TELEMETRY_INTERVAL_MS;
    expect(await c.flush()).toBe(true);
    expect(sent.length).toBe(2);
  });

  it("es geht maximal 1 Request pro Intervall raus, auch bei vielen Samples", async () => {
    let t = 0;
    const { c, sent } = makeCollector({ now: () => t });
    for (let i = 0; i < 10; i++) c.sample();
    await c.flush();
    for (let i = 0; i < 10; i++) c.sample();
    t = 100;
    await c.flush(); // gedrosselt
    expect(sent.length).toBe(1);
    t = TELEMETRY_INTERVAL_MS;
    await c.flush();
    expect(sent.length).toBe(2);
    // alle gesammelten Samples landen gebuendelt in der zweiten Anfrage
    expect(JSON.parse(sent[1].body).length).toBe(10);
  });
});

describe("Sendefehler still schlucken", () => {
  it("gescheiterte Samples bleiben im Puffer und werden spaeter erneut gesendet", async () => {
    let t = 0;
    let fails = 2;
    const calls: string[] = [];
    const { c } = makeCollector({
      now: () => t,
      send: async (_url, body) => {
        if (fails > 0) { fails--; throw new Error("offline"); }
        calls.push(body);
      },
    });
    c.sample();
    await c.flush();
    expect(c.pendingCount).toBe(1); // Puffer bleibt
    c.sample();
    t = TELEMETRY_INTERVAL_MS;
    await c.flush();
    expect(c.pendingCount).toBe(2);
    t = 2 * TELEMETRY_INTERVAL_MS;
    await c.flush();
    expect(c.pendingCount).toBe(0);
    expect(JSON.parse(calls[0]).length).toBe(2);
  });

  it("Senden benutzt den Rig-Empfaenger und POST-Keepalive-Body als JSON-Liste", async () => {
    const { c, sent } = makeCollector({});
    c.sample();
    await c.flush();
    expect(sent[0].url).toBe(TELEMETRY_ENDPOINT);
    const body = JSON.parse(sent[0].body);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].build).toBe("abc1234 2026-11-28");
  });
});
