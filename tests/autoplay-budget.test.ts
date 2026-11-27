import { describe, expect, it } from "vitest";
import { botDirection, chooseBestOffer, offerScore, type BotInput } from "../src/logic/autoplay";
import type { Offer } from "../src/logic/levelup";

/**
 * K4-Aequivalenz-Fixture: bitidentische Entscheidungen gegen den Vorher-Stand
 * (git cf85540^, alte botDirection/offerScore-Implementierung). Generiert mit
 * scripts-seitigem A/B-Vergleich (48 Szenen, 600 Score-Faelle, 200 Entscheidungen);
 * der Generator liegt unter ~/tmp/m10-autoplay-budget/gen-fixture.mjs, Beleg im
 * Karten-Commit (#5721) und in docs/lanes/m10-autoplay-budget.md.
 */

// Szenen-Builder — identisch zum Generator (Seed 1000 + s*77).
function scene(s: number): BotInput {
  let a = (1000 + s * 77) >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const world = 960;
  const px = 40 + rng() * (world - 80);
  const py = 40 + rng() * (world - 80);
  const counts = [0, 1, 2, 5, 30, 120, 500, 500];
  const n = counts[s % counts.length]!;
  const enemies = [];
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = rng() < 0.4 ? rng() * 150 : 150 + rng() * 600;
    const e: { x: number; y: number; threat: number; radius?: number } = {
      x: Math.max(2, Math.min(world - 2, px + Math.cos(ang) * dist)),
      y: Math.max(2, Math.min(world - 2, py + Math.sin(ang) * dist)),
      threat: 1.0,
    };
    if (rng() < 0.5) e.radius = 4 + rng() * 14;
    enemies.push(e);
  }
  const projectiles = [];
  for (let i = 0; i < (n === 0 ? 0 : Math.min(24, n)); i++) {
    const ang = rng() * Math.PI * 2;
    projectiles.push({
      x: px + Math.cos(ang) * rng() * 260,
      y: py + Math.sin(ang) * rng() * 260,
      vx: (rng() - 0.5) * 320,
      vy: (rng() - 0.5) * 320,
      threat: 2.2,
      radius: 4,
    });
  }
  const hazards = [];
  for (let i = 0; i < (n === 0 ? 0 : s % 5); i++) {
    hazards.push({ x: px + (rng() - 0.5) * 200, y: py + (rng() - 0.5) * 200, radius: 10 + rng() * 40, threat: 3.0 });
  }
  const gems = [];
  for (let i = 0; i < (n === 0 ? 0 : Math.min(60, n * 2)); i++) {
    gems.push({ x: px + (rng() - 0.5) * 400, y: py + (rng() - 0.5) * 400 });
  }
  const chests = rng() < 0.5 ? [] : [{ x: px + (rng() - 0.5) * 500, y: py + (rng() - 0.5) * 500 }];
  const boss = rng() < 0.4 ? undefined : { x: px + (rng() - 0.5) * 600, y: py + (rng() - 0.5) * 600, radius: 24 };
  return { playerX: px, playerY: py, worldSize: world, enemies, projectiles, hazards, gems, melee: s % 2 === 1, boss, chests };
}

