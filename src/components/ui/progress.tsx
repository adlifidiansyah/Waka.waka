import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  total,
  className,
  brand = false,
}: {
  value: number;
  total: number;
  className?: string;
  brand?: boolean;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-ink-200", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${value} of ${total} milestones approved`}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          brand ? "bg-[var(--portal-brand)]" : "bg-ink-900",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
