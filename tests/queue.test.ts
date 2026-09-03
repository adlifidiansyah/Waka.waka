import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderQueued } from "@/lib/email/queue";

const BRAND = {
  studioName: "Northlight Studio",
  brandColor: "#4f46e5",
  logoUrl: null,
  showBadge: true,
};

describe("queued message dispatch", () => {
  test("renders an approval receipt from its stored payload", () => {
    const email = renderQueued({
      kind: "approval_receipt",
      payload: {
        brand: BRAND,
        clientName: "Maya Rahmawati",
        projectTitle: "Aurora Coffee",
        milestoneTitle: "Visual Design",
        approvedAt: "Sep 2, 2026, 09:14 AM",
        signedBy: "Maya Rahmawati",
        ipAddress: "203.0.113.42",
        nextMilestoneTitle: null,
      },
    });
    assert.match(email.subject, /you approved Visual Design$/);
    assert.ok(email.html.includes("203.0.113.42"));
  });

  test("renders a payment reminder from its stored payload", () => {
    const email = renderQueued({
      kind: "payment_reminder",
      payload: {
        brand: BRAND,
        clientName: "Maya",
        projectTitle: "Aurora Coffee",
        milestoneTitle: "Visual Design",
        amount: "$3,000",
        dueDate: "Sep 5, 2026",
        daysOverdue: 7,
        checkoutUrl: null,
        unlocksFiles: true,
      },
    });
    assert.match(email.subject, /^Overdue:/);
    assert.ok(email.text.includes("unlock"));
  });

  test("renders an approval notification from its stored payload", () => {
    const email = renderQueued({
      kind: "approval_notification",
      payload: {
        brand: BRAND,
        clientName: "Maya Rahmawati",
        projectTitle: "Aurora Coffee",
        milestoneTitle: "Visual Design",
        approvedAt: "Sep 2, 2026, 09:14 AM",
        signedBy: "Maya Rahmawati",
        dashboardUrl: "https://app.test/dashboard/projects/abc",
        outstandingAmount: null,
      },
    });
    assert.match(email.subject, /approved Visual Design$/);
  });

  test("a payload the template cannot render throws, rather than sending nonsense", () => {
    assert.throws(
      () => renderQueued({ kind: "payment_reminder", payload: { brand: BRAND } }),
      /does not match the payment_reminder template/,
    );
  });

  test("a payload from an older schema is rejected by name", () => {
    // A row queued before branding was nested would look like this.
    assert.throws(
      () =>
        renderQueued({
          kind: "approval_receipt",
          payload: {
            studioName: "Northlight Studio",
            clientName: "Maya",
            projectTitle: "Aurora Coffee",
            milestoneTitle: "Visual Design",
            approvedAt: "now",
            signedBy: "Maya",
          },
        }),
      /does not match the approval_receipt template/,
    );
  });

  test("an unknown kind is refused", () => {
    assert.throws(
      () => renderQueued({ kind: "carrier_pigeon" as never, payload: {} }),
      /Unknown email kind/,
    );
  });
});
