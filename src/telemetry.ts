import type Phaser from "phaser";
import { GAME_SCALE, RENDER_SCALE } from "./config";

/**
 * M10 Device-Telemetry (Lane m10-device-telemetry): echte Endgeraete-Zahlen von
 * Doms Android-Tablet, ohne adb. Ein Sample wird je Qualitaetsstufe gesammelt
 * (M10-telemetry-budget: full 5 s, reduced 10 s, minimal 20 s) und gepuffert
 * an den Empfaenger auf dem Rig geschickt (`POST /t`, JSON-Liste).
 *
 * Grundaetze:
 * - KEINE personenbezogenen Daten: keine IDs, keine Position, keine Eingaben.
 *   Einzige halb-identifizierende Angabe ist der User-Agent (noetig, um APK- von
 *   Desktop-Laeufen zu unterscheiden; vom Briefing ausdruecklich gewuenscht).
 * - Aktiv nur mit `?telemetry=1` ODER im APK-Build (Host 127.0.0.1 + Android-UA).
 *   Desktop-Spieler senden NICHTS.
 * - Sendefehler werden still geschluckt; nie mehr als 1 Request je Sammel-Intervall
 *   (5/10/20 s je Qualitaetsstufe); das Spiel darf durch Telemetry nie blockieren.
 * - Abschalten: `?telemetry=0` gewinnt ueber alles (auch im APK).
 */

export const TELEMETRY_ENDPOINT = "http://10.10.50.185:5180/t";
export const TELEMETRY_INTERVAL_MS = 5000;

/**
 * M10-telemetry-budget: Sammel-Intervall, Frame-Puffer und Pending-Deckel je
 * Qualitaetsstufe (= LOD-Level aus logic/lod.ts, kommt als readings.quality rein).
 * Eigene Messkosten der Telemetry sollen sich nach dem Spielbudget richten:
 * wer auf `minimal` spielt, dem soll der Sampler auch weniger Arbeit/Last
 * machen. Werte (Vorher-Probe scripts/m10-telemetry-budget.mjs, Ist = 33.5 µs
 * je collect(), 334 B je Sample):
 * - `full`    = Ist-Verhalten bitleich (5 s / 600 / 60).
 * - `reduced` = halber Takt, Puffer 240 (4 s @ 60 FPS reicht fuer p50/p95/max).
 * - `minimal` = viertel Takt, Puffer 120 (2 s), Pending-Deckel 12 (2 min).
 */
export interface TelemetryBudget {
  /** Sammel-/Sendetakt in ms. */
  intervalMs: number;
  /** Max. Frame-Dauern im Ringpuffer (Sortier-/Kopierkosten je Sample). */
  frameBufferMax: number;
  /** Max. zurueckgestellte Samples im Sendepuffer. */
  pendingMax: number;
}

export const TELEMETRY_BUDGETS: Readonly<Record<"full" | "reduced" | "minimal", TelemetryBudget>> = {
  full: { intervalMs: 5000, frameBufferMax: 600, pendingMax: 60 },
  reduced: { intervalMs: 10000, frameBufferMax: 240, pendingMax: 24 },
  minimal: { intervalMs: 20000, frameBufferMax: 120, pendingMax: 12 },
};

/** Budget je Qualitaetsstufe (pur, getestet). `null`/unbekannt → `full` (Ist). */
export function telemetryBudgetFor(quality: string | null): TelemetryBudget {
  if (quality === "reduced") return TELEMETRY_BUDGETS.reduced;
  if (quality === "minimal") return TELEMETRY_BUDGETS.minimal;
  return TELEMETRY_BUDGETS.full;
}

export interface TelemetryEnv {
  ua: string;
  dpr: number;
  screenW: number;
  screenH: number;
}

export interface TelemetryStatic {
  /** WebGL debug info (UNMASKED_RENDERER/VENDOR) — nur EINMAL pro Lauf gelesen. */
  renderer: string;
  vendor: string;
  /** Commit-Hash + Build-Zeit (vite define __LF_BUILD__, "dev" im rohen Node). */
  build: string;
}

export interface TelemetryReadings {
  t: number;
  fps: number;
  frameMs: number[];
  quality: string | null;
  renderScale: number;
  gameScale: number;
  enemies: number;
  fxActive: number;
  drawCalls: number | null;
  heapMB: number | null;
  scene: string;
  character: string | null;
}

