import "server-only";

/**
 * Resend transport.
 *
 * Called through `fetch` rather than the SDK, matching how the payment
 * webhooks talk to Stripe and Midtrans: the send endpoint is a single POST,
 * and keeping it dependency-free means the request shape is visible and
 * testable without network access. Move to the SDK if attachments, batching or
 * scheduled sends become necessary.
 *
 * https://resend.com/docs/api-reference/emails/send-email
 */

const DEFAULT_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

/**
 * Overridable so the transport can be pointed at a stub in tests or at an
 * egress proxy in a locked-down network. Unset in normal use.
 */
function endpoint() {
  return process.env.RESEND_ENDPOINT_OVERRIDE || DEFAULT_ENDPOINT;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Client replies should reach the freelancer, not a no-reply void. */
  replyTo?: string | null;
  /** Collapses provider-side retries of the same logical send. */
  idempotencyKey?: string;
}

export type SendEmailResult =
  | { ok: true; id: string | null }
  | {
      ok: false;
      reason: "not_configured" | "rejected" | "unavailable" | "network";
      message: string;
      /**
       * Whether another attempt could plausibly succeed. A 4xx is the provider
       * saying the message itself is wrong — an unverified domain, a malformed
       * recipient — and retrying it just burns the budget. A 429 or a 5xx is
       * the provider being briefly unable, which is exactly what retries exist
       * for.
       */
      retryable: boolean;
    };

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

/**
 * Never throws: a failed send is a returned result the caller can surface next
 * to the link, so the freelancer copies it by hand instead of assuming their
 * client got it.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      reason: "not_configured",
      retryable: false,
      message:
        "Email isn't set up on this deployment. Add RESEND_API_KEY and RESEND_FROM_EMAIL, or copy the link and send it yourself.",
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers,
      body: JSON.stringify(buildPayload(from, input)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; name?: string }
      | null;

    if (!response.ok) {
      const transient = response.status === 429 || response.status === 408 || response.status >= 500;
      return {
        ok: false,
        reason: transient ? "unavailable" : "rejected",
        retryable: transient,
        // Resend's message names the actual problem (unverified domain, bad
        // recipient), which is exactly what the freelancer needs to see.
        message:
          body?.message ??
          (transient
            ? `Resend was unavailable (HTTP ${response.status}).`
            : `Resend rejected the send (HTTP ${response.status}).`),
      };
    }

    return { ok: true, id: body?.id ?? null };
  } catch (caught) {
    const timedOut = caught instanceof Error && caught.name === "TimeoutError";
    return {
      ok: false,
      reason: "network",
      retryable: true,
      message: timedOut
        ? "Sending timed out. Copy the link and send it yourself."
        : "Could not reach the email provider. Copy the link and send it yourself.",
    };
  }
}

/** Exported for tests: the exact JSON body Resend receives. */
export function buildPayload(from: string, input: SendEmailInput) {
  return {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(input.replyTo ? { reply_to: [input.replyTo] } : {}),
  };
}
