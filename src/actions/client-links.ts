"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { generateClientToken, portalLinkFor } from "@/lib/tokens";
import { appUrl } from "@/lib/env";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";

const linkSchema = z.object({
  projectId: z.string().uuid(),
  label: z.string().trim().min(1).max(120).default("Client link"),
  clientEmail: z.string().trim().email().optional().or(z.literal("")),
  expiresInDays: z.coerce.number().int().min(0).max(3650).default(0),
});

/**
 * Mints a magic link. The raw token is returned exactly once, in the action
 * result — after this it exists only as a SHA-256 hash, so a lost link has to
 * be re-issued rather than looked up.
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
    });

    if (!parsed.success) return fail("Check the link details.");

    const { raw, hash } = generateClientToken();
    const expiresAt =
      parsed.data.expiresInDays > 0
        ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000).toISOString()
        : null;

    const supabase = await createClient();
    const { error } = await supabase.from("client_access_tokens").insert({
      project_id: parsed.data.projectId,
      token_hash: hash,
      label: parsed.data.label,
      client_email: parsed.data.clientEmail || null,
      expires_at: expiresAt,
    });

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      action: `Client link created: ${parsed.data.label}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { expires_at: expiresAt },
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok("Link created. Copy it now — it isn't shown again.", {
      createdLink: portalLinkFor(raw, appUrl()),
    });
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