// Erwartete Richtungen aus dem Vorher-Stand, 48 Szenen (Seed s = 0..47).
const BOT_MATRIX: readonly (readonly [number, number])[] = [
  [0.6094570419907108, -0.7928190928376617],
  [0.5343948746968058, 0.845234948341457],
  [0.9996517395686157, 0.02638938380184032],
  [-0.11114003910394807, 0.993804755325699],
  [0.2711604813875143, 0.9625341517752455],
  [0.023492292435881832, -0.9997240180150253],
  [0.3653964852893321, 0.930851979929249],
  [-0.7715129166403677, -0.6362136586533437],
  [-0.18750072846055513, -0.9822644637910714],
  [0.5170503853076335, -0.8559549632154883],
  [0.6956186811069442, 0.7184111987539138],
  [-0.45785561029078303, -0.8890265688522783],
  [-0.8797446548939961, -0.47544646616148467],
  [-0.9999712457519353, -0.007583381127332683],
  [0.647131864514085, 0.7623780885692636],
  [0.07962923911314962, -0.9968245503990465],
  [0.5, 0],
  [0.9854583993238368, -0.16991687144630824],
  [0.5278521994289355, -0.8493362441095019],
  [0.6534195467492981, -0.7569959682362526],
  [0.6187904548810906, 0.7855560915351958],
  [0.9307158041524143, -0.3657432048595361],
  [0.9363341786115037, 0.3511101051862801],
  [-0.04120590824963761, 0.9991506758869367],
  [-0.623409970669828, 0.7818951390496326],
  [-0.9996107396760902, -0.027899267449515572],
  [-0.5213642973643426, 0.8533342073500776],
  [0.9812357243838884, 0.192811963303178],
  [-0.8624209690339248, -0.5061917345933121],
  [0.19407181328819173, 0.9809873247331147],
  [0.36091457217138917, -0.9325988803308437],
  [0.6951850223925286, -0.7188308456383181],
  [0.5, 0],
  [-0.5559510287497048, -0.8312150465626478],
  [0.9978868549188208, -0.06497557064177548],
  [0.9656459090471043, -0.2598614598985223],
  [-0.21527001612559188, -0.9765545658883006],
  [0.9949106298055648, -0.10076129564418254],
  [-0.13362429766698786, 0.9910320615767201],
  [-0.37752668067252937, -0.9259987070079431],
  [0.9248169035937442, -0.3804125324266792],
  [-0.8670447180940005, -0.49823032507595827],
  [0.6369466705410418, 0.770907866665454],
  [0.30309771355467946, 0.9529594828941709],
  [-0.999670165002112, 0.025681923694500727],
  [-0.8626563588103527, 0.5057904769804036],
  [0.9513331019931318, -0.3081644513115122],
  [-0.13729651203681958, -0.9905299933785567],
];

