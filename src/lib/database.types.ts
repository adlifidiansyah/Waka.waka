/**
 * Hand-maintained mirror of supabase/migrations. Regenerate with:
 *   supabase gen types typescript --local > src/lib/database.types.ts
 */

export type PlanTier = "free" | "starter" | "pro" | "agency";
export type MemberRole = "owner" | "admin" | "member";
export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type MilestoneStatus = "pending" | "in_progress" | "in_review" | "approved";
export type DeliverableKind = "file" | "embed" | "link";
export type InvoiceStatus = "draft" | "unpaid" | "paid" | "void";
export type PaymentProvider = "manual" | "stripe" | "midtrans";
export type ActorType = "freelancer" | "client" | "system";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  brand_color: string;
  badge_enabled: boolean;
  plan: PlanTier;
  custom_domain: string | null;
  payout_provider: PaymentProvider;
  payout_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  organization_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  client_name: string;
  client_email: string;
  budget_cents: number;
  currency: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  order_index: number;
  due_date: string | null;
  status: MilestoneStatus;
  price_cents: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deliverable {
  id: string;
  milestone_id: string;
  kind: DeliverableKind;
  title: string;
  storage_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  embed_url: string | null;
  locked_until_paid: boolean;
  order_index: number;
  created_at: string;
}

export interface Invoice {
  id: string;
  milestone_id: string;
  amount_cents: number;
  currency: string;
  status: InvoiceStatus;
  provider: PaymentProvider;
  provider_payment_id: string | null;
  checkout_url: string | null;
  issued_at: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientAccessToken {
  id: string;
  project_id: string;
  token_hash: string;
  label: string;
  client_email: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  project_id: string | null;
  milestone_id: string | null;
  action: string;
  actor_type: ActorType;
  actor_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** A milestone with everything the portal and dashboard render alongside it. */
export interface MilestoneWithChildren extends Milestone {
  deliverables: Deliverable[];
  invoice: Invoice | null;
}
