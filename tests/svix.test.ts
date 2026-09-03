import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { suppressionFor, verifySvixSignature } from "../src/lib/email/svix.ts";

const KEY = randomBytes(24);
const SECRET = `whsec_${KEY.toString("base64")}`;
const BODY = JSON.stringify({ type: "email.bounced", data: { to: ["dead@x.test"] } });
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);

function sign(body: string, id: string, atMs: number, key = KEY) {
  const timestamp = String(Math.floor(atMs / 1000));
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return { id, timestamp, signature: `v1,${signature}` };
}

describe("Resend (Svix) webhook signatures", () => {
  test("accepts a correctly signed delivery", () => {
    const headers = sign(BODY, "msg_1", NOW);
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW).valid, true);
  });

  test("rejects a body tampered with after signing", () => {
    const headers = sign(BODY, "msg_1", NOW);
    const forged = BODY.replace("dead@x.test", "victim@x.test");
    assert.equal(verifySvixSignature(forged, headers, SECRET, NOW).valid, false);
  });

  test("rejects a signature bound to a different message id", () => {
    const headers = sign(BODY, "msg_1", NOW);
    assert.equal(
      verifySvixSignature(BODY, { ...headers, id: "msg_2" }, SECRET, NOW).valid,
      false,
    );
  });

  test("rejects a signature made with another key", () => {
    const headers = sign(BODY, "msg_1", NOW, randomBytes(24));
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW).valid, false);
  });

  test("rejects a replay outside the five-minute tolerance", () => {
    const headers = sign(BODY, "msg_1", NOW - 6 * 60_000);
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW).valid, false);
  });

  test("accepts any matching v1 signature, so a secret rotation does not drop events", () => {
    const good = sign(BODY, "msg_1", NOW);
    const headers = { ...good, signature: `v1,AAAA ${good.signature}` };
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW).valid, true);
  });

  test("ignores signature versions it does not understand", () => {
    const good = sign(BODY, "msg_1", NOW);
    const headers = { ...good, signature: good.signature.replace("v1,", "v2,") };
    assert.equal(verifySvixSignature(BODY, headers, SECRET, NOW).valid, false);
  });

  test("fails closed on missing headers or secret", () => {
    const headers = sign(BODY, "msg_1", NOW);
    assert.equal(verifySvixSignature(BODY, headers, undefined, NOW).valid, false);
    assert.equal(
      verifySvixSignature(BODY, { ...headers, signature: null }, SECRET, NOW).valid,
      false,
    );
    assert.equal(verifySvixSignature(BODY, { ...headers, id: null }, SECRET, NOW).valid, false);
    assert.equal(
      verifySvixSignature(BODY, { ...headers, timestamp: null }, SECRET, NOW).valid,
      false,
    );
  });

  test("works whether or not the secret carries the whsec_ prefix", () => {
    const headers = sign(BODY, "msg_1", NOW);
    assert.equal(verifySvixSignature(BODY, headers, KEY.toString("base64"), NOW).valid, true);
  });
});

describe("which events suppress an address", () => {
  test("bounces and complaints stop future mail", () => {
    assert.deepEqual(suppressionFor("email.bounced"), { reason: "bounced" });
    assert.deepEqual(suppressionFor("email.complained"), { reason: "complained" });
  });

  test("ordinary lifecycle events do not", () => {
    for (const type of ["email.sent", "email.delivered", "email.opened", "email.clicked", ""]) {
      assert.equal(suppressionFor(type), null, `${type} should not suppress`);
    }
  });
});
