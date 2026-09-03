import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { PAYLOAD_SCHEMAS, type EmailKind } from "@/lib/email/payloads";
import {
  renderApprovalNotificationEmail,
  renderApprovalReceiptEmail,
  renderPaymentReminderEmail,
  renderPortalLinkEmail,
  type RenderedEmail,
} from "@/lib/email/render";

export interface EnqueueInput {
  organizationId: string;
  projectId?: string | null;
  milestoneId?: string | null;
  invoiceId?: string | null;
  kind: EmailKind;
  to: string;
  replyTo?: string | null;
  payload: Record<string, unknown>;
  /**
   * Set for anything that must fire at most once — a specific reminder for a
   * specific invoice. Leave unset for a deliberate one-off, like a manual nudge
   * the freelancer clicked.
   */
  dedupeKey?: string | null;
  /** Delay the first attempt, e.g. to batch a morning send. */
  notBefore?: Date | null;
}

export type EnqueueResult =
  | { queued: true; id: string }
  | { queued: false; reason: "duplicate" | "suppressed" | "error"; message?: string };

/**
 * Adds a message to the outbox. Uses the service role deliberately: enqueueing
 * is only ever reached from a Server Action or webhook that has already
 * authorised the caller, and there is no INSERT policy for `authenticated`,
 * so a signed-in user cannot queue arbitrary mail from the deployment's
 * verified sending domain.
 */
export async function enqueueEmail(input: EnqueueInput): Promise<EnqueueResult> {
  const supabase = createAdminClient();
  const to = input.to.trim().toLowerCase();

  if (await isSuppressed(supabase, to)) {
    return { queued: false, reason: "suppressed" };
  }

  const { data, error } = await supabase
    .from("email_messages")
    .insert({
      organization_id: input.organizationId,
      project_id: input.projectId ?? null,
      milestone_id: input.milestoneId ?? null,
      invoice_id: input.invoiceId ?? null,
      kind: input.kind,
      to_email: to,
      reply_to: input.replyTo ?? null,
      payload: input.payload,
      dedupe_key: input.dedupeKey ?? null,
      next_attempt_at: (input.notBefore ?? new Date()).toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) {
    // 23505 is the dedupe index doing its job — the message is already queued
    // or already went out, which is success from the caller's point of view.
    if (error.code === "23505") return { queued: false, reason: "duplicate" };
    console.error("[email] could not queue message", { kind: input.kind, error: error.message });
    return { queued: false, reason: "error", message: error.message };
  }

  return { queued: true, id: data.id };
}

async function isSuppressed(supabase: SupabaseClient, email: string) {
  const { data } = await supabase
    .from("email_suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  return Boolean(data);
}

export interface DrainSummary {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface QueuedRow {
  id: string;
  kind: EmailKind;
  to_email: string;
  reply_to: string | null;
  payload: Record<string, unknown>;
}

/**
 * Sends whatever is due. Safe to run concurrently — the claim uses
 * `for update skip locked`, so overlapping cron runs split the queue rather
 * than double-sending.
 *
 * Never throws: a worker that dies partway leaves its claimed messages leased,
 * and they become claimable again five minutes later.
 */
export async function drainEmailQueue(limit = 25): Promise<DrainSummary> {
  const summary: DrainSummary = { claimed: 0, sent: 0, failed: 0, skipped: 0 };

  if (!isEmailConfigured()) return summary;

  const supabase = createAdminClient();
  const { data: batch, error } = await supabase.rpc("claim_email_batch", { p_limit: limit });

  if (error) {
    console.error("[email] could not claim a batch", error.message);
    return summary;
  }

  const rows = (batch ?? []) as QueuedRow[];
  summary.claimed = rows.length;

  for (const row of rows) {
    // Re-check on the way out: an address can be suppressed between queueing
    // and sending, and a reminder series outlives a bounce.
    if (await isSuppressed(supabase, row.to_email)) {
      await supabase.rpc("mark_email_failed", {
        p_id: row.id,
        p_error: "Recipient is suppressed",
        p_permanent: true,
      });
      summary.skipped += 1;
      continue;
    }

    let rendered: RenderedEmail;
    try {
      rendered = renderQueued(row);
    } catch (caught) {
      // A payload the current templates cannot render will never render.
      await supabase.rpc("mark_email_failed", {
        p_id: row.id,
        p_error: caught instanceof Error ? caught.message : "Could not render the email",
        p_permanent: true,
      });
      summary.failed += 1;
      continue;
    }

    const result = await sendEmail({
      to: row.to_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: row.reply_to,
      // Survives a retry after an ambiguous failure: the provider collapses
      // the duplicate rather than mailing the client twice.
      idempotencyKey: `queued-${row.id}`,
    });

    if (result.ok) {
      await supabase.rpc("mark_email_sent", { p_id: row.id, p_provider_id: result.id });
      summary.sent += 1;
    } else {
      await supabase.rpc("mark_email_failed", {
        p_id: row.id,
        p_error: result.message,
        // The transport decides: a 4xx means the message itself is wrong and
        // retrying only burns the budget, while a 429, a 5xx or a network blip
        // is worth another go.
        p_permanent: !result.retryable,
      });
      summary.failed += 1;
    }
  }

  return summary;
}

/** Exported for tests: payload validation plus template dispatch. */
export function renderQueued(row: Pick<QueuedRow, "kind" | "payload">): RenderedEmail {
  const schema = PAYLOAD_SCHEMAS[row.kind];
  if (!schema) throw new Error(`Unknown email kind: ${row.kind}`);

  const parsed = schema.safeParse(row.payload);
  if (!parsed.success) {
    throw new Error(`Payload does not match the ${row.kind} template: ${parsed.error.message}`);
  }

  switch (row.kind) {
    case "approval_receipt":
      return renderApprovalReceiptEmail(parsed.data as never);
    case "approval_notification":
      return renderApprovalNotificationEmail(parsed.data as never);
    case "payment_reminder":
      return renderPaymentReminderEmail(parsed.data as never);
    case "portal_link":
      return renderPortalLinkEmail(parsed.data as never);
  }
}
