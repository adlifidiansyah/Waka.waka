"use client";

import { useActionState, useState } from "react";
import {
  ChevronDown,
  FileUp,
  Lock,
  LockOpen,
  Paperclip,
  Send,
  Trash2,
  Link as LinkIcon,
} from "lucide-react";
import { deleteMilestone, setMilestoneStatus } from "@/actions/milestones";
import {
  addEmbedDeliverable,
  deleteDeliverable,
  toggleDeliverableLock,
  uploadDeliverableFile,
} from "@/actions/deliverables";
import { issueInvoice, markInvoicePaid } from "@/actions/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { InvoiceStatusBadge, MilestoneStatusBadge } from "@/components/ui/status";
import { cn, formatBytes, formatDate, formatMoney } from "@/lib/utils";
import type { ActionState } from "@/actions/types";
import type { MilestoneWithChildren } from "@/lib/database.types";

const INITIAL: ActionState = {};

export function MilestoneEditor({
  projectId,
  currency,
  milestone,
}: {
  projectId: string;
  currency: string;
  milestone: MilestoneWithChildren;
}) {
  const [open, setOpen] = useState(milestone.status === "in_review");
  const [statusState, statusAction] = useActionState(setMilestoneStatus, INITIAL);
  const [deleteState, deleteAction] = useActionState(deleteMilestone, INITIAL);
  const [embedState, embedAction] = useActionState(addEmbedDeliverable, INITIAL);
  const [uploadState, uploadAction] = useActionState(uploadDeliverableFile, INITIAL);
  const [lockState, lockAction] = useActionState(toggleDeliverableLock, INITIAL);
  const [removeState, removeAction] = useActionState(deleteDeliverable, INITIAL);
  const [issueState, issueAction] = useActionState(issueInvoice, INITIAL);
  const [payState, payAction] = useActionState(markInvoicePaid, INITIAL);

  const invoice = milestone.invoice;
  const error =
    statusState.error ??
    deleteState.error ??
    embedState.error ??
    uploadState.error ??
    lockState.error ??
    removeState.error ??
    issueState.error ??
    payState.error;
  const success =
    statusState.success ??
    embedState.success ??
    uploadState.success ??
    lockState.success ??
    issueState.success ??
    payState.success;

  return (
    <div
      className={cn(
        "rounded-xl border",
        milestone.status === "in_review" ? "border-amber-300 bg-amber-50/40" : "border-ink-200",
      )}
    >
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
            {milestone.order_index}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink-900">{milestone.title}</span>
            <span className="block text-xs text-ink-400">
              {milestone.due_date ? `Due ${formatDate(milestone.due_date)} · ` : ""}
              {formatMoney(milestone.price_cents, currency)} ·{" "}
              {milestone.deliverables.length} deliverable
              {milestone.deliverables.length === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronDown
            className={cn("ml-auto size-4 shrink-0 text-ink-400 transition", open && "rotate-180")}
            aria-hidden
          />
        </button>
        <div className="flex items-center gap-2">
          <MilestoneStatusBadge status={milestone.status} />
          {invoice ? <InvoiceStatusBadge status={invoice.status} /> : null}
        </div>
      </div>

      {open ? (
        <div className="space-y-5 border-t border-ink-200 p-4">
          {milestone.description ? (
            <p className="text-sm leading-relaxed text-ink-600">{milestone.description}</p>
          ) : null}

          <FormMessage error={error} success={success} />

          {/* Status controls */}
          <div className="flex flex-wrap items-center gap-2">
            {(["pending", "in_progress", "in_review", "approved"] as const).map((status) => (
              <form key={status} action={statusAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <input type="hidden" name="status" value={status} />
                <SubmitButton
                  variant={milestone.status === status ? "primary" : "secondary"}
                  size="sm"
                  disabled={milestone.status === status}
                >
                  {status === "in_review" ? (
                    <>
                      <Send className="size-3.5" aria-hidden />
                      Send for review
                    </>
                  ) : status === "in_progress" ? (
                    "In progress"
                  ) : status === "approved" ? (
                    "Mark approved"
                  ) : (
                    "Not started"
                  )}
                </SubmitButton>
              </form>
            ))}
            <form action={deleteAction} className="ml-auto">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="milestoneId" value={milestone.id} />
              <SubmitButton variant="ghost" size="sm">
                <Trash2 className="size-3.5" aria-hidden />
                Delete
              </SubmitButton>
            </form>
          </div>

          {/* Deliverables */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">
              Deliverables
            </h3>

            {milestone.deliverables.length > 0 ? (
              <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200 bg-white">
                {milestone.deliverables.map((deliverable) => (
                  <li key={deliverable.id} className="flex items-center gap-3 px-3 py-2.5">
                    {deliverable.kind === "file" ? (
                      <Paperclip className="size-4 shrink-0 text-ink-400" aria-hidden />
                    ) : (
                      <LinkIcon className="size-4 shrink-0 text-ink-400" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink-900">{deliverable.title}</p>
                      <p className="truncate text-xs text-ink-400">
                        {deliverable.kind === "file"
                          ? formatBytes(deliverable.file_size_bytes)
                          : deliverable.embed_url}
                      </p>
                    </div>
                    {deliverable.locked_until_paid ? (
                      <Badge tone="warning">
                        <Lock className="size-3" aria-hidden />
                        Locked
                      </Badge>
                    ) : null}
                    {deliverable.kind === "file" ? (
                      <form action={lockAction}>
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="deliverableId" value={deliverable.id} />
                        <SubmitButton variant="ghost" size="sm">
                          {deliverable.locked_until_paid ? (
                            <LockOpen className="size-3.5" aria-hidden />
                          ) : (
                            <Lock className="size-3.5" aria-hidden />
                          )}
                          {deliverable.locked_until_paid ? "Unlock" : "Lock"}
                        </SubmitButton>
                      </form>
                    ) : null}
                    <form action={removeAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="deliverableId" value={deliverable.id} />
                      <SubmitButton variant="ghost" size="sm" aria-label="Remove deliverable">
                        <Trash2 className="size-3.5" aria-hidden />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-500">
                Nothing attached yet. Add a Figma or Loom link, or upload the files.
              </p>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              {/* Embed / link */}
              <form action={embedAction} className="space-y-2 rounded-lg border border-ink-200 p-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <p className="text-xs font-medium text-ink-700">Add a preview</p>
                <input
                  name="title"
                  className="input"
                  placeholder="Design prototype"
                  maxLength={160}
                  required
                />
                <input
                  name="url"
                  type="url"
                  className="input"
                  placeholder="https://figma.com/proto/…"
                  required
                />
                <div className="flex items-center gap-2">
                  <select name="kind" className="input flex-1" defaultValue="embed">
                    <option value="embed">Embed in the portal</option>
                    <option value="link">Outbound link only</option>
                  </select>
                  <SubmitButton variant="secondary" size="sm">
                    Add
                  </SubmitButton>
                </div>
              </form>

              {/* File upload */}
              <form action={uploadAction} className="space-y-2 rounded-lg border border-ink-200 p-3">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <p className="text-xs font-medium text-ink-700">Upload a file</p>
                <input
                  name="title"
                  className="input"
                  placeholder="Title (defaults to the filename)"
                  maxLength={160}
                />
                <input name="file" type="file" className="input py-1.5" required />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs text-ink-600">
                    <input
                      type="checkbox"
                      name="lockUntilPaid"
                      defaultChecked
                      className="size-4 rounded border-ink-300"
                    />
                    Lock until paid
                  </label>
                  <SubmitButton variant="secondary" size="sm">
                    <FileUp className="size-3.5" aria-hidden />
                    Upload
                  </SubmitButton>
                </div>
              </form>
            </div>
          </section>

          {/* Invoice */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-400">Invoice</h3>
            {invoice && invoice.status !== "draft" ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5">
                <span className="text-sm font-medium text-ink-900">
                  {formatMoney(invoice.amount_cents, invoice.currency)}
                </span>
                <InvoiceStatusBadge status={invoice.status} />
                <span className="text-xs text-ink-400">
                  {invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : "No due date"}
                </span>
                {invoice.checkout_url ? (
                  <a
                    href={invoice.checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Payment link
                  </a>
                ) : null}
                {invoice.status === "unpaid" ? (
                  <form action={payAction} className="ml-auto flex items-center gap-2">
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                    <input
                      name="reference"
                      className="input h-8 w-40 text-xs"
                      placeholder="Payment reference"
                    />
                    <SubmitButton size="sm">Mark paid</SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : (
              <form action={issueAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <input type="hidden" name="currency" value={currency} />
                <div>
                  <label className="label text-xs" htmlFor={`amount-${milestone.id}`}>
                    Amount
                  </label>
                  <input
                    id={`amount-${milestone.id}`}
                    name="amount"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={(milestone.price_cents / 100).toFixed(2)}
                    className="input mt-1 w-32"
                    required
                  />
                </div>
                <div>
                  <label className="label text-xs" htmlFor={`due-${milestone.id}`}>
                    Due date
                  </label>
                  <input
                    id={`due-${milestone.id}`}
                    name="dueDate"
                    type="date"
                    defaultValue={milestone.due_date ?? ""}
                    className="input mt-1"
                  />
                </div>
                <div className="min-w-56 flex-1">
                  <label className="label text-xs" htmlFor={`checkout-${milestone.id}`}>
                    Payment link <span className="font-normal text-ink-400">(optional)</span>
                  </label>
                  <input
                    id={`checkout-${milestone.id}`}
                    name="checkoutUrl"
                    type="url"
                    className="input mt-1"
                    placeholder="https://buy.stripe.com/…"
                  />
                </div>
                <SubmitButton variant="secondary">Issue invoice</SubmitButton>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
