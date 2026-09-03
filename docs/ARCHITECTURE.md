# Architecture

## Shape of the system

```
                        ┌─────────────────────────────┐
   Freelancer  ────────▶│  /dashboard  (Supabase Auth)│
   (has an account)     │  anon key + user JWT        │
                        └──────────────┬──────────────┘
                                       │  every query filtered by RLS
                                       ▼
                        ┌─────────────────────────────┐
                        │        Postgres             │
                        │  RLS on every table         │
                        │  business rules in SQL      │
                        └──────────────▲──────────────┘
                                       │  service role, explicitly scoped
                        ┌──────────────┴──────────────┐
   Client       ───────▶│  /portal/[token]            │
   (no account)         │  token verified server-side │
                        └─────────────────────────────┘
                                       ▲
                                       │  signature-verified
                        ┌──────────────┴──────────────┐
   Stripe / Midtrans ──▶│  /api/webhooks/*            │
                        └─────────────────────────────┘
```

## Two very different callers

The freelancer and the client reach the same data through completely different
paths, and conflating them is where a portal like this usually springs a leak.

**The freelancer** is a normal Supabase Auth user. Their session cookie carries
a JWT, `auth.uid()` resolves, and every query runs under row-level security.
The app never filters by organization for safety — it filters for clarity, and
RLS is what actually enforces the boundary. If a query forgets its `WHERE`,
Postgres still returns nothing that isn't theirs.

**The client** has no account, no password and no JWT. They have a link. That
link is resolved in `resolvePortalToken()`:

1. Hash the raw token with SHA-256 and look up `client_access_tokens`.
2. Reject if it is unknown, revoked, or past `expires_at`.
3. Load exactly one project — the one the token row points at.
4. Load that project's milestones, and only deliverables and invoices belonging
   to those milestone ids.

Those reads use the service role, which bypasses RLS, so the scoping is the
security boundary and it is written explicitly. **No project, milestone or
deliverable id is ever taken from the request** — every id used in a query comes
from a row reached through the token. When the client submits an approval or a
download, the token is re-resolved from scratch rather than trusted from the
render.

## Why tokens are hashed

`client_access_tokens` stores `token_hash`, never the token. 32 bytes from
`randomBytes`, base64url-encoded — 256 bits, not guessable. The raw value is
returned once, in the Server Action result that created it, and after that it
exists only in whatever the freelancer pasted into their email.

The consequence, which the UI states plainly: a lost link cannot be looked up,
only re-issued. That is the correct trade. A stolen database backup should not
be a set of working portal links to every client of every studio on the
platform.

## Rules that live in Postgres, not in React

Anything whose failure costs someone money is enforced in the database:

| Rule | Mechanism |
|---|---|
| Free = 1 active project, Starter = 3 | `enforce_project_limit()` trigger |
| Badge removal needs Pro; custom domain needs Agency | `enforce_branding_entitlements()` trigger |
| Approving a milestone always writes an audit row | `portal_approve_milestone()`, one transaction |
| A milestone can only be approved through its own project's token | same function, re-checks `project_id` |
| Settling an invoice always writes an audit row | `settle_invoice()`, one transaction |
| Webhook redelivery does not double-settle | `settle_invoice()` returns early when already paid |
| A signed-in user cannot settle another studio's invoice | membership check inside `settle_invoice()` |

That last one matters more than it looks. `settle_invoice()` is
`SECURITY DEFINER`, so it runs with RLS bypassed. Without an explicit membership
check, knowing an invoice UUID would have been enough for any signed-in user to
mark it paid — and marking it paid unlocks that studio's gated files. The
function now requires that a caller with an `auth.uid()` be a member of the
owning organization; a null uid means the service role, which only reaches the
function after a provider signature has been verified. `anon` has no EXECUTE
grant at all. `portal_approve_milestone()` is revoked from every role except the
service role for the same reason.

`audit_logs` has SELECT and INSERT policies and deliberately no UPDATE or DELETE
policy, so the sign-off trail is append-only for every non-service role.

