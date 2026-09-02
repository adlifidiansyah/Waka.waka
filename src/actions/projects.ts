"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { Project, ProjectStatus } from "@/lib/database.types";

const projectSchema = z.object({
  title: z.string().trim().min(1, "Give the project a title.").max(160),
  clientName: z.string().trim().min(1, "Who is this for?").max(120),
  clientEmail: z.string().trim().email("That doesn't look like an email address."),
  description: z.string().trim().max(2000).optional(),
  budget: z.coerce.number().min(0, "Budget can't be negative.").max(100_000_000).default(0),
  currency: z.string().trim().length(3).toUpperCase().default("USD"),
});

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let projectId: string;

  try {
    const workspace = await requireWorkspace();
    const parsed = projectSchema.safeParse({
      title: formData.get("title"),
      clientName: formData.get("clientName"),
      clientEmail: formData.get("clientEmail"),
      description: formData.get("description") ?? undefined,
      budget: formData.get("budget") ?? 0,
      currency: formData.get("currency") ?? "USD",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        organization_id: workspace.organization.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        client_name: parsed.data.clientName,
        client_email: parsed.data.clientEmail,
        budget_cents: Math.round(parsed.data.budget * 100),
        currency: parsed.data.currency,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      // The plan-limit trigger surfaces here as a check_violation.
      return fail(error?.message ?? "Could not create the project.");
    }

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: data.id,
      action: `Project created: ${parsed.data.title}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    projectId = data.id;
  } catch (caught) {
    return fail(messageFrom(caught, "Could not create the project."));
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/projects/${projectId}`);
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("projects")
      .update({ status })
      .eq("id", projectId)
      .select("title")
      .single<Pick<Project, "title">>();

    if (error || !data) return fail(error?.message ?? "Could not update the project.");

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      action: `Project status set to ${status}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { status },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok(`Project marked ${status}.`);
  } catch (caught) {
    return fail(messageFrom(caught, "Could not update the project."));
  }
}

export async function setProjectStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "") as ProjectStatus;
  if (!projectId || !status) return fail("Missing project or status.");
  return updateProjectStatus(projectId, status);
}
