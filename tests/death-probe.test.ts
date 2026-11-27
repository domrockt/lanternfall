import { describe, it } from "vitest";
import { deathClassFor, deathFxFor, type DeathClass } from "../src/logic/death";
import { ENEMIES } from "../src/data/enemies";
describe("probe", () => {
  it("prints", () => {
    const rows: string[] = [];
    const clsSet = new Map<DeathClass, string>();
    for (const e of Object.values(ENEMIES)) {
      const cls = deathClassFor(e.archetype);
      const s = deathFxFor(cls);
      const b = deathFxFor(cls, true);
      rows.push(`| ${e.id} | ${e.name} | ${e.archetype} | ${cls} | ${s.shard} | ${s.dust} | ${s.count} | ${s.additive} | ${b.count} | ${b.shard} |`);
      clsSet.set(cls, `${s.shard}/${s.dust}/${s.count}/${s.additive}`);
    }
    console.log("PROBE\n" + rows.join("\n"));
    console.log("PROBE classes:", [...clsSet.keys()].join(","));
    console.log("PROBE fingerprints non-boss:", new Set([...clsSet.values()]).size, "of", clsSet.size);
    const counts: Record<string, number> = {};
    for (const e of Object.values(ENEMIES)) counts[deathClassFor(e.archetype)] = (counts[deathClassFor(e.archetype)] ?? 0) + 1;
    console.log("PROBE counts:", JSON.stringify(counts));
  });
});
