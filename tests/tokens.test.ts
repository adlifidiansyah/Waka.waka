import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateClientToken,
  hashToken,
  isPlausibleToken,
  portalLinkFor,
  tokensMatch,
} from "../src/lib/tokens.ts";

describe("magic-link tokens", () => {
  test("a generated token is high-entropy and URL-safe", () => {
    const { raw } = generateClientToken();
    assert.match(raw, /^[A-Za-z0-9_-]+$/);
    assert.equal(raw.length, 43); // 32 bytes, base64url, unpadded
  });

  test("tokens do not repeat", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateClientToken().raw));
    assert.equal(seen.size, 500);
  });

  test("only the hash is meant for storage, and it is not the raw token", () => {
    const { raw, hash } = generateClientToken();
    assert.notEqual(hash, raw);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test("hashing is deterministic, so a returning client resolves", () => {
    const { raw, hash } = generateClientToken();
    assert.equal(hashToken(raw), hash);
  });

  test("a near-miss token hashes differently", () => {
    const { raw, hash } = generateClientToken();
    assert.notEqual(hashToken(`${raw}x`), hash);
    assert.notEqual(hashToken(raw.slice(0, -1)), hash);
  });

  test("comparison is length-safe and correct", () => {
    assert.equal(tokensMatch("abc", "abc"), true);
    assert.equal(tokensMatch("abc", "abd"), false);
    assert.equal(tokensMatch("abc", "abcd"), false);
    assert.equal(tokensMatch("", ""), true);
  });

  test("implausible tokens are rejected before touching the database", () => {
    assert.equal(isPlausibleToken(null), false);
    assert.equal(isPlausibleToken(undefined), false);
    assert.equal(isPlausibleToken(""), false);
    assert.equal(isPlausibleToken("short"), false);
    assert.equal(isPlausibleToken("x".repeat(513)), false);
    assert.equal(isPlausibleToken(generateClientToken().raw), true);
  });

  test("portal links join cleanly whether or not the base URL has a slash", () => {
    assert.equal(portalLinkFor("tok", "https://a.test"), "https://a.test/portal/tok");
    assert.equal(portalLinkFor("tok", "https://a.test/"), "https://a.test/portal/tok");
  });
});
