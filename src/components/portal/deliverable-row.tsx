"use client";

import { useActionState, useEffect } from "react";
import { Download, Lock, Paperclip } from "lucide-react";
import { requestDownload } from "@/actions/portal";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatBytes } from "@/lib/utils";
import type { ActionState } from "@/actions/types";
import type { Deliverable } from "@/lib/database.types";

const INITIAL: ActionState & { downloadUrl?: string } = {};

export function DeliverableRow({
  token,
  deliverable,
  unlocked,
  amountDue,
}: {
  token: string;
  deliverable: Deliverable;
  unlocked: boolean;
  amountDue: string | null;
}) {
  const [state, formAction] = useActionState(requestDownload, INITIAL);

  // The signed URL is short-lived, so hand it straight to the browser rather
  // than rendering a link the client might come back to in ten minutes.
  useEffect(() => {
    if (state.downloadUrl) window.location.href = state.downloadUrl;
  }, [state.downloadUrl]);

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Paperclip className="size-4 shrink-0 text-ink-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-900">{deliverable.title}</p>
        <p className="text-xs text-ink-400">
          {formatBytes(deliverable.file_size_bytes)}
          {state.error ? <span className="text-red-600"> · {state.error}</span> : null}
        </p>
      </div>

      {unlocked ? (
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="deliverableId" value={deliverable.id} />
          <SubmitButton variant="secondary" size="sm">
            <Download className="size-3.5" aria-hidden />
            Download
          </SubmitButton>
        </form>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-500"
          title={
            amountDue
              ? `Unlocks once the ${amountDue} invoice is settled`
              : "Unlocks once this milestone's invoice is settled"
          }
        >
          <Lock className="size-3.5" aria-hidden />
          {amountDue ? `Unlocks on payment (${amountDue})` : "Unlocks on payment"}
        </span>
      )}
    </li>
  );
}
