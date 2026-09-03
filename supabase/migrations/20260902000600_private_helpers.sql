-- Move internal helpers out of the PostgREST-exposed API surface.
--
-- Supabase exposes the `public` schema over REST, so every function in it is
-- reachable at /rest/v1/rpc/<name>. That is right for the handful this app
-- deliberately calls that way, and wrong for the rest:
--
--   * `project_org()` and `milestone_org()` are SECURITY DEFINER and return an
--     organization id for any project or milestone id — an RLS bypass in
--     miniature, exposed to anon.
--   * `is_org_member()` / `is_org_admin()` leak little, but there is no reason
--     for them to be callable at all.
--   * the trigger functions are not meaningfully callable, but they should not
--     appear in a public API either.
--
-- They cannot simply have EXECUTE revoked: RLS policy expressions are evaluated
-- with the querying role's privileges, so `authenticated` genuinely needs
-- EXECUTE on the helpers its own policies call. Moving them to a schema
-- PostgREST does not serve keeps the grant and removes the endpoint.
--
-- Deliberately left in `public`, because the application calls them by RPC:
--   portal_approve_milestone, settle_invoice, claim_email_batch,
--   mark_email_sent, mark_email_failed, suppress_email.
-- All but settle_invoice are revoked from anon and authenticated; settle_invoice
-- is callable by a signed-in user on purpose (the dashboard's "Mark paid") and
-- carries its own membership check.

create schema if not exists private;

-- USAGE, not exposure: PostgREST only serves the schemas it is configured with,
-- so this grant makes the helpers callable from policy expressions without
-- putting them on the API.
grant usage on schema private to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Helpers, re-created in `private`
-- ---------------------------------------------------------------------------
create or replace function private.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function private.project_org(p uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select organization_id from public.projects where id = p;
$$;

create or replace function private.milestone_org(m uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select p.organization_id from public.milestones ms
  join public.projects p on p.id = ms.project_id where ms.id = m;
$$;

create or replace function private.plan_active_project_limit(p public.plan_tier)
returns integer language sql immutable set search_path = public, pg_temp as $$
  select case p when 'free' then 1 when 'starter' then 3 else null end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger functions, re-created in `private` with a fixed search_path
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.enforce_project_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  org_plan public.plan_tier;
  max_active integer;
  active_count integer;
begin
  if new.status <> 'active' then return new; end if;
  select plan into org_plan from public.organizations where id = new.organization_id;
  max_active := private.plan_active_project_limit(org_plan);
  if max_active is null then return new; end if;
  select count(*) into active_count from public.projects
  where organization_id = new.organization_id and status = 'active' and id <> new.id;
  if active_count >= max_active then
    raise exception using errcode = 'check_violation',
      message = format('Plan limit reached: the %s plan allows %s active project(s). Upgrade or archive a project.', org_plan, max_active);
  end if;
  return new;
end;
$$;

create or replace function private.enforce_branding_entitlements()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.badge_enabled = false and new.plan in ('free', 'starter') then
    raise exception using errcode = 'check_violation',
      message = 'Removing the ClientDeck badge requires the Pro plan or higher.';
  end if;
  if new.custom_domain is not null and new.plan <> 'agency' then
    raise exception using errcode = 'check_violation',
      message = 'Custom domains require the Agency plan.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Repoint the triggers
-- ---------------------------------------------------------------------------
drop trigger if exists organizations_touch on public.organizations;
drop trigger if exists projects_touch on public.projects;
drop trigger if exists milestones_touch on public.milestones;
drop trigger if exists invoices_touch on public.invoices;
drop trigger if exists email_messages_touch on public.email_messages;
drop trigger if exists projects_enforce_plan_limit on public.projects;
drop trigger if exists organizations_enforce_entitlements on public.organizations;

create trigger organizations_touch before update on public.organizations
  for each row execute function private.touch_updated_at();
create trigger projects_touch before update on public.projects
  for each row execute function private.touch_updated_at();
create trigger milestones_touch before update on public.milestones
  for each row execute function private.touch_updated_at();
create trigger invoices_touch before update on public.invoices
  for each row execute function private.touch_updated_at();
create trigger email_messages_touch before update on public.email_messages
  for each row execute function private.touch_updated_at();
create trigger projects_enforce_plan_limit
  before insert or update of status, organization_id on public.projects
  for each row execute function private.enforce_project_limit();
create trigger organizations_enforce_entitlements
  before insert or update on public.organizations
  for each row execute function private.enforce_branding_entitlements();

-- ---------------------------------------------------------------------------
-- Repoint every policy. Recreated rather than altered so the new definition is
-- stated in full and nothing is left referencing the old function.
-- ---------------------------------------------------------------------------
drop policy if exists organizations_select on public.organizations;
drop policy if exists organizations_update on public.organizations;
drop policy if exists organizations_delete on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy organizations_update on public.organizations
  for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy organizations_delete on public.organizations
  for delete to authenticated using (private.is_org_admin(id));

drop policy if exists organization_members_select on public.organization_members;
drop policy if exists organization_members_insert on public.organization_members;
drop policy if exists organization_members_update on public.organization_members;
drop policy if exists organization_members_delete on public.organization_members;
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_org_member(organization_id));
create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_org_admin(organization_id));
create policy organization_members_update on public.organization_members
  for update to authenticated
  using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (private.is_org_admin(organization_id) or user_id = (select auth.uid()));

drop policy if exists projects_select on public.projects;
drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (private.is_org_member(organization_id));
create policy projects_insert on public.projects
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy projects_update on public.projects
  for update to authenticated
  using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy projects_delete on public.projects
  for delete to authenticated using (private.is_org_admin(organization_id));

drop policy if exists milestones_select on public.milestones;
drop policy if exists milestones_write on public.milestones;
create policy milestones_select on public.milestones
  for select to authenticated using (private.is_org_member(private.project_org(project_id)));
create policy milestones_write on public.milestones
  for all to authenticated
  using (private.is_org_member(private.project_org(project_id)))
  with check (private.is_org_member(private.project_org(project_id)));

drop policy if exists deliverables_select on public.deliverables;
drop policy if exists deliverables_write on public.deliverables;
create policy deliverables_select on public.deliverables
  for select to authenticated using (private.is_org_member(private.milestone_org(milestone_id)));
create policy deliverables_write on public.deliverables
  for all to authenticated
  using (private.is_org_member(private.milestone_org(milestone_id)))
  with check (private.is_org_member(private.milestone_org(milestone_id)));

drop policy if exists invoices_select on public.invoices;
drop policy if exists invoices_write on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (private.is_org_member(private.milestone_org(milestone_id)));
create policy invoices_write on public.invoices
  for all to authenticated
  using (private.is_org_member(private.milestone_org(milestone_id)))
  with check (private.is_org_member(private.milestone_org(milestone_id)));

drop policy if exists client_access_tokens_select on public.client_access_tokens;
drop policy if exists client_access_tokens_write on public.client_access_tokens;
create policy client_access_tokens_select on public.client_access_tokens
  for select to authenticated using (private.is_org_member(private.project_org(project_id)));
create policy client_access_tokens_write on public.client_access_tokens
  for all to authenticated
  using (private.is_org_member(private.project_org(project_id)))
  with check (private.is_org_member(private.project_org(project_id)));

drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (private.is_org_member(organization_id));
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated with check (private.is_org_member(organization_id));

drop policy if exists email_messages_select on public.email_messages;
create policy email_messages_select on public.email_messages
  for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists "deliverables_member_read" on storage.objects;
drop policy if exists "deliverables_member_write" on storage.objects;
drop policy if exists "deliverables_member_delete" on storage.objects;
create policy "deliverables_member_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'deliverables' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "deliverables_member_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deliverables' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "deliverables_member_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'deliverables' and private.is_org_member(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- settle_invoice keeps its RPC endpoint but must use the moved helper.
-- ---------------------------------------------------------------------------
create or replace function public.settle_invoice(
  p_invoice_id uuid, p_provider public.payment_provider, p_provider_payment_id text,
  p_actor_email text, p_actor_type public.actor_type default 'system'
)
returns public.invoices language plpgsql security definer set search_path = public, pg_temp as $$
declare
  inv public.invoices;
  proj record;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'no_data_found';
  end if;

  select p.id as project_id, p.organization_id into proj
  from public.milestones m join public.projects p on p.id = m.project_id
  where m.id = inv.milestone_id;

  if (select auth.uid()) is not null and not private.is_org_member(proj.organization_id) then
    raise exception 'Not authorised to settle this invoice' using errcode = 'insufficient_privilege';
  end if;

  if inv.status = 'paid' then return inv; end if;

  update public.invoices
  set status = 'paid', paid_at = now(), provider = p_provider,
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
  where id = p_invoice_id returning * into inv;

  insert into public.audit_logs (
    organization_id, project_id, milestone_id, action, actor_type, actor_email, metadata
  ) values (
    proj.organization_id, proj.project_id, inv.milestone_id,
    'Invoice marked paid', p_actor_type, p_actor_email,
    jsonb_build_object('invoice_id', inv.id, 'amount_cents', inv.amount_cents,
                       'currency', inv.currency, 'provider', p_provider)
  );
  return inv;
end;
$$;

revoke all on function public.settle_invoice(uuid, public.payment_provider, text, text, public.actor_type) from public, anon;

-- ---------------------------------------------------------------------------
-- Retire the public copies.
-- ---------------------------------------------------------------------------
drop function if exists public.is_org_member(uuid);
drop function if exists public.is_org_admin(uuid);
drop function if exists public.project_org(uuid);
drop function if exists public.milestone_org(uuid);
drop function if exists public.plan_active_project_limit(public.plan_tier);
drop function if exists public.enforce_project_limit();
drop function if exists public.enforce_branding_entitlements();
drop function if exists public.touch_updated_at();