// offerScore-Matrix: 6 Builds (inkl. undefined) x 100 Offers, Vorher-Stand.
const OFFER_MATRIX: readonly number[] = [
  514, 526, 538, 542, 560, 560, 560, 560,
  512, 524, 536, 540, 558, 558, 558, 558,
  510, 522, 534, 538, 556, 556, 556, 556,
  504, 516, 528, 532, 550, 550, 550, 550,
  500, 512, 524, 528, 546, 546, 546, 546,
  496, 508, 520, 524, 542, 542, 542, 542,
  544, 556, 568, 572, 590, 590, 590, 590,
  542, 554, 566, 570, 588, 588, 588, 588,
  750, 750, 750, 850, 850, 850, 650, 650,
  650, 950, 950, 950, 412, 420, 428, 448,
  448, 448, 406, 414, 422, 442, 442, 442,
  404, 412, 420, 440, 440, 440, 402, 410,
  418, 438, 438, 438, 514, 526, 538, 542,
  560, 560, 560, 560, 512, 524, 536, 540,
  558, 558, 558, 558, 510, 522, 534, 538,
  556, 556, 556, 556, 504, 516, 528, 532,
  550, 550, 550, 550, 500, 512, 524, 528,
  546, 546, 546, 546, 496, 508, 520, 524,
  542, 542, 542, 542, 544, 556, 568, 572,
  590, 590, 590, 590, 542, 554, 566, 570,
  588, 588, 588, 588, 750, 750, 750, 850,
  850, 850, 650, 650, 650, 950, 950, 950,
  412, 420, 428, 448, 448, 448, 406, 414,
  422, 442, 442, 442, 404, 412, 420, 440,
  440, 440, 402, 410, 418, 438, 438, 438,
  181, 184, 187, 188, 120, 120, 120, 120,
  179, 182, 185, 186, 118, 118, 118, 118,
  1251, 1254, 1257, 1258, 116, 116, 116, 116,
  171, 174, 177, 178, 110, 110, 110, 110,
  167, 170, 173, 174, 106, 106, 106, 106,
  163, 166, 169, 170, 102, 102, 102, 102,
  211, 214, 217, 218, 150, 150, 150, 150,
  209, 212, 215, 216, 148, 148, 148, 148,
  760, 760, 760, 860, 860, 860, 650, 650,
  650, 950, 950, 950, 412, 420, 428, 448,
  448, 448, 406, 414, 422, 442, 442, 442,
  404, 412, 420, 440, 440, 440, 820, 820,
  820, 900, 900, 900, 181, 184, 187, 188,
  120, 120, 120, 120, 179, 182, 185, 186,
  118, 118, 118, 118, 177, 180, 183, 184,
  116, 116, 116, 116, 171, 174, 177, 178,
  110, 110, 110, 110, 167, 170, 173, 174,
  106, 106, 106, 106, 1251, 1254, 1257, 1258,
  102, 102, 102, 102, 211, 214, 217, 218,
  150, 150, 150, 150, 209, 212, 215, 216,
  148, 148, 148, 148, 982, 982, 982, 1050,
  1050, 1050, 650, 650, 650, 950, 950, 950,
  412, 420, 428, 448, 448, 448, 406, 414,
  422, 442, 442, 442, 404, 412, 420, 440,
  440, 440, 402, 410, 418, 438, 438, 438,
  514, 526, 538, 542, 560, 560, 560, 560,
  512, 524, 536, 540, 558, 558, 558, 558,
  510, 522, 534, 538, 556, 556, 556, 556,
  504, 516, 528, 532, 550, 550, 550, 550,
  500, 512, 524, 528, 546, 546, 546, 546,
  496, 508, 520, 524, 542, 542, 542, 542,
  544, 556, 568, 572, 590, 590, 590, 590,
  542, 554, 566, 570, 588, 588, 588, 588,
  750, 750, 750, 850, 850, 850, 650, 650,
  650, 950, 950, 950, 412, 420, 428, 448,
  448, 448, 406, 414, 422, 442, 442, 442,
  404, 412, 420, 440, 440, 440, 402, 410,
  418, 438, 438, 438, 181, 184, 187, 188,
  120, 120, 120, 120, 1251, 1254, 1257, 1258,
  118, 118, 118, 118, 177, 180, 183, 184,
  116, 116, 116, 116, 171, 174, 177, 178,
  110, 110, 110, 110, 167, 170, 173, 174,
  106, 106, 106, 106, 163, 166, 169, 170,
  102, 102, 102, 102, 211, 214, 217, 218,
  150, 150, 150, 150, 209, 212, 215, 216,
  148, 148, 148, 148, 750, 750, 750, 850,
  850, 850, 836, 836, 836, 900, 900, 900,
  412, 420, 428, 448, 448, 448, 406, 414,
  422, 442, 442, 442, 404, 412, 420, 440,
  440, 440, 402, 410, 418, 438, 438, 438,
];

// offerAt(i) deckt genau diese 100 Offer-Konfigurationen ab.
const OFFERS_PER_BUILD = 100;

