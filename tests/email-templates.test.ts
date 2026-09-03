import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  renderApprovalNotificationEmail,
  renderApprovalReceiptEmail,
  renderPaymentReminderEmail,
} from "../src/lib/email/render.ts";

const BRAND = {
  studioName: "Northlight Studio",
  brandColor: "#4f46e5",
  logoUrl: null,
  showBadge: true,
};

const RECEIPT = {
  brand: BRAND,
  clientName: "Maya Rahmawati",
  projectTitle: "Aurora Coffee — Website Rebuild",
  milestoneTitle: "Visual Design",
  approvedAt: "Sep 2, 2026, 09:14 AM",
  signedBy: "Maya Rahmawati",
  ipAddress: "203.0.113.42",
  nextMilestoneTitle: "Build & Launch",
};

const REMINDER = {
  brand: BRAND,
  clientName: "Maya Rahmawati",
  projectTitle: "Aurora Coffee — Website Rebuild",
  milestoneTitle: "Visual Design",
  amount: "$3,000",
  dueDate: "Sep 5, 2026",
  daysOverdue: 0,
  checkoutUrl: null,
  unlocksFiles: false,
};

describe("subject lines", () => {
  test("no subject appends the project after a dash, which titles already contain", () => {
    const receipt = renderApprovalReceiptEmail(RECEIPT);
    const dueSoon = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: -3 });
    const dueToday = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: 0 });
    const overdue = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: 7 });

    for (const email of [receipt, dueSoon, dueToday, overdue]) {
      const dashes = (email.subject.match(/—/g) ?? []).length;
      assert.ok(
        dashes <= 1,
        `"${email.subject}" reads as three fragments with ${dashes} em dashes`,
      );
    }
  });

  test("the receipt names the studio, so it is recognisable in a crowded inbox", () => {
    assert.equal(
      renderApprovalReceiptEmail(RECEIPT).subject,
      "Northlight Studio: you approved Visual Design",
    );
  });
});

describe("approval receipt", () => {
  test("records everything the sign-off trail holds", () => {
    const email = renderApprovalReceiptEmail(RECEIPT);
    for (const value of ["Visual Design", "Maya Rahmawati", "Sep 2, 2026, 09:14 AM", "203.0.113.42"]) {
      assert.ok(email.html.includes(value), `HTML missing ${value}`);
      assert.ok(email.text.includes(value), `text missing ${value}`);
    }
  });

  test("carries no portal link — only the token hash is stored, so there is none to give", () => {
    const email = renderApprovalReceiptEmail(RECEIPT);
    assert.ok(!email.html.includes("/portal/"));
    assert.ok(!email.text.includes("/portal/"));
  });

  test("names the next milestone, or says the plan is done", () => {
    assert.ok(renderApprovalReceiptEmail(RECEIPT).html.includes("Build &amp; Launch"));
    const last = renderApprovalReceiptEmail({ ...RECEIPT, nextMilestoneTitle: null });
    assert.ok(last.html.includes("last step on the plan"));
  });

  test("omits the IP row when none was captured", () => {
    const email = renderApprovalReceiptEmail({ ...RECEIPT, ipAddress: null });
    assert.ok(!email.html.includes("From IP"));
    assert.ok(!email.text.includes("From IP"));
  });

  test("a hostile signer name cannot inject markup", () => {
    const email = renderApprovalReceiptEmail({
      ...RECEIPT,
      signedBy: '<script>alert(1)</script>',
    });
    assert.ok(!email.html.includes("<script>"));
    assert.ok(email.html.includes("&lt;script&gt;"));
  });
});

