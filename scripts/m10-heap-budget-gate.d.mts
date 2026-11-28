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

/** Robustes SOFT-Signal (F1-Fix): Minimum der rohen Peaks je Fenster. */
export interface HeapGateFloor {
  window: number;
  fromMin: number;
  toMin: number;
  floorMB: number;
}

export interface HeapGateResult {
  definition: string;
  softDefinition: string;
  minute1MB: number | null;
  endMB: number | null;
  endDeltaMB: number | null;
  endDeltaPct: number | null;
  gatePct: number;
  softPct: number;
  windowPeaks: HeapGateWindow[];
  maxWindowPeakMB: number | null;
  maxWindowPeakPct: number | null;
  windowFloors: HeapGateFloor[];
  maxWindowFloorMB: number | null;
  maxWindowFloorPct: number | null;
  softReferenceMB: number | null;
  softFloorPass: boolean;
  hardPass: boolean;
  softPass: boolean;
  verdict: "PASS" | "FAIL" | "UNMESSBAR";
  softVerdict: string;
  softFloorVerdict: string;
  fallA: boolean;
  fallB: boolean;
}

export declare function evaluateHeapGate(input: HeapGateInput): HeapGateResult;
