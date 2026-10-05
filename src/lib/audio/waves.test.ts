import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pointInPoly, reflectPoint, roomPolygon, sampleWaves } from "./waves.ts";

const limits = { minX: 0.08, maxX: 0.92, minY: 0.1, maxY: 0.9 };
const bowls = [
  { id: "a", x: 0.32, y: 0.4, frequency: 196, gain: 0.8 },
  { id: "b", x: 0.62, y: 0.58, frequency: 294, gain: 0.7 },
];
const ears = [{ id: "ear", x: 0.5, y: 0.5 }];

describe("wave fronts", () => {
  it("sends a ring out of every bowl and folds a copy off each wall", () => {
    const sample = sampleWaves({ bowls, ears, shape: "chapel", limits, time: 0.45 });
    const direct = sample.rings.filter((ring) => ring.kind === "direct");
    const bounce = sample.rings.filter((ring) => ring.kind === "bounce");
    assert.ok(direct.length >= bowls.length, "each bowl emits a front");
    assert.ok(bounce.length >= 4, "walls send fronts back in");
    assert.equal(sample.polygon.length, 4);
    for (const ring of direct) {
      assert.ok(ring.radius > 0);
      assert.ok(ring.alpha > 0);
    }
  });

  it("moves the fronts forward in time, then wraps", () => {
    const early = sampleWaves({ bowls, ears, shape: "cube", limits, time: 0.2 });
    const later = sampleWaves({ bowls, ears, shape: "cube", limits, time: 0.55 });
    assert.notEqual(early.phase, later.phase);
    const grow = later.rings.find((ring) => ring.kind === "direct" && ring.bowlId === "a");
    const start = early.rings.find((ring) => ring.kind === "direct" && ring.bowlId === "a" && ring.radius === grow?.radius);
    const earlyMax = Math.max(...early.rings.filter((ring) => ring.kind === "direct" && ring.bowlId === "a").map((ring) => ring.radius));
    const laterMax = Math.max(...later.rings.filter((ring) => ring.kind === "direct" && ring.bowlId === "a").map((ring) => ring.radius));
    assert.ok(laterMax > earlyMax || later.phase !== early.phase);
    assert.equal(start, undefined);
  });

  it("lights an ear when a front arrives and marks where bowls cross", () => {
    let lit = false;
    let crossed = false;
    for (let step = 0; step < 40; step++) {
      const sample = sampleWaves({ bowls, ears, shape: "shoebox", limits, time: step * 0.08 });
      if (sample.hits.includes("ear")) lit = true;
      if (sample.crossings.length > 0) crossed = true;
    }
    assert.equal(lit, true);
    assert.equal(crossed, true);
  });

  it("marks a bowl when another bowl's front arrives", () => {
    let struck = false;
    for (let step = 0; step < 40; step++) {
      const sample = sampleWaves({ bowls, ears, shape: "shoebox", limits, time: step * 0.08 });
      if (sample.bowlHits.some((hit) => hit.fromId !== hit.toId)) struck = true;
    }
    assert.equal(struck, true);
  });

  it("sends rising fronts back down from a face-down dome", () => {
    const dome = { id: "d", x: 0.32, y: 0.4, size: 0.7, reflect: 0.9, diffuse: 0.2, frequency: 196, height: 1.4 };
    const far = { ...dome, id: "far", x: 0.88, y: 0.86 };
    let under = false;
    let reached = false;
    for (let step = 0; step < 48; step++) {
      const time = step * 0.07;
      const near = sampleWaves({ bowls, ears, shape: "cube", limits, time, domes: [dome] });
      if (near.rings.some((ring) => ring.kind === "dome" && ring.domeId === "d" && ring.alpha > 0)) under = true;
      const wide = sampleWaves({ bowls, ears, shape: "cube", limits, time, domes: [far] });
      if (wide.rings.some((ring) => ring.kind === "dome" && ring.domeId === "far")) reached = true;
    }
    assert.equal(under, true);
    assert.equal(reached, true);
    const quiet = sampleWaves({ bowls, ears, shape: "cube", limits, time: 0.4, domes: [{ ...dome, reflect: 0 }] });
    assert.equal(quiet.rings.some((ring) => ring.kind === "dome"), false);
    let matched = 0;
    let detuned = 0;
    for (let step = 0; step < 48; step++) {
      const time = step * 0.07;
      const on = sampleWaves({ bowls, ears, shape: "cube", limits, time, domes: [dome] });
      const off = sampleWaves({
        bowls,
        ears,
        shape: "cube",
        limits,
        time,
        domes: [{ ...dome, frequency: 880 }],
      });
      matched += on.rings.filter((ring) => ring.kind === "dome").reduce((sum, ring) => sum + ring.alpha, 0);
      detuned += off.rings.filter((ring) => ring.kind === "dome").reduce((sum, ring) => sum + ring.alpha, 0);
    }
    assert.ok(matched > detuned, "a dome returns more of the note it is tuned to");
  });

  it("keeps reflected points on the far side of a wall", () => {
    const wallA = { x: 0, y: 0 };
    const wallB = { x: 0, y: 1 };
    const mirror = reflectPoint({ x: 0.4, y: 0.3 }, wallA, wallB);
    assert.ok(Math.abs(mirror.x + 0.4) < 1e-6);
    assert.ok(Math.abs(mirror.y - 0.3) < 1e-6);
    const poly = roomPolygon("rotunda", limits);
    assert.ok(poly.length >= 12);
    assert.equal(pointInPoly({ x: 0.5, y: 0.5 }, roomPolygon("chapel", limits)), true);
    assert.equal(pointInPoly({ x: 0, y: 0 }, roomPolygon("chapel", limits)), false);
  });
});
