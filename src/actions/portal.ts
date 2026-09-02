"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDeliverableUnlocked, requestActorMeta, resolvePortalToken } from "@/lib/portal";
import { recordAudit } from "@/lib/audit";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";

const approveSchema = z.object({
  token: z.string().min(10).max(512),
  milestoneId: z.string().uuid(),
  signerName: z.string().trim().min(2, "Type your name to sign off.").max(120),
});

/**
 * "Approve & next" from the client portal.
 *
 * Authorisation is possession of the magic-link token, re-verified here rather
 * than trusted from the page render. The milestone id is checked against the
 * project the token unlocks inside `portal_approve_milestone`, which also
 * writes the audit row in the same transaction.
 */
export async function approveMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const parsed = approveSchema.safeParse({
      token: formData.get("token"),
      milestoneId: formData.get("milestoneId"),
      signerName: formData.get("signerName"),
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the approval details.");
    }

    const lookup = await resolvePortalToken(parsed.data.token);
    if (!lookup.ok) return fail("This link is no longer valid. Ask for a fresh one.");

    const milestone = lookup.context.milestones.find((m) => m.id === parsed.data.milestoneId);
    if (!milestone) return fail("That milestone isn't part of this project.");
    if (milestone.status === "approved") return ok("Already approved — thank you.");

    const { ip, userAgent } = await requestActorMeta();
    const signer = `${parsed.data.signerName} <${lookup.context.clientEmail ?? lookup.context.project.client_email}>`;

    const supabase = createAdminClient();
    const { error } = await supabase.rpc("portal_approve_milestone", {
      p_project_id: lookup.context.project.id,
      p_milestone_id: milestone.id,
      p_actor_email: signer,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (error) return fail(error.message);

    revalidatePath(`/portal/${parsed.data.token}`);
    revalidatePath(`/dashboard/projects/${lookup.context.project.id}`);
    return ok(`“${milestone.title}” is approved. Thanks — that's on the record.`);
  } catch (caught) {
    return fail(messageFrom(caught, "Could not record the approval."));
  }
}

const downloadSchema = z.object({
  token: z.string().min(10).max(512),
  deliverableId: z.string().uuid(),
});

/**
 * Mints a short-lived signed URL for a deliverable, after re-checking the
 * Asset Locker. Returns the URL rather than redirecting so the portal can
 * surface a lock message inline.
 */
export async function requestDownload(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { downloadUrl?: string }> {
  try {
    const parsed = downloadSchema.safeParse({
      token: formData.get("token"),
      deliverableId: formData.get("deliverableId"),
    });

    if (!parsed.success) return fail("Invalid download request.");

    const lookup = await resolvePortalToken(parsed.data.token);
    if (!lookup.ok) return fail("This link is no longer valid. Ask for a fresh one.");

    const milestone = lookup.context.milestones.find((m) =>
      m.deliverables.some((d) => d.id === parsed.data.deliverableId),
    );
    const deliverable = milestone?.deliverables.find((d) => d.id === parsed.data.deliverableId);

    if (!milestone || !deliverable) return fail("That file isn't part of this project.");
    if (!deliverable.storage_path) return fail("That deliverable has no file attached.");
    if (!isDeliverableUnlocked(deliverable, milestone.invoice)) {
      return fail("This file unlocks once the milestone invoice is settled.");
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.storage
      .from("deliverables")
      .createSignedUrl(deliverable.storage_path, 300, { download: deliverable.title });

    if (error || !data?.signedUrl) {
      return fail(error?.message ?? "Could not prepare the download.");
    }

    const { ip, userAgent } = await requestActorMeta();
    await recordAudit(supabase, {
      organizationId: lookup.context.organization.id,
      projectId: lookup.context.project.id,
      milestoneId: milestone.id,
      action: `Client downloaded: ${deliverable.title}`,
      actorType: "client",
      actorEmail: lookup.context.clientEmail ?? lookup.context.project.client_email,
      ip,
      userAgent,
      metadata: { deliverable_id: deliverable.id },
    });

    return { ...ok("Your download is ready."), downloadUrl: data.signedUrl };
  } catch (caught) {
    return fail(messageFrom(caught, "Could not prepare the download."));
  }
}
