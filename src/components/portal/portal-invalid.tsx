import { LinkIcon, ShieldAlert } from "lucide-react";

const COPY: Record<string, { title: string; body: string }> = {
  not_found: {
    title: "This link doesn't work",
    body: "It may have been mistyped, or the project it pointed to was removed. Ask whoever sent it for a fresh link.",
  },
  revoked: {
    title: "This link has been turned off",
    body: "The studio revoked it. That usually means a new link was issued — check your email for the latest one.",
  },
  expired: {
    title: "This link has expired",
    body: "Portal links can be set to expire. Ask the studio to send you a new one — it takes them a few seconds.",
  },
};

export function PortalInvalid({ reason }: { reason: "not_found" | "revoked" | "expired" }) {
  const copy = COPY[reason] ?? COPY.not_found!;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ink-50 px-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-ink-100 text-ink-500">
          {reason === "not_found" ? (
            <LinkIcon className="size-5" aria-hidden />
          ) : (
            <ShieldAlert className="size-5" aria-hidden />
          )}
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{copy.body}</p>
      </div>
    </main>
  );
}
