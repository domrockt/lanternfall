// Guard, Lane m10-render-1280-gap (K3, Befund-Karte #12969):
// "1280er Viewport — Ground-Chunks rechts/unten vom Spieler teils ungerendert".
//
// Zwei reine Pruefungen, kein DOM/Phaser-Lauf:
// (a) chunkRangeForView: die Chunk-Anfrage-Range muss den sichtbaren
//     Weltausschnitt fuer 960x540 / 1280x720 / 1920x1080 (und Teiler s=2)
//     LUECKENLOS abdecken — K1 hatte gezeigt, dass der Defect an der
//     Anfrage-/Install-Range bzw. am Start-Rueckstau haengt; die Range aus
//     scrollX + camera.width waere bei Teiler s>1 wieder zu schmal
//     (#4658-Fehlerklasse, nur im Culling gefixt gewesen).
// (b) backlogInstallsAllowed: der Start-Rueckstau-Policy (Zusatz-Installs
//     ueber das 1-Install-pro-Frame-Gate hinaus) greift genau dann, wenn ein
//     echter Rueckstau vorliegt und das Frame-Budget nicht defert.
import { describe, expect, it } from "vitest";
// GroundRenderer importiert Phaser; die getesteten Helfer sind rein
// (Muster tests/ground-chunk-budget.test.ts).
import { vi } from "vitest";
vi.mock("phaser", () => ({ default: {} }));
import {
  CHUNK_BACKLOG_READY_MIN,
  backlogInstallsAllowed,
  cameraWorldView,
  chunkRangeForView,
} from "../src/gfx/GroundRenderer";
import { CHUNK_SIZE, WORLD_SIZE } from "../src/config";

const VIEWPORTS = [
  { width: 960, height: 540 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];

/** Chunk-Spalten/Zeilen, die den (auf die Welt geklemmten) Ausschnitt schneiden. */
function intersectingCells(view: { left: number; top: number; width: number; height: number }) {
  const left = Math.max(0, view.left);
  const top = Math.max(0, view.top);
  const right = Math.min(WORLD_SIZE, view.left + view.width);
  const bottom = Math.min(WORLD_SIZE, view.top + view.height);
  const cols: number[] = [];
  const rows: number[] = [];
  for (let c = Math.floor(left / CHUNK_SIZE); c * CHUNK_SIZE < right; c++) cols.push(c);
  for (let r = Math.floor(top / CHUNK_SIZE); r * CHUNK_SIZE < bottom; r++) rows.push(r);
  return { cols, rows };
}

describe("chunkRangeForView — Chunk-Abdeckung lueckenlos (#12969)", () => {
  for (const vp of VIEWPORTS) {
    it(`deckt ${vp.width}x${vp.height} @ Teiler 1 an mehreren Positionen lueckenlos ab`, () => {
      const positions = [
        { scrollX: 0, scrollY: 0 },
        { scrollX: 1234, scrollY: 567 },
        { scrollX: WORLD_SIZE - vp.width, scrollY: WORLD_SIZE - vp.height },
        { scrollX: WORLD_SIZE / 2 - vp.width / 2, scrollY: WORLD_SIZE / 2 - vp.height / 2 },
      ];
      for (const p of positions) {
        const view = cameraWorldView(vp.width, vp.height, p.scrollX, p.scrollY, 1);
        const range = chunkRangeForView(view.left, view.top, view.width, view.height, 1);
        const { cols, rows } = intersectingCells(view);
        expect(cols.length, "Ausschnitt schneidet mindestens 1 Chunk-Spalte").toBeGreaterThan(0);
        for (const c of cols) {
          expect(range.minCx, `Spalte ${c} (links=${view.left}) unterhalb minCx ${range.minCx}`).toBeLessThanOrEqual(c);
          expect(range.maxCx, `Spalte ${c} (rechts=${view.left + view.width}) oberhalb maxCx ${range.maxCx}`).toBeGreaterThanOrEqual(c);
        }
        for (const r of rows) {
          expect(range.minCy).toBeLessThanOrEqual(r);
          expect(range.maxCy).toBeGreaterThanOrEqual(r);
        }
      }
    });
  }

  it("deckt bei Teiler 2 (camera.width = W/2) die VOLLE sichtbare Breite ab — alte scrollX+camera.width-Range nicht", () => {
    // 2560x1080 @ Teiler 2: Kamera-Rect 1280x540, sichtbar 2560x1080. Die alte
    // Formel (Range aus scrollX + camera.width) unterschreitet den sichtbaren
    // rechten Rand um camera.width/2 - margin = 384 px > CHUNK_SIZE — dort
    // fehlt eine ganze Chunk-Spalte. (Bei 1280x720 @ Teiler 2 waere das
    // Defizit nur 64 px und von der 1-Chunk-Margin absorbiert.)
    const camW = 1280;
    const camH = 540;
    const scrollX = 2000;
    const scrollY = 1500;
    const view = cameraWorldView(camW, camH, scrollX, scrollY, 0.5); // sichtbar 2560x1080
    const range = chunkRangeForView(view.left, view.top, view.width, view.height, 1);
    const { cols, rows } = intersectingCells(view);
    for (const c of cols) {
      expect(range.minCx).toBeLessThanOrEqual(c);
      expect(range.maxCx).toBeGreaterThanOrEqual(c);
    }
    for (const r of rows) {
      expect(range.minCy).toBeLessThanOrEqual(r);
      expect(range.maxCy).toBeGreaterThanOrEqual(r);
    }
    // Regressionssicherung: die ALTE Formel (Range nur ueber die Kamera-Rect)
    // ueberdeckte den sichtbaren Ausschnitt NICHT — dieser Befund darf nicht
    // zurueckkommen (analog #4658, dort nur im Culling gefixt).
    const oldMaxCx = Math.floor((scrollX + camW) / CHUNK_SIZE) + 1;
    expect(oldMaxCx).toBeLessThan(Math.max(...cols));
  });

  it("klemmt die Range an die Weltgrenzen (keine Chunks ausserhalb der Welt)", () => {
    const maxChunk = Math.ceil(WORLD_SIZE / CHUNK_SIZE) - 1;
    const neg = chunkRangeForView(-5000, -5000, 1280, 720, 1);
    expect(neg.minCx).toBe(0);
    expect(neg.minCy).toBe(0);
    const beyond = chunkRangeForView(WORLD_SIZE - 100, WORLD_SIZE - 100, 1280, 720, 1);
    expect(beyond.maxCx).toBe(maxChunk);
    expect(beyond.maxCy).toBe(maxChunk);
  });
});

describe("backlogInstallsAllowed — Start-Rueckstau-Policy (#12969)", () => {
  it("kein Backlog: kein Zusatz-Install (Ruhebetrieb bleibt geglaettet)", () => {
    expect(backlogInstallsAllowed(0, 0)).toBe(false);
    expect(backlogInstallsAllowed(CHUNK_BACKLOG_READY_MIN, 0)).toBe(false);
  });

  it("echter Rueckstau ohne Frame-Budget-Defer: Zusatz-Installs erlaubt", () => {
    expect(backlogInstallsAllowed(CHUNK_BACKLOG_READY_MIN + 1, 0)).toBe(true);
    expect(backlogInstallsAllowed(35, 0)).toBe(true);
  });

  it("Frame-Budget defert: keine Zusatz-Installs, auch bei grossem Backlog", () => {
    expect(backlogInstallsAllowed(35, 1)).toBe(false);
    expect(backlogInstallsAllowed(35, 3)).toBe(false);
  });
});
