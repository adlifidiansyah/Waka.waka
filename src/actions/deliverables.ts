"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { Deliverable } from "@/lib/database.types";

/**
 * Kept in step with `serverActions.bodySizeLimit` in next.config.ts. The
 * default matches Vercel's 4.5 MB platform ceiling for request bodies, which
 * is enforced before the action runs — checking it here just produces a
 * sentence a person can act on instead of a raw 413.
 */
const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 4);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const embedSchema = z.object({
  projectId: z.string().uuid(),
  milestoneId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the deliverable a title.").max(160),
  url: z.string().trim().url("Enter a full https:// URL."),
  kind: z.enum(["embed", "link"]).default("embed"),
});

export async function addEmbedDeliverable(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = embedSchema.safeParse({
      projectId: formData.get("projectId"),
      milestoneId: formData.get("milestoneId"),
      title: formData.get("title"),
      url: formData.get("url"),
      kind: formData.get("kind") ?? "embed",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the link details.");
    }
    if (!parsed.data.url.startsWith("https://")) {
      return fail("Only https:// links can be shared with a client.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("deliverables").insert({
      milestone_id: parsed.data.milestoneId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      embed_url: parsed.data.url,
      // Links and embeds are previews; the Asset Locker guards downloadable files.
      locked_until_paid: false,
    });

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId: parsed.data.projectId,
      milestoneId: parsed.data.milestoneId,
      action: `Preview added: ${parsed.data.title}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    return ok("Preview added to the portal.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not add the preview."));
  }
}

export async function uploadDeliverableFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const milestoneId = String(formData.get("milestoneId") ?? "");
    const lockUntilPaid = formData.get("lockUntilPaid") === "on";
    const file = formData.get("file");

    if (!projectId || !milestoneId) return fail("Missing milestone.");
    if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.");
    if (file.size > MAX_UPLOAD_BYTES) {
      return fail(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Uploads through the portal are capped at ${MAX_UPLOAD_MB} MB — share anything larger as a link deliverable.`,
      );
    }

    const supabase = await createClient();

    // <organization_id>/<project_id>/<random>-<filename> — the leading segment
    // is what the storage RLS policy checks.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const storagePath = `${workspace.organization.id}/${projectId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("deliverables")
      .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

    if (uploadError) return fail(`Upload failed: ${uploadError.message}`);

    const { error: insertError } = await supabase.from("deliverables").insert({
      milestone_id: milestoneId,
      kind: "file",
      title: formData.get("title")?.toString().trim() || file.name,
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: file.type || null,
      locked_until_paid: lockUntilPaid,
    });

    if (insertError) {
      // Don't leave an orphan object behind if the row failed.
      await supabase.storage.from("deliverables").remove([storagePath]);
      return fail(insertError.message);
    }

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      milestoneId,
      action: `File uploaded: ${file.name}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { locked_until_paid: lockUntilPaid, size_bytes: file.size },
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok(lockUntilPaid ? "File uploaded and locked until payment." : "File uploaded.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not upload the file."));
  }
}

export async function toggleDeliverableLock(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const deliverableId = String(formData.get("deliverableId") ?? "");
    if (!projectId || !deliverableId) return fail("Missing deliverable.");

    const supabase = await createClient();
    const { data: current } = await supabase
      .from("deliverables")
      .select("id, title, locked_until_paid")
      .eq("id", deliverableId)
      .single<Pick<Deliverable, "id" | "title" | "locked_until_paid">>();

    if (!current) return fail("Deliverable not found.");

    const next = !current.locked_until_paid;
    const { error } = await supabase
      .from("deliverables")
      .update({ locked_until_paid: next })
      .eq("id", deliverableId);

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      action: `${next ? "Locked" : "Unlocked"} deliverable: ${current.title}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok(next ? "Locked until the invoice is paid." : "Unlocked for the client.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not change the lock."));
  }
}

export async function deleteDeliverable(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const projectId = String(formData.get("projectId") ?? "");
    const deliverableId = String(formData.get("deliverableId") ?? "");
    if (!projectId || !deliverableId) return fail("Missing deliverable.");

    const supabase = await createClient();
    const { data: current } = await supabase
      .from("deliverables")
      .select("title, storage_path")
      .eq("id", deliverableId)
      .single<Pick<Deliverable, "title" | "storage_path">>();

    const { error } = await supabase.from("deliverables").delete().eq("id", deliverableId);
    if (error) return fail(error.message);

    if (current?.storage_path) {
      await supabase.storage.from("deliverables").remove([current.storage_path]);
    }

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      projectId,
      action: `Deliverable removed: ${current?.title ?? deliverableId}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath(`/dashboard/projects/${projectId}`);
    return ok("Deliverable removed.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not remove the deliverable."));
  }
}