## The Asset Locker

One predicate, `isDeliverableUnlocked()`, decides whether a file is available:

```ts
if (!deliverable.locked_until_paid) return true;
return invoice?.status === "paid";
```

It is called twice — once to render the lock in the portal, and again inside
`requestDownload()` before a signed URL is minted. The UI check is a courtesy;
the server-side check is the enforcement. Downloads are signed URLs valid for
five minutes, so a link copied out of the network tab is not a permanent
bypass, and every download appends an audit row.

Files live in a private Storage bucket laid out as
`<organization_id>/<project_id>/<uuid>-<filename>`. The storage RLS policies key
off that first path segment, so an object's own path carries its tenant.

## The Embed Frame

Client portals render third-party content inside a studio's branding, which is
a phishing surface if you let it be one. `describeEmbed()` allowlists hosts by
suffix (Figma, Loom, YouTube, Vimeo, Vercel, Netlify) and:

- frames only `https:` URLs from allowlisted hosts;
- returns `null` for any other scheme, so `javascript:` and `data:` URLs never
  become a clickable anchor either;
- rejects lookalikes — `figma.com.evil.example` does not match `figma.com`;
- renders anything else as a plain outbound link with `rel="noopener"`.

Frames are sandboxed without `allow-same-origin` and without
`allow-top-navigation`, so embedded content cannot reach the parent page or
navigate the client away.

## Transactional email

`src/lib/email/` splits along the same line as `payments.ts`: `render.ts` is
pure and unit-tested, `resend.ts` does the network and carries the
`server-only` marker.

The rendering half is where the risk is. A portal email interpolates a studio
name, a project title, a client's name and a freelancer's free-text note into
HTML that lands in someone else's mail client. All of it goes through
`escapeHtml`, brand colours are re-validated against `#rrggbb` before touching a
`style` attribute, and logo URLs must parse as absolute `https` before reaching
a `src`. `renderPortalLinkEmail` also refuses outright to send a portal URL that
is not https unless it is localhost, so a deployment left on the default
`NEXT_PUBLIC_APP_URL` cannot mail a client an unencrypted link.

The transport never throws. A send failure returns a typed result carrying the
provider's own message, and the action turns that into a `warning` beside a
`success`: the link exists and is valid, so the freelancer is shown it to copy
rather than told the operation failed. `Idempotency-Key` is set from the token
id so a double-submitted form cannot mail a client two portal links.

Because only the token hash is stored, there is no "resend" — the raw token is
gone the moment the action returns. Emailing therefore happens inside
`createClientLink` rather than as a separate step, and the UI states that a lost
link is re-issued rather than recovered. The approval receipt carries no portal
link at all for the same reason: linking would mean minting a live token for
every receipt, so the receipt is a record and the client uses the link they
already have.

### Inline sends and the outbox

The portal link is sent inline. Every other email goes through `email_messages`.
The dividing line is whether a person is watching: a freelancer who clicks
"Create & send" can read a failure and copy the link instead, but nobody is
looking when an approval receipt or a 3-days-overdue reminder fires, so those
need somewhere to fail loudly and be retried.

The outbox stores render inputs rather than rendered HTML — rows stay small, and
a template fix reaches anything still queued. The price is that a payload can
outlive the template that reads it, so `renderQueued()` validates against a Zod
schema per kind and a mismatch becomes a *permanent* failure on that one message
rather than a crashed worker.

`claim_email_batch()` uses `for update skip locked`, so overlapping cron runs
split the queue instead of double-sending. The claim itself increments
`attempts` and pushes `next_attempt_at` five minutes out, which means a worker
that dies mid-send leaves a leased row that becomes claimable again rather than
a wedged one. Failures back off quadratically (1m, 4m, 9m, 16m) up to
`max_attempts`.

