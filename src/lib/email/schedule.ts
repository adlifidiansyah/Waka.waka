/**
 * Payment reminder schedule.
 *
 * Deliberately free of imports so the timing rules — the part with off-by-one
 * risk and the part that decides how often a client hears from us — are
 * unit-testable without a database.
 *
 * Five touches over seventeen days, then silence. A reminder series that never
 * stops trains the recipient to filter the sender, which costs the freelancer
 * the next project's emails too. Each step has a stable id so it can be used as
 * a dedupe key: the schedule can be re-evaluated as often as the cron runs
 * without any client receiving the same nudge twice.
 */

export const REMINDER_STEPS = [
  { id: "upcoming", offsetDays: -3 },
  { id: "due", offsetDays: 0 },
  { id: "overdue-3", offsetDays: 3 },
  { id: "overdue-7", offsetDays: 7 },
  { id: "overdue-14", offsetDays: 14 },
] as const;

export type ReminderStepId = (typeof REMINDER_STEPS)[number]["id"];

/**
 * The step an invoice has reached, given how far past its due date it is.
 *
 * Returns the latest step whose offset has been passed, so a cron outage does
 * not deliver a backlog of four reminders at once when it recovers — the client
 * gets the current one and the missed ones are simply skipped.
 */
export function currentReminderStep(daysOverdue: number): ReminderStepId | null {
  let reached: ReminderStepId | null = null;
  for (const step of REMINDER_STEPS) {
    if (daysOverdue >= step.offsetDays) reached = step.id;
  }
  return reached;
}

/**
 * Whole days between a due date and today, positive once overdue. Both sides
 * are floored to UTC midnight so the answer does not depend on what time of day
 * the cron happens to run.
 */
export function daysOverdue(dueDate: string, now: Date): number {
  const due = new Date(`${dueDate.slice(0, 10)}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - due) / 86_400_000);
}
