# Roadmap

What is deliberately not built, and what it would take. Nothing here is
half-implemented — each item is absent rather than stubbed, so the codebase does
not claim capabilities it lacks.

## Phase 2 — retention

### Custom domain provisioning
**Now:** `organizations.custom_domain` is stored and gated to the Agency plan.
**Missing:** actually serving a portal on that hostname. Needs a domains API
call at the host (Vercel, Cloudflare) on save, a verification-state column, and
middleware that maps an incoming `Host` header to an organization before
resolving the token.

### Scope Creep Shield (change requests)
**Missing entirely.** A `change_requests` table hanging off `projects`, with a
client-facing "request a change" form in the portal and a freelancer-side
accept/decline that can convert an accepted request into a priced milestone. The
audit trail already carries the evidence half of this; the workflow is the gap.

### Contract e-signatures
**Now:** milestone approvals are signed with a typed name plus timestamp, IP and
user agent — enough to settle "I never approved that wireframe".
**Missing:** a document-level signature on a contract or SOW, which needs a
documents table, a rendered agreement, and a signature artifact with more
ceremony than a milestone tick.

### WhatsApp notification webhooks
**Missing entirely.** Outbound only: a queue table, a worker, and WhatsApp
Business API credentials per organization. Worth doing after the email
notifications that also do not exist yet — right now the freelancer copies a
link and sends it themselves, which is honest but manual.

### Multi-seat team roles
**Now:** `organization_members` is many-to-many with `owner`/`admin`/`member`
roles, and RLS distinguishes admins from members.
**Missing:** the invitation flow (invite tokens, email delivery, an accept
page), seat-count enforcement against the plan, and an organization switcher.
`requireWorkspace()` currently takes a user's first membership.

## Also missing, worth naming

- **Email delivery.** No transactional email at all. Portal links are copied by
  hand. Wiring Resend to send the link, an approval receipt and a payment
  reminder is the highest-value next increment.
- **CI.** The tests exist (`npm run check` for unit tests, `npm run test:sql`
  for the RLS and business-rule assertions against a live Postgres) but nothing
  runs them automatically. A GitHub Actions workflow that boots
  `supabase start` and runs both is a small, obvious next step.
- **Browser-level end-to-end tests.** The portal render path is verified against
  a real database; the click-through (approve, download, upload) is not covered
  by an automated Playwright run.
- **Milestone reordering.** `order_index` exists and is respected; there is no
  drag-to-reorder UI.
- **File previews.** Uploaded files download; they do not preview inline.
- **Rate limiting.** Portal token resolution should be rate-limited per IP to
  slow brute-force scanning. 256-bit tokens make this low-risk, not zero-risk.
