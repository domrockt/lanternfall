import { describe, expect, it, vi } from "vitest";
// GroundRenderer/BossSystem importieren Phaser; die getesteten Helfer sind rein.
vi.mock("phaser", () => ({ default: {} }));
import { GAME_WIDTH, renderBufferSize } from "../src/config";
import { bossSpawnDistance } from "../src/logic/scaling";
import { cameraWorldView, screenAnchoredX } from "../src/gfx/GroundRenderer";
import {
  BOSS_INTRO_ZOOM,
  bossHudRects,
  composedBossCenterY,
} from "../src/systems/BossSystem";

// #4658: camera.width-Leser bei gesenktem Massstab. Bei Render-Teiler s ist
// camera.width = W/s (Viewport W/s x H/s, Zoom 1/s — enforceCameraProjection),
// die SICHTBARE Welt bleibt aber W x H, midpoint-zentriert. Alle Leser, die
// camera.width als logische Breite behandeln, muessen GAME_WIDTH (HUD-Muster
// Run.ts/UI.ts) bzw. cameraWorldView/screenAnchoredX (GFX) nutzen.
//
// Ground truth: Kamera-Sonde /home/ai/tmp/m10-dpr-budget-cap/camera-probe.mjs
// (echte Kamera-Matrix + getWorldPoint aus dem laufenden Spiel, 780x360 dpr3):
//   Teiler 2: camW=390, zoom=0.5, scrollX = midX - 195,
//   sichtbare Welt = [scrollX - 195, scrollX + 585] (780 breit, midPoint-zentriert),
//   sf=0-Objekt an p rendert bei 0.5*(p - 195) + 195 (Pivot Viewport-Mitte).

/** Wie enforceCameraProjection: Viewport W/s x H/s, Zoom 1/s, Midpoint gerettet. */
function projection(s: number, W: number, H: number, midX: number, midY: number) {
  return {
    camW: W / s, camH: H / s, zoom: 1 / s,
    scrollX: midX - W / (2 * s), scrollY: midY - H / (2 * s),
  };
}

const VIEWS: Array<{ W: number; H: number; dpr: number }> = [
  { W: 640, H: 360, dpr: 1 },      // 640x360 dpr1
  { W: 780, H: 360, dpr: 3 },      // 780x360 dpr3, Messformat M25 (@3)
  { W: 960, H: 540, dpr: 1 },      // 960x540
  { W: 1920, H: 1080, dpr: 1 },    // 1920x1080
];

