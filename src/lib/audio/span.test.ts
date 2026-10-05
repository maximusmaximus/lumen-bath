import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bowlDropRoom, bowlLift, bowlPoint, dropBowlBottom, earSolids } from "./space.ts";
import type { SolidBowl } from "./space.ts";

const settings = { width: 0.55, depth: 0.55, size: 4, roomShape: "rotunda" as const };

function bowl(patch: Partial<SolidBowl> & Pick<SolidBowl, "id" | "gain">): SolidBowl {
  return {
    x: 0.5,
    y: 0.5,
    size: 0.5,
    height: 0.4,
    ...patch,
  };
}

function rim(item: SolidBowl): number {
  const placed = bowlPoint(item, settings);
  return placed.lift + placed.wall * 0.9;
}

describe("dropBowlBottom", () => {
  it("grows the wall downward and keeps the rim", () => {
    const start = bowl({ id: "a", gain: 0.72, height: 0.36 });
    const before = bowlPoint(start, settings);
    const next = dropBowlBottom(start, before.lift - 0.45, [], settings);
    const after = bowlPoint({ ...start, ...next }, settings);
    assert.ok(next.height > start.height);
    assert.ok(next.gain < start.gain);
    assert.ok(Math.abs(rim({ ...start, ...next }) - rim(start)) < 1e-3);
    assert.ok(after.lift < before.lift - 0.3);
  });

  it("will not push the base through the floor", () => {
    const start = bowl({ id: "a", gain: 0.7, height: 0.3 });
    const next = dropBowlBottom(start, -5, [], settings);
    const floor = bowlLift(0.05);
    const after = bowlPoint({ ...start, ...next }, settings);
    assert.ok(after.lift >= floor - 1e-3);
    assert.ok(bowlDropRoom(bowl({ id: "floor", gain: 0.05, height: 0.4 }), [], settings) < 0.08);
  });

  it("stops on a bowl or an ear underneath, and ignores one beside it", () => {
    const lower = bowl({ id: "low", gain: 0.2, height: 0.85 });
    const upper = bowl({ id: "up", gain: 0.9, height: 0.28 });
    const beside = bowl({ id: "side", x: 0.15, y: 0.15, gain: 0.2, height: 0.85 });
    const blocked = dropBowlBottom(upper, -5, [lower], settings);
    const clear = dropBowlBottom(upper, -5, [beside], settings);
    const lowTop = bowlPoint(lower, settings).lift + bowlPoint(lower, settings).wall * 0.9;
    const blockedLift = bowlPoint({ ...upper, ...blocked }, settings).lift;
    const clearLift = bowlPoint({ ...upper, ...clear }, settings).lift;
    assert.ok(blockedLift >= lowTop - 0.02);
    assert.ok(clearLift < blockedLift - 0.2);

    const ear = earSolids([{ x: 0.5, y: 0.5, height: 0.45, yaw: 0 }], settings)[0]!;
    const underEar = dropBowlBottom(upper, -5, [], settings, [ear]);
    const earLift = bowlPoint({ ...upper, ...underEar }, settings).lift;
    assert.ok(earLift >= ear.top - 0.02);
  });
});
