import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Svix webhook signatures, which is what Resend uses for delivery events.
 *
 * The signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 under the
 * base64 secret that follows the `whsec_` prefix, compared base64. The
 * signature header can carry several space-separated versioned signatures
 * during a secret rotation, so any matching `v1` entry is accepted.
 *
 * Kept free of `server-only` so it is unit-testable.
 */

const TOLERANCE_MS = 5 * 60 * 1000;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
}

export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  secret: string | undefined,
  now = Date.now(),
): VerificationResult {
  if (!secret) return { valid: false, reason: "RESEND_WEBHOOK_SECRET is not set" };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { valid: false, reason: "Missing svix headers" };
  }

  const sentAt = Number(headers.timestamp) * 1000;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > TOLERANCE_MS) {
    return { valid: false, reason: "Timestamp outside tolerance" };
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return { valid: false, reason: "Malformed signing secret" };

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest("base64");

  const presented = headers.signature
    .split(" ")
    .map((entry) => entry.split(","))
    .filter(([version]) => version === "v1")
    .map(([, value]) => value ?? "");

  if (presented.length === 0) return { valid: false, reason: "No v1 signature present" };

  const match = presented.some((candidate) => {
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });

  return match ? { valid: true } : { valid: false, reason: "Signature mismatch" };
}

/** Delivery events that mean an address should stop being mailed. */
export function suppressionFor(
  eventType: string,
): { reason: "bounced" | "complained" } | null {
  if (eventType === "email.bounced") return { reason: "bounced" };
  if (eventType === "email.complained") return { reason: "complained" };
  return null;
}
