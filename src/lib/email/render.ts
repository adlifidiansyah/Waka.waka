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

export interface PortalLinkEmailInput {
  clientName: string;
  studioName: string;
  projectTitle: string;
  portalUrl: string;
  brandColor: string;
  logoUrl?: string | null;
  /** Human-readable expiry, e.g. "30 September 2026". Omitted when it never expires. */
  expiresOn?: string | null;
  /** Optional note the freelancer typed alongside the link. */
  message?: string | null;
  showBadge: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderPortalLinkEmail(input: PortalLinkEmailInput): RenderedEmail {
  const brand = safeHexColor(input.brandColor);
  const onBrand = readableTextOn(brand);
  const logo = safeHttpsUrl(input.logoUrl);
  const portalUrl = safeHttpsUrl(input.portalUrl) ?? httpLocalhostOnly(input.portalUrl);

  const studio = escapeHtml(input.studioName);
  const project = escapeHtml(input.projectTitle);
  const client = escapeHtml(firstName(input.clientName));

  const subject = `${input.studioName}: your portal for ${input.projectTitle}`;

  const expiryLine = input.expiresOn
    ? `<p style="margin:0 0 8px;font-size:13px;color:#64748b;">This link stops working on ${escapeHtml(
        input.expiresOn,
      )}.</p>`
    : "";

  const note = input.message?.trim()
    ? `<tr><td style="padding:0 32px 24px;">
         <div style="border-left:3px solid ${brand};padding:2px 0 2px 14px;font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap;">${escapeHtml(
           input.message.trim(),
         )}</div>
       </td></tr>`
    : "";

  const header = logo
    ? `<img src="${escapeAttr(logo)}" alt="${escapeAttr(input.studioName)}" width="40" height="40"
         style="display:block;border:0;border-radius:8px;" />`
    : `<div style="width:40px;height:40px;border-radius:8px;background:${brand};color:${onBrand};
         font:600 16px/40px -apple-system,Segoe UI,sans-serif;text-align:center;">${escapeHtml(
           input.studioName.slice(0, 1).toUpperCase(),
         )}</div>`;

  const badge = input.showBadge
    ? `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Powered by ClientDeck</p>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${subject ? escapeHtml(subject) : ""}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  Your project portal for ${project} — milestones, files and approvals in one place.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
      style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr><td style="padding:28px 32px 20px;">${header}
        <p style="margin:14px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${studio}</p>
      </td></tr>

      <tr><td style="padding:0 32px 8px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;color:#0f172a;">
          ${client ? `Hi ${client}, your` : "Your"} project portal is ready
        </h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
          ${studio} set up a single page for <strong style="color:#0f172a;">${project}</strong>.
          It shows where the project stands, the work waiting on your review, and anything
          ready for you to download. No account or password needed.
        </p>
      </td></tr>

      ${note}

      <tr><td style="padding:0 32px 24px;">
        <a href="${escapeAttr(portalUrl)}"
           style="display:inline-block;background:${brand};color:${onBrand};text-decoration:none;
                  font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
          Open your project portal
        </a>
      </td></tr>

      <tr><td style="padding:20px 32px 28px;border-top:1px solid #e2e8f0;">
        ${expiryLine}
        <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
          This link is private to you — anyone who has it can see the project, so please
          don't forward it.
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;word-break:break-all;">
          If the button doesn't work, paste this into your browser:<br />
          ${escapeHtml(portalUrl)}
        </p>
        ${badge}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    client ? `Hi ${firstName(input.clientName)},` : "Hello,",
    "",
    `${input.studioName} set up a single page for "${input.projectTitle}".`,
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
    ...(input.showBadge ? ["", "Powered by ClientDeck"] : []),
  ].join("\n");

  return { subject, html, text };
}

/** Local development serves the portal over http; production must be https. */
function httpLocalhostOnly(value: string) {
  try {
    const parsed = new URL(value);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "http:" && local) return parsed.toString();
  } catch {
    /* fall through */
  }
  throw new Error(
    "Refusing to email a portal link that is not https. Set NEXT_PUBLIC_APP_URL to your real origin.",
  );
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? "";
}
