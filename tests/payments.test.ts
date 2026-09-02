import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  isMidtransSettled,
  verifyMidtransSignature,
  verifyStripeSignature,
} from "../src/lib/payments.ts";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ type: "checkout.session.completed", id: "evt_1" });

function stripeHeader(body: string, secret: string, atMs: number) {
  const t = Math.floor(atMs / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("Stripe webhook signatures", () => {
  const now = Date.UTC(2026, 8, 2, 12, 0, 0);

  test("accepts a correctly signed payload", () => {
    const header = stripeHeader(BODY, SECRET, now);
    assert.equal(verifyStripeSignature(BODY, header, SECRET, now).valid, true);
  });

  test("rejects a body tampered with after signing", () => {
    const header = stripeHeader(BODY, SECRET, now);
    const forged = BODY.replace("evt_1", "evt_2");
    assert.equal(verifyStripeSignature(forged, header, SECRET, now).valid, false);
  });

  test("rejects a signature made with a different secret", () => {
    const header = stripeHeader(BODY, "whsec_attacker", now);
    assert.equal(verifyStripeSignature(BODY, header, SECRET, now).valid, false);
  });

  test("rejects a replay outside the five-minute tolerance", () => {
    const header = stripeHeader(BODY, SECRET, now - 6 * 60_000);
    assert.equal(verifyStripeSignature(BODY, header, SECRET, now).valid, false);
  });

  test("accepts a delivery inside the tolerance", () => {
    const header = stripeHeader(BODY, SECRET, now - 60_000);
    assert.equal(verifyStripeSignature(BODY, header, SECRET, now).valid, true);
  });

  test("rejects a missing or malformed header", () => {
    assert.equal(verifyStripeSignature(BODY, null, SECRET, now).valid, false);
    assert.equal(verifyStripeSignature(BODY, "garbage", SECRET, now).valid, false);
    assert.equal(verifyStripeSignature(BODY, "t=abc,v1=def", SECRET, now).valid, false);
  });

  test("fails closed when no endpoint secret is configured", () => {
    const header = stripeHeader(BODY, SECRET, now);
    assert.equal(verifyStripeSignature(BODY, header, undefined, now).valid, false);
  });
});

describe("Midtrans notifications", () => {
  const serverKey = "SB-Mid-server-key";
  const base = { order_id: "inv-1", status_code: "200", gross_amount: "300000.00" };
  const signature_key = createHash("sha512")
    .update(`${base.order_id}${base.status_code}${base.gross_amount}${serverKey}`)
    .digest("hex");

  test("accepts a correctly signed notification", () => {
    assert.equal(verifyMidtransSignature({ ...base, signature_key }, serverKey).valid, true);
  });

  test("rejects a forged signature", () => {
    assert.equal(
      verifyMidtransSignature({ ...base, signature_key: "0".repeat(128) }, serverKey).valid,
      false,
    );
  });

  test("rejects an amount swapped after signing", () => {
    assert.equal(
      verifyMidtransSignature({ ...base, gross_amount: "1.00", signature_key }, serverKey).valid,
      false,
    );
  });

  test("rejects missing fields and a missing server key", () => {
    assert.equal(verifyMidtransSignature({ order_id: "inv-1" }, serverKey).valid, false);
    assert.equal(verifyMidtransSignature({ ...base, signature_key }, undefined).valid, false);
  });

  test("only settled or captured, non-fraud transactions unlock assets", () => {
    assert.equal(isMidtransSettled({ transaction_status: "settlement" }), true);
    assert.equal(
      isMidtransSettled({ transaction_status: "capture", fraud_status: "accept" }),
      true,
    );
    assert.equal(
      isMidtransSettled({ transaction_status: "capture", fraud_status: "challenge" }),
      false,
    );
    assert.equal(isMidtransSettled({ transaction_status: "pending" }), false);
    assert.equal(isMidtransSettled({ transaction_status: "deny" }), false);
    assert.equal(isMidtransSettled({}), false);
  });
});
