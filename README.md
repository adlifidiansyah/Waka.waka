# ClientDeck

A client portal for freelancers and boutique agencies.

Most freelance projects are run across five tools — email for files, WhatsApp
for "quick changes", Drive for `final_v3_FINAL.zip`, a project board the client
never opens, and an invoice chased after the files have already been handed
over. ClientDeck replaces that with **one branded link per client**: milestones
they can read at a glance, previews they can review in place, one-click sign-off
that leaves a timestamped record, and deliverables that stay locked until the
milestone invoice is settled.

Clients never create an account. They click a link.

---

## What's built

| Capability | Where it lives |
|---|---|
| Magic-link client access (revocable, optionally expiring) | `src/lib/tokens.ts`, `src/lib/portal.ts` |
| Milestone tracker with a visual progress bar | `src/components/portal/portal-overview.tsx` |
| One-click approvals with a signed, timestamped audit row | `src/actions/portal.ts`, `portal_approve_milestone()` |
| Asset Locker — downloads gated on invoice payment | `isDeliverableUnlocked()`, `src/actions/portal.ts` |
| Embed frame for Figma / Loom / staging URLs | `src/lib/embeds.ts`, `src/components/portal/embed-frame.tsx` |
| Sign-off trail (action, actor, IP, user agent, timestamp) | `src/lib/audit.ts`, `audit_logs` |
| Freelancer dashboard: projects, milestones, files, invoices | `src/app/dashboard/**` |
| Branding: logo, colour, badge removal, custom domain field | `src/actions/organization.ts` |
| Plan tiers and entitlements, enforced in the database | `src/lib/plans.ts`, `enforce_project_limit()` |
| Stripe + Midtrans webhook settlement | `src/app/api/webhooks/**`, `src/lib/payments.ts` |

Not built (deliberately deferred — see [docs/ROADMAP.md](docs/ROADMAP.md)):
contract e-signatures, WhatsApp notification webhooks, change-request/scope-creep
flows, team seat invitations, and automated custom-domain provisioning.

---

## Stack

- **Next.js 16** (App Router, React 19, Server Actions) with TypeScript
- **Tailwind CSS v4**, lucide icons
- **Supabase** — Postgres with row-level security, Auth, and private Storage
- **@tanstack/react-query** for client-side cache
- No payment SDK at runtime: webhook signatures are verified directly

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your Supabase keys
supabase start                 # or point at a hosted project
supabase db reset              # applies migrations + demo data
npm run dev
```

Then:

- **Freelancer view** — <http://localhost:3000/login>, create an account.
  A workspace is provisioned on first sign-in.
- **Client view** — <http://localhost:3000/portal/demo-client-token-clientdeck>
  (from `supabase/seed.sql`; it's the same page a real client would get).

To see the seeded demo project in your own dashboard, attach yourself to the
demo organization:

```sql
insert into public.organization_members (organization_id, user_id, role)
values ('11111111-1111-4111-8111-111111111111', '<your auth.users id>', 'owner');
```

### Checks

```bash
npm run check     # eslint + tsc --noEmit + unit tests
npm test          # unit tests only (token, webhook signature, embed allowlist)
npm run test:sql  # RLS, entitlement and audit assertions against a live database
```

`npm run test:sql` needs a running database with the migrations applied
(`supabase start`). It runs in a transaction and rolls back, so it is safe
against a database with real data in it. See [tests/sql/README.md](tests/sql/README.md).

---

## How the security model works

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture. The
three decisions worth knowing up front:

1. **Every table is deny-by-default under RLS.** The anon and authenticated keys
   ship to the browser, so a signed-in freelancer reaches only rows belonging to
   an organization they are a member of. Cross-tenant reads and writes return
   nothing rather than erroring.

2. **The client portal is not a Postgres principal.** A client has no account
   and no JWT. Their link is resolved server-side, and only then is a
   service-role query issued — explicitly scoped to the single project the token
   unlocks. No project id is ever accepted from the request. Only the SHA-256
   hash of a token is stored, so the raw link is unrecoverable from a database
   dump and is shown to the freelancer exactly once.

3. **Rules that cost money live in the database, not the UI.** Plan limits,
   badge and custom-domain entitlements, milestone approval, and invoice
   settlement are Postgres functions and triggers. A bug in a form cannot hand
   out a paid tier, unlock a gated file, or skip an audit row.

---

## Payments

ClientDeck does not hold funds and is not in PCI scope. You paste a Stripe
Payment Link or Midtrans Snap link onto a milestone invoice; the provider's
signed webhook flips that invoice to `paid`; the Asset Locker reads that status.
Money stays in your own merchant account.

Settlement runs through `settle_invoice()`, which is idempotent on redelivery
and writes the audit row in the same transaction. Manual settlement (bank
transfer, cash) uses the same function from the dashboard.

---

## Project layout

```
src/
  actions/       Server Actions — one module per entity, all returning ActionState
  app/
    dashboard/   Freelancer-facing app (auth-gated by middleware)
    portal/      Client-facing portal, resolved from a magic-link token
    api/         Payment webhooks
  components/    ui/ primitives, dashboard/, portal/, auth/
  lib/           Supabase clients, auth, audit, plans, tokens, embeds, payments
supabase/
  migrations/    Schema, RLS policies, storage, business-rule functions
  seed.sql       Demo agency, project, milestones and a working client link
tests/           Unit tests for the token, payment and embed logic
docs/            Architecture, product brief, roadmap
```
