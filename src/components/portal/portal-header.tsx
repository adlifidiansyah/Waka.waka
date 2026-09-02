/* eslint-disable @next/next/no-img-element */
import type { Organization, Project } from "@/lib/database.types";

export function PortalHeader({
  organization,
  project,
}: {
  organization: Organization;
  project: Project;
}) {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-5">
        {organization.logo_url ? (
          // Freelancer-supplied logo from an arbitrary host, so not next/image.
          <img
            src={organization.logo_url}
            alt=""
            className="size-9 rounded-lg object-contain"
            width={36}
            height={36}
          />
        ) : (
          <span
            className="grid size-9 place-items-center rounded-lg text-sm font-semibold"
            style={{
              backgroundColor: "var(--portal-brand)",
              color: "var(--portal-brand-contrast)",
            }}
            aria-hidden
          >
            {organization.name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{organization.name}</p>
          <p className="truncate text-xs text-ink-500">{project.title}</p>
        </div>
      </div>
    </header>
  );
}
