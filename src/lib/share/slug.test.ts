import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSharePath, shareCardPath, sharePath, slugify } from "./slug.ts";

describe("share slugs", () => {
  it("builds a name-based path and reads it back", () => {
    assert.equal(slugify("Max Infeld"), "max-infeld");
    assert.equal(slugify("Chapel Dawn!"), "chapel-dawn");
    const path = sharePath("max-infeld", "chapel-dawn");
    assert.equal(path, "/s/max-infeld/chapel-dawn.html");
    assert.deepEqual(parseSharePath("max-infeld/chapel-dawn.html"), { user: "max-infeld", slug: "chapel-dawn" });
    assert.equal(parseSharePath("!!!"), null);
    assert.equal(shareCardPath("Max Infeld", "Chapel Dawn"), "/api/share-card?user=Max%20Infeld&slug=Chapel%20Dawn");
  });
});
