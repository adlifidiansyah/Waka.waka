"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { approveMilestone } from "@/actions/portal";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/actions/types";
import type { MilestoneWithChildren } from "@/lib/database.types";

const INITIAL: ActionState = {};

export function ApproveForm({
  token,
  milestone,
  clientName,
}: {
  token: string;
  milestone: MilestoneWithChildren;
  clientName: string;
}) {
  const [state, formAction] = useActionState(approveMilestone, INITIAL);

  if (state.success) {
    return <FormMessage success={state.success} />;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="milestoneId" value={milestone.id} />

      <p className="text-sm text-ink-600">
        Happy with &ldquo;{milestone.title}&rdquo;? Type your name to sign off. We record the date
        and time so there&apos;s a clear record for both of you.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label text-xs" htmlFor={`signer-${milestone.id}`}>
            Your name
          </label>
          <input
            id={`signer-${milestone.id}`}
            name="signerName"
            className="input mt-1"
            defaultValue={clientName}
            maxLength={120}
            required
          />
        </div>
        <SubmitButton variant="brand" size="lg">
          <CheckCircle2 className="size-4" aria-hidden />
          Approve &amp; next
        </SubmitButton>
      </div>

      <FormMessage error={state.error} />
    </form>
  );
}
