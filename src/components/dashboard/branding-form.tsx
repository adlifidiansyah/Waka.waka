"use client";

import { useActionState, useState } from "react";
import { updateBranding } from "@/actions/organization";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLANS } from "@/lib/plans";
import { readableTextOn } from "@/lib/utils";
import type { ActionState } from "@/actions/types";
import type { Organization } from "@/lib/database.types";

const INITIAL: ActionState = {};

export function BrandingForm({ organization }: { organization: Organization }) {
  const [state, formAction] = useActionState(updateBranding, INITIAL);
  const [color, setColor] = useState(organization.brand_color);
  const plan = PLANS[organization.plan];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Branding</CardTitle>
          <CardDescription>
            Your client sees this, not ours — as far as their plan allows.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody>
        <form action={formAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="name">
              Studio name
            </label>
            <input
              id="name"
              name="name"
              className="input mt-1"
              defaultValue={organization.name}
              maxLength={120}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="brandColor">
                Brand colour
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="brandColor"
                  name="brandColor"
                  type="color"
                  className="h-10 w-14 cursor-pointer rounded-lg border border-ink-300 bg-white p-1"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
                <span
                  className="flex h-10 flex-1 items-center justify-center rounded-lg text-sm font-medium"
                  style={{ backgroundColor: color, color: readableTextOn(color) }}
                >
                  Approve &amp; next
                </span>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="logoUrl">
                Logo URL <span className="font-normal text-ink-400">(optional)</span>
              </label>
              <input
                id="logoUrl"
                name="logoUrl"
                type="url"
                className="input mt-1"
                placeholder="https://…/logo.png"
                defaultValue={organization.logo_url ?? ""}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="customDomain">
              Custom domain
              {plan.canUseCustomDomain ? null : (
                <span className="ml-1 font-normal text-ink-400">— Agency plan</span>
              )}
            </label>
            <input
              id="customDomain"
              name="customDomain"
              className="input mt-1"
              placeholder="portal.your-agency.com"
              defaultValue={organization.custom_domain ?? ""}
              disabled={!plan.canUseCustomDomain}
            />
            <p className="mt-1 text-xs text-ink-400">
              Point a CNAME at your ClientDeck deployment, then set it here.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-3">
            <input
              type="checkbox"
              name="badgeEnabled"
              defaultChecked={organization.badge_enabled}
              disabled={!plan.canRemoveBadge}
              className="mt-0.5 size-4 rounded border-ink-300"
            />
            <span className="text-sm">
              <span className="font-medium text-ink-900">
                Show the &ldquo;Powered by ClientDeck&rdquo; badge
              </span>
              <span className="mt-0.5 block text-ink-500">
                {plan.canRemoveBadge
                  ? "Untick to run the portal fully white-label."
                  : `Removing the badge needs the Pro plan. You're on ${plan.name}.`}
              </span>
            </span>
          </label>

          <FormMessage error={state.error} success={state.success} />
          <SubmitButton>Save branding</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
