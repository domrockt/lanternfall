import { describe, expect, it, vi } from "vitest";
import {
  TELEMETRY_BUDGETS,
  TELEMETRY_INTERVAL_MS,
  TelemetryCollector,
  telemetryBudgetFor,
  telemetryEnabled,
  type TelemetryEnv,
  type TelemetryStatic,
} from "../src/telemetry";

/**
 * M10-telemetry-budget: Budget-Matrix je Qualitaetsstufe (Sammel-Intervall,
 * Frame-Puffer, Pending-Deckel) und deren dynamische Anpassung im Collector.
 * Aktivierungsmatrix (?telemetry=1 / APK / Desktop aus) bleibt unveraendert —
 * hier als Bitleich-Regression, voll abgedeckt in tests/telemetry.test.ts.
 */

const env: TelemetryEnv = { ua: "test", dpr: 2, screenW: 800, screenH: 360 };
const statics: TelemetryStatic = { renderer: "Mali-G52", vendor: "ARM", build: "abc1234" };

/** Spiel-Stub, dessen Run-Szene die gegebene LOD-Stufe meldet. */
function gameWithTier(level: string | null) {
  return {
    events: { on: vi.fn() },
    scene: {
      isActive: (k: string) => k === "run",
      isPaused: () => false,
      getScene: (k: string) =>
        k === "run"
          ? {
              getQuickStats: () => ({
                time: 5, fps: 60, enemies: 300, character: "kael", lod: { level },
              }),
              combat: { fx: { active: [] } },
            }
          : null,
    },
    loop: { actualFps: 60 },
    renderer: { drawCount: 10 },
    canvas: null,
  } as never;
}

function makeCollector(
  game: ReturnType<typeof gameWithTier>,
  opts: { send?: (url: string, body: string) => Promise<unknown>; now?: () => number; intervalMs?: number } = {},
): TelemetryCollector {
  return new TelemetryCollector(game, env, statics, {
    intervalMs: opts.intervalMs,
    now: opts.now,
    send: opts.send ?? (async () => {}),
  });
}

describe("Budget-Matrix je Qualitaetsstufe", () => {
  it("full = Ist-Verhalten bitleich (5 s / 600 / 60)", () => {
    expect(TELEMETRY_BUDGETS.full).toEqual({
      intervalMs: TELEMETRY_INTERVAL_MS,
      frameBufferMax: 600,
      pendingMax: 60,
    });
    expect(telemetryBudgetFor("full")).toBe(TELEMETRY_BUDGETS.full);
  });

  it("reduced = halber Takt, Puffer 240, Deckel 24", () => {
    expect(telemetryBudgetFor("reduced")).toEqual({
      intervalMs: 10000,
      frameBufferMax: 240,
      pendingMax: 24,
    });
  });

  it("minimal = viertel Takt, Puffer 120, Deckel 12", () => {
    expect(telemetryBudgetFor("minimal")).toEqual({
      intervalMs: 20000,
      frameBufferMax: 120,
      pendingMax: 12,
    });
  });

  it("null/unbekannt → full (Ist), nie ein Wert unter dem Ist-Takt", () => {
    expect(telemetryBudgetFor(null)).toBe(TELEMETRY_BUDGETS.full);
    expect(telemetryBudgetFor("quatsch")).toBe(TELEMETRY_BUDGETS.full);
  });
});

