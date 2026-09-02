-- Demo data for local development (`supabase db reset` runs this automatically).
--
-- Creates one agency, one project, three milestones with deliverables and
-- invoices, and a client magic link you can open immediately:
--
--   http://localhost:3000/portal/demo-client-token-clientdeck
--
-- To see it in the dashboard too, sign up at /login and then run:
--   insert into public.organization_members (organization_id, user_id, role)
--   values ('11111111-1111-4111-8111-111111111111', '<your auth.users id>', 'owner');

insert into public.organizations (id, name, slug, brand_color, plan, badge_enabled)
values ('11111111-1111-4111-8111-111111111111', 'Northlight Studio', 'northlight', '#4f46e5', 'pro', false)
on conflict (id) do nothing;

insert into public.projects (id, organization_id, title, description, client_name, client_email, budget_cents, currency, status)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Aurora Coffee — Website Rebuild',
  'Marketing site rebuild with a headless CMS, plus a new ordering flow.',
  'Maya Rahmawati',
  'maya@auroracoffee.example',
  850000,
  'USD',
  'active'
) on conflict (id) do nothing;

insert into public.milestones (id, project_id, title, description, order_index, due_date, status, price_cents, approved_at)
values
  ('33333333-3333-4333-8333-000000000001', '22222222-2222-4222-8222-222222222222',
   'Discovery & Wireframes', 'Sitemap, user flows and low-fidelity wireframes for 8 screens.',
   1, current_date - 14, 'approved', 200000, now() - interval '12 days'),
  ('33333333-3333-4333-8333-000000000002', '22222222-2222-4222-8222-222222222222',
   'Visual Design', 'High-fidelity Figma designs, design tokens and a component sheet.',
   2, current_date + 3, 'in_review', 300000, null),
  ('33333333-3333-4333-8333-000000000003', '22222222-2222-4222-8222-222222222222',
   'Build & Launch', 'Next.js build, CMS wiring, QA pass and production deploy.',
   3, current_date + 24, 'pending', 350000, null)
on conflict (id) do nothing;

insert into public.deliverables (milestone_id, kind, title, embed_url, locked_until_paid, order_index)
values
  ('33333333-3333-4333-8333-000000000001', 'embed', 'Wireframe walkthrough (Loom)',
   'https://www.loom.com/embed/00000000000000000000000000000000', false, 1),
  ('33333333-3333-4333-8333-000000000002', 'embed', 'Visual design prototype (Figma)',
   'https://www.figma.com/embed?embed_host=clientdeck&url=https://www.figma.com/proto/demo', false, 1),
  ('33333333-3333-4333-8333-000000000003', 'link', 'Staging environment',
   'https://aurora-coffee-staging.example.com', false, 1)
on conflict do nothing;

insert into public.invoices (milestone_id, amount_cents, currency, status, provider, due_date, paid_at)
values
  ('33333333-3333-4333-8333-000000000001', 200000, 'USD', 'paid', 'manual', current_date - 14, now() - interval '13 days'),
  ('33333333-3333-4333-8333-000000000002', 300000, 'USD', 'unpaid', 'manual', current_date + 3, null),
  ('33333333-3333-4333-8333-000000000003', 350000, 'USD', 'draft', 'manual', current_date + 24, null)
on conflict (milestone_id) do nothing;

-- Magic link token. Only the hash lives in the database; the raw value below is
-- a fixed demo string so local development has a link that always works.
insert into public.client_access_tokens (project_id, token_hash, label, client_email)
values (
  '22222222-2222-4222-8222-222222222222',
  encode(digest('demo-client-token-clientdeck', 'sha256'), 'hex'),
  'Maya — main link',
  'maya@auroracoffee.example'
) on conflict (token_hash) do nothing;

insert into public.audit_logs (organization_id, project_id, milestone_id, action, actor_type, actor_email, created_at)
values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-000000000001',
  'Milestone approved: Discovery & Wireframes',
  'client', 'maya@auroracoffee.example', now() - interval '12 days'
) on conflict do nothing;