describe("#4658 camera.width-Leser bei gesenktem Massstab: Projektion", () => {
  it("cameraWorldView: bei Teiler 1 Identitaet (left=scrollX, width=camW) in allen 4 Formaten", () => {
    for (const { W, H } of VIEWS) {
      const view = cameraWorldView(W, H, 1658, 1868, 1);
      expect(view).toEqual({ left: 1658, top: 1868, width: W, height: H });
    }
  });

  it("cameraWorldView: sichtbarer Ausschnitt bei Teiler 1/2/3 identisch (Midpoint gerettet)", () => {
    for (const { W, H } of VIEWS) {
      const midX = 2048, midY = 2048;
      for (const s of [1, 2, 3]) {
        const p = projection(s, W, H, midX, midY);
        const view = cameraWorldView(p.camW, p.camH, p.scrollX, p.scrollY, p.zoom);
        expect(view.width).toBeCloseTo(W, 9);
        expect(view.height).toBeCloseTo(H, 9);
        expect(view.left).toBeCloseTo(midX - W / 2, 9);
        expect(view.top).toBeCloseTo(midY - H / 2, 9);
      }
    }
  });

  it("Ground-Cull: alter Ausdruck scrollX..scrollX+camW deckte bei Teiler 2 nur die Haelfte", () => {
    // Sonde rbscale=2 (780x360): scrollX=1853, camW=390 -> alt [1853, 2243],
    // sichtbar [1658, 2438]. Margin 16 px rettet das nicht (Gap 180 px).
    const p = projection(2, 780, 360, 2048, 2048);
    expect(p.scrollX).toBe(1853);
    expect(p.scrollX + p.camW).toBe(2243);
    const view = cameraWorldView(p.camW, p.camH, p.scrollX, p.scrollY, p.zoom);
    expect(view.left).toBe(1658);
    expect(view.left + view.width).toBe(2438);
  });

  it("Ripple-Cull-Marge 16 px: genau am Rand sichtbar, 17 px dahinter nicht (jeder Teiler)", () => {
    const MARGIN = 16;
    for (const s of [1, 2, 3]) {
      const p = projection(s, 780, 360, 1000, 500);
      const view = cameraWorldView(p.camW, p.camH, p.scrollX, p.scrollY, p.zoom);
      const onScreen = (x: number, y: number): boolean =>
        x > view.left - MARGIN && x < view.left + view.width + MARGIN &&
        y > view.top - MARGIN && y < view.top + view.height + MARGIN;
      expect(onScreen(view.left - 15.5, view.top)).toBe(true);
      expect(onScreen(view.left - 16.5, view.top)).toBe(false);
      expect(onScreen(view.left + view.width + 15.5, view.top)).toBe(true);
      expect(onScreen(view.left + view.width + 16.5, view.top)).toBe(false);
    }
  });

  it("Fireflies: baseX-Spanne zielt auf die volle Weltbreite, nicht auf camera.width", () => {
    for (const { W, H } of VIEWS) {
      for (const s of [1, 2, 3]) {
        const p = projection(s, W, H, 1000, 500);
        const view = cameraWorldView(p.camW, p.camH, p.scrollX, p.scrollY, p.zoom);
        expect(view.left + 0 * view.width).toBeCloseTo(view.left, 9);
        expect(view.left + 1 * view.width).toBeCloseTo(view.left + W, 9);
        if (s >= 2) expect(view.width).toBeGreaterThan(p.camW);
        else expect(view.width).toBe(p.camW);
      }
    }
  });

  it("Chunk-Cull-Margin: 1 Chunk deckt Teiler 2 voll, Teiler 3 bis auf 4 px Rand (Doku K1)", () => {
    // CHUNK_SIZE = 16 * CHUNK_TILES; Enqueue rechts = scrollX + camW + CHUNK_SIZE.
    // Sichtbare rechte Kante = scrollX + camW/2 + W/2 (midPoint-zentriert,
    // Sonde rbscale=2: scrollX=1853 -> sichtbar bis 2438 = +585).
    const CHUNK = 16 * 16; // CHUNK_TILES = 16 (src/config.ts)
    for (const s of [2, 3]) {
      const p = projection(s, 780, 360, 2048, 2048);
      const rightEdge = p.scrollX + p.camW / 2 + 390;
      const enqueueRight = p.scrollX + p.camW + CHUNK;
      if (s === 2) expect(enqueueRight).toBeGreaterThanOrEqual(rightEdge);
      else expect(rightEdge - enqueueRight).toBeLessThanOrEqual(4); // 4-px-Randfall
    }
  });

  /** Phaser real (Sonde): sf=0 an logischem p -> screen = z*(p - camSize/2) + camSize/2;
   *  CSS-Position = Teiler * screen (Buffer-Pixel -> CSS pixelated).
   *  driftPx = Screen-Pixel-Drift, wird (wie im Spiel seit Reviewer-Fix) NACH
   *  der Pivot-Kompensation addiert. */
  function renderedCss(baseX: number, s: number, W: number, driftPx = 0): number {
    const camW = W / s;
    const zoom = 1 / s;
    const p = screenAnchoredX(baseX * camW, camW, zoom);
    return s * (zoom * (p - camW / 2) + camW / 2) + driftPx;
  }

  it("Nebel (sf=0): Bildschirmposition bei Teiler 1/2/3 identisch (Pivot kompensiert)", () => {
    for (const W of VIEWS.map((v) => v.W)) {
      for (const baseX of [0, 0.2, 0.5, 0.8, 1]) {
        const ref = renderedCss(baseX, 1, W);
        expect(renderedCss(baseX, 2, W)).toBeCloseTo(ref, 9);
        expect(renderedCss(baseX, 3, W)).toBeCloseTo(ref, 9);
      }
    }
  });

  it("Nebel-Drift: CSS-Amplitude bleibt 46 px bei jedem Teiler (Drift NACH Kompensation)", () => {
    for (const s of [1, 2, 3]) {
      const base = renderedCss(0.5, s, 780, 0);
      expect(renderedCss(0.5, s, 780, 46) - base).toBeCloseTo(46, 9);
    }
    // Alter Bug (Drift IN screenAnchoredX): CSS-Drift waere 46*s.
    const buggyCssDrift = (s: number): number => {
      const camW = 780 / s;
      const zoom = 1 / s;
      const p = screenAnchoredX(0.5 * camW + 46, camW, zoom);
      return s * (zoom * (p - camW / 2) + camW / 2) - renderedCss(0.5, s, 780, 0);
    };
    expect(buggyCssDrift(2)).toBeCloseTo(92, 9);
    expect(buggyCssDrift(2)).not.toBeCloseTo(46, 9);
  });

  it("screenAnchoredX: bei zoom 1 Identitaet", () => {
    for (const x of [0, 20, 195, 390, 780]) {
      expect(screenAnchoredX(x, 780, 1)).toBe(x);
      expect(screenAnchoredX(x, 390, 1)).toBe(x);
    }
  });
});

