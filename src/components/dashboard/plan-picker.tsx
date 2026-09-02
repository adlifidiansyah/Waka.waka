"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { changePlan } from "@/actions/organization";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLANS, PLAN_ORDER } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/actions/types";
import type { Organization } from "@/lib/database.types";

const INITIAL: ActionState = {};

export function PlanPicker({
  organization,
  activeProjects,
}: {
  organization: Organization;
  activeProjects: number;
}) {
  const [state, formAction] = useActionState(changePlan, INITIAL);
  const current = PLANS[organization.plan];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Plan</CardTitle>
          <CardDescription>
            You&apos;re on {current.name} with {activeProjects} active project
            {activeProjects === 1 ? "" : "s"}
            {current.activeProjectLimit === null ? "" : ` of ${current.activeProjectLimit}`}.
          </CardDescription>
        </div>
        <Badge tone="info">{current.name}</Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
          Switching plans here changes entitlements directly. In production this is driven by the
          billing provider&apos;s webhook after checkout.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            const isCurrent = tier === organization.plan;
            const wouldExceed =
              plan.activeProjectLimit !== null && activeProjects > plan.activeProjectLimit;

            return (
              <form
                key={tier}
                action={formAction}
                className={cn(
                  "flex flex-col rounded-xl border p-4",
                  isCurrent ? "border-ink-900 bg-ink-50" : "border-ink-200",
                )}
              >
                <input type="hidden" name="plan" value={tier} />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink-900">{plan.name}</span>
                  <span className="text-sm text-ink-500">${plan.priceUsdPerMonth}/mo</span>
                </div>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-xs text-ink-600">
                      <Check className="mt-0.5 size-3 shrink-0 text-emerald-600" aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {isCurrent ? (
                    <Badge>Current plan</Badge>
                  ) : (
                    <SubmitButton
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled={wouldExceed}
                      title={
                        wouldExceed
                          ? `Archive projects first — ${plan.name} allows ${plan.activeProjectLimit} active.`
                          : undefined
                      }
                    >
                      {wouldExceed ? "Archive projects first" : `Switch to ${plan.name}`}
                    </SubmitButton>
                  )}
                </div>
              </form>
            );
          })}
        </div>

        <FormMessage error={state.error} success={state.success} />
      </CardBody>
    </Card>
  );
}