Whether a failure is worth retrying is decided by the transport, not the worker,
because only the transport sees the status code. A 4xx is permanent — the
provider is saying the message itself is wrong (unverified sending domain,
malformed recipient) and further attempts only burn the budget. A 429, a 5xx, a
timeout or a connection error is retryable: the provider is briefly unable
rather than refusing. Collapsing those two into "any non-2xx is permanent" is a
real bug, and was one until an end-to-end run against a stub provider returned a
502 and the message was abandoned on the first try.

Nothing writes to the outbox through the browser-visible keys. `email_messages`
has a SELECT policy and deliberately no INSERT policy: every enqueue runs from a
Server Action or webhook that has already authorised the caller, through the
service role. Without that, any signed-in user could queue arbitrary mail from
the deployment's verified sending domain — the SQL suite asserts the absence of
a write policy for exactly this reason.

### Reminder scheduling

`schedule.ts` holds the timing rules and imports nothing, so the off-by-one-prone
part is testable without a database. Five steps over seventeen days, each with a
stable id that becomes the dedupe key `payment_reminder:<invoice>:<step>`. The
sweep can therefore run as often as it likes and be idempotent.

`currentReminderStep()` returns the *latest* step passed rather than every step
passed. After a cron outage the client gets the current nudge, not four of them
at once — an availability problem on our side should not look like harassment on
theirs. The series then stops: a reminder that never ends trains the recipient
to filter the sender, which costs the freelancer the next project's emails too.

### Suppression

Bounces and complaints arrive on `/api/webhooks/resend`, Svix-signed. A
suppressed address is recorded globally rather than per-organization, because a
hard bounce is a fact about the address and every studio on a deployment shares
its sending reputation. `suppress_email()` also cancels anything still queued
for that address, and the worker re-checks suppression at send time — a reminder
series outlives a bounce that happens between queueing and sending.

## Server Actions

Every mutation is a Server Action returning a uniform `ActionState`
(`{ error?, success?, createdLink? }`), consumed with `useActionState`, so forms
share one error-rendering path and one pending state. Actions re-derive the
caller's workspace with `requireWorkspace()` rather than accepting an
organization id, validate input with Zod, and write an audit row on the way out.

Audit writes never fail a user action — a missing log line is worth less than a
blocked approval — but they log loudly on the server so the gap is visible.

## Trade-offs taken

- **A hand-maintained `database.types.ts`** instead of generated types, so the
  repo is useful before anyone runs `supabase gen types`. The header says how to
  regenerate it.
- **Plan changes are a direct write** from settings rather than a checkout flow.
  Billing belongs to the provider webhook; this keeps entitlements testable
  without a merchant account, and the UI says so.
- **Custom domains store the hostname only.** Actual CNAME provisioning is a
  deployment concern (Vercel domains API or equivalent) and is not automated.
- **Single-organization membership.** `requireWorkspace()` takes a user's first
  membership. The schema is many-to-many and ready for an org switcher; the UI
  for it is not built.
- **The outbox is a database table drained by cron,** not a broker. It is the
  right size for one deployment's transactional mail and has no extra
  infrastructure to run, but it polls, so the floor on *unattended* delivery
  latency is the cron interval — and on a Vercel Hobby account that interval can
  only be daily. Anything user-triggered sidesteps this: the approval action
  drains the queue in `after()`, once its response is already sent, so a receipt
  arrives in seconds and the schedule is only the retry path. Anything genuinely
  latency-sensitive would want a real queue.
- **Deliverable uploads go through a Server Action,** which binds them to the
  host's request-body ceiling — 4.5 MB on Vercel, enforced before any of this
  code runs. The cap is stated in the UI rather than discovered as a 413.
  Uploading straight to Supabase Storage with a signed URL would remove the
  limit entirely and is the right fix; it is not built.
- **Reminder timing is UTC-only.** `daysOverdue()` floors both sides to UTC
  midnight, so a client in UTC+13 may see a "due today" email on what is already
  tomorrow for them. Per-organization timezones are a schema change plus a
  send-window preference, and are not built.
- **Resend over `fetch`, not the SDK,** matching the payment webhooks. The send
  endpoint is one POST; the trade is that attachments, batching and scheduled
  sends would each need writing by hand.
