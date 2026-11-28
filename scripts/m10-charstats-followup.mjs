#!/usr/bin/env node
// Lane m10-charstats-spec-followup K4: SSOT-Guard Spec ↔ src/data/characters.ts.
//
// Prüft die Spec-Referenztabelle (unten, Quelle: GAME.md Z.34/35/173) gegen die
// Charakter-Daten (Regex-Parse wie scripts/m10-charstats-ssot.mjs) und meldet
// jede DRIFT, die nicht durch einen Kommentar in characters.ts gedeckt ist:
//   - Wert ≠ Spec und Zeile/Block trägt "Bewusst:" → OK (dokumentierte Abweichung)
//   - Wert ≠ Spec ohne "Bewusst:"-Kommentar                      → FAIL (exit 1)
//   - Wert ≠ erwartetem Ist (diese Lane hat ihn entschieden)      → FAIL (exit 1)
// Spec-schweigende Felder (spec: null) brauchen einen Kommentar mit "F1/P1".
// Aufruf: node scripts/m10-charstats-followup.mjs   (exit 0 = grün, exit 1 = Drift)
// Hintergrund/Entscheide: docs/lanes/m10-charstats-spec-followup.md (F1–F5).
import { readFileSync } from "node:fs";

const SRC = new URL("../src/data/characters.ts", import.meta.url);

// Spec-Referenztabelle — bei Spec-Änderung (GAME.md Z.34/35) HIER pflegen.
// spec   = Wert laut GAME.md-Spec (null = Spec schweigt)
// ist    = entschieden/gepinnter Datenwert (diese Lane, F1–F5)
// why    = Entscheidung + Quelle
const SPEC = {
  mira: {
    hp: { spec: 90, ist: 90, why: "GAME.md Z.34 'HP 90' (F2, ssot-Lane gefixt)" },
    speed: { spec: 62, ist: 62, why: "GAME.md Z.173 Basis-Tempo 62,0 px/s" },
    armor: { spec: null, ist: 1, why: "Spec schweigt (F1/P1), M6-Tuning-Basis" },
    startWeapon: { spec: "ember", ist: "ember", why: "GAME.md Z.34 'Start: Glutfunke'" },
    mods: {
      areaPct: { spec: 10, ist: 10, why: "GAME.md Z.34 '+10 % Flächenwirkung'" },
      regen: { spec: null, ist: 1.0, why: "Spec schweigt (F1/P1), M6-Tuning-Basis" },
    },
  },
  kael: {
    hp: { spec: 130, ist: 130, why: "GAME.md Z.35 'HP 130'" },
    // Spec: Z.35 "-5 % Tempo" auf Basis 62 ⇒ 58,9; 59 = gerundeter Ist (F3, Variante b:
    // moveSpeedPct entfernt, Abzug steckt in der Basis — kein Doppel-Abzug mehr).
    speed: { spec: 58.9, ist: 59, why: "F3-Entscheid: 62·0,95 ≈ 58,9 gerundet, moveSpeedPct entfernt" },
    armor: { spec: 1, ist: 1, why: "GAME.md Z.35 '1 Rüstung' (F5-Entscheid, war 2 aus M6-Status Z.356)" },
    startWeapon: { spec: "flail", ist: "flail", why: "GAME.md Z.35 'Start: Kettenflegel'" },
    mods: {
      maxHpPct: { spec: 20, ist: 20, why: "GAME.md Z.35 '+20 % Max-HP' (F4-Entscheid, war 25)" },
      maxHpFlat: { spec: null, ist: 90, why: "Spec schweigt (F1/P1), M6-Tuning-Basis" },
      regen: { spec: null, ist: 1.5, why: "Spec schweigt (F1/P1), M6-Tuning-Basis" },
      xpPct: { spec: null, ist: -25, why: "Spec schweigt (F1/P1), M6-Tuning-Basis" },
      // F3: moveSpeedPct darf für Kael NICHT mehr existieren (Doppel-Abzug).
    },
  },
};

const FORBIDDEN_MODS = { kael: ["moveSpeedPct"] };

