import type { PlanTier } from "@/lib/database.types";

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  priceUsdPerMonth: number;
  tagline: string;
  /** null = unlimited. Mirrors public.plan_active_project_limit() in SQL. */
  activeProjectLimit: number | null;
  seats: number | null;
  canRemoveBadge: boolean;
  canUseCustomDomain: boolean;
  features: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    priceUsdPerMonth: 0,
    tagline: "One live project, all the core features.",
    activeProjectLimit: 1,
    seats: 1,
    canRemoveBadge: false,
    canUseCustomDomain: false,
    features: [
      "1 active project",
      "Magic-link client access",
      "Milestone tracker & approvals",
      "Asset Locker",
      '"Powered by ClientDeck" badge',
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceUsdPerMonth: 19,
    tagline: "For the solo freelancer juggling a handful of clients.",
    activeProjectLimit: 3,
    seats: 1,
    canRemoveBadge: false,
    canUseCustomDomain: false,
    features: [
      "3 active projects",
      "Everything in Free",
      "Signed, expiring asset downloads",
      "Full sign-off audit trail",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceUsdPerMonth: 39,
    tagline: "Unlimited projects, and the portal looks like yours.",
    activeProjectLimit: null,
    seats: 3,
    canRemoveBadge: true,
    canUseCustomDomain: false,
    features: [
      "Unlimited active projects",
      "Remove the ClientDeck badge",
      "Custom logo & brand colour",
      "Up to 3 team seats",
    ],
  },
  agency: {
    id: "agency",
    name: "Agency",
    priceUsdPerMonth: 79,
    tagline: "Your own domain, your whole team.",
    activeProjectLimit: null,
    seats: 8,
    canRemoveBadge: true,
    canUseCustomDomain: true,
    features: [
      "Everything in Pro",
      "Custom domain (portal.your-agency.com)",
      "Up to 8 team seats",
      "Role-based access for the team",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["free", "starter", "pro", "agency"];

export function planFor(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}

/** The upgrade prompt the dashboard shows, or null when nothing is blocked. */
export function upgradeReason(
  plan: PlanTier,
  activeProjects: number,
): { title: string; body: string; suggested: PlanTier } | null {
  const limit = PLANS[plan].activeProjectLimit;
  if (limit === null || activeProjects < limit) return null;

  const suggested: PlanTier = plan === "free" ? "starter" : "pro";
  return {
    title: `You're at your ${PLANS[plan].name} limit`,
    body: `The ${PLANS[plan].name} plan covers ${limit} active project${limit === 1 ? "" : "s"}. Upgrade to ${PLANS[suggested].name} to start another, or archive one you've finished.`,
    suggested,
  };
}
