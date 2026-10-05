import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampCycleSeconds, cycleFadeSeconds, reorderEars, rotateEars } from "./ear-order.ts";

const ears = [
  { id: "ear" },
  { id: "stem-a" },
  { id: "stem-b" },
];

describe("ear order", () => {
  it("turns the ear into the last stem and hears the next one", () => {
    assert.deepEqual(
      rotateEars(ears).map((ear) => ear.id),
      ["stem-a", "stem-b", "ear"],
    );
    assert.deepEqual(
      rotateEars(rotateEars(rotateEars(ears))).map((ear) => ear.id),
      ["ear", "stem-a", "stem-b"],
    );
  });

  it("keeps a single ear where it is", () => {
    assert.deepEqual(rotateEars([{ id: "ear" }]), [{ id: "ear" }]);
  });

  it("sorts into the order the user arranged", () => {
    assert.deepEqual(
      reorderEars(ears, ["stem-b", "ear", "stem-a"]).map((ear) => ear.id),
      ["stem-b", "ear", "stem-a"],
    );
    assert.deepEqual(reorderEars(ears, ["ear"]), ears);
  });

  it("keeps the cycle between a quarter second and 33.33 seconds", () => {
    assert.equal(clampCycleSeconds(0), 0.25);
    assert.equal(clampCycleSeconds(0.25), 0.25);
    assert.equal(clampCycleSeconds(33.33), 33.33);
    assert.equal(clampCycleSeconds(60), 33.33);
    const fade = cycleFadeSeconds(0.25);
    assert.ok(fade < 0.25);
    assert.ok(cycleFadeSeconds(33.33) <= 0.22);
  });
});
