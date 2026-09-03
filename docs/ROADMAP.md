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
**Missing entirely.** Needs WhatsApp Business API credentials per organization
and a template approval process on Meta's side. The delivery half is mostly
solved: `email_messages` is already a generic outbox with retries, dedupe and
suppression, so this wants a `channel` column and a second transport rather than
a parallel queue.

### Multi-seat team roles
**Now:** `organization_members` is many-to-many with `owner`/`admin`/`member`
roles, and RLS distinguishes admins from members.
**Missing:** the invitation flow (invite tokens, email delivery, an accept
page), seat-count enforcement against the plan, and an organization switcher.
`requireWorkspace()` currently takes a user's first membership.

## Also missing, worth naming

- **The remaining notifications.** Portal links, approval receipts, studio
  notifications and payment reminders all send. A "milestone ready for review"
  nudge to the client does not — it needs the freelancer to choose when it fires,
  which is a UI decision rather than a plumbing one. Per-recipient unsubscribe
  and per-organization send windows are also absent; the reminder series is
  bounded and suppression is honoured, but a client cannot opt out of an
  individual stream.
- **An outbox UI.** `email_messages` records what was sent, what failed and why,
  and members can read their own organization's rows, but nothing renders them.
  A freelancer currently learns a reminder bounced only by noticing the client
  never replied.
- **CI.** The tests exist (`npm run check` for unit tests, `npm run test:sql`
  for the RLS and business-rule assertions against a live Postgres) but nothing
  runs them automatically. A GitHub Actions workflow that boots
  `supabase start` and runs both is a small, obvious next step.
- **Browser-level end-to-end tests.** The portal render path is verified against
  a real database; the click-through (approve, download, upload) is not covered
  by an automated Playwright run.
- **Direct-to-storage uploads.** Files currently pass through a Server Action, so
  they inherit the host's request-body limit (4.5 MB on Vercel). Issuing a signed
  upload URL and having the browser PUT straight to Supabase Storage would lift
  the cap to the bucket's own 100 MB and take the bytes off the function
  entirely.
- **Milestone reordering.** `order_index` exists and is respected; there is no
  drag-to-reorder UI.
- **File previews.** Uploaded files download; they do not preview inline.
- **Rate limiting.** Portal token resolution should be rate-limited per IP to
  slow brute-force scanning. 256-bit tokens make this low-risk, not zero-risk.
