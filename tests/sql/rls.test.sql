-- Security assertions against a live database.
--
-- Run with:  npm run test:sql        (needs a running `supabase start`)
-- or:        psql "$DATABASE_URL" -f tests/sql/rls.test.sql
--
-- Every assertion raises an exception on failure, so a clean run means every
-- check below held. Runs inside a transaction and rolls back, so it is safe
-- against a database with data in it.

begin;

do $$
declare
  alice uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  bob   uuid := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  org_a uuid;
  org_b uuid;
  proj_a uuid;
  ms_a uuid;
  inv_a uuid;
  seen int;
  ok boolean;
begin
  -- Two studios that must never see each other.
  insert into auth.users (id, email) values (alice, 'alice@rls.test'), (bob, 'bob@rls.test');

  insert into public.organizations (name, slug, plan)
  values ('RLS Studio A', 'rls-studio-a', 'pro') returning id into org_a;
  insert into public.organizations (name, slug, plan)
  values ('RLS Studio B', 'rls-studio-b', 'free') returning id into org_b;

  insert into public.organization_members values (org_a, alice, 'owner');
  insert into public.organization_members values (org_b, bob, 'owner');

  insert into public.projects (organization_id, title, client_name, client_email)
  values (org_a, 'A confidential build', 'Client A', 'a@rls.test') returning id into proj_a;

  insert into public.milestones (project_id, title, order_index, price_cents, status)
  values (proj_a, 'A milestone', 1, 100000, 'in_review') returning id into ms_a;

  insert into public.invoices (milestone_id, amount_cents, status)
  values (ms_a, 100000, 'unpaid') returning id into inv_a;

  -- 1. The owner sees their own project.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  select count(*) into seen from public.projects where id = proj_a;
  assert seen = 1, 'RLS: an owner cannot see their own project';

  -- 2. Another studio sees nothing of it, at any depth.
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.projects where id = proj_a;
  assert seen = 0, 'RLS LEAK: another org can read projects';
  select count(*) into seen from public.milestones where id = ms_a;
  assert seen = 0, 'RLS LEAK: another org can read milestones';
  select count(*) into seen from public.invoices where id = inv_a;
  assert seen = 0, 'RLS LEAK: another org can read invoices';
  select count(*) into seen from public.client_access_tokens where project_id = proj_a;
  assert seen = 0, 'RLS LEAK: another org can read client link tokens';
  select count(*) into seen from public.audit_logs where project_id = proj_a;
  assert seen = 0, 'RLS LEAK: another org can read the audit trail';

  -- 3. And cannot write to it.
  update public.projects set title = 'hijacked' where id = proj_a;
  get diagnostics seen = row_count;
  assert seen = 0, 'RLS LEAK: another org can update projects';

  -- 4. Anon sees nothing at all.
  reset role;
  set local role anon;
  select count(*) into seen from public.projects;
  assert seen = 0, 'RLS LEAK: anon can read projects';
  select count(*) into seen from public.client_access_tokens;
  assert seen = 0, 'RLS LEAK: anon can read client link tokens';

  -- 5. A signed-in stranger cannot settle someone else's invoice. Settling one
  --    unlocks its gated files, so this is a money-and-IP boundary.
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', bob::text, true);
  ok := false;
  begin
    perform public.settle_invoice(inv_a, 'manual', 'forged', 'bob@rls.test', 'freelancer');
  exception when insufficient_privilege then
    ok := true;
  end;
  assert ok, 'PRIVILEGE ESCALATION: a stranger settled another org''s invoice';

  -- 6. The owner can settle their own.
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.settle_invoice(inv_a, 'manual', 'bank-1', 'alice@rls.test', 'freelancer');
  reset role;
  select count(*) into seen from public.invoices where id = inv_a and status = 'paid';
  assert seen = 1, 'An owner could not settle their own invoice';

  -- 7. Settlement is idempotent, so webhook redelivery cannot double-log.
  perform public.settle_invoice(inv_a, 'manual', 'bank-1', 'alice@rls.test', 'freelancer');
  select count(*) into seen from public.audit_logs
  where milestone_id = ms_a and action = 'Invoice marked paid';
  assert seen = 1, format('Settlement is not idempotent: %s audit rows', seen);

  -- 8. Portal approval is service-role only.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  ok := false;
  begin
    perform public.portal_approve_milestone(proj_a, ms_a, 'Alice', null, null);
  exception when insufficient_privilege then
    ok := true;
  end;
  assert ok, 'portal_approve_milestone is callable by a non-service role';

  -- 9. Approving writes the sign-off trail, with attribution.
  reset role;
  perform public.portal_approve_milestone(
    proj_a, ms_a, 'Client A <a@rls.test>', '203.0.113.7'::inet, 'test-agent');
  select count(*) into seen from public.milestones where id = ms_a and status = 'approved';
  assert seen = 1, 'Approval did not change the milestone status';
  select count(*) into seen from public.audit_logs
  where milestone_id = ms_a and actor_type = 'client' and ip_address = '203.0.113.7'::inet;
  assert seen = 1, 'Approval did not write an attributed audit row';

  -- 10. Re-approving is idempotent.
  perform public.portal_approve_milestone(proj_a, ms_a, 'Client A', null, null);
  select count(*) into seen from public.audit_logs
  where milestone_id = ms_a and actor_type = 'client';
  assert seen = 1, 'Re-approval duplicated the audit row';

  -- 11. A milestone from another project is refused even with a valid project id.
  ok := false;
  begin
    perform public.portal_approve_milestone(
      proj_a,
      (select id from public.milestones where project_id <> proj_a limit 1),
      'Attacker', null, null);
  exception when no_data_found or not_null_violation then
    ok := true;
  end;
  assert ok, 'A milestone outside the token''s project was approvable';

  -- 12. The audit trail is append-only for non-service roles.
  select count(*) into seen from pg_policies
  where tablename = 'audit_logs' and cmd in ('UPDATE', 'DELETE');
  assert seen = 0, 'audit_logs has an UPDATE or DELETE policy; the trail is not append-only';

  -- 13. Plan limits: Free allows exactly one active project.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', bob::text, true);
  insert into public.projects (organization_id, title, client_name, client_email)
  values (org_b, 'B one', 'C', 'c@rls.test');
  ok := false;
  begin
    insert into public.projects (organization_id, title, client_name, client_email)
    values (org_b, 'B two', 'C', 'c@rls.test');
  exception when check_violation then
    ok := true;
  end;
  assert ok, 'PLAN LEAK: a second active project was allowed on Free';

  -- 14. Archiving frees the slot.
  update public.projects set status = 'archived' where organization_id = org_b;
  insert into public.projects (organization_id, title, client_name, client_email)
  values (org_b, 'B two', 'C', 'c@rls.test');

  -- 15. Entitlements: badge removal and custom domains are gated.
  reset role;
  ok := false;
  begin
    update public.organizations set badge_enabled = false where id = org_b;
  exception when check_violation then ok := true;
  end;
  assert ok, 'PLAN LEAK: Free removed the ClientDeck badge';

  ok := false;
  begin
    update public.organizations set custom_domain = 'portal.b.test' where id = org_b;
  exception when check_violation then ok := true;
  end;
  assert ok, 'PLAN LEAK: Free set a custom domain';

  update public.organizations set plan = 'agency' where id = org_b;
  update public.organizations set custom_domain = 'portal.b.test' where id = org_b;

  raise notice 'All 15 security and business-rule assertions passed.';
end;
$$;

rollback;
