"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";
import { PLANS } from "@/lib/plans";
import { fail, messageFrom, ok, type ActionState } from "@/actions/types";
import type { PlanTier } from "@/lib/database.types";

const brandingSchema = z.object({
  name: z.string().trim().min(1, "Your studio needs a name.").max(120),
  brandColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Brand colour must be a hex value like #4f46e5."),
  logoUrl: z.string().trim().url("Logo must be a full https:// URL.").optional().or(z.literal("")),
  badgeEnabled: z.boolean(),
  customDomain: z
    .string()
    .trim()
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "That doesn't look like a domain.")
    .optional()
    .or(z.literal("")),
});

export async function updateBranding(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const parsed = brandingSchema.safeParse({
      name: formData.get("name"),
      brandColor: formData.get("brandColor"),
      logoUrl: formData.get("logoUrl") ?? "",
      badgeEnabled: formData.get("badgeEnabled") === "on",
      customDomain: formData.get("customDomain") ?? "",
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? "Check the branding details.");
    }

    const plan = PLANS[workspace.organization.plan];
    if (!parsed.data.badgeEnabled && !plan.canRemoveBadge) {
      return fail(`Removing the badge needs the Pro plan. You're on ${plan.name}.`);
    }
    if (parsed.data.customDomain && !plan.canUseCustomDomain) {
      return fail(`Custom domains need the Agency plan. You're on ${plan.name}.`);
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("organizations")
      .update({
        name: parsed.data.name,
        brand_color: parsed.data.brandColor.toLowerCase(),
        logo_url: parsed.data.logoUrl || null,
        badge_enabled: parsed.data.badgeEnabled,
        custom_domain: parsed.data.customDomain || null,
      })
      .eq("id", workspace.organization.id);

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      action: "Branding updated",
      actorType: "freelancer",
      actorEmail: workspace.email,
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return ok("Branding saved. Your client portals updated too.");
  } catch (caught) {
    return fail(messageFrom(caught, "Could not save your branding."));
  }
}

/**
 * Plan switching. In production this is driven by the billing provider's
 * webhook after checkout; exposing it here keeps self-serve upgrades testable
 * without wiring a payment account first.
 */
export async function changePlan(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const workspace = await requireWorkspace();
    const plan = String(formData.get("plan") ?? "") as PlanTier;
    if (!(plan in PLANS)) return fail("Unknown plan.");

    const supabase = await createClient();
    const downgradeClears =
      !PLANS[plan].canRemoveBadge || !PLANS[plan].canUseCustomDomain
        ? {
            badge_enabled: PLANS[plan].canRemoveBadge
              ? workspace.organization.badge_enabled
              : true,
            custom_domain: PLANS[plan].canUseCustomDomain
              ? workspace.organization.custom_domain
              : null,
          }
        : {};

    const { error } = await supabase
      .from("organizations")
      .update({ plan, ...downgradeClears })
      .eq("id", workspace.organization.id);

    if (error) return fail(error.message);

    await recordAudit(supabase, {
      organizationId: workspace.organization.id,
      action: `Plan changed to ${PLANS[plan].name}`,
      actorType: "freelancer",
      actorEmail: workspace.email,
      metadata: { plan },
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard");
    return ok(`You're on the ${PLANS[plan].name} plan.`);
  } catch (caught) {
    return fail(messageFrom(caught, "Could not change the plan."));
  }
}
