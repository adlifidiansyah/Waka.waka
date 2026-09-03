import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepPaymentReminders } from "@/lib/email/reminders";
import { drainEmailQueue } from "@/lib/email/queue";
import { isEmailConfigured } from "@/lib/email/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The scheduled tick: work out which payment reminders are due, then send
 * whatever is sitting in the outbox.
 *
 * One endpoint rather than two so there is a single thing to schedule. Run it
 * hourly — the reminder schedule is measured in days, and the queue's own
 * backoff handles anything that failed.
 *
 *   Vercel:  { "crons": [{ "path": "/api/cron/email", "schedule": "0 * * * *" }] }
 *   Other:   curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/email
 *
 * Both GET and POST are accepted because schedulers disagree about which to use.
 */
async function handle(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({ skipped: "email is not configured" });
  }

  const reminders = await sweepPaymentReminders();
  const delivery = await drainEmailQueue(50);

  return NextResponse.json({ reminders, delivery });
}

export const GET = handle;
export const POST = handle;

/**
 * A cron endpoint is a public URL that sends mail, so it is authenticated even
 * though no user is involved. Vercel Cron sends its own bearer token; anything
 * else uses CRON_SECRET. With neither set the endpoint refuses to run rather
 * than defaulting open.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
