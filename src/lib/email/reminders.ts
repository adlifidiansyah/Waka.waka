import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueEmail } from "@/lib/email/queue";
import { brandOf } from "@/lib/email/brand";
import { organizationEmails } from "@/lib/email/recipients";
import { currentReminderStep, daysOverdue } from "@/lib/email/schedule";

// Re-exported so callers have one import for "reminders".
export { REMINDER_STEPS, currentReminderStep, daysOverdue } from "@/lib/email/schedule";
export type { ReminderStepId } from "@/lib/email/schedule";
import { formatDate, formatMoney } from "@/lib/utils";

export interface ReminderSweepSummary {
  considered: number;
  queued: number;
  skipped: number;
}

interface InvoiceRow {
  id: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  checkout_url: string | null;
  milestone: {
    id: string;
    title: string;
    project: {
      id: string;
      title: string;
      client_name: string;
      client_email: string;
      status: string;
      organization: {
        id: string;
        name: string;
        brand_color: string;
        logo_url: string | null;
        badge_enabled: boolean;
      };
    };
  } | null;
}

/**
 * Finds unpaid invoices that have reached a reminder step and queues the nudge.
 * Idempotent: re-running it queues nothing new, because every message carries
 * the dedupe key `payment_reminder:<invoice>:<step>`.
 */
export async function sweepPaymentReminders(now = new Date()): Promise<ReminderSweepSummary> {
  const summary: ReminderSweepSummary = { considered: 0, queued: 0, skipped: 0 };
  const supabase = createAdminClient();
  // "Reply to arrange payment" only works if replies reach a person, and a
  // sweep usually touches several invoices per studio.
  const replyToByOrg = new Map<string, string | null>();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `id, amount_cents, currency, due_date, checkout_url,
       milestone:milestones!inner (
         id, title,
         project:projects!inner (
           id, title, client_name, client_email, status,
           organization:organizations!inner ( id, name, brand_color, logo_url, badge_enabled )
         )
       )`,
    )
    .eq("status", "unpaid")
    .not("due_date", "is", null)
    .returns<InvoiceRow[]>();

  if (error) {
    console.error("[reminders] could not load unpaid invoices", error.message);
    return summary;
  }

  for (const invoice of data ?? []) {
    summary.considered += 1;

    const milestone = invoice.milestone;
    const project = milestone?.project;
    const organization = project?.organization;

    if (!milestone || !project || !organization || !invoice.due_date) {
      summary.skipped += 1;
      continue;
    }

    // Don't chase payment on work the freelancer has shelved.
    if (project.status === "archived" || project.status === "paused") {
      summary.skipped += 1;
      continue;
    }

    const overdue = daysOverdue(invoice.due_date, now);
    const step = currentReminderStep(overdue);
    if (!step) {
      summary.skipped += 1;
      continue;
    }

    // Whether settling this invoice actually releases anything, so the email
    // only makes that promise when it is true.
    const { count: lockedCount } = await supabase
      .from("deliverables")
      .select("id", { count: "exact", head: true })
      .eq("milestone_id", milestone.id)
      .eq("locked_until_paid", true);

    if (!replyToByOrg.has(organization.id)) {
      const emails = await organizationEmails(supabase, organization.id);
      replyToByOrg.set(organization.id, emails[0] ?? null);
    }

    const result = await enqueueEmail({
      organizationId: organization.id,
      projectId: project.id,
      milestoneId: milestone.id,
      invoiceId: invoice.id,
      kind: "payment_reminder",
      to: project.client_email,
      replyTo: replyToByOrg.get(organization.id) ?? null,
      dedupeKey: `payment_reminder:${invoice.id}:${step}`,
      payload: {
        brand: brandOf({
          name: organization.name,
          brand_color: organization.brand_color,
          logo_url: organization.logo_url,
          badge_enabled: organization.badge_enabled,
        }),
        clientName: project.client_name,
        projectTitle: project.title,
        milestoneTitle: milestone.title,
        amount: formatMoney(invoice.amount_cents, invoice.currency),
        dueDate: formatDate(invoice.due_date),
        daysOverdue: overdue,
        checkoutUrl: invoice.checkout_url,
        unlocksFiles: (lockedCount ?? 0) > 0,
      },
    });

    if (result.queued) summary.queued += 1;
    else summary.skipped += 1;
  }

  return summary;
}
