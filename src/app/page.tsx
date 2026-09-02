import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileLock2,
  Link2,
  MonitorPlay,
  ShieldCheck,
  Signature,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS, PLAN_ORDER } from "@/lib/plans";

const PAIN_POINTS = [
  { tool: "Email", problem: "Attachments scattered across six threads" },
  { tool: "WhatsApp", problem: "“Quick change?” requests with no paper trail" },
  { tool: "Drive", problem: "final_v3_FINAL_actually-final.zip" },
  { tool: "Trello", problem: "Boards your client never opens" },
  { tool: "Invoicing", problem: "Chasing payment after you already handed over the files" },
];

const FEATURES = [
  {
    icon: Link2,
    title: "Magic-link access",
    body: "Your client clicks one branded link. No account, no password, nothing to forget. Links can be revoked or set to expire.",
  },
  {
    icon: CheckCircle2,
    title: "Milestone tracker",
    body: "A visual progress bar your client reads in three seconds, so “where are we?” stops arriving by WhatsApp at 11pm.",
  },
  {
    icon: FileLock2,
    title: "Asset Locker",
    body: "Source files stay locked until the milestone invoice is settled. Downloads are signed and expire in minutes.",
  },
  {
    icon: MonitorPlay,
    title: "Embed frame",
    body: "Figma prototypes, Loom walkthroughs and staging URLs render inline. Reviews happen where the work lives.",
  },
  {
    icon: Signature,
    title: "One-click approvals",
    body: "“Approve & next” moves the project forward and closes the loop without a single email.",
  },
  {
    icon: ShieldCheck,
    title: "Sign-off trail",
    body: "Every approval is stamped with the date, IP and name. Scope creep arguments end with a link to the log.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-900">
          <span className="grid size-7 place-items-center rounded-md bg-ink-900 text-sm text-white">
            C
          </span>
          ClientDeck
        </span>
        <nav className="flex items-center gap-2">
          <Link href="#pricing" className="hidden px-3 text-sm text-ink-600 hover:text-ink-900 sm:block">
            Pricing
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="sm">
              Sign in
            </Button>
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-20">
          <Badge tone="info" className="mb-5">
            <Sparkles className="size-3" aria-hidden /> For freelancers &amp; boutique studios
          </Badge>
          <h1 className="max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-ink-900 sm:text-5xl">
            One link your client actually understands.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-600">
            Stop running projects across five tools your client half-reads. ClientDeck gives every
            project a branded portal with milestones, approvals, gated deliverables and a sign-off
            trail — so you look like a studio, and get paid before the files leave your hands.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login">
              <Button size="lg">
                Start free — 1 project
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </Link>
            <Link href="/portal/demo-client-token-clientdeck">
              <Button size="lg" variant="secondary">
                See the client view
              </Button>
            </Link>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            No credit card. The demo link opens the same portal your client would see.
          </p>
        </section>

        {/* The 5-tool trap */}
        <section className="border-y border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">The 5-tool trap</h2>
            <p className="mt-2 max-w-2xl text-ink-600">
              Every project starts organised and ends as archaeology. Each tool solves one slice and
              leaves the seams to you.
            </p>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PAIN_POINTS.map(({ tool, problem }) => (
                <li key={tool} className="card p-4">
                  <p className="text-sm font-semibold text-ink-900">{tool}</p>
                  <p className="mt-1 text-sm text-ink-500">{problem}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
            Everything the handover needs, nothing it doesn&apos;t
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-5">
                <Icon className="size-5 text-brand-600" aria-hidden />
                <h3 className="mt-3 text-sm font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-500">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-ink-900">Pricing</h2>
            <p className="mt-2 text-ink-600">
              Free while you try it on one project. Upgrade when a second client shows up.
            </p>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {PLAN_ORDER.map((tier) => {
                const plan = PLANS[tier];
                const highlighted = tier === "pro";
                return (
                  <div
                    key={tier}
                    className={
                      highlighted
                        ? "card border-ink-900 p-5 ring-1 ring-ink-900"
                        : "card p-5"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-900">{plan.name}</h3>
                      {highlighted ? <Badge tone="info">Most popular</Badge> : null}
                    </div>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-ink-900">
                      ${plan.priceUsdPerMonth}
                      <span className="text-sm font-normal text-ink-400">/mo</span>
                    </p>
                    <p className="mt-2 text-sm text-ink-500">{plan.tagline}</p>
                    <ul className="mt-4 space-y-2">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-ink-600">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-10 text-sm text-ink-400 sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} ClientDeck</span>
        <span>Built for people who bill by the project.</span>
      </footer>
    </div>
  );
}
