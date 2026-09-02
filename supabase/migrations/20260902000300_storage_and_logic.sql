-- Storage bucket + the business rules that must hold regardless of which
-- client (dashboard, portal, webhook) is talking to the database.

-- ---------------------------------------------------------------------------
-- Private bucket for deliverable files. Downloads always go through a signed,
-- expiring URL minted server-side after the Asset Locker check.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('deliverables', 'deliverables', false, 104857600)
on conflict (id) do nothing;

-- Objects are laid out as: <organization_id>/<project_id>/<deliverable_id>-<filename>
-- so the first path segment is the tenant boundary.
create policy "deliverables_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'deliverables'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "deliverables_member_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'deliverables'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "deliverables_member_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'deliverables'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- ---------------------------------------------------------------------------
-- Plan limits on active projects. Enforced in the database so a bug in the UI
-- cannot hand out the paid tiers for free.
-- ---------------------------------------------------------------------------
create or replace function public.plan_active_project_limit(p public.plan_tier)
returns integer
language sql
immutable
as $$
  select case p
    when 'free'    then 1
    when 'starter' then 3
    else null -- pro / agency: unlimited
  end;
$$;

create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  org_plan public.plan_tier;
  max_active integer;
  active_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select plan into org_plan from public.organizations where id = new.organization_id;
  max_active := public.plan_active_project_limit(org_plan);

  if max_active is null then
    return new;
  end if;

  select count(*) into active_count
  from public.projects
  where organization_id = new.organization_id
    and status = 'active'
    and id <> new.id;

  if active_count >= max_active then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'Plan limit reached: the %s plan allows %s active project(s). Upgrade or archive a project.',
        org_plan, max_active
      );
  end if;

  return new;
end;
$$;

create trigger projects_enforce_plan_limit
  before insert or update of status, organization_id on public.projects
  for each row execute function public.enforce_project_limit();

-- ---------------------------------------------------------------------------
-- Branding badge: only Pro and Agency may switch "Powered by ClientDeck" off.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_branding_entitlements()
returns trigger
language plpgsql
as $$
begin
  if new.badge_enabled = false and new.plan in ('free', 'starter') then
    raise exception using
      errcode = 'check_violation',
      message = 'Removing the ClientDeck badge requires the Pro plan or higher.';
  end if;

  if new.custom_domain is not null and new.plan <> 'agency' then
    raise exception using
      errcode = 'check_violation',
      message = 'Custom domains require the Agency plan.';
  end if;

  return new;
end;
$$;

create trigger organizations_enforce_entitlements
  before insert or update on public.organizations
  for each row execute function public.enforce_branding_entitlements();

-- ---------------------------------------------------------------------------
-- Approving a milestone from the client portal.
--
-- SECURITY DEFINER and callable only by the service role: the caller has
-- already proven possession of a valid, unrevoked magic-link token for
-- `p_project_id`, and we re-check here that the milestone belongs to it.
-- Writing the status change and the audit row in one function keeps the
-- sign-off trail impossible to skip.
-- ---------------------------------------------------------------------------
create or replace function public.portal_approve_milestone(
  p_project_id uuid,
  p_milestone_id uuid,
  p_actor_email text,
  p_ip inet default null,
  p_user_agent text default null
)
returns public.milestones
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ms public.milestones;
  org uuid;
begin
  select m.* into ms
  from public.milestones m
  where m.id = p_milestone_id and m.project_id = p_project_id
  for update;

  if not found then
    raise exception 'Milestone not found for this project' using errcode = 'no_data_found';
  end if;

  if ms.status = 'approved' then
    return ms; -- idempotent: re-clicking "Approve" is not an error
  end if;

  update public.milestones
  set status = 'approved', approved_at = now()
  where id = p_milestone_id
  returning * into ms;

  select organization_id into org from public.projects where id = p_project_id;

  insert into public.audit_logs (
    organization_id, project_id, milestone_id, action,
    actor_type, actor_email, ip_address, user_agent, metadata
  )
  values (
    org, p_project_id, p_milestone_id,
    format('Milestone approved: %s', ms.title),
    'client', p_actor_email, p_ip, p_user_agent,
    jsonb_build_object('milestone_title', ms.title, 'order_index', ms.order_index)
  );

  return ms;
end;
$$;

revoke all on function public.portal_approve_milestone(uuid, uuid, text, inet, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Settling an invoice. Used by the manual "mark as paid" action and by the
-- Stripe/Midtrans webhooks. Idempotent on (provider, provider_payment_id).
-- ---------------------------------------------------------------------------
create or replace function public.settle_invoice(
  p_invoice_id uuid,
  p_provider public.payment_provider,
  p_provider_payment_id text,
  p_actor_email text,
  p_actor_type public.actor_type default 'system'
)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.invoices;
  proj record;
begin
  select * into inv from public.invoices where id = p_invoice_id for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'no_data_found';
  end if;

  select p.id as project_id, p.organization_id
  into proj
  from public.milestones m
  join public.projects p on p.id = m.project_id
  where m.id = inv.milestone_id;

  -- SECURITY DEFINER bypasses RLS, so authorise explicitly. A signed-in user
  -- (auth.uid() is set) must be a member of the owning organization; without
  -- this, knowing an invoice UUID would be enough to settle another studio's
  -- invoice and unlock their gated files. A null uid means the service role --
  -- the payment webhooks, which have already verified a provider signature --
  -- and anon has no EXECUTE grant on this function at all.
  if (select auth.uid()) is not null and not public.is_org_member(proj.organization_id) then
    raise exception 'Not authorised to settle this invoice' using errcode = 'insufficient_privilege';
  end if;

  if inv.status = 'paid' then
    return inv; -- webhook redelivery
  end if;

  update public.invoices
  set status = 'paid',
      paid_at = now(),
      provider = p_provider,
      provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id)
  where id = p_invoice_id
  returning * into inv;

  insert into public.audit_logs (
    organization_id, project_id, milestone_id, action,
    actor_type, actor_email, metadata
  )
  values (
    proj.organization_id, proj.project_id, inv.milestone_id,
    'Invoice marked paid',
    p_actor_type, p_actor_email,
    jsonb_build_object(
      'invoice_id', inv.id,
      'amount_cents', inv.amount_cents,
      'currency', inv.currency,
      'provider', p_provider
    )
  );

  return inv;
end;
$$;

revoke all on function public.settle_invoice(uuid, public.payment_provider, text, text, public.actor_type) from public, anon;