describe("approval notification", () => {
  const NOTIFY = {
    brand: BRAND,
    clientName: "Maya Rahmawati",
    projectTitle: "Aurora Coffee — Website Rebuild",
    milestoneTitle: "Visual Design",
    approvedAt: "Sep 2, 2026, 09:14 AM",
    signedBy: "Maya Rahmawati <maya@auroracoffee.test>",
    dashboardUrl: "https://app.clientdeck.test/dashboard/projects/abc",
    outstandingAmount: "$3,000",
  };

  test("links the freelancer straight to the project", () => {
    const email = renderApprovalNotificationEmail(NOTIFY);
    assert.ok(email.html.includes(`href="${NOTIFY.dashboardUrl}"`));
    assert.ok(email.text.includes(NOTIFY.dashboardUrl));
  });

  test("flags an outstanding invoice, and stays quiet when there isn't one", () => {
    assert.ok(renderApprovalNotificationEmail(NOTIFY).html.includes("$3,000"));
    const paid = renderApprovalNotificationEmail({ ...NOTIFY, outstandingAmount: null });
    assert.ok(!paid.html.includes("outstanding"));
  });

  test("refuses a non-https dashboard URL outside localhost", () => {
    assert.throws(
      () => renderApprovalNotificationEmail({ ...NOTIFY, dashboardUrl: "http://app.test/x" }),
      /not https/,
    );
  });
});

describe("payment reminder", () => {
  test("tone escalates with age rather than repeating one message", () => {
    const upcoming = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: -3 });
    const dueToday = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: 0 });
    const late = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: 5 });
    const veryLate = renderPaymentReminderEmail({ ...REMINDER, daysOverdue: 20 });

    assert.match(upcoming.subject, /due on Sep 5, 2026 for/);
    assert.match(dueToday.subject, /due today/);
    assert.match(late.subject, /^Overdue:/);
    assert.match(veryLate.subject, /^Overdue:/);

    assert.ok(upcoming.html.includes("due soon"));
    assert.ok(dueToday.html.includes("due today"));
    assert.ok(late.html.includes("now overdue"));
    assert.ok(veryLate.html.includes("well past due"));

    const subjects = new Set([upcoming.subject, dueToday.subject, late.subject]);
    assert.equal(subjects.size, 3, "each stage should read differently");
  });

  test("shows a pay button only when a checkout link exists", () => {
    assert.ok(!renderPaymentReminderEmail(REMINDER).html.includes("Pay $3,000"));
    const withLink = renderPaymentReminderEmail({
      ...REMINDER,
      checkoutUrl: "https://buy.stripe.test/abc",
    });
    assert.ok(withLink.html.includes("https://buy.stripe.test/abc"));
    assert.ok(withLink.html.includes("Pay $3,000"));
  });

  test("without a pay link it tells the client how to respond", () => {
    assert.ok(renderPaymentReminderEmail(REMINDER).html.includes("reply to this email"));
  });

  test("a javascript: checkout link is dropped, not rendered", () => {
    const email = renderPaymentReminderEmail({ ...REMINDER, checkoutUrl: "javascript:alert(1)" });
    assert.ok(!email.html.includes("javascript:"));
    assert.ok(!email.html.includes("Pay $3,000"));
  });

  test("only promises files unlock when files are actually locked", () => {
    assert.ok(!renderPaymentReminderEmail(REMINDER).html.includes("unlock"));
    const gated = renderPaymentReminderEmail({ ...REMINDER, unlocksFiles: true });
    assert.ok(gated.html.includes("unlock"));
    assert.ok(gated.text.includes("unlock"));
  });

  test("always states the amount, milestone and due date", () => {
    const email = renderPaymentReminderEmail(REMINDER);
    for (const value of ["$3,000", "Visual Design", "Sep 5, 2026"]) {
      assert.ok(email.html.includes(value), `HTML missing ${value}`);
      assert.ok(email.text.includes(value), `text missing ${value}`);
    }
  });

  test("a hostile project title cannot inject markup", () => {
    const email = renderPaymentReminderEmail({
      ...REMINDER,
      projectTitle: '"><img src=x onerror=alert(1)>',
    });
    assert.ok(!email.html.includes("<img src=x"));
  });
});