export interface TelemetrySample extends TelemetryEnv, Omit<TelemetryReadings, "frameMs"> {
  ts: number;
  frameMsP50: number | null;
  frameMsP95: number | null;
  frameMsMax: number | null;
  renderer: string;
  vendor: string;
  build: string;
}

/** Build-ID aus vite define (vite.config.ts liest `git rev-parse --short HEAD`). */
declare const __LF_BUILD__: string;

export function buildInfo(): string {
  try {
    return typeof __LF_BUILD__ === "string" && __LF_BUILD__ ? __LF_BUILD__ : "dev";
  } catch {
    return "dev";
  }
}

/**
 * Aktivierung (K2). `search` ohne Hash, `host` = location.hostname,
 * `ua` = navigator.userAgent. Nur getestete Wege:
 * - `?telemetry=1`  → an (auch auf dem Desktop, fuer lokale Probe-Laeufe)
 * - `?telemetry=0`  → aus, gewinnt ueber alles (auch im APK)
 * - kein Param + Host 127.0.0.1 + Android-UA (APK laedt ueber 127.0.0.1) → an
 * - sonst (Desktop-Spieler) → aus
 */
export function telemetryEnabled(search: string, host: string, ua: string): boolean {
  if (/[?&]telemetry=0(?:&|$)/.test(search)) return false;
  if (/[?&]telemetry=1(?:&|$)/.test(search)) return true;
  return host === "127.0.0.1" && /Android/i.test(ua);
}

