import type { EmailBrand } from "@/lib/email/render";
import type { Organization } from "@/lib/database.types";

/**
 * Every template takes the same branding block, so the mapping from an
 * organization row lives in one place. `showBadge` is a plan entitlement the
 * database already enforces; this just carries it into the email.
 */
export function brandOf(
  organization: Pick<Organization, "name" | "brand_color" | "logo_url" | "badge_enabled">,
): EmailBrand {
  return {
    studioName: organization.name,
    brandColor: organization.brand_color,
    logoUrl: organization.logo_url,
    showBadge: organization.badge_enabled,
  };
}