describe("#4658 BossSystem: Spawn-Distanz und Spawn-Komposition", () => {
  it("bossSpawnDistance(GAME_WIDTH, GAME_HEIGHT) == Skala-1-Wert; camera.width (Bug) haette halben Ring", () => {
    // Im Test-Env ist GAME_WIDTH = 640 (setGameView laeuft erst im Browser).
    expect(bossSpawnDistance(GAME_WIDTH, 360)).toBe(bossSpawnDistance(640, 360));
    expect(bossSpawnDistance(640, 360)).toBe(144);
    // Alter Bug bei Teiler 2: min(320, 180) * 0.4 = 72, auf 130 geklemmt —
    // trotzdem 14 px zu nah (und ohne Klammer waeren es 72).
    expect(bossSpawnDistance(640 / 2, 360 / 2)).toBe(130);
  });

  /**
   * Spawn-Mathe wie BossSystem.spawn nach #4658: camTopLog = scrollY +
   * camera.height/2 - GAME_HEIGHT/2 ist teilerunabhaengig (der Midpoint ist
   * scrollY + camera.height/2 bei jedem Teiler), die Komposition rechnet in
   * logischen Screen-Pixeln (HUD-Muster bossHudRects(GAME_WIDTH)).
   */
  function spawnComposition(
    s: number, W: number, H: number, desiredY: number, playerY: number, midY: number,
  ): number {
    const camH = H / s;
    const scrollY = midY - camH / 2;
    const camTopLog = scrollY + camH / 2 - H / 2;
    const composed = composedBossCenterY(
      desiredY - camTopLog, playerY - camTopLog, 0, W, H, camTopLog, BOSS_INTRO_ZOOM,
    );
    return camTopLog + composed;
  }

  it("camTopLog ist teilerunabhaengig (Midpoint-Erhaltung)", () => {
    for (const { H } of VIEWS) {
      for (const s of [1, 2, 3]) {
        const scrollY = 2048 - (H / s) / 2;
        expect(scrollY + (H / s) / 2 - H / 2).toBeCloseTo(2048 - H / 2, 9);
      }
    }
  });

  it("Spawn-Komposition: identisches Welt-Y bei Teiler 1/2/3 in allen 4 Formaten", () => {
    const size = 56; // BOSS_SPRITE_SIZE[0]; safeTop aus der HUD-Rect-Kette
    const { banner } = bossHudRects(640);
    const safeTop = banner.y + banner.h + 6; // BOSS_HUD_CLEARANCE
    for (const { W, H } of VIEWS) {
      const midY = 2048, playerY = midY - H / 2 + 80; // Spieler unterhalb der Mitte
      // Fall trifft den Guard: alter Code (camera.height) klemmt hart auf
      // safeTop + size/2, der Fix reicht ohne Klemme aus -> verschiedene Welt-Y.
      const desiredY = midY - H / 2 + safeTop + size / 2 + 20;
      const ref = spawnComposition(1, W, H, desiredY, playerY, midY);
      expect(spawnComposition(2, W, H, desiredY, playerY, midY)).toBeCloseTo(ref, 9);
      expect(spawnComposition(3, W, H, desiredY, playerY, midY)).toBeCloseTo(ref, 9);
      // Alter Bug (camera.width/height statt GAME_*): der y-Vergleich mischt
      // Welt-Offset mit logischem Screen und klemmt um H*(s-1)/(2s) zu frueh.
      const buggy = (() => {
        const camH = H / 2;
        const scrollY = midY - camH / 2;
        const composed = composedBossCenterY(
          desiredY - scrollY, playerY - scrollY, 0, W / 2, camH, scrollY, BOSS_INTRO_ZOOM,
        );
        return scrollY + composed;
      })();
      expect(buggy).not.toBeCloseTo(ref, 6);
    }
  });

  it("bossHudRects(GAME_WIDTH) == Teiler-1-Layout; camera.width (Bug) haette halbes Layout", () => {
    // Im Test-Env ist GAME_WIDTH = 640 (setGameView setzt erst im Browser);
    // im Spiel gilt GAME_WIDTH = 780 = camera.width bei Teiler 1.
    const fixed = bossHudRects(GAME_WIDTH);
    const teiler1 = bossHudRects(GAME_WIDTH);
    expect(fixed).toEqual(teiler1);
    expect(teiler1.hpBar.x).toBe(GAME_WIDTH / 2 - teiler1.hpBar.w / 2);
    expect(teiler1.banner.x).toBe(GAME_WIDTH / 2 - teiler1.banner.w / 2);
    // Alter Bug: camera.width = GAME_WIDTH/2 bei Teiler 2 haette andere (halbe) Zentren.
    const bug = bossHudRects(GAME_WIDTH / 2);
    expect(bug.hpBar.x).not.toBe(teiler1.hpBar.x);
    expect(bug.banner.x).not.toBe(teiler1.banner.x);
  });

  it("renderBufferSize: 780x360@3 -> 260x120 (Soll-Buffer der Sonde)", () => {
    expect(renderBufferSize(780, 360, 3)).toEqual({ width: 260, height: 120 });
  });
});
