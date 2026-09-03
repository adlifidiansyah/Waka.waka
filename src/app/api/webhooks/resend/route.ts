import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { suppressionFor, verifySvixSignature } from "@/lib/email/svix";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend delivery events.
 *
 * The one that matters is the bad news: a hard bounce or a spam complaint means
 * the address must stop being mailed. Payment reminders are a repeating series,
 * so without this a single dead address would be retried on a schedule for the
 * life of the project, which is how a sending domain gets blocked for every
 * studio sharing it.
 *
 * Point Resend at:  POST /api/webhooks/resend
 * with `email.bounced` and `email.complained` enabled.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const verification = verifySvixSignature(
    rawBody,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    process.env.RESEND_WEBHOOK_SECRET,
  );

  if (!verification.valid) {
    console.warn("[resend] rejected webhook:", verification.reason);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { to?: string[] | string; bounce?: { message?: string } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const suppression = suppressionFor(event.type ?? "");
  if (!suppression) {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const recipients = Array.isArray(event.data?.to)
    ? event.data.to
    : event.data?.to
      ? [event.data.to]
      : [];

  if (recipients.length === 0) {
    return NextResponse.json({ received: true, ignored: "no recipient" });
  }

  const supabase = createAdminClient();
  for (const recipient of recipients) {
    const { error } = await supabase.rpc("suppress_email", {
      p_email: recipient,
      p_reason: suppression.reason,
      p_detail: event.data?.bounce?.message ?? null,
    });
    if (error) {
      console.error("[resend] could not suppress", recipient, error.message);
      // 500 so Resend retries rather than dropping the signal.
      return NextResponse.json({ error: "Could not record suppression" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true, suppressed: recipients.length });
}
