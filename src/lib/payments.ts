import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Payment integration.
 *
 * ClientDeck does not hold funds. A milestone invoice carries a `checkout_url`
 * — a Stripe Payment Link or a Midtrans Snap link the freelancer pastes in —
 * and the provider's webhook is what flips the invoice to `paid`, which is what
 * the Asset Locker reads. That keeps the money in the freelancer's own
 * merchant account and keeps this codebase out of PCI scope.
 *
 * Signature verification is implemented directly against each provider's
 * documented scheme so no SDK is required at runtime. Secrets are passed in
 * by the route handlers rather than read here, which keeps this module pure
 * and unit-testable.
 */

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Stripe's `Stripe-Signature` header: `t=<unix>,v1=<hex hmac>` where the signed
 * payload is `${t}.${rawBody}` under the endpoint secret.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
  now = Date.now(),
): VerificationResult {
  if (!secret) return { valid: false, reason: "STRIPE_WEBHOOK_SECRET is not set" };
  if (!signatureHeader) return { valid: false, reason: "Missing Stripe-Signature header" };

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((chunk) => {
      const [key, ...rest] = chunk.split("=");
      return [key?.trim() ?? "", rest.join("=")];
    }),
  );

  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { valid: false, reason: "Malformed signature header" };

  // Reject replays outside Stripe's recommended tolerance.
  const age = Math.abs(now - Number(timestamp) * 1000);
  if (!Number.isFinite(age) || age > FIVE_MINUTES_MS) {
    return { valid: false, reason: "Signature timestamp outside tolerance" };
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(expected, provided)
    ? { valid: true }
    : { valid: false, reason: "Signature mismatch" };
}

/**
 * Midtrans signs notifications as
 * SHA512(order_id + status_code + gross_amount + server_key).
 */
export function verifyMidtransSignature(
  payload: { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string },
  serverKey: string | undefined,
): VerificationResult {
  if (!serverKey) return { valid: false, reason: "MIDTRANS_SERVER_KEY is not set" };

  const { order_id, status_code, gross_amount, signature_key } = payload;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return { valid: false, reason: "Missing signature fields" };
  }

  const expected = createHash("sha512")
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest("hex");

  return safeEqual(expected, signature_key)
    ? { valid: true }
    : { valid: false, reason: "Signature mismatch" };
}

/** Midtrans transaction states that mean the money has actually arrived. */
export function isMidtransSettled(payload: {
  transaction_status?: string;
  fraud_status?: string;
}) {
  const settled = payload.transaction_status === "settlement" || payload.transaction_status === "capture";
  const fraudOk = !payload.fraud_status || payload.fraud_status === "accept";
  return settled && fraudOk;
}
