"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { Milestone, MilestoneStatus } from "@/lib/database.types";

const milestoneSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the milestone a title.").max(160),
  description: z.string().trim().max(2000).optional(),
  price: z.coerce.number().min(0).max(100_000_000).default(0),
  dueDate: z.string().trim().optional(),
});

export async function createMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = milestoneSchema.safeParse({
      projectId: formData.get("projectId"),
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      price: formData.get("price") ?? 0,
      dueDate: formData.get("dueDate") ?? undefined,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the milestone details.");
    }

    const supabase = await createClient();

    // order_index is contiguous per project; take the next slot.
    const { data: last } = await supabase
      .from("milestones")
      .select("order_index")
      .eq("project_id", parsed.data.projectId)
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle<{ order_index: number }>();

    const { data: milestone, error } = await supabase
      .from("milestones")
      .insert({
        project_id: parsed.data.projectId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        price_cents: Math.round(parsed.data.price * 100),
        due_date: parsed.data.dueDate || null,
        order_index: (last?.order_index ?? 0) + 1,
      })
      .select("id, title")
      .single<Pick<Milestone, "id" | "title">>();

    if (error || !milestone) return fail(error?.message ?? "Could not add the milestone.");

    // A priced milestone gets a draft invoice immediately — that invoice is
    // what the Asset Locker checks against.
    if (parsed.data.price > 0) {
      await supabase.from("invoices").insert({
        milestone_id: milestone.id,
        amount_cents: Math.round(parsed.data.price * 100),
        status: "draft",
        due_date: parsed.data.dueDate || null,
      });
    }

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      milestoneId: milestone.id,
      action: `Milestone added: ${milestone.title}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok("Milestone added.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not add the milestone."));
  }
}

const statusSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "in_review", "approved"]),
});

export async function setMilestoneStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = statusSchema.safeParse({
      projectId: formData.get("projectId"),
      milestoneId: formData.get("milestoneId"),
      status: formData.get("status"),
    });

    if (!parsed.success) return fail("Invalid milestone status.");

    const supabase = await createClient();
    const status = parsed.data.status as MilestoneStatus;

    const { data, error } = await supabase
      .from("milestones")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.data.milestoneId)
      .select("title")
      .single<Pick<Milestone, "title">>();

    if (error || !data) return fail(error?.message ?? "Could not update the milestone.");

    // Moving to in_review issues the draft invoice, so the client sees an
    // amount due next to the work waiting on them.
    if (status === "in_review") {
      await supabase
        .from("invoices")
        .update({ status: "unpaid", issued_at: new Date().toISOString() })
        .eq("milestone_id", parsed.data.milestoneId)
        .eq("status", "draft");
    }

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      milestoneId: parsed.data.milestoneId,
      action:
        status === "in_review"
          ? `Sent for review: ${data.title}`
          : `Milestone status set to ${status}: ${data.title}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { status },
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok(status === "in_review" ? "Sent to the client for approval." : "Milestone updated.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not update the milestone."));
  }
}

export async function deleteMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const milestoneId = String(formData.get("milestoneId") ?? "");
    if (!projectId || !milestoneId) return fail("Missing milestone.");

    const supabase = await createClient();
    const { error } = await supabase.from("milestones").delete().eq("id", milestoneId);
    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      action: "Milestone deleted",
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { milestone_id: milestoneId },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok("Milestone removed.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not remove the milestone."));
  }
}
