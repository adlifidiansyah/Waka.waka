import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/plans";
import type { PlanTier } from "@/lib/database.types";

export function UpgradeNotice({
  notice,
}: {
  notice: { title: string; body: string; suggested: PlanTier };
}) {
  const suggested = PLANS[notice.suggested];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-ink-900">{notice.title}</p>
          <p className="mt-1 max-w-xl text-sm text-ink-600">{notice.body}</p>
        </div>
      </div>
      <Link href="/dashboard/settings#plan" className="shrink-0">
        <Button>
          Upgrade to {suggested.name} — ${suggested.priceUsdPerMonth}/mo
        </Button>
      </Link>
    </div>
  );
}
