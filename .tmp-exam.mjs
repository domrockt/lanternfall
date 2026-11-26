import fs from "node:fs";
const j = JSON.parse(fs.readFileSync("shots/perf-heap-3runs.json", "utf8"));
console.log("args", JSON.stringify(j.args));
console.log("summary", JSON.stringify(j.summary, null, 2));
for (const r of j.runs) {
  console.log("run", r.run, "deltaPct", r.heap.deltaPct,
    "startMB", r.heap.start.mb, "endMB", r.heap.end.mb,
    "deltaNodes", r.heap.deltaNodes,
    "fpsMin", r.fps.min, "fpsMedian", r.fps.median,
    "gc", JSON.stringify(r.gc),
    "errors", r.errors.length);
  console.log("  topBytes", r.heap.top5GrowthByBytes.map((x) => x.constructor + " " + x.deltaBytes).join(" | "));
  console.log("  topCount", r.heap.top5GrowthByCount.map((x) => x.type + "/" + x.constructor + " " + x.deltaCount).join(" | "));
}
