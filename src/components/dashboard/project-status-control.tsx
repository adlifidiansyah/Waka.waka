"use client";

import { useActionState } from "react";
import { setProjectStatusAction } from "@/actions/projects";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/actions/types";
import type { ProjectStatus } from "@/lib/database.types";

const INITIAL: ActionState = {};

const NEXT_LABEL: Record<ProjectStatus, { status: ProjectStatus; label: string }> = {
  active: { status: "completed", label: "Mark completed" },
  paused: { status: "active", label: "Resume project" },
  completed: { status: "archived", label: "Archive" },
  archived: { status: "active", label: "Reopen" },
};

export function ProjectStatusControl({
  projectId,
  status,
}: {
  projectId: string;
  status: ProjectStatus;
}) {
  const [state, formAction] = useActionState(setProjectStatusAction, INITIAL);
  const next = NEXT_LABEL[status];

  return (
    <div className="space-y-2">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="status" value={next.status} />
        <SubmitButton variant="secondary" size="sm">
          {next.label}
        </SubmitButton>
      </form>
      <FormMessage error={state.error} />
    </div>
  );
}
