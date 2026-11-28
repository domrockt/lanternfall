// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync, existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * m10-evo-element-guard (K3): Regression-Guard fuer Doms Evo-Regel
 * "Element muss auf einem Standbild ohne Beschriftung erkennbar sein"
 * (Phönix=Feuer, Winter=Frost, Soulpyre=kalt-türkis, Gewittersiegel=Blitz-Weiß,
 * Zornpendel=Glut/Rot, Dornensturm=grüne Dornen).
 *
 * Die Optik ist von Dom abgenommen (02:00Z-Regel, 10:00Z-Abnahme). Dieser Test
 * liest die committeten Standbild-Signaturen (shots/m10-evo-element-guard.json,
 * gemessen von scripts/m10-evo-element-guard.mjs auf der iGPU, Muster
 * run-determinism-Test: Belege liegen im Repo, der Test prueft sie) und faellt,
 * wenn eine kuenftige FX-/Depth-Aenderung (blend-band-followup, warmup-Chunks, …)
 * die Element-Identitaet stumm verschlechtert: Ziel-Farbband-Anteil unter der
 * kalibrierten Schwelle (Ist-min x 0.4, siehe Kopf des Probe-Skripts).
 *
 * Kalibrierung: Mesa Intel RPL-S (iGPU), Standbilder 640x360 + 960x540,
 * Spieler-Crop (42%/38% halbe Kante) um den fixen Teleport-Punkt 2048/2048, Seed 7.
 */

const url = (rel: string) => new URL(rel, import.meta.url);
const readJson = (rel: string) => JSON.parse(readFileSync(url(rel), "utf8"));

const EVOS = ["phoenix", "winter", "soulpyre", "gewittersiegel", "zornpendel", "dornensturm"] as const;
const TAGS = ["640", "960"] as const;

interface Band {
  share: number;
  threshold: number;
  direction: "min" | "max";
  ok: boolean;
}
interface EvoTag {
  shot: string;
  renderer: string;
  fxKeys: string[];
  aliveEnemies: number;
  crop: { x0: number; y0: number; x1: number; y1: number; w: number; h: number };
  paletteHist: number[];
  bands: Record<string, Band>;
}
interface GuardReport {
  generatedAt: string;
  renderer: string;
  valid: boolean;
  errors: string[];
  verdicts: Record<string, string>;
  evos: Record<string, Record<string, EvoTag>>;
}

const report = readJson("../shots/m10-evo-element-guard.json") as GuardReport;
const probeSource = readFileSync(url("../scripts/m10-evo-element-guard.mjs"), "utf8");

describe("m10-evo-element-guard: Element-Identitaet auf Standbildern (Doms Evo-Regel)", () => {
  it("Beleg ist iGPU-gueltig: kein SwiftShader/llvmpipe, 0 JS-Fehler", () => {
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.renderer).toMatch(/Mesa Intel/i);
    expect(report.renderer.toLowerCase()).not.toMatch(/swiftshader|llvmpipe|software/);
  });

  it("alle 6 Evos x 2 Aufloesungen vorhanden, Urteil GREEN", () => {
    for (const evo of EVOS) {
      expect(report.verdicts[evo], `verdict ${evo}`).toBe("GREEN");
      for (const tag of TAGS) {
        const r = report.evos[evo]?.[tag];
        expect(r, `evo ${evo} tag ${tag}`).toBeDefined();
        expect(r.shot).toBe(`shots/m10-evo-element-${evo}-${tag}.png`);
        expect(r.fxKeys.length, `fxKeys ${evo}/${tag}`).toBeGreaterThan(0);
        expect(r.aliveEnemies, `lebende Gegner ${evo}/${tag}`).toBeGreaterThan(0);
      }
    }
  });

  it("12 Standbild-PNGs sind committet und nicht leer", () => {
    for (const evo of EVOS) {
      for (const tag of TAGS) {
        const p = url(`../shots/m10-evo-element-${evo}-${tag}.png`).pathname;
        expect(existsSync(p), `${evo}-${tag}.png`).toBe(true);
        expect(statSync(p).size, `${evo}-${tag}.png`).toBeGreaterThan(10_000);
      }
    }
  });

  it("jede Farb-Signatur erfuellt ihre kalibrierte Schwelle (Element erkennbar)", () => {
    for (const evo of EVOS) {
      for (const tag of TAGS) {
        const bands = report.evos[evo][tag].bands;
        for (const [name, band] of Object.entries(bands)) {
          if (name === "grid") continue; // eigene Raster-Pruefung unten
          expect(band.ok, `${evo}/${tag}.${name} share=${band.share} ${band.direction} ${band.threshold}`).toBe(true);
          if (band.direction === "min") expect(band.share).toBeGreaterThanOrEqual(band.threshold);
          else expect(band.share).toBeLessThanOrEqual(band.threshold);
        }
      }
    }
  });

  it("Dornensturm: keine flaechnaige Raster-Signatur (Grid-CV >= Schwelle)", () => {
    for (const tag of TAGS) {
      const grid = report.evos.dornensturm[tag].bands.grid as unknown as { greenPerRowCv: number; threshold: number; ok: boolean };
      expect(grid.ok, `grid ${tag} cv=${grid.greenPerRowCv}`).toBe(true);
      expect(grid.greenPerRowCv).toBeGreaterThanOrEqual(grid.threshold);
    }
  });

  it("Source-Guard: Probe-Skript praesent, alle Waffen + Schwellen im Script synchron", () => {
    for (const weapon of ["phoenix", "eternal_winter", "soul_beacon", "thunder_seal", "wrath_pendulum", "thorn_storm"]) {
      expect(probeSource.includes(weapon), `addWeapon ${weapon}`).toBe(true);
    }
    // Schwellen im JSON muessen mit den committeten Werten im Probe-Skript uebereinstimmen
    // (verhindert stilles Lockern der Kalibrierung).
    for (const evo of EVOS) {
      for (const tag of TAGS) {
        for (const [name, band] of Object.entries(report.evos[evo][tag].bands)) {
          if (name === "grid") continue;
          const token = `${band.direction}: ${band.threshold}`;
          expect(probeSource.includes(token), `Schwelle ${evo}/${tag}.${name} = ${token} fehlt im Probe-Skript`).toBe(true);
        }
      }
    }
    // Paletten-Indizes der Zielbaender bleiben im 32er-Palette-Bereich.
    const idxArrays = [...probeSource.matchAll(/idx: \[([0-9, ]+)\]/g)].map((m) => m[1].split(",").map((s: string) => parseInt(s, 10)));
    expect(idxArrays.length).toBeGreaterThanOrEqual(10);
    for (const arr of idxArrays) for (const i of arr) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThanOrEqual(31);
  });
});
