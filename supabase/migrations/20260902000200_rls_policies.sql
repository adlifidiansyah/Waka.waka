-- Row-Level Security.
--
-- Threat model: the anon/authenticated keys ship to the browser, so every table
-- is deny-by-default. A signed-in freelancer reaches only rows belonging to an
-- organization they are a member of. The client portal is NOT an authenticated
-- Postgres role -- it is resolved server-side from a magic-link token and read
-- through the service role with explicit project scoping (see src/lib/portal.ts).
-- That keeps client access off the browser-visible key entirely.

alter table public.organizations         enable row level security;
alter table public.organization_members  enable row level security;
alter table public.projects              enable row level security;
alter table public.milestones            enable row level security;
alter table public.deliverables          enable row level security;
alter table public.invoices              enable row level security;
alter table public.client_access_tokens  enable row level security;
alter table public.audit_logs            enable row level security;

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so policies on organization_members do
-- not recurse into themselves.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.project_org(p uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select organization_id from public.projects where id = p;
$$;

create or replace function public.milestone_org(m uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.organization_id
  from public.milestones ms
  join public.projects p on p.id = ms.project_id
  where ms.id = m;
$$;

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create policy organizations_select on public.organizations
  for select to authenticated
  using (public.is_org_member(id));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (true); -- creator is added as owner in the same transaction

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.is_org_admin(id))
  with check (public.is_org_admin(id));

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.is_org_admin(id));

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));

create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (
    -- bootstrapping your own membership of a brand-new org, or an admin inviting
    user_id = (select auth.uid()) or public.is_org_admin(organization_id)
  );

create policy organization_members_update on public.organization_members
  for update to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (public.is_org_admin(organization_id) or user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.is_org_member(organization_id));

create policy projects_update on public.projects
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.is_org_admin(organization_id));

-- ---------------------------------------------------------------------------
-- milestones
-- ---------------------------------------------------------------------------
create policy milestones_select on public.milestones
  for select to authenticated
  using (public.is_org_member(public.project_org(project_id)));

create policy milestones_write on public.milestones
  for all to authenticated
  using (public.is_org_member(public.project_org(project_id)))
  with check (public.is_org_member(public.project_org(project_id)));

-- ---------------------------------------------------------------------------
-- deliverables
-- ---------------------------------------------------------------------------
create policy deliverables_select on public.deliverables
  for select to authenticated
  using (public.is_org_member(public.milestone_org(milestone_id)));

create policy deliverables_write on public.deliverables
  for all to authenticated
  using (public.is_org_member(public.milestone_org(milestone_id)))
  with check (public.is_org_member(public.milestone_org(milestone_id)));

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
create policy invoices_select on public.invoices
  for select to authenticated
  using (public.is_org_member(public.milestone_org(milestone_id)));

create policy invoices_write on public.invoices
  for all to authenticated
  using (public.is_org_member(public.milestone_org(milestone_id)))
  with check (public.is_org_member(public.milestone_org(milestone_id)));

-- ---------------------------------------------------------------------------
-- client_access_tokens
--
-- Deliberately no SELECT of token_hash for anon. Members manage links for their
-- own projects; the raw token is only ever returned once, at creation time.
-- ---------------------------------------------------------------------------
create policy client_access_tokens_select on public.client_access_tokens
  for select to authenticated
  using (public.is_org_member(public.project_org(project_id)));

create policy client_access_tokens_write on public.client_access_tokens
  for all to authenticated
  using (public.is_org_member(public.project_org(project_id)))
  with check (public.is_org_member(public.project_org(project_id)));

-- ---------------------------------------------------------------------------
-- audit_logs: append-only from the app's perspective. Members read their own
-- org's trail; nobody updates or deletes it (no UPDATE/DELETE policy exists,
-- so those are denied for every non-service role).
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (public.is_org_member(organization_id));
