-- Outbox guarantees, asserted against a live database.
--
-- Run with:  npm run test:sql        (needs a running `supabase start`)
--
-- Runs in a transaction and rolls back, so it is safe against a database with
-- real data in it. Every check is a PL/pgSQL assert: a clean run prints one
-- notice, a failure aborts naming what broke.

begin;

do $$
declare
  org uuid;
  proj uuid;
  a uuid;
  b uuid;
  claimed int;
  seen int;
  retry_secs numeric;
  ok boolean;
begin
  insert into public.organizations (name, slug, plan)
  values ('Queue Studio', 'queue-studio', 'pro') returning id into org;

  insert into public.projects (organization_id, title, client_name, client_email)
  values (org, 'Queue project', 'C', 'c@queue.test') returning id into proj;

  -- 1. Two messages queue normally.
  insert into public.email_messages (organization_id, project_id, kind, to_email, payload, dedupe_key)
  values (org, proj, 'payment_reminder', 'c@queue.test', '{}', 'reminder:1') returning id into a;
  insert into public.email_messages (organization_id, project_id, kind, to_email, payload)
  values (org, proj, 'approval_receipt', 'c@queue.test', '{}') returning id into b;

  -- 2. A dedupe key cannot be queued twice. This is what stops a client
  --    receiving the same reminder on every cron tick.
  ok := false;
  begin
    insert into public.email_messages (organization_id, kind, to_email, payload, dedupe_key)
    values (org, 'payment_reminder', 'c@queue.test', '{}', 'reminder:1');
  exception when unique_violation then
    ok := true;
  end;
  assert ok, 'DUPLICATE SEND: the same dedupe key queued twice';

  -- 3. Claiming leases the batch: a second worker gets nothing.
  select count(*) into claimed from public.claim_email_batch(10);
  assert claimed = 2, format('Expected to claim 2 messages, claimed %s', claimed);
  select count(*) into claimed from public.claim_email_batch(10);
  assert claimed = 0, 'DOUBLE SEND: a leased message was claimed by a second worker';

  -- 4. Claiming counts the attempt, so a worker that dies cannot loop forever.
  select attempts into seen from public.email_messages where id = a;
  assert seen = 1, format('Claim did not record the attempt (attempts = %s)', seen);

  -- 5. A retryable failure backs off and stays claimable.
  perform public.mark_email_failed(a, 'connection reset');
  select status::text, extract(epoch from next_attempt_at - now())
  into strict ok, retry_secs
  from (select status::text = 'pending' as status, next_attempt_at
        from public.email_messages where id = a) t;
  assert ok, 'A retryable failure did not stay pending';
  assert retry_secs > 0, 'A retryable failure did not back off';

  -- 6. Success is terminal and records the provider id.
  perform public.mark_email_sent(b, 'msg_provider_1');
  select count(*) into seen from public.email_messages
  where id = b and status = 'sent' and provider_id = 'msg_provider_1' and sent_at is not null;
  assert seen = 1, 'A sent message was not recorded as sent';

  -- 7. Exhausted attempts stop being retried forever.
  update public.email_messages set attempts = max_attempts, next_attempt_at = now() where id = a;
  perform public.mark_email_failed(a, 'gave up');
  select count(*) into seen from public.email_messages where id = a and status = 'failed';
  assert seen = 1, 'An exhausted message was not marked failed';
  select count(*) into claimed from public.claim_email_batch(10);
  assert claimed = 0, 'A failed message was claimed again';

  -- 8. A permanent error fails at once without burning the retry budget.
  insert into public.email_messages (organization_id, kind, to_email, payload)
  values (org, 'payment_reminder', 'perm@queue.test', '{}') returning id into a;
  perform public.mark_email_failed(a, 'unrenderable payload', true);
  select count(*) into seen from public.email_messages
  where id = a and status = 'failed' and attempts = 0;
  assert seen = 1, 'A permanent failure was retried';

  -- 9. Suppressing an address cancels everything still queued for it, so a
  --    reminder series cannot keep hammering a dead mailbox.
  insert into public.email_messages (organization_id, kind, to_email, payload)
  values (org, 'payment_reminder', 'Bouncy@Queue.test', '{}');
  perform public.suppress_email('bouncy@queue.test', 'bounced', '550 no such user');
  select count(*) into seen from public.email_messages
  where to_email = 'Bouncy@Queue.test' and status = 'cancelled';
  assert seen = 1, 'SUPPRESSION LEAK: queued mail to a bounced address stayed pending';

  -- 10. Suppression normalises case and whitespace, and is idempotent.
  perform public.suppress_email('  BOUNCY@queue.TEST  ', 'complained', null);
  select count(*) into seen from public.email_suppressions where email = 'bouncy@queue.test';
  assert seen = 1, format('Suppression is not idempotent (%s rows)', seen);
  select count(*) into seen from public.email_suppressions where email <> lower(email);
  assert seen = 0, 'A suppression was stored with mixed case';

  -- 11. A recipient must at least look like an address.
  ok := false;
  begin
    insert into public.email_messages (organization_id, kind, to_email, payload)
    values (org, 'payment_reminder', 'not-an-address', '{}');
  exception when check_violation then
    ok := true;
  end;
  assert ok, 'A malformed recipient was accepted';

  -- 12. The browser-visible roles cannot queue mail from the sending domain.
  select count(*) into seen from pg_policies
  where tablename = 'email_messages' and cmd in ('INSERT', 'UPDATE', 'DELETE');
  assert seen = 0,
    'SPAM VECTOR: email_messages has a write policy; a signed-in user could queue arbitrary mail';

  -- 13. The worker functions are service-role only.
  ok := false;
  begin
    set local role authenticated;
    perform public.claim_email_batch(1);
  exception when insufficient_privilege then
    ok := true;
  end;
  reset role;
  assert ok, 'claim_email_batch is callable by a non-service role';

  ok := false;
  begin
    set local role authenticated;
    perform public.suppress_email('x@y.test', 'manual', null);
  exception when insufficient_privilege then
    ok := true;
  end;
  reset role;
  assert ok, 'suppress_email is callable by a non-service role';

  raise notice 'All 13 outbox assertions passed.';
end;
$$;

rollback;
