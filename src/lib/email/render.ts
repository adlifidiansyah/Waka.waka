/**
 * Email rendering.
 *
 * Kept free of `server-only` and of any network import so the escaping and
 * template logic is unit-testable. Everything interpolated into the HTML below
 * is user-controlled — a studio name, a project title, a client's name — so it
 * all goes through `escapeHtml`. An email client is a HTML renderer pointed at
 * content the recipient did not write; treating it more loosely than a web page
 * would be a mistake.
 */

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Brand colours arrive from `organizations.brand_color`, which the database
 * constrains to `#rrggbb`. This is the second gate: anything else falls back
 * rather than being written into a `style` attribute.
 */
export function safeHexColor(value: string | null | undefined, fallback = "#4f46e5") {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/**
 * Only absolute https URLs are ever placed in an `href` or `src`. Guards
 * against a `javascript:` logo URL turning a branded email into a payload.
 */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function readableTextOn(hexColor: string): "#ffffff" | "#0f172a" {
  const hex = safeHexColor(hexColor).slice(1);
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? "#0f172a" : "#ffffff";
}

/** Branding shared by every template, taken from the sending organization. */
export interface EmailBrand {
  studioName: string;
  brandColor: string;
  logoUrl?: string | null;
  showBadge: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

interface ShellInput {
  brand: EmailBrand;
  subject: string;
  /** Inbox preview line. Shown next to the subject, never in the body. */
  preheader: string;
  heading: string;
  /** Pre-escaped HTML for the body. Callers escape their own interpolations. */
  bodyHtml: string;
  /** Full-width pre-escaped rows between the body and the CTA, e.g. a quoted note. */
  asideHtml?: string;
  cta?: { label: string; url: string } | null;
  /** Pre-escaped HTML for the small print under the divider. */
  footerHtml?: string;
}

function renderShell(input: ShellInput): string {
  const brandColor = safeHexColor(input.brand.brandColor);
  const onBrand = readableTextOn(brandColor);
  const logo = safeHttpsUrl(input.brand.logoUrl);
  const studio = escapeHtml(input.brand.studioName);

  const header = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(input.brand.studioName)}" width="40" height="40"
         style="display:block;border:0;border-radius:8px;" />`
    : `<div style="width:40px;height:40px;border-radius:8px;background:${brandColor};color:${onBrand};
         font:600 16px/40px -apple-system,Segoe UI,sans-serif;text-align:center;">${escapeHtml(
           input.brand.studioName.slice(0, 1).toUpperCase(),
         )}</div>`;

  const cta = input.cta
    ? `<tr><td style="padding:0 32px 24px;">
         <a href="${escapeHtml(input.cta.url)}"
            style="display:inline-block;background:${brandColor};color:${onBrand};text-decoration:none;
                   font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
           ${escapeHtml(input.cta.label)}
         </a>
       </td></tr>`
    : "";

  const badge = input.brand.showBadge
    ? `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Powered by ClientDeck</p>`
    : "";

  const footer =
    input.footerHtml || badge
      ? `<tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;">
           ${input.footerHtml ?? ""}${badge}
         </td></tr>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:28px 32px 20px;">${header}
        <p style="margin:14px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${studio}</p>
      </td></tr>

      <tr><td style="padding:0 32px 8px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0f172a;">${escapeHtml(
          input.heading,
        )}</h1>
        ${input.bodyHtml}
      </td></tr>

      ${input.asideHtml ?? ""}
      ${cta}
      ${footer}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A quoted note, used wherever a person's free text is shown. */
function quoteBlock(text: string, brandColor: string) {
  return `<tr><td style="padding:0 32px 24px;">
      <div style="border-left:3px solid ${safeHexColor(
        brandColor,
      )};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap;">${escapeHtml(
        text,
      )}</div>
    </td></tr>`;
}

const P = 'margin:0 0 16px;font-size:15px;line-height:1.6;color:#475569;';
const SMALL = 'margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;';

// ---------------------------------------------------------------------------
// 1. Portal link — sent when a client link is created
// ---------------------------------------------------------------------------

export interface PortalLinkEmailInput {
  brand: EmailBrand;
  clientName: string;
  projectTitle: string;
  portalUrl: string;
  /** Human-readable expiry, e.g. "Sep 30, 2026". Omitted when it never expires. */
  expiresOn?: string | null;
  /** Optional note the freelancer typed alongside the link. */
  message?: string | null;
}

