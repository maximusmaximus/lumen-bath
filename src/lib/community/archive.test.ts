import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiWeekPath,
  profilePath,
  publishedScenePath,
  savedScenePath,
  savedSlugs,
  sessionPath,
} from "./archive.ts";

describe("library archive paths", () => {
  it("keeps scene files under the author and rejects path tricks", () => {
    assert.equal(publishedScenePath("Max Infeld", "Chapel Dawn"), "scenes/max-infeld/chapel-dawn.json");
    assert.equal(publishedScenePath("../etc", "a/b"), "scenes/etc/a-b.json");
    assert.equal(savedScenePath("maxi", "lip down"), "scenes/maxi/saved/lip-down.json");
    assert.equal(profilePath("maxi"), "preferences/maxi/profile.json");
    assert.equal(sessionPath("maxi"), "preferences/maxi/session.json");
    assert.equal(aiWeekPath("2026-W40"), "ai/weeks/2026-w40.json");
  });

  it("gives two baths with the same name different files", () => {
    const slugs = savedSlugs([
      { name: "Dawn", id: "abc12345" },
      { name: "Dawn", id: "zzz99999" },
    ]);
    assert.equal(slugs[0], "dawn");
    assert.notEqual(slugs[0], slugs[1]);
    assert.match(slugs[1] ?? "", /^dawn-/);
  });
});