// chooseBestOffer-Entscheidungen fuer 200 Zufallsangebote (Seed 50000 + s*131).
const CHOOSE_MATRIX: readonly number[] = [
  3, 3, 0, 2, 0, 0, 1, 2, 2, 1, 3, 0, 1, 2, 0, 2, 4, 0, 2, 0,
  1, 3, 1, 1, 1, 0, 1, 2, 3, 0, 2, 1, 0, 0, 0, 1, 0, 2, 1, 1,
  3, 3, 4, 2, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 3, 3, 3, 1, 0, 0,
  0, 3, 1, 3, 2, 0, 1, 1, 0, 3, 2, 1, 1, 0, 0, 1, 0, 1, 3, 3,
  1, 0, 0, 0, 2, 0, 2, 0, 0, 0, 3, 3, 0, 0, 2, 1, 1, 2, 0, 0,
  1, 0, 1, 0, 1, 2, 4, 0, 1, 0, 3, 0, 0, 3, 2, 0, 3, 2, 2, 0,
  1, 1, 1, 3, 0, 3, 0, 1, 0, 0, 1, 1, 2, 2, 1, 0, 0, 0, 0, 0,
  0, 2, 1, 0, 0, 3, 1, 0, 4, 2, 0, 1, 0, 1, 0, 0, 1, 4, 1, 1,
  0, 3, 1, 0, 2, 1, 0, 0, 4, 1, 0, 2, 3, 3, 1, 0, 0, 0, 0, 3,
  1, 3, 1, 0, 1, 0, 1, 3, 0, 2, 3, 0, 1, 3, 3, 0, 0, 1, 2, 1,
];

function offerAt(i: number): Offer {
  const WEAPON_IDS = ["ember", "thorn", "frost", "storm", "lantern", "flail", "phoenix", "wrath_pendulum"];
  const PASSIVE_IDS = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
  const cases: Offer[] = [];
  for (const wid of WEAPON_IDS) {
    for (const isNew of [false, true]) {
      for (const level of [1, 4, 7, 8]) {
        cases.push({ kind: "weapon", id: wid, name: wid, description: "", level, isNew, iconColor: 0 });
      }
    }
  }
  for (const pid of PASSIVE_IDS) {
    for (const isNew of [false, true]) {
      for (const level of [1, 3, 5]) {
        cases.push({ kind: "passive", id: pid, name: pid, description: "", level, isNew, iconColor: 0 });
      }
    }
  }
  return cases[i]!;
}

const BUILDS = [
  undefined,
  { weapons: [] as { id: string; level: number }[], passives: [] as { id: string; level: number }[] },
  { weapons: [{ id: "frost", level: 6 }], passives: [{ id: "heart", level: 2 }], startingWeapon: "frost" },
  { weapons: [{ id: "flail", level: 7 }, { id: "lantern", level: 3 }], passives: [{ id: "heart", level: 3 }, { id: "tome", level: 1 }], startingWeapon: "flail" },
  { weapons: [{ id: "phoenix", level: 8 }], passives: [] },
  { weapons: [{ id: "ember", level: 5 }, { id: "thorn", level: 5 }], passives: [{ id: "boots", level: 4 }], startingWeapon: "thorn" },
] as const;

describe("autoplay-budget: Entscheidungsgleichheit (Vorher-Stand cf85540^)", () => {
  it("botDirection: 48 Seed-Szenen bitidentisch", () => {
    for (let s = 0; s < BOT_MATRIX.length; s++) {
      const dir = botDirection(scene(s));
      expect(dir.x).toBe(BOT_MATRIX[s]![0]);
      expect(dir.y).toBe(BOT_MATRIX[s]![1]);
    }
  });

  it("offerScore: 6 Builds x 100 Offers identisch zum Vorher-Stand", () => {
    let k = 0;
    for (const build of BUILDS) {
      for (let i = 0; i < OFFERS_PER_BUILD; i++) {
        expect(offerScore(offerAt(i), build)).toBe(OFFER_MATRIX[k]);
        k++;
      }
    }
    expect(k).toBe(OFFER_MATRIX.length);
  });

  it("chooseBestOffer: 200 Seed-Entscheidungen identisch", () => {
    let a = 0;
    const rng = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // Generator nutzt buildList = Builds ohne undefined (5 Eintraege).
    const CHOOSE_BUILDS = BUILDS.slice(1);
    for (let s = 0; s < 200; s++) {
      const seed = 50000 + s * 131;
      a = seed >>> 0;
      const picks: Offer[] = [];
      const k = 2 + Math.floor(rng() * 4);
      for (let i = 0; i < k; i++) picks.push(offerAt(Math.floor(rng() * OFFERS_PER_BUILD)));
      const build = CHOOSE_BUILDS[s % CHOOSE_BUILDS.length];
      expect(chooseBestOffer(picks, build)).toBe(CHOOSE_MATRIX[s]);
    }
  });
});

