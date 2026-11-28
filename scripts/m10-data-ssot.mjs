#!/usr/bin/env node
// m10-data-ssot-guard K1/K4: Data-SSOT-Befund, NUR LESEND (kein Schreiben in src).
// Laedt alle src/data-Module ueber Vites SSR-Loader (wie acceptance-count.mjs) und prueft:
//  - ID-Eindeutigkeit in allen ID-Arrays (types.ts)
//  - weaponIds vs. weapons.ts-Keys, evolutions/evo-weapons-Paare gegen weaponIds
//  - Key/ID-Drift in WEAPONS, EVOLUTION_WEAPONS, PASSIVES, CHARACTERS, ENEMIES, BOSSES
//  - types.ts-Exporte/Felder ohne Consumer (statischer Textscan, src ohne data/types.ts)
//  - acceptance-count-Vertrag 30/6/6/6/6/2 (A3)
// Aufruf: node scripts/m10-data-ssot.mjs [before|after]  (Default: after)
import { createServer } from "vite";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const phase = process.argv[2] === "before" ? "before" : "after";
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const findings = [];
const note = (kind, detail) => findings.push({ kind, detail });

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

function walkSrc(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkSrc(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

try {
  const data = await server.ssrLoadModule("/src/data/index.ts");

  // 1) ID-Eindeutigkeit in allen ID-Arrays
  const idArrays = {
    WEAPON_IDS: data.WEAPON_IDS,
    EVOLUTION_WEAPON_IDS: data.EVOLUTION_WEAPON_IDS,
    PASSIVE_IDS: data.PASSIVE_IDS,
    CHARACTER_IDS: data.CHARACTER_IDS,
    BOSS_IDS: data.BOSS_IDS,
    ENEMY_IDS: data.ENEMY_IDS,
  };
  const duplicates = {};
  for (const [name, arr] of Object.entries(idArrays)) {
    const seen = new Set();
    const dup = arr.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    if (dup.length) {
      duplicates[name] = dup;
      note("duplicate_ids", `${name}: ${dup.join(", ")}`);
    }
  }

  // 2) weaponIds (types.ts) vs. weapons.ts-Keys
  const weaponKeys = Object.keys(data.WEAPONS);
  const weaponIdSet = [...data.WEAPON_IDS];
  const weaponsOnly = weaponKeys.filter((k) => !weaponIdSet.includes(k));
  const idsOnly = weaponIdSet.filter((k) => !weaponKeys.includes(k));
  if (weaponsOnly.length || idsOnly.length) {
    note("weaponids_drift", `Keys ohne ID: ${weaponsOnly} | IDs ohne Key: ${idsOnly}`);
  }
  // def.id muss dem Key entsprechen
  for (const [k, def] of Object.entries(data.WEAPONS)) {
    if (def.id !== k) note("weapon_def_id_mismatch", `WEAPONS[${k}].id = ${def.id}`);
  }

  // 3) EVOLUTION_WEAPON_IDS vs. EVOLUTION_WEAPONS-Keys vs. EVOLUTIONS
  const evoWeaponKeys = Object.keys(data.EVOLUTION_WEAPONS);
  const evoIdArr = [...data.EVOLUTION_WEAPON_IDS];
  const evoKeysOnly = evoWeaponKeys.filter((k) => !evoIdArr.includes(k));
  const evoIdsOnly = evoIdArr.filter((k) => !evoWeaponKeys.includes(k));
  if (evoKeysOnly.length || evoIdsOnly.length) {
    note("evolution_weapon_ids_drift", `Keys ohne ID: ${evoKeysOnly} | IDs ohne Key: ${evoIdsOnly}`);
  }
  // Evolutions-Paare: jede Basiswaffe genau 1x, passive valide, id in EVOLUTION_WEAPON_IDS
  const baseSeen = new Map();
  for (const evo of data.EVOLUTIONS) {
    baseSeen.set(evo.baseWeapon, (baseSeen.get(evo.baseWeapon) ?? 0) + 1);
    if (!data.WEAPON_IDS.includes(evo.baseWeapon)) {
      note("evolution_base_unknown", `${evo.id}: baseWeapon ${evo.baseWeapon} nicht in WEAPON_IDS`);
    }
    if (!data.PASSIVE_IDS.includes(evo.passive)) {
      note("evolution_passive_unknown", `${evo.id}: passive ${evo.passive} nicht in PASSIVE_IDS`);
    }
    if (!data.EVOLUTION_WEAPON_IDS.includes(evo.id)) {
      note("evolution_id_unknown", `${evo.id} nicht in EVOLUTION_WEAPON_IDS`);
    }
    const def = data.EVOLUTION_WEAPONS[evo.id];
    if (!def) note("evolution_weapon_missing", `kein EVOLUTION_WEAPONS-Eintrag fuer ${evo.id}`);
    else if (def.behavior !== evo.id) {
      note("evolution_behavior_mismatch", `${evo.id}: behavior ${def.behavior}`);
    }
  }
  const basesUncovered = data.WEAPON_IDS.filter((w) => !baseSeen.has(w));
  const basesMulti = [...baseSeen.entries()].filter(([, n]) => n > 1);
  if (basesUncovered.length) note("evolution_base_uncovered", `Basiswaffen ohne Evolution: ${basesUncovered}`);
  if (basesMulti.length) note("evolution_base_multi", `Basiswaffen mit >1 Evolution: ${basesMulti.map(([k]) => k)}`);

  // 4) Weitere Key/ID-Drifts
  for (const [label, keys, ids] of [
    ["passives", Object.keys(data.PASSIVES), [...data.PASSIVE_IDS]],
    ["characters", Object.keys(data.CHARACTERS), [...data.CHARACTER_IDS]],
    ["enemies", Object.keys(data.ENEMIES), [...data.ENEMY_IDS]],
    ["bosses", data.BOSSES.map((b) => b.id), [...data.BOSS_IDS]],
  ]) {
    const extra = keys.filter((k) => !ids.includes(k));
    const missing = ids.filter((k) => !keys.includes(k));
    if (extra.length || missing.length) {
      note(`${label}_ids_drift`, `Keys ohne ID: ${extra} | IDs ohne Key: ${missing}`);
    }
  }
  // weaponDef(): jede WeaponAnyId muss aufloesbar sein
  for (const id of [...data.WEAPON_IDS, ...data.EVOLUTION_WEAPON_IDS]) {
    if (!data.weaponDef(id)) note("weapondef_unresolved", `weaponDef(${id}) = null`);
  }

  // 5) types.ts-Exporte/Felder ohne Consumer (statischer Textscan, nur lesend)
  const srcFiles = walkSrc(join(root, "src")).filter((p) => !p.endsWith("data/types.ts"));
  const testsFiles = walkSrc(join(root, "tests"));
  const corpus = [...srcFiles, ...testsFiles].map((p) => readFileSync(p, "utf8")).join("\n");
  const typesSrc = readFileSync(join(root, "src/data/types.ts"), "utf8");
  const typesCorpus = corpus + "\n" + typesSrc.replace(/\bexport /g, " ");
  const exportedNames = [...typesSrc.matchAll(/export (?:type|interface) (\w+)/g)].map((m) => m[1]);
  const orphanTypes = exportedNames.filter((n) => !new RegExp(`\\b${n}\\b`).test(typesCorpus));
  if (orphanTypes.length) note("types_without_consumer", `Typen ohne Referenz (auch nicht transitiv): ${orphanTypes.join(", ")}`);
  const internalOnly = exportedNames.filter((n) => !orphanTypes.includes(n) && !new RegExp(`\\b${n}\\b`).test(corpus));
  // Felder der Kern-Interfaces ohne Referenz im Corpus
  const fieldScan = {};
  const interfaceBlocks = [...typesSrc.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)];
  for (const [, name, body] of interfaceBlocks) {
    const fields = [...body.matchAll(/^\s{2}(\w+)[?]?[:,]/gm)].map((m) => m[1]);
    const orphans = fields.filter(
      (f) => !["id", "name", "level", "count", "speed", "hp", "damage", "tier", "minute", "mix", "mods", "index", "radius"].includes(f) &&
        !new RegExp(`\\b${f}\\b`).test(corpus),
    );
    if (orphans.length) fieldScan[name] = orphans;
  }
  for (const [iface, orphans] of Object.entries(fieldScan)) {
    note("types_field_without_consumer", `${iface}: ${orphans.join(", ")}`);
  }

  // 6b) Waffen-Stufen: jede Waffe/Evolutionswaffe hat Stufen 1..maxLevel fortlaufend
  const allWeapons = { ...data.WEAPONS, ...data.EVOLUTION_WEAPONS };
  for (const [k, def] of Object.entries(allWeapons)) {
    const lv = def.levels.map((l) => l.level);
    const want = Array.from({ length: def.maxLevel }, (_, i) => i + 1);
    if (def.levels.length !== def.maxLevel || lv.some((v, i) => v !== want[i])) {
      note("weapon_levels_drift", `${k}: Stufen ${lv} vs. maxLevel ${def.maxLevel}`);
    }
  }
  // 6c) Boss-Reihenfolge: BOSSES[i].index === i und Reihenfolge folgt BOSS_IDS
  data.BOSSES.forEach((b, i) => {
    if (b.index !== i) note("boss_index_drift", `BOSSES[${i}].index = ${b.index}`);
    if (b.id !== data.BOSS_IDS[i]) note("boss_order_drift", `BOSSES[${i}].id = ${b.id} vs. BOSS_IDS[${i}] = ${data.BOSS_IDS[i]}`);
  });

  // 7) acceptance-count-Vertrag A3
  const counts = {
    enemies: Object.keys(data.ENEMIES).length,
    weapons: Object.keys(data.WEAPONS).length,
    powerups: Object.keys(data.PASSIVES).length,
    evolutions: data.EVOLUTIONS.length,
    bosses: data.BOSSES.length,
    characters: Object.keys(data.CHARACTERS).length,
  };
  const expected = { enemies: 30, weapons: 6, powerups: 6, evolutions: 6, bosses: 6, characters: 2 };
  const contractOk = Object.keys(expected).every((k) => counts[k] === expected[k]);
  if (!contractOk) note("acceptance_count_drift", `Ist ${JSON.stringify(counts)} vs Soll ${JSON.stringify(expected)}`);

  const result = {
    phase,
    generatedAt: new Date().toISOString(),
    ok: findings.length === 0,
    contractOk,
    counts,
    expected,
    findings,
    findingCount: findings.length,
    typesInternalOnly: internalOnly,
    read_only: true,
  };
  const outPath = join(root, "shots", `m10-data-ssot-${phase}.json`);
  mkdirSync(join(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok && contractOk ? 0 : 1;
} finally {
  await server.close();
}
