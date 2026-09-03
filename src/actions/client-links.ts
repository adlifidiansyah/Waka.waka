"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { generateClientToken, portalLinkFor } from "@/lib/tokens";
import { appUrl } from "@/lib/env";
import { renderPortalLinkEmail } from "@/lib/email/render";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { formatDate } from "@/lib/utils";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { Project } from "@/lib/database.types";

const linkSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().trim().min(1).max(120).default("Client link"),
  clientEmail: z.string().trim().email().optional().or(z.literal("")),
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(0),
  sendEmail: z.boolean().default(false),
  message: z.string().trim().max(1000).optional(),
});

/**
 * Mints a magic link and, optionally, emails it to the client.
 *
 * The raw token is returned exactly once, in the action result — after this it
 * exists only as a SHA-256 hash, so a lost link has to be re-issued rather than
 * looked up. That is also why emailing happens here rather than as a separate
 * "resend" action: there is nothing left to re-send.
 */
export async function createClientLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = linkSchema.safeParse({
      projectId: formData.get("projectId"),
      label: formData.get("label") || "Client link",
      clientEmail: formData.get("clientEmail") ?? "",
      expiresInDays: formData.get("expiresInDays") ?? 0,
      sendEmail: formData.get("sendEmail") === "on",
      message: formData.get("message") ?? undefined,
    });

    if (!parsed.success) return fail("Check the link details.");

    const supabase = await createClient();

    const { data: project } = await supabase
      .from("projects")
      .select("id, title, client_name, client_email, organization_id")
      .eq("id", parsed.data.projectId)
      .maybeSingle<
        Pick<Project, "id" | "title" | "client_name" | "client_email" | "organization_id">
      >();

    if (!project) return fail("Project not found.");

    // Whoever the freelancer typed wins; otherwise fall back to the address on
    // the project.
    const recipient = parsed.data.clientEmail || project.client_email;

    if (parsed.data.sendEmail && !recipient) {
      return fail("Add a client email address to send the link to.");
    }

    const { raw, hash } = generateClientToken();
    const expiresAt =
      parsed.data.expiresInDays > 0
        ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
        : null;

    const { data: token, error } = await supabase
      .from("client_access_tokens")
      .insert({
        project_id: parsed.data.projectId,
        token_hash: hash,
        label: parsed.data.label,
        client_email: parsed.data.clientEmail || null,
        expires_at: expiresAt,
      })
      .select("id")
      .single<{ id: string }>();

    if (error || !token) return fail(error?.message ?? "Could not create the link.");

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      action: `Client link created: ${parsed.data.label}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { expires_at: expiresAt },
    });

    const link = portalLinkFor(raw, appUrl());

    if (!parsed.data.sendEmail) {
      revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
      return ok("Link created. Copy it now — it isn't shown again.", { createdLink: link });
    }

    const rendered = renderPortalLinkEmail({
      clientName: project.client_name,
      studioName: workspace.organization.name,
      projectTitle: project.title,
      portalUrl: link,
      brandColor: workspace.organization.brand_color,
      logoUrl: workspace.organization.logo_url,
      expiresOn: expiresAt ? formatDate(expiresAt) : null,
      message: parsed.data.message,
      showBadge: workspace.organization.badge_enabled,
    });

    const result = await sendEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      // Replies go to the freelancer, not into a no-reply void.
      replyTo: workspace.email || null,
      // A double-submitted form must not send the client two portal emails.
      idempotencyKey: `portal-link-${token.id}`,
    });

    if (!result.ok) {
      await recordAudit(supabase, {
        organizationId: workspace.organization.id,
        projectId: parsed.data.projectId,
        action: "Client link email failed",
        actorType: "system",
        actorEmail: recipient,
        metadata: { token_id: token.id, reason: result.reason },
      });

      revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
      // The link is real and usable — say so, and hand it over to be sent by
      // hand rather than reporting a flat failure.
      return {
        success: "Link created. Copy it now — it isn't shown again.",
        warning: `It wasn't emailed: ${result.message}`,
        createdLink: link,
      };
    }

    await supabase
      .from("client_access_tokens")
      .update({
        emailed_at: new Date().toISOString(),
        emailed_to: recipient,
        email_provider_id: result.id,
      })
      .eq("id", token.id);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      action: `Portal link emailed to ${recipient}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { token_id: token.id, provider_id: result.id },
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok(`Link created and emailed to ${recipient}.`, { createdLink: link });
  } catch (caught) {
    return fail(messageFrom(caught, "Could not create the link."));
  }
}

export async function revokeClientLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const tokenId = String(formData.get("tokenId") ?? "");
    if (!projectId || !tokenId) return fail("Missing link.");

    const supabase = await createClient();
    const { error } = await supabase
      .from("client_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", tokenId)
      .is("revoked_at", null);

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      action: "Client link revoked",
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { token_id: tokenId },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok("Link revoked. It stops working immediately.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not revoke the link."));
  }
}

/** Surfaces whether this deployment can send email, for the dashboard UI. */
export async function emailAvailability() {
  return { configured: isEmailConfigured() };
}
