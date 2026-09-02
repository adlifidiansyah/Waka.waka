import { ExternalLink } from "lucide-react";
import type { EmbedInfo } from "@/lib/embeds";

export function EmbedFrame({ title, embed }: { title: string; embed: EmbedInfo | null }) {
  if (!embed) return null;

  return (
    <figure>
      <figcaption className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-800">{title}</span>
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900"
        >
          Open in {embed.provider}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </figcaption>

      {embed.embeddable ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg border border-ink-200 bg-ink-100">
          <iframe
            src={embed.url}
            title={title}
            loading="lazy"
            allow="fullscreen; clipboard-write"
            // Third-party content in the studio's branding: no same-origin, no
            // top-level navigation, no form posts.
            sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            className="size-full border-0"
          />
        </div>
      ) : (
        <a
          href={embed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-700 hover:border-ink-300"
        >
          <span className="truncate">{embed.host}</span>
          <ExternalLink className="size-4 shrink-0 text-ink-400" aria-hidden />
        </a>
      )}
    </figure>
  );
}
