import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generatePasscode, hashPasscode, verifyPasscode } from "./passcode";

describe("meeting passcode generation and verification", () => {
  it("generates a 6-digit numeric passcode", () => {
    const code = generatePasscode();
    assert.match(code, /^\d{6}$/);
    const num = Number(code);
    assert.ok(num >= 100000 && num <= 999999);
  });

  it("hashes and correctly verifies valid passcodes", () => {
    const code = "741258";
    const hash = hashPasscode(code);
    assert.ok(hash.includes(":"));
    assert.notEqual(hash, code);
    assert.equal(verifyPasscode(code, hash), true);
    assert.equal(verifyPasscode("  741258  ", hash), true);
  });

  it("rejects incorrect passcodes", () => {
    const hash = hashPasscode("123456");
    assert.equal(verifyPasscode("123457", hash), false);
    assert.equal(verifyPasscode("000000", hash), false);
    assert.equal(verifyPasscode("", hash), false);
  });

  it("handles null, undefined, and malformed hashes safely", () => {
    assert.equal(verifyPasscode("123456", null), false);
    assert.equal(verifyPasscode("123456", undefined), false);
    assert.equal(verifyPasscode("123456", "malformed"), false);
    assert.equal(verifyPasscode("123456", "short:"), false);
  });
});
