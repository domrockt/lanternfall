export declare const GATE_PCT: number;
export declare const SOFT_PCT: number;
export declare const round1: (x: number) => number;

export interface HeapGateInput {
  minute1MB: number | null;
  endMB: number | null;
  minutePeaks: Array<{ minute: number; peakMB: number }>;
}

export interface HeapGateWindow {
  window: number;
  fromMin: number;
  toMin: number;
  peakMB: number;
}

export interface HeapGateResult {
  definition: string;
  minute1MB: number | null;
  endMB: number | null;
  endDeltaMB: number | null;
  endDeltaPct: number | null;
  gatePct: number;
  softPct: number;
  windowPeaks: HeapGateWindow[];
  maxWindowPeakMB: number | null;
  maxWindowPeakPct: number | null;
  hardPass: boolean;
  softPass: boolean;
  verdict: "PASS" | "FAIL" | "UNMESSBAR";
  softVerdict: string;
  fallA: boolean;
  fallB: boolean;
}

export declare function evaluateHeapGate(input: HeapGateInput): HeapGateResult;
