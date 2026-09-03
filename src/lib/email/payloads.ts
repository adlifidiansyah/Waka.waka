import { z } from "zod";

/**
 * Queued messages store their render inputs, not rendered HTML: rows stay
 * small, and a template fix reaches anything still waiting to go out.
 *
 * The payload is written by this codebase and read back by it, but it is
 * validated on the way out anyway — a row queued before a deploy is read by
 * the code that comes after it, and a schema change should surface as a
 * permanent failure on one message rather than a crashed worker.
 */

const brandSchema = z.object({
  studioName: z.string(),
  brandColor: z.string(),
  logoUrl: z.string().nullable().optional(),
  showBadge: z.boolean(),
});

export const approvalReceiptPayload = z.object({
  brand: brandSchema,
  clientName: z.string(),
  projectTitle: z.string(),
  milestoneTitle: z.string(),
  approvedAt: z.string(),
  signedBy: z.string(),
  ipAddress: z.string().nullable().optional(),
  nextMilestoneTitle: z.string().nullable().optional(),
});

export const approvalNotificationPayload = z.object({
  brand: brandSchema,
  clientName: z.string(),
  projectTitle: z.string(),
  milestoneTitle: z.string(),
  approvedAt: z.string(),
  signedBy: z.string(),
  dashboardUrl: z.string(),
  outstandingAmount: z.string().nullable().optional(),
});

export const paymentReminderPayload = z.object({
  brand: brandSchema,
  clientName: z.string(),
  projectTitle: z.string(),
  milestoneTitle: z.string(),
  amount: z.string(),
  dueDate: z.string(),
  daysOverdue: z.number(),
  checkoutUrl: z.string().nullable().optional(),
  unlocksFiles: z.boolean(),
});

export const portalLinkPayload = z.object({
  brand: brandSchema,
  clientName: z.string(),
  projectTitle: z.string(),
  portalUrl: z.string(),
  expiresOn: z.string().nullable().optional(),
  message: z.string().nullable().optional(),
});

export const PAYLOAD_SCHEMAS = {
  approval_receipt: approvalReceiptPayload,
  approval_notification: approvalNotificationPayload,
  payment_reminder: paymentReminderPayload,
  portal_link: portalLinkPayload,
} as const;

export type EmailKind = keyof typeof PAYLOAD_SCHEMAS;
