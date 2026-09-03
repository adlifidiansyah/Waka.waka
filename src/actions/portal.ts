"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isDeliverableUnlocked,
  requestActorMeta,
  resolvePortalToken,
  type PortalContext,
} from "@/lib/portal";
import type { MilestoneWithChildren } from "@/lib/database.types";
import { recordAudit } from "@/lib/audit";
import { enqueueEmail } from "@/lib/email/queue";
import { brandOf } from "@/lib/email/brand";
import { organizationEmails } from "@/lib/email/recipients";
import { appUrl } from "@/lib/env";
import { formatDateTime, formatMoney } from "@/lib/utils";
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

    // The receipt and the studio's notification go through the outbox rather
    // than being sent here: the client is waiting on this action, and a slow
    // or failing mail provider must not hold up their approval.
    await queueApprovalEmails({
      context: lookup.context,
      milestone,
      signerName: parsed.data.signerName,
      signer,
      ip,
    });

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

/**
 * Queues the two emails an approval produces: a receipt for the client, and a
 * notification for the studio. Failures here are logged and swallowed — the
 * approval is already committed and is the thing that mattered.
 */
async function queueApprovalEmails({
  context,
  milestone,
  signerName,
  signer,
  ip,
}: {
  context: PortalContext;
  milestone: MilestoneWithChildren;
  signerName: string;
  signer: string;
  ip: string | null;
}) {
  try {
    const { project, organization, milestones } = context;
    const brand = brandOf(organization);
    const approvedAt = formatDateTime(new Date().toISOString());
    const next = milestones.find((m) => m.order_index > milestone.order_index);
    const clientEmail = context.clientEmail ?? project.client_email;

    const outstanding =
      milestone.invoice && milestone.invoice.status === "unpaid"
        ? formatMoney(milestone.invoice.amount_cents, milestone.invoice.currency)
        : null;

    await enqueueEmail({
      organizationId: organization.id,
      projectId: project.id,
      milestoneId: milestone.id,
      kind: "approval_receipt",
      to: clientEmail,
      // One receipt per milestone, however many times Approve is clicked.
      dedupeKey: `approval_receipt:${milestone.id}`,
      payload: {
        brand,
        clientName: project.client_name,
        projectTitle: project.title,
        milestoneTitle: milestone.title,
        approvedAt,
        signedBy: signerName,
        ipAddress: ip,
        nextMilestoneTitle: next?.title ?? null,
      },
    });

    const supabase = createAdminClient();
    const studioEmails = await organizationEmails(supabase, organization.id);

    await Promise.all(
      studioEmails.map((email) =>
        enqueueEmail({
          organizationId: organization.id,
          projectId: project.id,
          milestoneId: milestone.id,
          kind: "approval_notification",
          to: email,
          replyTo: clientEmail,
          dedupeKey: `approval_notification:${milestone.id}:${email}`,
          payload: {
            brand,
            clientName: project.client_name,
            projectTitle: project.title,
            milestoneTitle: milestone.title,
            approvedAt,
            signedBy: signer,
            dashboardUrl: `${appUrl()}/dashboard/projects/${project.id}`,
            outstandingAmount: outstanding,
          },
        }),
      ),
    );
  } catch (caught) {
    console.error("[email] could not queue approval emails", caught);
  }
}
