"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { createMilestone } from "@/actions/milestones";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/actions/types";

const INITIAL: ActionState = {};

export function AddMilestoneForm({
  projectId,
  currency,
}: {
  projectId: string;
  currency: string;
}) {
  const [state, formAction] = useActionState(createMilestone, INITIAL);

  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-dashed border-ink-300 p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Add a milestone</p>

      <div className="grid gap-3 sm:grid-cols-[1fr_140px_170px]">
        <input
          name="title"
          className="input"
          placeholder="Visual design"
          maxLength={160}
          required
          aria-label="Milestone title"
        />
        <input
          name="price"
          type="number"
          min={0}
          step="0.01"
          defaultValue={0}
          className="input"
          aria-label={`Milestone price in ${currency}`}
          placeholder={`Price (${currency})`}
        />
        <input name="dueDate" type="date" className="input" aria-label="Due date" />
      </div>

      <textarea
        name="description"
        rows={2}
        className="input resize-y"
        placeholder="What your client gets at this step, in their words."
        maxLength={2000}
        aria-label="Milestone description"
      />

      <FormMessage error={state.error} success={state.success} />

      <SubmitButton variant="secondary">
        <Plus className="size-4" aria-hidden />
        Add milestone
      </SubmitButton>
    </form>
  );
}