/** p50/p95/max aus Frame-Dauern (ms). pXX = naechstgroesserer Rang (nearest-rank). */
export function frameStats(frameMs: number[]): { p50: number | null; p95: number | null; max: number | null } {
  if (frameMs.length === 0) return { p50: null, p95: null, max: null };
  const sorted = [...frameMs].sort((a, b) => a - b);
  const pick = (p: number): number => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    p50: round2(pick(0.5)),
    p95: round2(pick(0.95)),
    max: round2(sorted[sorted.length - 1]),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Sample aus Umwelt-, Static- und Laufzeit-Lesungen aufbauen (pur, getestet). */
export function buildSample(
  ts: number,
  env: TelemetryEnv,
  statics: TelemetryStatic,
  readings: TelemetryReadings,
): TelemetrySample {
  const stats = frameStats(readings.frameMs);
  return {
    ts,
    t: round1(readings.t),
    fps: round1(readings.fps),
    frameMsP50: stats.p50,
    frameMsP95: stats.p95,
    frameMsMax: stats.max,
    quality: readings.quality,
    renderScale: round2(readings.renderScale),
    gameScale: round2(readings.gameScale),
    enemies: readings.enemies,
    fxActive: readings.fxActive,
    drawCalls: readings.drawCalls,
    heapMB: readings.heapMB === null ? null : round1(readings.heapMB),
    scene: readings.scene,
    character: readings.character,
    renderer: statics.renderer,
    vendor: statics.vendor,
    build: statics.build,
    ua: env.ua,
    dpr: round2(env.dpr),
    screenW: Math.round(env.screenW),
    screenH: Math.round(env.screenH),
  };
}

/** Umwelt-Lesung (nur im Browser aufrufen; im Node-Test wird sie uebergeben). */
export function collectEnv(): TelemetryEnv {
  return {
    ua: typeof navigator !== "undefined" ? navigator.userAgent : "",
    dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    screenW: typeof screen !== "undefined" ? screen.width : 0,
    screenH: typeof screen !== "undefined" ? screen.height : 0,
  };
}

/** Nur die Laufzeit-Felder, die Telemetry aus dem Spiel liest (lesend, nie schreibend). */
interface RunLike {
  getQuickStats(): Record<string, unknown>;
  combat?: { fx?: { active?: unknown[] } } | null;
}

interface GameLike {
  events: { on(event: string, fn: (...args: unknown[]) => void): void };
  scene: { isActive(key: string): boolean; isPaused(key: string): boolean; getScene(key: string): unknown };
  loop: { actualFps: number };
  renderer: unknown;
  canvas: HTMLCanvasElement | null;
  registry?: { get(key: string): unknown };
}

const SCENE_ORDER = ["run", "charselect", "results", "credits", "title", "boot"] as const;

function activeSceneKey(game: GameLike): string {
  for (const key of SCENE_ORDER) {
    try {
      if (game.scene.isActive(key) || game.scene.isPaused(key)) return key;
    } catch { /* Szene evtl. noch nicht registriert */ }
  }
  return "boot";
}

/** Laufzeit-Lesungen aus dem Spiel sammeln. Alles eingehuellt: Telemetry darf nie werfen. */
export function collectReadings(game: GameLike, frameMs: number[], nowMs: number, startedAtMs: number): TelemetryReadings {
  const readings: TelemetryReadings = {
    t: Math.round((nowMs - startedAtMs)) / 1000,
    fps: round1(Number(game.loop?.actualFps ?? 0)),
    frameMs: [...frameMs],
    quality: null,
    renderScale: RENDER_SCALE,
    gameScale: GAME_SCALE,
    enemies: 0,
    fxActive: 0,
    drawCalls: null,
    heapMB: null,
    scene: "boot",
    character: null,
  };
  try {
    readings.scene = activeSceneKey(game);
    if (game.scene.isActive("run") || game.scene.isPaused("run")) {
      const run = game.scene.getScene("run") as RunLike;
      const qs = run.getQuickStats();
      const time = Number(qs.time ?? readings.t);
      if (Number.isFinite(time)) readings.t = time;
      readings.fps = round1(Number(qs.fps ?? readings.fps));
      readings.enemies = Number(qs.enemies ?? 0);
      readings.character = typeof qs.character === "string" ? qs.character : null;
      const lod = qs.lod as { level?: string } | undefined;
      readings.quality = typeof lod?.level === "string" ? lod.level : null;
      readings.fxActive = run.combat?.fx?.active?.length ?? 0;
    }
    const drawCalls = (game.renderer as { drawCount?: unknown } | null)?.drawCount;
    if (typeof drawCalls === "number" && Number.isFinite(drawCalls)) readings.drawCalls = drawCalls;
    const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory;
    const heap = memory?.usedJSHeapSize;
    if (typeof heap === "number" && Number.isFinite(heap)) readings.heapMB = heap / (1024 * 1024);
  } catch { /* Telemetry darf das Spiel nie stoeren */ }
  return readings;
}

export interface TelemetryOptions {
  endpoint?: string;
  /** Fester Intervall-Override (Tests/Probes); sonst gilt das Qualitaets-Budget
   * (TELEMETRY_BUDGETS, folgt readings.quality). */
  intervalMs?: number;
  /** Sendefunktion, test-injizierbar (Default: fetch mit keepalive). */
  send?: (url: string, body: string) => Promise<unknown>;
  now?: () => number;
  /** SetInterval/ClearInterval test-injizierbar. */
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

interface RendererInfoLike {
  renderer?: string;
  vendor?: string;
}

/**
 * Collector: haengt sich an den Phaser-Step (Frame-Dauern), sammelt alle
 * `intervalMs` ein Sample und sendet den Puffer (max. 1 Request / Intervall).
 * Sendefehler schlucken still und bleiben im Puffer (aeltere fallen heraus).
 */
export class TelemetryCollector {
  private frameMs: number[] = [];
  private pending: TelemetrySample[] = [];
  private lastSentAtMs = -Infinity;
  private startedAtMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Aktuelles Sammel-Budget (M10-telemetry-budget), folgt readings.quality. */
  private budget: TelemetryBudget = telemetryBudgetFor(null);

  constructor(
    private game: GameLike,
    private env: TelemetryEnv,
    private statics: TelemetryStatic,
    private opts: TelemetryOptions = {},
  ) {
    this.startedAtMs = (opts.now ?? Date.now)();
  }

  /** Wirksames Intervall: Test-Override (opts.intervalMs) gewinnt, sonst Budget. */
  private effectiveIntervalMs(): number {
    return this.opts.intervalMs ?? this.budget.intervalMs;
  }

  /** Frame-Dauer registrieren (Phaser-Step-Delta in ms). Deckel 2 s: echte
   * Frame-Hitches (z. B. Thermik-Drosselung auf dem Tablet) bleiben sichtbar. */
  recordFrame(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 2000) return;
    this.frameMs.push(deltaMs);
    if (this.frameMs.length > this.budget.frameBufferMax) this.frameMs.shift();
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Aktuelles Budget (fuer Tests/Probes). */
  get currentBudget(): TelemetryBudget {
    return this.budget;
  }

  collect(): TelemetrySample {
    const nowMs = (this.opts.now ?? Date.now)();
    return buildSample(
      nowMs,
      this.env,
      this.statics,
      collectReadings(this.game, this.frameMs, nowMs, this.startedAtMs),
    );
  }

  /** Beispiel sammeln, Budget je Qualitaetsstufe nachziehen, Puffer-Deckel beachten. */
  sample(): TelemetrySample {
    const s = this.collect();
    this.applyBudget(telemetryBudgetFor(s.quality));
    this.pending.push(s);
    if (this.pending.length > this.budget.pendingMax) this.pending.shift();
    return s;
  }

  /** Budget wechseln: Frame-Puffer kuerzen, laufenden Timer neu takten. */
  private applyBudget(next: TelemetryBudget): void {
    if (next === this.budget) return;
    const prevIntervalMs = this.effectiveIntervalMs();
    this.budget = next;
    if (this.frameMs.length > next.frameBufferMax) {
      this.frameMs.splice(0, this.frameMs.length - next.frameBufferMax);
    }
    if (this.pending.length > next.pendingMax) {
      this.pending.splice(0, this.pending.length - next.pendingMax);
    }
    if (this.timer && prevIntervalMs !== this.effectiveIntervalMs()) this.reschedule();
  }

  /** Laufenden Timer auf das wirksame Intervall umsetzen (nur ohne Override). */
  private reschedule(): void {
    if (!this.timer) return;
    (this.opts.clearInterval ?? clearInterval)(this.timer);
    this.timer = (this.opts.setInterval ?? setInterval)(
      () => {
        this.sample();
        void this.flush();
      },
      this.effectiveIntervalMs(),
    );
  }

  canSend(nowMs: number): boolean {
    return nowMs - this.lastSentAtMs >= this.effectiveIntervalMs();
  }

  /**
   * Puffer senden. True = Request raus (oder nichts zu senden); false = gedrosselt.
   * Fehler werden still geschluckt; Samples bleiben im Puffer und werden spaeter
   * erneut versucht.
   */
  async flush(): Promise<boolean> {
    if (this.pending.length === 0) return true;
    const nowMs = (this.opts.now ?? Date.now)();
    if (!this.canSend(nowMs)) return false;
    this.lastSentAtMs = nowMs;
    const body = JSON.stringify(this.pending);
    const sent = this.pending.length;
    try {
      const send = this.opts.send ?? defaultSend;
      await send(this.opts.endpoint ?? TELEMETRY_ENDPOINT, body);
      this.pending.splice(0, sent);
    } catch { /* still schlucken; Puffer bleibt, naechster Flush versucht erneut */ }
    return true;
  }

  start(): void {
    if (this.timer) return;
    this.timer = (this.opts.setInterval ?? setInterval)(
      () => {
        this.sample();
        void this.flush();
      },
      this.effectiveIntervalMs(),
    );
    this.game.events.on("step", (_time: unknown, delta: unknown) => {
      this.recordFrame(Number(delta));
    });
  }

  stop(): void {
    if (this.timer) {
      (this.opts.clearInterval ?? clearInterval)(this.timer);
      this.timer = null;
    }
  }
}

function defaultSend(url: string, body: string): Promise<unknown> {
  return fetch(url, { method: "POST", body, keepalive: true });
}

/**
 * Installation (K2). Gibt `null` zurueck, wenn Telemetry aus ist — der aufrufende
 * Code (debug.ts) hat dann nichts zu tun. Statics (renderer/vendor) werden EINMAL
 * vor dem Start gelesen, `readRendererInfo` liefert sie lazily.
 */
export function installTelemetry(
  game: Phaser.Game,
  readRendererInfo: () => RendererInfoLike | undefined,
  opts: TelemetryOptions = {},
): TelemetryCollector | null {
  let search = "";
  let host = "";
  let ua = "";
  try {
    search = typeof location !== "undefined" ? location.search : "";
    host = typeof location !== "undefined" ? location.hostname : "";
    ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  } catch { /* kein Browser-Umfeld */ }
  if (!telemetryEnabled(search, host, ua)) return null;

  let endpoint = opts.endpoint;
  if (!endpoint && typeof URLSearchParams !== "undefined") {
    const override = new URLSearchParams(search).get("telemetryEndpoint");
    if (override) endpoint = override;
  }

  const info = readRendererInfo() ?? {};
  const collector = new TelemetryCollector(game as unknown as GameLike, collectEnv(), {
    renderer: String(info.renderer ?? ""),
    vendor: String(info.vendor ?? ""),
    build: buildInfo(),
  }, { ...opts, endpoint });

  collector.sample(); // erster Sample sofort (Start-Zustand, auch vor dem 5-s-Tick)
  void collector.flush();
  collector.start();
  // Letzte Chance beim Verstecken/Schliessen der App: Puffer mit keepalive raus.
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) void collector.flush();
    });
  }
  return collector;
}
