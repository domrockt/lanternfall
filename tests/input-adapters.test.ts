import { beforeEach, describe, expect, it } from "vitest";
import { snapshotFromPad } from "../src/input/Gamepad";
import { getTouchSnapshot, resetTouchSnapshot, setTouchSnapshot } from "../src/input/TouchState";

describe("Gamepad-Snapshot-Adapter", () => {
  it("liefert null fuer fehlende Pads", () => {
    expect(snapshotFromPad(null)).toBeNull();
    expect(snapshotFromPad(undefined)).toBeNull();
  });

  it("fuellt kurze Achsen auf zwei Werte auf und macht NaN zu 0", () => {
    const short = snapshotFromPad({ axes: [0.5], buttons: [] });
    expect(short).toEqual({ axes: [0.5, 0], buttons: [] });
    const invalid = snapshotFromPad({ axes: [Number.NaN, Infinity], buttons: [] });
    expect(invalid).toEqual({ axes: [0, 0], buttons: [] });
  });

  it("liest pressed und value >= 0.5, toleriert null-Buttons", () => {
    const pad = snapshotFromPad({
      axes: [0, 0, 0, 0],
      buttons: [{ pressed: true }, { value: 0.6 }, { value: 0.4 }, null],
    });
    expect(pad?.buttons).toEqual([true, true, false, false]);
  });
});

describe("TouchState-Snapshot", () => {
  beforeEach(() => resetTouchSnapshot());

  it("klemmt x/y auf [-1,1] und NaN auf 0", () => {
    setTouchSnapshot({ active: true, x: -3.4, y: 2.7, pause: true });
    expect(getTouchSnapshot()).toEqual({ active: true, x: -1, y: 1, pause: true });
    setTouchSnapshot({ active: true, x: Number.NaN, y: Infinity, pause: false });
    expect(getTouchSnapshot()).toEqual({ active: true, x: 0, y: 0, pause: false });
  });

  it("gibt Kopien heraus (kein Mutieren des globalen Zustands)", () => {
    setTouchSnapshot({ active: true, x: 0.5, y: 0.5 });
    const copy = getTouchSnapshot();
    copy.x = 0.9;
    expect(getTouchSnapshot().x).toBe(0.5);
    resetTouchSnapshot();
    expect(getTouchSnapshot()).toEqual({ active: false, x: 0, y: 0, pause: false });
  });
});