describe("autoplay-budget: Grenzfaelle", () => {
  it("0 Gegner: Idle-Kreisbewegung, kein NaN", () => {
    const dir = botDirection({
      playerX: 480, playerY: 480, worldSize: 960,
      enemies: [], projectiles: [], hazards: [], gems: [],
    });
    expect(dir.x).toBe(0.5); // cos(0 * 1.7) * 0.5
    expect(dir.y).toBe(0); // sin(0 * 1.3) * 0.5
  });

  it("1 Gegner weit weg: kein Repel, Idle-Kreis mit enemies.length=1", () => {
    const dir = botDirection({
      playerX: 480, playerY: 480, worldSize: 960,
      enemies: [{ x: 20, y: 20, threat: 1 }], projectiles: [], hazards: [], gems: [],
    });
    // Vektorsumme 0 -> Idle-Kreis: cos(len*1.7)*0.5 / sin(len*1.3)*0.5.
    expect(dir.x).toBe(Math.cos(1.7) * 0.5);
    expect(dir.y).toBe(Math.sin(1.3) * 0.5);
  });

  it("1 Gegner direkt auf dem Spieler: kein NaN (d==0-Fallback)", () => {
    const dir = botDirection({
      playerX: 480, playerY: 480, worldSize: 960,
      enemies: [{ x: 480, y: 480, threat: 1 }], projectiles: [], hazards: [], gems: [],
    });
    expect(Number.isFinite(dir.x)).toBe(true);
    expect(Number.isFinite(dir.y)).toBe(true);
  });

  it("1 Projektil mit vx/vy trifft den Spieler: kein NaN", () => {
    const dir = botDirection({
      playerX: 480, playerY: 480, worldSize: 960,
      enemies: [],
      projectiles: [{ x: 500, y: 480, vx: -100, vy: 0, threat: 2.2, radius: 4 }],
      hazards: [], gems: [],
    });
    expect(Number.isFinite(dir.x)).toBe(true);
    expect(Number.isFinite(dir.y)).toBe(true);
    // Lead 0.28 setzt das Projektil auf x=472 (linkss vom Spieler bei 480):
    // der Bot flieht VOR die Vorhergesagte Position -> Repel nach rechts.
    expect(dir.x).toBeGreaterThan(0);
  });

  it("Warnflaeche (threat 3) gewinnt gegen gleich platzierten Gegner (threat 1)", () => {
    // Gegner links (fliet nach +x), Hazard rechts (faehrt nach -x): Rohwerte
    // Gegner (1-20/124)*1 = 0.839 vs Hazard (1-20/48)*3 = 1.75 -> netto -x.
    const base = {
      playerX: 480, playerY: 480, worldSize: 960,
      projectiles: [] as never[], gems: [] as never[],
    };
    const hazardRight = botDirection({
      ...base,
      enemies: [{ x: 460, y: 480, threat: 1, radius: 6 }],
      hazards: [{ x: 500, y: 480, threat: 3, radius: 6 }],
    });
    const enemyRight = botDirection({
      ...base,
      enemies: [{ x: 500, y: 480, threat: 1, radius: 6 }],
      hazards: [{ x: 460, y: 480, threat: 3, radius: 6 }],
    });
    expect(hazardRight.x).toBeLessThan(0); // flieht eher vom Hazard
    expect(enemyRight.x).toBeGreaterThan(0); // spiegelverkehrt genauso
  });

  it("Richtung ist immer normalisiert, wenn nicht idle", () => {
    for (let s = 0; s < 48; s++) {
      const input = scene(s);
      const dir = botDirection(input);
      if (input.enemies.length === 0) continue; // Idle hat Laenge 0.5
      expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 12);
    }
  });
});
