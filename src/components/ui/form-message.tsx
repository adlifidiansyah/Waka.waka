import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * `warning` is for partial success — the main action worked, something
 * secondary did not. It renders alongside `success` rather than replacing it,
 * so nobody is told to retry work that already landed.
 */
export function FormMessage({
  error,
  success,
  warning,
  className,
}: {
  error?: string | null;
  success?: string | null;
  warning?: string | null;
  className?: string;
}) {
  if (!error && !success && !warning) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
      {success ? (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{success}</span>
        </p>
      ) : null}
      {warning ? (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{warning}</span>
        </p>
      ) : null}
    </div>
  );
}
