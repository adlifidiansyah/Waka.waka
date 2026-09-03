import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REMINDER_STEPS,
  currentReminderStep,
  daysOverdue,
} from "../src/lib/email/schedule.ts";

describe("days overdue", () => {
  const at = (iso: string) => new Date(iso);

  test("counts whole days, positive once past due", () => {
    assert.equal(daysOverdue("2026-09-05", at("2026-09-05T09:00:00Z")), 0);
    assert.equal(daysOverdue("2026-09-05", at("2026-09-08T09:00:00Z")), 3);
    assert.equal(daysOverdue("2026-09-05", at("2026-09-02T09:00:00Z")), -3);
  });

  test("time of day does not shift the count", () => {
    assert.equal(daysOverdue("2026-09-05", at("2026-09-05T00:00:01Z")), 0);
    assert.equal(daysOverdue("2026-09-05", at("2026-09-05T23:59:59Z")), 0);
  });

  test("accepts a full timestamp as well as a date", () => {
    assert.equal(daysOverdue("2026-09-05T00:00:00+00:00", at("2026-09-06T12:00:00Z")), 1);
  });

  test("spans month and year boundaries", () => {
    assert.equal(daysOverdue("2026-12-30", at("2027-01-02T00:00:00Z")), 3);
    assert.equal(daysOverdue("2026-01-31", at("2026-02-01T00:00:00Z")), 1);
  });
});

describe("reminder schedule", () => {
  test("nothing fires before the first step", () => {
    assert.equal(currentReminderStep(-10), null);
    assert.equal(currentReminderStep(-4), null);
  });

  test("each step fires as it is reached", () => {
    assert.equal(currentReminderStep(-3), "upcoming");
    assert.equal(currentReminderStep(-1), "upcoming");
    assert.equal(currentReminderStep(0), "due");
    assert.equal(currentReminderStep(2), "due");
    assert.equal(currentReminderStep(3), "overdue-3");
    assert.equal(currentReminderStep(7), "overdue-7");
    assert.equal(currentReminderStep(14), "overdue-14");
  });

  test("the series stops rather than nagging forever", () => {
    assert.equal(currentReminderStep(30), "overdue-14");
    assert.equal(currentReminderStep(365), "overdue-14");
  });

  test("after an outage the client gets the current step, not a backlog", () => {
    // Cron down from day 0 to day 9: the sweep resumes at overdue-7 only.
    assert.equal(currentReminderStep(9), "overdue-7");
  });

  test("steps are ordered and uniquely identified, so dedupe keys are stable", () => {
    const ids = REMINDER_STEPS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    const offsets = REMINDER_STEPS.map((s) => s.offsetDays);
    assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
  });

  test("the whole series is five touches over seventeen days", () => {
    assert.equal(REMINDER_STEPS.length, 5);
    assert.equal(REMINDER_STEPS.at(-1)!.offsetDays, 14);
  });
});