describe("Collector folgt der Qualitaetsstufe", () => {
  it("sample() mit minimal: Budget wechselt, Frame-Puffer auf 120 gekuerzt", () => {
    const c = makeCollector(gameWithTier("minimal"));
    for (let i = 0; i < 600; i++) c.recordFrame(16.7);
    c.sample();
    expect(c.currentBudget).toBe(TELEMETRY_BUDGETS.minimal);
    const stats = c.collect();
    expect(stats.frameMsP50).toBe(16.7);
    // Puffer muss auf 120 geschrumpft sein (p95 aus 2 s Daten, nicht 10 s):
    expect(stats.frameMsP95).toBe(16.7);
    // weiteres recordFrame ueber den neuen Deckel hinaus:
    for (let i = 0; i < 200; i++) c.recordFrame(33.3);
    expect(c.collect().frameMsP50).toBe(33.3); // alte 16.7er sind rausgedreht
  });

  it("sample() mit reduced: Budget wechselt, Pending-Deckel 24 greift", () => {
    const c = makeCollector(gameWithTier("reduced"), {
      send: async () => { throw new Error("offline"); },
    });
    for (let i = 0; i < 600; i++) c.recordFrame(16.7);
    for (let i = 0; i < 40; i++) c.sample();
    expect(c.currentBudget).toBe(TELEMETRY_BUDGETS.reduced);
    expect(c.pendingCount).toBe(24); // 60-Deckel des Ist wuerde 60 melden
  });

  it("Drosselung folgt dem Tier-Intervall (minimal: erst nach 20 s wieder senden)", async () => {
    let t = 0;
    const sent: string[] = [];
    const c = makeCollector(gameWithTier("minimal"), {
      now: () => t,
      send: async (_url, body) => { sent.push(body); },
    });
    c.sample();
    expect(await c.flush()).toBe(true);
    expect(sent.length).toBe(1);
    t = 10_000;
    c.sample();
    expect(await c.flush()).toBe(false); // 10 s < 20 s Tier-Intervall
    expect(sent.length).toBe(1);
    t = 20_000;
    expect(await c.flush()).toBe(true);
    expect(sent.length).toBe(2);
  });

  it("opts.intervalMs-Override gewinnt weiter (Tests/Probes)", async () => {
    let t = 0;
    const sent: string[] = [];
    const c = makeCollector(gameWithTier("minimal"), {
      now: () => t,
      intervalMs: 5000,
      send: async (_url, body) => { sent.push(body); },
    });
    c.sample();
    await c.flush();
    t = 5000;
    c.sample();
    expect(await c.flush()).toBe(true); // Override 5 s, nicht Tier-20 s
    expect(sent.length).toBe(2);
  });

  it("Start-Tick: nach Stufenwechsel wird der Timer neu getaktet (minimal: 20 s)", async () => {
    vi.useFakeTimers();
    try {
      let t = 0;
      const sent: string[] = [];
      const c = makeCollector(gameWithTier("minimal"), {
        now: () => t,
        send: async (_url, body) => { sent.push(body); },
      });
      c.start();
      await vi.advanceTimersByTimeAsync(5000); // erster Tick (Ist-Takt 5 s)
      expect(sent.length).toBe(1); // Budget jetzt minimal, Timer auf 20 s
      t = 15_000;
      await vi.advanceTimersByTimeAsync(10_000); // 5 s + 10 s = 15 s: kein Tick
      expect(sent.length).toBe(1);
      t = 25_000;
      await vi.advanceTimersByTimeAsync(10_000); // naechster Tick bei 25 s
      expect(sent.length).toBe(2);
      c.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Zurueck auf full: Budget kehrt aufs Ist zurueck", () => {
    let level: string | null = "minimal";
    const game = {
      events: { on: vi.fn() },
      scene: {
        isActive: (k: string) => k === "run",
        isPaused: () => false,
        getScene: (k: string) =>
          k === "run"
            ? { getQuickStats: () => ({ time: 5, fps: 60, enemies: 0, character: null, lod: { level } }) }
            : null,
      },
      loop: { actualFps: 60 },
      renderer: null,
      canvas: null,
    } as never;
    const c = makeCollector(game);
    c.sample(); // minimal
    expect(c.currentBudget).toBe(TELEMETRY_BUDGETS.minimal);
    level = "full";
    c.sample(); // wieder full
    expect(c.currentBudget).toBe(TELEMETRY_BUDGETS.full);
  });
});

describe("Aktivierung bitleich (Regression)", () => {
  it("?telemetry=1 / APK an, Desktop + ?telemetry=0 aus — unveraendert zum Ist", () => {
    expect(telemetryEnabled("?telemetry=1", "localhost", "Mozilla/5.0 X11")).toBe(true);
    expect(telemetryEnabled("", "127.0.0.1", "Mozilla/5.0 (Linux; Android 14)")).toBe(true);
    expect(telemetryEnabled("", "10.10.50.185", "Mozilla/5.0 X11; Linux x86_64")).toBe(false);
    expect(telemetryEnabled("?telemetry=0", "127.0.0.1", "Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });
});
