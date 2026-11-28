import { describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_ENDPOINT,
  TELEMETRY_INTERVAL_MS,
  TelemetryCollector,
  buildSample,
  collectReadings,
  frameStats,
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

  it("installTelemetry Happy-Pfad: ?telemetry=1 installiert, sendet sofort, haengt an step", () => {
    vi.stubGlobal("location", { search: "?telemetry=1", hostname: "localhost" });
    vi.stubGlobal("navigator", { userAgent: "HeadlessChrome Test" });
    vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
    try {
      const send = vi.fn(async () => {});
      const on = vi.fn();
      const collector = installTelemetry(
        { events: { on } } as never,
        () => ({ renderer: "Mali-G52", vendor: "ARM" }),
        { send, now: () => 42 },
      );
      expect(collector).not.toBeNull();
      expect(send).toHaveBeenCalled(); // Sofort-Sample beim Install
      expect(on).toHaveBeenCalledWith("step", expect.any(Function));
      expect(document.addEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
      collector?.stop();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("?telemetryEndpoint= ueberschreibt den Empfaenger", () => {
    vi.stubGlobal("location", {
      search: "?telemetry=1&telemetryEndpoint=http://192.168.5.5:9999/t",
      hostname: "localhost",
    });
    vi.stubGlobal("navigator", { userAgent: "HeadlessChrome Test" });
    vi.stubGlobal("document", { addEventListener: vi.fn(), hidden: false });
    try {
      const send = vi.fn(async (_url: string, _body: string) => {});
      installTelemetry({ events: { on: vi.fn() } } as never, () => undefined, { send });
      expect(send.mock.calls[0][0]).toBe("http://192.168.5.5:9999/t");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("frameStats / buildSample (K3: Sample-Aufbau)", () => {
  it("frameStats: p50/p95/max (nearest-rank), leer -> null", () => {
    expect(frameStats([])).toEqual({ p50: null, p95: null, max: null });
    const s = frameStats([16.7, 8.3, 16.6, 33.3, 16.7, 8.4, 16.6, 16.7, 16.6, 16.7]);
    // 10 Frames, sortiert: 8.3 8.4 16.6 16.6 16.6 16.7 16.7 16.7 16.7 33.3
    expect(s.p50).toBe(16.6); // Rang ceil(0.5*10)=5
    expect(s.p95).toBe(33.3); // Rang ceil(0.95*10)=10
    expect(s.max).toBe(33.3);
  });

  it("buildSample: Felder, Rundung, null fuer nicht verfuegbare Werte", () => {
    const sample = buildSample(
      1732780800000,
      { ua: "Android-Test", dpr: 1.75, screenW: 1280.4, screenH: 720.6 },
      { renderer: "Mali-G52", vendor: "ARM", build: "abc 2026" },
      {
        t: 62.34,
        fps: 59.87,
        frameMs: [16.6, 16.7, 16.8],
        quality: "full",
        renderScale: 1,
        gameScale: 3,
        enemies: 214,
        fxActive: 37,
        drawCalls: 148,
        heapMB: 233.44,
        scene: "run",
        character: "kael",
      },
    );
    expect(sample).toMatchObject({
      ts: 1732780800000,
      t: 62.3,
      fps: 59.9,
      quality: "full",
      renderScale: 1,
      gameScale: 3,
      enemies: 214,
      fxActive: 37,
      drawCalls: 148,
      heapMB: 233.4,
      scene: "run",
      character: "kael",
      renderer: "Mali-G52",
      vendor: "ARM",
      build: "abc 2026",
      ua: "Android-Test",
      dpr: 1.75,
      screenW: 1280,
      screenH: 721,
    });
    expect(sample.frameMsP50).toBe(16.7);
    expect(sample.frameMsP95).toBe(16.8);
    expect(sample.frameMsMax).toBe(16.8);
  });

  it("buildSample ohne Frame-Daten / ohne drawCalls/heap -> null statt NaN", () => {
    const sample = buildSample(
      1,
      { ua: "", dpr: 1, screenW: 0, screenH: 0 },
      { renderer: "", vendor: "", build: "dev" },
      {
        t: 0, fps: 0, frameMs: [], quality: null, renderScale: 1, gameScale: 3,
        enemies: 0, fxActive: 0, drawCalls: null, heapMB: null, scene: "boot",
        character: null,
      },
    );
    expect(sample.frameMsP50).toBeNull();
    expect(sample.frameMsP95).toBeNull();
    expect(sample.frameMsMax).toBeNull();
    expect(sample.drawCalls).toBeNull();
    expect(sample.heapMB).toBeNull();
  });
});

describe("collectReadings (lesend, nie werfend)", () => {
  const game = {
    events: { on: vi.fn() },
    scene: {
      isActive: (k: string) => k === "run",
      isPaused: () => false,
      getScene: (k: string) =>
        k === "run"
          ? {
              getQuickStats: () => ({
                time: 31.4, fps: 59.5, enemies: 120, character: "kael",
                lod: { level: "reduced" },
              }),
              combat: { fx: { active: [1, 2, 3, 4, 5] } },
            }
          : null,
    },
    loop: { actualFps: 60 },
    renderer: { drawCount: 96 },
    canvas: null,
  } as never;

  it("Run-Lesungen: t/fps/enemies/quality/fxActive/character/scene", () => {
    const r = collectReadings(game, [16.6, 16.7], 5000, 0);
    expect(r).toMatchObject({
      t: 31.4, fps: 59.5, enemies: 120, quality: "reduced",
      fxActive: 5, character: "kael", scene: "run",
      drawCalls: 96,
    });
    expect(r.frameMs).toEqual([16.6, 16.7]);
  });

  it("kaputte Spielobjekte werfen nicht (Telemetry stoert nie)", () => {
    const broken = {
      events: { on: vi.fn() },
      scene: {
        isActive: () => { throw new Error("boot chaos"); },
        isPaused: () => false,
        getScene: () => null,
      },
      loop: {},
      renderer: null,
      canvas: null,
    } as never;
    const r = collectReadings(broken, [], 1000, 0);
    expect(r.scene).toBe("boot");
    expect(r.fps).toBe(0);
    expect(r.drawCalls).toBeNull();
  });
});

describe("TelemetryCollector: Ringpuffer + Dauertakt", () => {
  it("recordFrame begrenzt auf 600 Eintraege und filtert Unsinn", () => {
    const { c } = makeCollector({});
    c.recordFrame(16.7);
    c.recordFrame(NaN);
    c.recordFrame(0);
    c.recordFrame(5000); // > 1 s: weg
    for (let i = 0; i < 700; i++) c.recordFrame(16.7);
    expect(c.collect().frameMsMax).toBe(16.7);
    expect(c.collect().frameMsP50).toBe(16.7);
  });

  it("Start-Tick sammelt pro Intervall genau ein Sample", async () => {
    vi.useFakeTimers();
    try {
      const { c, sent } = makeCollector({});
      c.start();
      c.recordFrame(16.7);
      await vi.advanceTimersByTimeAsync(TELEMETRY_INTERVAL_MS);
      c.stop();
      // sample() + flush() liefen im Tick: gesendet (letzte Antwort sofort)
      expect(sent.length).toBe(1);
      expect(c.pendingCount).toBe(0);
      expect(JSON.parse(sent[0].body)[0].frameMsMax).toBe(16.7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Puffer-Deckel: nicht mehr als 60 Samples zurueckgestellt", () => {
    const { c } = makeCollector({ send: async () => { throw new Error("offline"); } });
    for (let i = 0; i < 80; i++) c.sample();
    expect(c.pendingCount).toBe(60);
  });
});
