import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSceneFromIntent, parsePromptIntent } from "./scene-generator.ts";

describe("Natural Language Scene Generator", () => {
  it("infers room, tuning, and binaural beat from natural language prompt", () => {
    const intent = parsePromptIntent("Deep sleep theta meditation in a cathedral nave with 2 domes and quad stems");
    assert.equal(intent.roomShape, "nave");
    assert.equal(intent.binauralBeatHz, 4.5);
    assert.equal(intent.domeCount, 2);
    assert.equal(intent.stemCount, 4);
  });

  it("generates complete soundscape without requiring manual coordinate placement", () => {
    const scene = generateSceneFromIntent({
      prompt: "Harmonic chakra sound bath in a rotunda with 7 bowls",
      tuning: "chakra",
      bowlCount: 7,
      layout: "circle",
    });

    assert.equal(scene.settings.roomShape, "rotunda");
    assert.equal(scene.bowls.length, 7);
    assert.equal((scene.ears?.length ?? 0) >= 1, true);

    // Bowls should be distributed properly within normalized boundary (0.1 to 0.9)
    for (const bowl of scene.bowls) {
      assert.ok(bowl.x >= 0.1 && bowl.x <= 0.9);
      assert.ok(bowl.y >= 0.1 && bowl.y <= 0.9);
      assert.ok(bowl.frequency >= 48 && bowl.frequency <= 960);
      assert.ok(bowl.gain > 0 && bowl.gain <= 1);
    }

    // Ear horns properly set up
    const ear = scene.ears![0]!;
    assert.ok(ear.left.size > 0);
    assert.ok(ear.right.size > 0);
  });

  it("supports solfeggio and planetary tunings with custom layout", () => {
    const scene = generateSceneFromIntent({
      tuning: "solfeggio",
      bowlCount: 9,
      layout: "spiral",
      roomShape: "golden",
    });

    assert.equal(scene.bowls.length, 9);
    assert.equal(scene.settings.roomShape, "golden");
    // Miracle 528 Hz is in solfeggio set
    assert.ok(scene.bowls.some((b) => b.frequency === 528));
  });
});
