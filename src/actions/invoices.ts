"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { Invoice } from "@/lib/database.types";

const issueSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  amount: z.coerce.number().min(0).max(100_000_000),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
  dueDate: z.string().trim().optional(),
  checkoutUrl: z.string().trim().url("Payment link must be a full https:// URL.").optional().or(z.literal("")),
});

/** Creates the milestone's invoice, or re-issues an existing draft. */
export async function issueInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = issueSchema.safeParse({
      projectId: formData.get("projectId"),
      milestoneId: formData.get("milestoneId"),
      amount: formData.get("amount"),
      currency: formData.get("currency") ?? "USD",
      dueDate: formData.get("dueDate") ?? undefined,
      checkoutUrl: formData.get("checkoutUrl") ?? "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the invoice details.");
    }

    const supabase = await createClient();
    const payload = {
      milestone_id: parsed.data.milestoneId,
      amount_cents: Math.round(parsed.data.amount * 100),
      currency: parsed.data.currency,
      status: "unpaid" as const,
      due_date: parsed.data.dueDate || null,
      checkout_url: parsed.data.checkoutUrl || null,
      issued_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("invoices")
      .upsert(payload, { onConflict: "milestone_id" });

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      milestoneId: parsed.data.milestoneId,
      action: "Invoice issued",
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { amount_cents: payload.amount_cents, currency: payload.currency },
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok("Invoice issued. Your client sees the amount due in their portal.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not issue the invoice."));
  }
}

/**
 * Manual settlement — bank transfer, cash, or a provider we don't have a
 * webhook for. Stripe/Midtrans go through the webhook route instead, which
 * calls the same `settle_invoice` function.
 */
export async function markInvoicePaid(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const invoiceId = String(formData.get("invoiceId") ?? "");
    const reference = formData.get("reference")?.toString().trim() || null;

    if (!projectId || !invoiceId) return fail("Missing invoice.");

    const supabase = await createClient();
    const { error } = await supabase.rpc("settle_invoice", {
      p_invoice_id: invoiceId,
      p_provider: "manual",
      p_provider_payment_id: reference,
      p_actor_email: workspace.email,
      p_actor_type: "freelancer",
    });

    if (error) return fail(error.message);

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok("Marked paid. Any locked files just unlocked for your client.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not mark the invoice paid."));
  }
}

export async function voidInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const invoiceId = String(formData.get("invoiceId") ?? "");
    if (!projectId || !invoiceId) return fail("Missing invoice.");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("invoices")
      .update({ status: "void" })
      .eq("id", invoiceId)
      .neq("status", "paid")
      .select("id, milestone_id")
      .maybeSingle<Pick<Invoice, "id" | "milestone_id">>();

    if (error) return fail(error.message);
    if (!data) return fail("A paid invoice can't be voided.");

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      milestoneId: data.milestone_id,
      action: "Invoice voided",
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok("Invoice voided.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not void the invoice."));
  }
}
