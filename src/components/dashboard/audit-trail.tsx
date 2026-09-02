import { ScrollText } from "lucide-react";
import { Card, CardBody, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import type { ActorType, AuditLog } from "@/lib/database.types";

const ACTOR_TONE: Record<ActorType, "info" | "success" | "neutral"> = {
  client: "success",
  freelancer: "info",
  system: "neutral",
};

export function AuditTrail({ entries }: { entries: AuditLog[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sign-off trail</CardTitle>
          <CardDescription>
            Every approval, payment and file change, stamped with who and when. Append-only.
          </CardDescription>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        {entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText className="size-7" aria-hidden />}
            title="Nothing logged yet"
            body="Activity shows up here as soon as you or your client do something on this project."
          />
        ) : (
          <ol className="divide-y divide-ink-200">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3">
                <Badge tone={ACTOR_TONE[entry.actor_type]}>{entry.actor_type}</Badge>
                <span className="text-sm text-ink-900">{entry.action}</span>
                <span className="ml-auto whitespace-nowrap text-xs text-ink-400">
                  {formatDateTime(entry.created_at)}
                </span>
                {entry.actor_email ? (
                  <span className="w-full text-xs text-ink-400">
                    {entry.actor_email}
                    {entry.ip_address ? ` · ${entry.ip_address}` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
