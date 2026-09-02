-- ClientDeck core schema
-- Entities: organizations -> projects -> milestones -> {deliverables, invoices}
-- Plus client_access_tokens (magic-link portal access) and audit_logs (sign-off trail).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.plan_tier as enum ('free', 'starter', 'pro', 'agency');
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.project_status as enum ('active', 'paused', 'completed', 'archived');
create type public.milestone_status as enum ('pending', 'in_progress', 'in_review', 'approved');
create type public.deliverable_kind as enum ('file', 'embed', 'link');
create type public.invoice_status as enum ('draft', 'unpaid', 'paid', 'void');
create type public.payment_provider as enum ('manual', 'stripe', 'midtrans');
create type public.actor_type as enum ('freelancer', 'client', 'system');

-- ---------------------------------------------------------------------------
-- organizations: the agency/freelancer profile, branding and plan state
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  logo_url text,
  brand_color text not null default '#4f46e5' check (brand_color ~* '^#[0-9a-f]{6}$'),
  -- "Powered by ClientDeck" badge. Free/Starter cannot switch it off.
  badge_enabled boolean not null default true,
  plan public.plan_tier not null default 'free',
  custom_domain text unique,
  payout_provider public.payment_provider not null default 'manual',
  payout_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  client_name text not null check (char_length(client_name) between 1 and 120),
  client_email text not null check (client_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  budget_cents bigint not null default 0 check (budget_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status public.project_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_organization_id_idx on public.projects (organization_id);
create index projects_org_active_idx on public.projects (organization_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text,
  order_index integer not null default 0,
  due_date date,
  status public.milestone_status not null default 'pending',
  price_cents bigint not null default 0 check (price_cents >= 0),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, order_index) deferrable initially deferred
);

create index milestones_project_id_idx on public.milestones (project_id, order_index);

-- ---------------------------------------------------------------------------
-- deliverables: files (Supabase Storage), embeds (Figma/Loom/staging) or links
-- ---------------------------------------------------------------------------
create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null references public.milestones (id) on delete cascade,
  kind public.deliverable_kind not null default 'file',
  title text not null check (char_length(title) between 1 and 160),
  -- storage object path inside the private `deliverables` bucket
  storage_path text,
  file_size_bytes bigint check (file_size_bytes >= 0),
  mime_type text,
  -- embed/link target (Figma prototype, Loom walkthrough, staging URL)
  embed_url text,
  -- Asset Locker: withhold the download until the milestone invoice is paid
  locked_until_paid boolean not null default true,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  constraint deliverable_target_present check (
    (kind = 'file' and storage_path is not null)
    or (kind in ('embed', 'link') and embed_url is not null)
  )
);

create index deliverables_milestone_id_idx on public.deliverables (milestone_id, order_index);

-- ---------------------------------------------------------------------------
-- invoices: one per milestone (escrow gate for the Asset Locker)
-- ---------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  milestone_id uuid not null unique references public.milestones (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  status public.invoice_status not null default 'unpaid',
  provider public.payment_provider not null default 'manual',
  provider_payment_id text,
  checkout_url text,
  issued_at timestamptz not null default now(),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_paid_has_timestamp check (status <> 'paid' or paid_at is not null)
);

create unique index invoices_provider_payment_id_idx
  on public.invoices (provider, provider_payment_id)
  where provider_payment_id is not null;

-- ---------------------------------------------------------------------------
-- client_access_tokens: the magic link. Only the SHA-256 hash is stored.
-- ---------------------------------------------------------------------------
create table public.client_access_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Client link',
  client_email text,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index client_access_tokens_project_id_idx on public.client_access_tokens (project_id);

-- ---------------------------------------------------------------------------
-- audit_logs: the sign-off trail ("I never approved that wireframe")
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  milestone_id uuid references public.milestones (id) on delete set null,
  action text not null,
  actor_type public.actor_type not null default 'system',
  actor_email text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_project_id_idx on public.audit_logs (project_id, created_at desc);
create index audit_logs_organization_id_idx on public.audit_logs (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger milestones_touch before update on public.milestones
  for each row execute function public.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();
