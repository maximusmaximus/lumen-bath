import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePairingCode, generateAgentToken, claimPairingCode } from "./pairing.server.ts";

describe("Agent Pairing Service", () => {
  it("generates 6-character uppercase alphanumeric pairing codes", () => {
    const code = generatePairingCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[A-Z0-9]{6}$/);
    // Check entropy
    const code2 = generatePairingCode();
    assert.notEqual(code, code2);
  });

  it("generates secure agent tokens prefixed with lmn_agt_", () => {
    const token = generateAgentToken();
    assert.ok(token.startsWith("lmn_agt_"));
    assert.ok(token.length >= 32);
  });

  it("rejects invalid pairing code formats", async () => {
    const short = await claimPairingCode("123");
    assert.equal(short.ok, false);
    assert.ok(short.error?.includes("Expected 6"));

    const tooLong = await claimPairingCode("12345678");
    assert.equal(tooLong.ok, false);
  });
});
