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
| Portal links emailed to the client, branded per studio | `src/lib/email/**`, `src/actions/client-links.ts` |
| Approval receipts and studio notifications on sign-off | `src/actions/portal.ts`, `src/lib/email/render.ts` |
| Scheduled payment reminders, with a manual nudge | `src/lib/email/schedule.ts`, `src/lib/email/reminders.ts` |
| Retrying outbox with bounce/complaint suppression | `src/lib/email/queue.ts`, `src/app/api/webhooks/resend` |
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
- **Resend** for transactional email
- **@tanstack/react-query** for client-side cache
- No payment or email SDK at runtime: webhook signatures are verified directly
  and Resend is called over `fetch`

---

## Deploying

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fadlifidiansyah%2FWaka.waka%2Ftree%2Fclaude%2Ffreelance-agency-portal-496pqb&project-name=clientdeck&repository-name=clientdeck&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,NEXT_PUBLIC_APP_URL,CRON_SECRET&envDescription=Supabase+project+keys+plus+your+deployment+URL.+DEPLOY.md+says+where+to+find+each+one.&envLink=https%3A%2F%2Fgithub.com%2Fadlifidiansyah%2FWaka.waka%2Fblob%2Fclaude%2Ffreelance-agency-portal-496pqb%2FDEPLOY.md)

The button imports the repo and prompts for the environment variables. You still
need a Supabase project for it to point at — [DEPLOY.md](DEPLOY.md) walks
through both, plus auth redirects, email, payments and the Vercel platform
limits the repo is configured around.

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
npm run test:sql  # RLS, entitlement, audit and outbox assertions against a live database
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

## Email

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (a verified sender on a domain you
control) to turn email on. Without them the app runs normally and the email
options are disabled with a note explaining what to set.

Four emails are wired, all branded with the studio's logo, colour and name:

| Email | To | Trigger |
|---|---|---|
| Portal link | Client | The freelancer ticks "email this link" when creating one |
| Approval receipt | Client | They approve a milestone in the portal |
| Approval notification | Studio | Same event — one per team member |
| Payment reminder | Client | An unpaid invoice reaches a step on the schedule, or the freelancer clicks "Send reminder" |

### Sent inline vs. queued

The portal link is sent **inline**, because a freelancer is watching it go out
and can act on a failure. Everything else goes through an **outbox**
(`email_messages`), because nobody is looking when it fires and a dropped send
would be silent. The outbox gives those messages retries with exponential
backoff, a dedupe key so a reminder cannot fire twice, and a record of what was
sent.

### Scheduling

Payment reminders need something to tick. `/api/cron/email` works out which
reminders are due and then drains the outbox — one endpoint, so there is one
thing to schedule. `vercel.json` already runs it hourly; anywhere else, call it
on a schedule with the shared secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/email
```

It is a public URL that sends mail, so it refuses to run unless `CRON_SECRET`
is set and matches.

The schedule is five touches over seventeen days — three days before due, on the
due date, then 3, 7 and 14 days late — and then it stops. The tone firms up as
the invoice ages. After a cron outage the client gets the current step, not a
backlog of the ones that were missed.

### Bounces

Add a Resend webhook pointing at `POST /api/webhooks/resend` with
`email.bounced` and `email.complained` enabled, and set `RESEND_WEBHOOK_SECRET`.
A suppressed address is never mailed again and anything already queued for it is
cancelled. This matters more once reminders are automatic: without it, one dead
address gets retried on a schedule for the life of the project, which is how a
sending domain gets blocked for every studio sharing it.

### Consequences of hashing tokens

Two of these are surfaced in the UI rather than hidden:

- **A portal link cannot be re-sent, only re-issued.** Only the SHA-256 hash is
  stored, so there is no raw token left to put in a second email. "Create &
  send" always mints a fresh link.
- **The approval receipt carries no portal link,** for the same reason — linking
  would mean minting a live token for every receipt. The client already has
  their link; the receipt is the record.

A failed inline send does not fail the action: the link was created and is
valid, so it is shown for copying alongside the provider's own reason for
refusing.

Delivery state is recorded on `client_access_tokens` and `email_messages`, and
sends and failures append to the audit trail.

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
  components/    ui/ primitives, dashboard/, portal/, auth/
    api/         Payment webhooks, Resend delivery events, the scheduled tick
  lib/           Supabase clients, auth, audit, plans, tokens, embeds, payments
    email/       Templates, transport, outbox, reminder schedule
supabase/
  migrations/    Schema, RLS policies, storage, business-rule functions
  seed.sql       Demo agency, project, milestones and a working client link
tests/           Unit tests for the token, payment and embed logic
docs/            Architecture, product brief, roadmap
```
