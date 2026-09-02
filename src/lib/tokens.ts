import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Magic-link token primitives.
 *
 * Kept free of `server-only` and of any Supabase import so the security-
 * critical parts are unit-testable in isolation. Nothing here reads secrets;
 * callers pass everything in.
 *
 * The raw token is shown to the freelancer exactly once, when the link is
 * created. Only its SHA-256 hash is stored, so a database leak does not hand
 * anyone a working portal link.
 */

/** 32 random bytes, base64url-encoded — 256 bits of entropy. */
export function generateClientToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time comparison, for anywhere two tokens are compared in app code. */
export function tokensMatch(a: string, b: string) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Rejects obviously malformed input before it reaches the database. */
export function isPlausibleToken(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && raw.length >= 16 && raw.length <= 512;
}

export function portalLinkFor(rawToken: string, baseUrl: string) {
  return `${baseUrl.replace(/\/$/, "")}/portal/${rawToken}`;
}
