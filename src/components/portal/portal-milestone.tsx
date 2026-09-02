import { CalendarDays, CheckCircle2, CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvoiceStatusBadge, MilestoneStatusBadge } from "@/components/ui/status";
import { EmbedFrame } from "@/components/portal/embed-frame";
import { DeliverableRow } from "@/components/portal/deliverable-row";
import { ApproveForm } from "@/components/portal/approve-form";
import { describeEmbed } from "@/lib/embeds";
import { isDeliverableUnlocked } from "@/lib/portal";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import type { MilestoneWithChildren } from "@/lib/database.types";

export function PortalMilestone({
  token,
  milestone,
  currency,
  clientName,
}: {
  token: string;
  milestone: MilestoneWithChildren;
  currency: string;
  clientName: string;
}) {
  const awaiting = milestone.status === "in_review";
  const previews = milestone.deliverables.filter((d) => d.kind !== "file");
  const files = milestone.deliverables.filter((d) => d.kind === "file");
  const invoice = milestone.invoice;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        awaiting && "border-[var(--portal-brand)] ring-1 ring-[var(--portal-brand)]/20",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                milestone.status === "approved"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-ink-100 text-ink-500",
              )}
              aria-hidden
            >
              {milestone.status === "approved" ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                milestone.order_index
              )}
            </span>
            <h3 className="font-semibold text-ink-900">{milestone.title}</h3>
          </div>
          {milestone.description ? (
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{milestone.description}</p>
          ) : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-400">
            {milestone.due_date ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" aria-hidden />
                Due {formatDate(milestone.due_date)}
              </span>
            ) : null}
            {milestone.price_cents > 0 ? (
              <span>{formatMoney(milestone.price_cents, currency)}</span>
            ) : null}
            {milestone.approved_at ? (
              <span>Approved {formatDateTime(milestone.approved_at)}</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MilestoneStatusBadge status={milestone.status} />
          {invoice && invoice.status !== "draft" ? (
            <InvoiceStatusBadge status={invoice.status} />
          ) : null}
        </div>
      </div>

      {previews.length > 0 ? (
        <div className="space-y-4 border-t border-ink-200 p-5">
          {previews.map((deliverable) => {
            const embed = describeEmbed(deliverable.embed_url);
            return (
              <EmbedFrame key={deliverable.id} title={deliverable.title} embed={embed} />
            );
          })}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="border-t border-ink-200 p-5">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
            Files
          </h4>
          <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
            {files.map((deliverable) => (
              <DeliverableRow
                key={deliverable.id}
                token={token}
                deliverable={deliverable}
                unlocked={isDeliverableUnlocked(deliverable, invoice)}
                amountDue={
                  invoice && invoice.status === "unpaid"
                    ? formatMoney(invoice.amount_cents, invoice.currency)
                    : null
                }
              />
            ))}
          </ul>
        </div>
      ) : null}

      {invoice && invoice.status === "unpaid" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 bg-amber-50/60 p-5">
          <p className="text-sm text-ink-700">
            <span className="font-medium text-ink-900">
              {formatMoney(invoice.amount_cents, invoice.currency)}
            </span>{" "}
            due for this step
            {invoice.due_date ? ` by ${formatDate(invoice.due_date)}` : ""}.
            {files.some((f) => f.locked_until_paid)
              ? " Files unlock as soon as it's settled."
              : ""}
          </p>
          {invoice.checkout_url ? (
            <a href={invoice.checkout_url} target="_blank" rel="noopener noreferrer">
              <Button variant="brand" size="sm">
                <CreditCard className="size-4" aria-hidden />
                Pay now
              </Button>
            </a>
          ) : null}
        </div>
      ) : null}

      {awaiting ? (
        <div className="border-t border-ink-200 bg-ink-50 p-5">
          <ApproveForm token={token} milestone={milestone} clientName={clientName} />
        </div>
      ) : null}
    </Card>
  );
}