export function renderPortalLinkEmail(input: PortalLinkEmailInput): RenderedEmail {
  const portalUrl = requirePortalUrl(input.portalUrl);
  const subject = `${input.brand.studioName}: your portal for ${input.projectTitle}`;
  const client = firstName(input.clientName);

  const body = `
    <p style="${P}">
      ${escapeHtml(input.brand.studioName)} set up a single page for
      <strong style="color:#0f172a;">${escapeHtml(input.projectTitle)}</strong>.
      It shows where the project stands, the work waiting on your review, and anything
      ready for you to download. No account or password needed.
    </p>`;

  const note = input.message?.trim() ? quoteBlock(input.message.trim(), input.brand.brandColor) : "";

  const footerHtml = `
    ${
      input.expiresOn
        ? `<p style="${SMALL}">This link stops working on ${escapeHtml(input.expiresOn)}.</p>`
        : ""
    }
    <p style="${SMALL}">
      This link is private to you — anyone who has it can see the project, so please
      don't forward it.
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
      If the button doesn't work, paste this into your browser:<br />${escapeHtml(portalUrl)}
    </p>`;

  return {
    subject,
    html: renderShell({
      brand: input.brand,
      subject,
      preheader: `Your project portal for ${input.projectTitle} — milestones, files and approvals in one place.`,
      heading: client ? `Hi ${client}, your project portal is ready` : "Your project portal is ready",
      bodyHtml: body,
      asideHtml: note,
      cta: { label: "Open your project portal", url: portalUrl },
      footerHtml,
    }),
    text: [
      client ? `Hi ${client},` : "Hello,",
      "",
      `${input.brand.studioName} set up a single page for "${input.projectTitle}".`,
      "It shows where the project stands, what's waiting on your review, and anything",
      "ready to download. No account or password needed.",
      ...(input.message?.trim() ? ["", input.message.trim()] : []),
      "",
      "Open your project portal:",
      portalUrl,
      "",
      ...(input.expiresOn ? [`This link stops working on ${input.expiresOn}.`, ""] : []),
      "This link is private to you — anyone who has it can see the project, so please",
      "don't forward it.",
      ...(input.brand.showBadge ? ["", "Powered by ClientDeck"] : []),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// 2. Approval receipt — sent to the client after they sign off
// ---------------------------------------------------------------------------

export interface ApprovalReceiptEmailInput {
  brand: EmailBrand;
  clientName: string;
  projectTitle: string;
  milestoneTitle: string;
  /** Rendered timestamp of the sign-off, e.g. "Sep 2, 2026, 09:14 AM". */
  approvedAt: string;
  /** Name typed into the sign-off box. */
  signedBy: string;
  ipAddress?: string | null;
  /** The next milestone's title, when there is one. */
  nextMilestoneTitle?: string | null;
}

/**
 * Deliberately carries no portal link. Only the hash of a magic-link token is
 * stored, so linking here would mean minting a fresh live token for every
 * receipt. The client already has their link; this email is the record.
 */
export function renderApprovalReceiptEmail(input: ApprovalReceiptEmailInput): RenderedEmail {
  const subject = `${input.brand.studioName}: you approved ${input.milestoneTitle}`;
  const client = firstName(input.clientName);

  const body = `
    <p style="${P}">
      Thanks — your approval of
      <strong style="color:#0f172a;">${escapeHtml(input.milestoneTitle)}</strong>
      on ${escapeHtml(input.projectTitle)} is recorded. Keep this email as your receipt.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
      ${receiptRow("Milestone", input.milestoneTitle)}
      ${receiptRow("Project", input.projectTitle)}
      ${receiptRow("Approved by", input.signedBy)}
      ${receiptRow("Date", input.approvedAt)}
      ${input.ipAddress ? receiptRow("From IP", input.ipAddress) : ""}
    </table>
    <p style="${P}">
      ${
        input.nextMilestoneTitle
          ? `Next up is <strong style="color:#0f172a;">${escapeHtml(
              input.nextMilestoneTitle,
            )}</strong>. We'll let you know when it's ready for you.`
          : "That's the last step on the plan — we'll be in touch about wrapping up."
      }
    </p>`;

  const footerHtml = `
    <p style="${SMALL}">
      You can see the full history any time from your project portal — use the link
      ${escapeHtml(input.brand.studioName)} sent you.
    </p>`;

  return {
    subject,
    html: renderShell({
      brand: input.brand,
      subject,
      preheader: `Your approval of ${input.milestoneTitle} is recorded.`,
      heading: client ? `Thanks ${client} — that's signed off` : "That's signed off",
      bodyHtml: body,
      cta: null,
      footerHtml,
    }),
    text: [
      client ? `Hi ${client},` : "Hello,",
      "",
      `Your approval of "${input.milestoneTitle}" on ${input.projectTitle} is recorded.`,
      "Keep this email as your receipt.",
      "",
      `Milestone:   ${input.milestoneTitle}`,
      `Project:     ${input.projectTitle}`,
      `Approved by: ${input.signedBy}`,
      `Date:        ${input.approvedAt}`,
      ...(input.ipAddress ? [`From IP:     ${input.ipAddress}`] : []),
      "",
      input.nextMilestoneTitle
        ? `Next up is "${input.nextMilestoneTitle}". We'll let you know when it's ready for you.`
        : "That's the last step on the plan — we'll be in touch about wrapping up.",
      "",
      `You can see the full history any time from your project portal — use the link ${input.brand.studioName} sent you.`,
      ...(input.brand.showBadge ? ["", "Powered by ClientDeck"] : []),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// 3. Approval notification — sent to the freelancer
// ---------------------------------------------------------------------------

export interface ApprovalNotificationEmailInput {
  brand: EmailBrand;
  clientName: string;
  projectTitle: string;
  milestoneTitle: string;
  approvedAt: string;
  signedBy: string;
  /** Dashboard URL for the project. The freelancer signs in, so this is safe. */
  dashboardUrl: string;
  /** Set when the milestone's invoice is still outstanding. */
  outstandingAmount?: string | null;
}

export function renderApprovalNotificationEmail(
  input: ApprovalNotificationEmailInput,
): RenderedEmail {
  const subject = `${input.clientName} approved ${input.milestoneTitle}`;
  const dashboardUrl = requireHttpsOrLocalhost(input.dashboardUrl);

  const body = `
    <p style="${P}">
      <strong style="color:#0f172a;">${escapeHtml(input.signedBy)}</strong> signed off
      <strong style="color:#0f172a;">${escapeHtml(input.milestoneTitle)}</strong>
      on ${escapeHtml(input.projectTitle)} at ${escapeHtml(input.approvedAt)}.
      It's on the audit trail.
    </p>
    ${
      input.outstandingAmount
        ? `<p style="${P}">The invoice for this milestone is still showing
             <strong style="color:#0f172a;">${escapeHtml(
               input.outstandingAmount,
             )}</strong> outstanding.</p>`
        : ""
    }`;

  return {
    subject,
    html: renderShell({
      brand: input.brand,
      subject,
      preheader: `${input.signedBy} approved ${input.milestoneTitle} on ${input.projectTitle}.`,
      heading: `${firstName(input.clientName) || "Your client"} approved a milestone`,
      bodyHtml: body,
      cta: { label: "Open the project", url: dashboardUrl },
    }),
    text: [
      `${input.signedBy} signed off "${input.milestoneTitle}" on ${input.projectTitle}`,
      `at ${input.approvedAt}. It's on the audit trail.`,
      ...(input.outstandingAmount
        ? ["", `The invoice for this milestone is still showing ${input.outstandingAmount} outstanding.`]
        : []),
      "",
      "Open the project:",
      dashboardUrl,
    ].join("\n"),
  };
}

// ---------------------------------------------------------------------------
// 4. Payment reminder — sent to the client for an unpaid invoice
// ---------------------------------------------------------------------------

export interface PaymentReminderEmailInput {
  brand: EmailBrand;
  clientName: string;
  projectTitle: string;
  milestoneTitle: string;
  /** Formatted amount, e.g. "$3,000". */
  amount: string;
  /** Rendered due date, e.g. "Sep 5, 2026". */
  dueDate: string;
  /**
   * Negative = days until due, 0 = due today, positive = days overdue. Drives
   * the tone, which firms up as an invoice ages.
   */
  daysOverdue: number;
  /** Stripe Payment Link or Midtrans Snap link, when the freelancer set one. */
  checkoutUrl?: string | null;
  /** True when settling this invoice releases gated files. */
  unlocksFiles: boolean;
}

export function renderPaymentReminderEmail(input: PaymentReminderEmailInput): RenderedEmail {
  const client = firstName(input.clientName);
  const checkoutUrl = safeHttpsUrl(input.checkoutUrl);
  const tone = reminderTone(input.daysOverdue);

  const subject =
    input.daysOverdue > 0
      ? `Overdue: ${input.amount} for ${input.projectTitle}`
      : `${input.amount} due ${
          input.daysOverdue === 0 ? "today" : `on ${input.dueDate}`
        } for ${input.projectTitle}`;

  const body = `
    <p style="${P}">${tone.opening(
      escapeHtml(input.amount),
      escapeHtml(input.milestoneTitle),
      escapeHtml(input.projectTitle),
      escapeHtml(input.dueDate),
    )}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
      style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
      ${receiptRow("Amount due", input.amount)}
      ${receiptRow("For", input.milestoneTitle)}
      ${receiptRow("Due", input.dueDate)}
    </table>
    ${
      input.unlocksFiles
        ? `<p style="${P}">The files for this milestone unlock as soon as it's settled.</p>`
        : ""
    }`;

  const footerHtml = `
    <p style="${SMALL}">
      ${
        checkoutUrl
          ? "If you've already paid, thanks — you can ignore this."
          : `If you've already paid, thanks — you can ignore this. Otherwise reply to this email and ${escapeHtml(
              input.brand.studioName,
            )} will sort out the details with you.`
      }
    </p>`;

  return {
    subject,
    html: renderShell({
      brand: input.brand,
      subject,
      preheader: `${input.amount} for ${input.milestoneTitle} — due ${input.dueDate}.`,
      heading: tone.heading(input.amount),
      bodyHtml: body,
      cta: checkoutUrl ? { label: `Pay ${input.amount}`, url: checkoutUrl } : null,
      footerHtml,
    }),
    text: [
      client ? `Hi ${client},` : "Hello,",
      "",
      tone.openingText(input.amount, input.milestoneTitle, input.projectTitle, input.dueDate),
      "",
      `Amount due: ${input.amount}`,
      `For:        ${input.milestoneTitle}`,
      `Due:        ${input.dueDate}`,
      ...(input.unlocksFiles
        ? ["", "The files for this milestone unlock as soon as it's settled."]
        : []),
      ...(checkoutUrl ? ["", "Pay online:", checkoutUrl] : []),
      "",
      "If you've already paid, thanks — you can ignore this.",
      ...(input.brand.showBadge ? ["", "Powered by ClientDeck"] : []),
    ].join("\n"),
  };
}

/**
 * Tone ladder. A reminder that reads identically on day -3 and day +14 either
 * nags people who are early or lets go of people who are late; neither helps
 * the freelancer get paid.
 */
function reminderTone(daysOverdue: number) {
  if (daysOverdue < 0) {
    return {
      heading: (amount: string) => `${amount} is due soon`,
      opening: (amount: string, milestone: string, project: string, due: string) =>
        `A quick heads-up: the invoice for <strong style="color:#0f172a;">${milestone}</strong> on ${project} — ${amount} — is due on ${due}.`,
      openingText: (amount: string, milestone: string, project: string, due: string) =>
        `A quick heads-up: the invoice for "${milestone}" on ${project} — ${amount} — is due on ${due}.`,
    };
  }
  if (daysOverdue === 0) {
    return {
      heading: (amount: string) => `${amount} is due today`,
      opening: (amount: string, milestone: string, project: string) =>
        `The invoice for <strong style="color:#0f172a;">${milestone}</strong> on ${project} — ${amount} — is due today.`,
      openingText: (amount: string, milestone: string, project: string) =>
        `The invoice for "${milestone}" on ${project} — ${amount} — is due today.`,
    };
  }
  if (daysOverdue <= 7) {
    return {
      heading: (amount: string) => `${amount} is now overdue`,
      opening: (amount: string, milestone: string, project: string, due: string) =>
        `The invoice for <strong style="color:#0f172a;">${milestone}</strong> on ${project} — ${amount} — was due on ${due} and is still showing as unpaid.`,
      openingText: (amount: string, milestone: string, project: string, due: string) =>
        `The invoice for "${milestone}" on ${project} — ${amount} — was due on ${due} and is still showing as unpaid.`,
    };
  }
  return {
    heading: (amount: string) => `${amount} is well past due`,
    opening: (amount: string, milestone: string, project: string, due: string) =>
      `The invoice for <strong style="color:#0f172a;">${milestone}</strong> on ${project} — ${amount} — was due on ${due} and remains unpaid. Could you let us know when to expect it?`,
    openingText: (amount: string, milestone: string, project: string, due: string) =>
      `The invoice for "${milestone}" on ${project} — ${amount} — was due on ${due} and remains unpaid. Could you let us know when to expect it?`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function receiptRow(label: string, value: string) {
  return `<tr>
    <td style="padding:10px 14px;font-size:13px;color:#64748b;white-space:nowrap;">${escapeHtml(
      label,
    )}</td>
    <td style="padding:10px 14px;font-size:13px;color:#0f172a;text-align:right;">${escapeHtml(
      value,
    )}</td>
  </tr>`;
}

/** Local development serves the portal over http; production must be https. */
function requireHttpsOrLocalhost(value: string) {
  const https = safeHttpsUrl(value);
  if (https) return https;
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "http:" && local) return parsed.toString();
  } catch {
    /* fall through */
  }
  throw new Error(
    "Refusing to email a link that is not https. Set NEXT_PUBLIC_APP_URL to your real origin.",
  );
}

const requirePortalUrl = requireHttpsOrLocalhost;

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}
