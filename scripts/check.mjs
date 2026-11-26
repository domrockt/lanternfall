#!/usr/bin/env node
// Taegliche Schleife: inkrementeller Typecheck + nur die Tests, die zu den
// geaenderten Dateien gehoeren (`vitest related`). Ausgabe: kompakt.
//
//   npm run check                  # alle Aenderungen gegen HEAD
//   npm run check src/logic/x.ts   # gezielt einzelne Dateien
//
// Exitcode 0 nur wenn tsc UND die betroffenen Tests gruen sind.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const started = Date.now();
const cliFiles = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));

function git(args) {
  const res = spawnSync("git", args, { encoding: "utf8" });
  return res.status === 0 ? res.stdout : "";
}

function changedFiles() {
  const names = new Set();
  for (const out of [
    git(["diff", "--name-only", "-z", "HEAD"]),
    git(["ls-files", "--others", "--exclude-standard", "-z"]),
  ]) {
    for (const name of out.split("\0")) {
      if (name) names.add(name);
    }
  }
  return [...names];
}

function bin(name) {
  const local = `node_modules/.bin/${name}`;
  return existsSync(local) ? local : name;
}

function run(name, args) {
  const res = spawnSync(bin(name), args, { encoding: "utf8" });
  return {
    ok: res.status === 0,
    out: `${res.stdout || ""}${res.stderr || ""}`.trim(),
    ms: Date.now() - started,
  };
}

const relevant = (cliFiles.length ? cliFiles : changedFiles())
  .filter((file) => !file.includes("node_modules/") && /\.(?:ts|tsx)$/.test(file))
  .filter((file) => existsSync(file));

console.log(`check: ${relevant.length} geaenderte Quelldatei(en)`);
if (relevant.length) console.log(`  ${relevant.join("\n  ")}`);

const tsc = run("tsc", ["--noEmit"]);
if (!tsc.ok) {
  console.error(tsc.out);
  console.error(`FAIL typecheck (${tsc.ms} ms)`);
  process.exit(1);
}
console.log(`OK   typecheck (${tsc.ms} ms)`);

if (!relevant.length) {
  console.log(`OK   tests uebersprungen (keine Aenderung an src/tests)`);
  process.exit(0);
}

const vitest = run("vitest", [
  "related", ...relevant,
  "--run",
  "--passWithNoTests",
  "--reporter=dot",
  "--silent=passed-only",
]);
if (!vitest.ok) {
  console.error(vitest.out);
  console.error(`FAIL Tests zu geaenderten Dateien (${vitest.ms} ms)`);
  process.exit(1);
}
const summary = vitest.out
  .split("\n")
  .filter((line) => /Test Files|Tests\s+.*(passed|failed)|No test files found|Duration/.test(line))
  .join("\n");
console.log(summary || "OK   tests (keine passenden Testdateien)");
console.log(`OK   check gesamt ${Date.now() - started} ms`);
