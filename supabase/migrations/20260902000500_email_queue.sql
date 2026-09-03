-- Outbound email queue.
--
-- The portal-link email is sent inline, because a freelancer is watching it go
-- out and can act on a failure. Approval receipts and payment reminders are
-- not: nobody is looking when they fire, so a dropped send is silent. They go
-- through this queue instead, which gives them retries with backoff, a record
-- of what was sent, and a suppression list so a bouncing address is not mailed
-- for the rest of a project's life.

create type public.email_kind as enum (
  'portal_link',
  'approval_receipt',
  'approval_notification',
  'payment_reminder'
);

create type public.email_status as enum ('pending', 'sent', 'failed', 'cancelled');

create type public.suppression_reason as enum ('bounced', 'complained', 'manual');

-- ---------------------------------------------------------------------------
-- email_messages
-- ---------------------------------------------------------------------------
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete set null,
  invoice_id uuid references public.invoices (id) on delete set null,
  kind public.email_kind not null,
  to_email text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reply_to text,
  -- Render inputs rather than rendered HTML: rows stay small, and a template
  -- fix reaches anything still queued.
  payload jsonb not null,
  -- Set for anything that must fire at most once (a specific reminder for a
  -- specific invoice). Null for deliberate one-offs like a manual nudge.
  dedupe_key text,
  status public.email_status not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  provider_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index email_messages_dedupe_key_idx
  on public.email_messages (dedupe_key)
  where dedupe_key is not null;

-- The worker's claim query: oldest due pending message first.
create index email_messages_due_idx
  on public.email_messages (next_attempt_at)
  where status = 'pending';

create index email_messages_org_idx on public.email_messages (organization_id, created_at desc);
create index email_messages_project_idx on public.email_messages (project_id, created_at desc);

create trigger email_messages_touch before update on public.email_messages
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- email_suppressions
--
-- Global rather than per-organization: a hard bounce is a fact about the
-- address, and continuing to mail it damages the sending domain every studio
-- on the deployment shares.
-- ---------------------------------------------------------------------------
create table public.email_suppressions (
  email text primary key check (email = lower(email)),
  reason public.suppression_reason not null,
  detail text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS
--
-- Members read their own organization's outbox. Nobody writes through the
-- browser-visible keys: every enqueue runs from a Server Action that has
-- already authorised the caller, through the service role. Without that, a
-- signed-in user could queue arbitrary mail from the deployment's verified
-- sending domain.
-- ---------------------------------------------------------------------------
alter table public.email_messages enable row level security;
alter table public.email_suppressions enable row level security;

create policy email_messages_select on public.email_messages
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy email_suppressions_select on public.email_suppressions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Worker: claim a batch.
--
-- `for update skip locked` lets several workers (or an overlapping cron run)
-- drain the queue at once without handing the same message to two of them.
-- The claim itself increments attempts and pushes next_attempt_at forward, so
-- a worker that dies mid-send retries later rather than wedging the row.
-- ---------------------------------------------------------------------------
create or replace function public.claim_email_batch(p_limit integer default 20)
returns setof public.email_messages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lease interval := interval '5 minutes';
begin
  return query
  with claimed as (
    select id
    from public.email_messages
    where status = 'pending'
      and next_attempt_at <= now()
      and attempts < max_attempts
    order by next_attempt_at
    limit greatest(1, least(p_limit, 100))
    for update skip locked
  )
  update public.email_messages m
  set attempts = m.attempts + 1,
      next_attempt_at = now() + lease
  from claimed
  where m.id = claimed.id
  returning m.*;
end;
$$;

revoke all on function public.claim_email_batch(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Worker: record the outcome.
-- ---------------------------------------------------------------------------
create or replace function public.mark_email_sent(p_id uuid, p_provider_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.email_messages
  set status = 'sent', sent_at = now(), provider_id = p_provider_id, last_error = null
  where id = p_id;
$$;

revoke all on function public.mark_email_sent(uuid, text) from public, anon, authenticated;

/**
 * Exponential backoff on a retryable failure: roughly 1m, 4m, 9m, 16m. A
 * message that has used its attempts is marked failed and stops being claimed.
 * `p_permanent` short-circuits that for errors retrying cannot fix — a
 * suppressed recipient, a malformed address.
 */
create or replace function public.mark_email_failed(
  p_id uuid,
  p_error text,
  p_permanent boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  msg public.email_messages;
begin
  select * into msg from public.email_messages where id = p_id for update;
  if not found then
    return;
  end if;

  if p_permanent or msg.attempts >= msg.max_attempts then
    update public.email_messages
    set status = 'failed', last_error = p_error
    where id = p_id;
  else
    update public.email_messages
    set status = 'pending',
        last_error = p_error,
        next_attempt_at = now() + make_interval(secs => (msg.attempts * msg.attempts) * 60)
    where id = p_id;
  end if;
end;
$$;

revoke all on function public.mark_email_failed(uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Suppression, written by the provider's bounce/complaint webhook.
-- ---------------------------------------------------------------------------
create or replace function public.suppress_email(
  p_email text,
  p_reason public.suppression_reason,
  p_detail text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  addr text := lower(trim(p_email));
begin
  insert into public.email_suppressions (email, reason, detail)
  values (addr, p_reason, p_detail)
  on conflict (email) do update
    set reason = excluded.reason, detail = excluded.detail;

  -- Anything still queued for that address will never arrive; stop trying.
  update public.email_messages
  set status = 'cancelled', last_error = format('Recipient suppressed (%s)', p_reason)
  where status = 'pending' and lower(to_email) = addr;
end;
$$;

revoke all on function public.suppress_email(text, public.suppression_reason, text) from public, anon, authenticated;
