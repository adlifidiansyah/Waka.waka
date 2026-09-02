/**
 * Embed Frame support.
 *
 * Only a known set of hosts is turned into an <iframe>; anything else renders
 * as a plain outbound link. A client portal is a page a stranger's URL can end
 * up on, and framing arbitrary origins is how you get a convincing phishing
 * surface inside someone else's branding.
 */
const EMBEDDABLE_HOSTS: Array<{ suffix: string; label: string }> = [
  { suffix: "figma.com", label: "Figma" },
  { suffix: "loom.com", label: "Loom" },
  { suffix: "youtube.com", label: "YouTube" },
  { suffix: "youtu.be", label: "YouTube" },
  { suffix: "vimeo.com", label: "Vimeo" },
  { suffix: "vercel.app", label: "Preview deploy" },
  { suffix: "netlify.app", label: "Preview deploy" },
];

export interface EmbedInfo {
  embeddable: boolean;
  url: string;
  provider: string;
  host: string;
}

export function describeEmbed(rawUrl: string | null | undefined): EmbedInfo | null {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Anything that is not https is dropped entirely rather than rendered as a
  // link: `javascript:` and `data:` URLs must never become a clickable anchor
  // inside the studio's own branding. The dashboard already rejects non-https
  // at creation time, so this is the second gate rather than the only one.
  if (parsed.protocol !== "https:") return null;

  const match = EMBEDDABLE_HOSTS.find(
    ({ suffix }) => parsed.hostname === suffix || parsed.hostname.endsWith(`.${suffix}`),
  );

  return {
    embeddable: Boolean(match),
    url: normaliseEmbedUrl(parsed),
    provider: match?.label ?? "Link",
    host: parsed.host,
  };
}

/** Turns share URLs into their embeddable equivalents where the host has one. */
function normaliseEmbedUrl(parsed: URL): string {
  const host = parsed.hostname.replace(/^www\./, "");

  if (host === "loom.com" && parsed.pathname.startsWith("/share/")) {
    return `https://www.loom.com/embed/${parsed.pathname.replace("/share/", "")}`;
  }
  if (host === "youtube.com" && parsed.searchParams.get("v")) {
    return `https://www.youtube.com/embed/${parsed.searchParams.get("v")}`;
  }
  if (host === "youtu.be") {
    return `https://www.youtube.com/embed${parsed.pathname}`;
  }
  if (host === "figma.com" && !parsed.pathname.startsWith("/embed")) {
    return `https://www.figma.com/embed?embed_host=clientdeck&url=${encodeURIComponent(parsed.toString())}`;
  }
  return parsed.toString();
}
