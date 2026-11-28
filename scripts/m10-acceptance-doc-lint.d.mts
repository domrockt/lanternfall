// Typdeklarationen zu scripts/m10-acceptance-doc-lint.mjs
// (Befund B2 der Nachabnahme G: In-run-Heap nie wieder als Tor zitieren).
export declare const INRUN_RE: RegExp;
export declare const PCT_RE: RegExp;
export declare const GATE_RE: RegExp;
export declare const JUDGE_RE: RegExp;
export declare const HEAPTOR_RE: RegExp;
export declare const RETAINED_RE: RegExp;
export declare const OBS_RE: RegExp;
export declare const CONTEXT_WINDOW: number;

export type LintRule = "in-run-as-gate" | "heap-tor-pct-judgment";

export interface LintFinding {
  file: string;
  line: number;
  rule: LintRule;
  match: string;
  text: string;
}

export declare function analyzeLine(
  lines: string[],
  i: number,
): { rule: LintRule; match: string } | null;

export declare function scanDoc(rel: string, text: string): LintFinding[];

export declare function scanDir(dir: string): LintFinding[];

export declare function listMdFiles(dir: string): string[];