function parseCharacters(text) {
  const out = {};
  for (const m of text.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const [, id, body] = m;
    if (!SPEC[id]) continue;
    const num = (key) => {
      const r = new RegExp(`${key}:\\s*(-?[\\d.]+)`).exec(body);
      return r ? Number(r[1]) : undefined;
    };
    const str = (key) => {
      const r = new RegExp(`${key}:\\s*"([^"]+)"`).exec(body);
      return r ? r[1] : undefined;
    };
    const mods = {};
    for (const mm of body.matchAll(/(\w+Pct|\w+Flat|regen|areaPct):\s*(-?[\d.]+)/g)) {
      if (mm[1] === "hp" || mm[1] === "speed" || mm[1] === "armor") continue;
      mods[mm[1]] = Number(mm[2]);
    }
    out[id] = { hp: num("hp"), speed: num("speed"), armor: num("armor"), startWeapon: str("startWeapon"), mods };
  }
  return out;
}

const text = readFileSync(SRC, "utf8");
const data = parseCharacters(text);
const problems = [];

const hasComment = (id, key) => {
  // Kommentar-Marker am Feld selbst (gleiche Zeile) oder unmittelbar drumherum
  // (1 Zeile davor / 2 Zeilen danach, deckt Inline- und Folgezeilen-Kommentare).
  const block = new RegExp(`${id}:\\s*\\{[\\s\\S]*?\\n  \\}`, "m").exec(text);
  if (!block) return false;
  const lines = block[0].split("\n");
  const idx = lines.findIndex((l) => new RegExp(`\\b${key}\\s*:`).test(l));
  if (idx < 0) return false;
  const window = [lines[idx]];
  if (idx > 0 && lines[idx - 1].trim().startsWith("//")) window.push(lines[idx - 1]);
  for (let i = 1; i <= 2 && lines[idx + i]?.trim().startsWith("//"); i++) window.push(lines[idx + i]);
  return /Bewusst:|Spec schweigt|F\d/.test(window.join("\n"));
};

for (const [id, fields] of Object.entries(SPEC)) {
  const d = data[id];
  if (!d) { problems.push(`${id}: in characters.ts nicht gefunden`); continue; }
  const commented = (key) => hasComment(id, key);
  for (const key of ["hp", "speed", "armor", "startWeapon"]) {
    const e = fields[key];
    if (d[key] !== e.ist) {
      problems.push(`${id}.${key}: Ist ${JSON.stringify(d[key])} ≠ entschieden ${JSON.stringify(e.ist)} (${e.why})`);
    } else if (e.spec !== null && e.spec !== e.ist && !commented(key)) {
      problems.push(`${id}.${key}: Abweichung von der Spec (${e.spec}) ohne "Bewusst:"-Kommentar`);
    } else if (e.spec === null && !commented(key)) {
      problems.push(`${id}.${key}: spec-schweigendes Feld ohne Kommentar (F1/P1)`);
    }
  }
  for (const [mod, e] of Object.entries(fields.mods)) {
    const actual = d.mods[mod];
    if (actual !== e.ist) {
      problems.push(`${id}.mods.${mod}: Ist ${JSON.stringify(actual)} ≠ entschieden ${JSON.stringify(e.ist)} (${e.why})`);
    } else if (e.spec === null && !commented(mod)) {
      problems.push(`${id}.mods.${mod}: spec-schweigendes Feld ohne Kommentar (F1/P1)`);
    }
  }
  for (const mod of d.mods ? Object.keys(d.mods) : []) {
    if (fields.mods[mod] === undefined && !(FORBIDDEN_MODS[id] ?? []).includes(mod)) {
      problems.push(`${id}.mods.${mod}: unbekanntes Mod (nicht in Spec-Referenztabelle gepflegt)`);
    }
    if ((FORBIDDEN_MODS[id] ?? []).includes(mod)) {
      problems.push(`${id}.mods.${mod}: verboten (${mod} = F3-Doppel-Abzug, darf nach F3-Entscheid nicht existieren)`);
    }
  }
}
for (const id of Object.keys(data)) {
  if (!SPEC[id]) problems.push(`${id}: Charakter ohne Eintrag in Spec-Referenztabelle`);
}

if (problems.length) {
  console.error(`[m10-charstats-followup] FAIL: ${problems.length} unbekommentierte Drift(s) Spec ↔ characters.ts:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("[m10-charstats-followup] PASS: characters.ts entspricht der Spec-Referenztabelle (GAME.md Z.34/35/173); alle Abweichungen kommentiert (F1–F5 entschieden, docs/lanes/m10-charstats-spec-followup.md).");
