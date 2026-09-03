# Product brief

The source brief for this build, kept alongside the code so decisions have a
reference. This is the "why"; [ARCHITECTURE.md](ARCHITECTURE.md) is the "how".

## Who it's for

**Primary — solo builders.** Freelance full-stack developers, UI/UX designers
and technical writers billing $1,500+ per project. They want to look like an
established studio without running enterprise software.

**Secondary — micro-agencies.** 2–8 person dev shops and creative studios that
need seat management, multi-project dashboards and a clear paper trail for
client approvals.

**The end client.** Non-technical founders, marketing leads and business owners.
They are overwhelmed by Jira and GitHub, and they misplace Drive links. Every
design decision in `/portal` assumes this person: no jargon, no account, no
navigation to learn, one obvious action per screen.

## The problem: the 5-tool trap

| Tool | What breaks |
|---|---|
| Email | Attachments scattered across six threads |
| WhatsApp | "Quick change?" requests with no paper trail |
| Drive | `final_v3_FINAL_actually-final.zip` |
| Trello | Boards the client never opens |
| Invoicing | Chasing payment after the files were already handed over |

Each tool solves one slice. The seams are the freelancer's problem, and the
seams are where scope creep and late payment live.

## The solution

One unified, branded link per client, carrying:

- **Formal sign-off checkpoints** — the client approves a milestone, and that
  approval is a record, not a chat message.
- **Escrow-style delivery** — source files unlock when the milestone invoice is
  settled, so the freelancer stops handing over work on trust.
- **In-place review** — Figma, Loom and staging URLs render in the page, so
  feedback happens where the work is.

The direct ROI: fewer scope arguments, faster payment, and a professional
surface that supports a higher project rate.

## Feature phasing

**Phase 1 (MVP) — built:**

- Magic-link access, no client passwords
- Milestone tracker with a visual progress bar
- Asset Locker, pay-to-unlock downloads
- Embed frame for Figma / Loom / staging URLs
- One-click "Approve & next"
- Portal links emailed to the client, branded per studio

**Phase 2 (retention) — not built.** See [ROADMAP.md](ROADMAP.md): custom-domain
CNAME provisioning, scope-creep change requests, contract e-signatures, WhatsApp
notification webhooks, multi-seat team roles.

## Pricing

| Plan | Price | Active projects | Notable |
|---|---|---|---|
| Free | $0 | 1 | Full core features, ClientDeck badge shown |
| Starter | $19/mo | 3 | Signed expiring downloads, full audit trail |
| Pro | $39/mo | Unlimited | Badge removal, custom logo and colour, 3 seats |
| Agency | $79/mo | Unlimited | Custom domain, 8 seats, role-based access |

The freemium hook is one genuinely useful free project. The conversion moments
are deliberate and each one is enforced in the database, not just prompted in
the UI: creating a second project, connecting a custom domain, or switching off
the badge.

Plan definitions live in `src/lib/plans.ts` and are mirrored by
`plan_active_project_limit()` in SQL. Changing a limit means changing both — the
SQL is the enforcement, the TypeScript is the presentation.

## Validation plan

The build is deliberately demoable before it is monetised:

1. The landing page's "See the client view" link opens a real seeded portal —
   the same page a client would get, not a screenshot.
2. Direct outreach to 20–30 active freelancers offering free lifetime access in
   exchange for a 15-minute onboarding call.
3. The question to answer is narrow: **will they replace their current
   Drive/Notion handover with this link?** Not "do you like it".

The signal to watch is whether a freelancer sends the link to a real client
unprompted. Everything else is politeness.
