"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, Trash2 } from "lucide-react";
import { createClientLink, revokeClientLink } from "@/actions/client-links";
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDateTime } from "@/lib/utils";
import type { ActionState } from "@/actions/types";
import type { ClientAccessToken } from "@/lib/database.types";

/** Expiry is decided on the server so render stays pure. */
export type TokenRow = Omit<ClientAccessToken, "token_hash"> & { expired: boolean };

const INITIAL: ActionState = {};

export function ClientLinkPanel({
  projectId,
  tokens,
}: {
  projectId: string;
  tokens: TokenRow[];
}) {
  const [createState, createAction] = useActionState(createClientLink, INITIAL);
  const [revokeState, revokeAction] = useActionState(revokeClientLink, INITIAL);
  const [copied, setCopied] = useState(false);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the input below is selectable as a fallback.
    }
  }

  const active = tokens.filter((t) => !t.revoked_at);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Client links</CardTitle>
          <CardDescription>
            One magic link per client. No password on their end — revoke it any time.
          </CardDescription>
        </div>
        <Badge tone={active.length ? "success" : "neutral"}>
          {active.length} active
        </Badge>
      </CardHeader>

      <CardBody className="space-y-4">
        {createState.createdLink ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">
              Copy this link now — it isn&apos;t shown again.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                readOnly
                value={createState.createdLink}
                onFocus={(event) => event.currentTarget.select()}
                className="input flex-1 bg-white font-mono text-xs"
                aria-label="Client portal link"
              />
              <Button variant="secondary" onClick={() => copyLink(createState.createdLink!)}>
                {copied ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <Copy className="size-4" aria-hidden />
                )}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        ) : null}

        {tokens.length > 0 ? (
          <ul className="divide-y divide-ink-200 rounded-lg border border-ink-200">
            {tokens.map((token) => {
              return (
                <li key={token.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink-900">
                      <Link2 className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                      <span className="truncate">{token.label}</span>
                      {token.revoked_at ? (
                        <Badge tone="danger">Revoked</Badge>
                      ) : token.expired ? (
                        <Badge tone="warning">Expired</Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {token.client_email ? `${token.client_email} · ` : ""}
                      Last opened {formatDateTime(token.last_used_at)}
                      {token.expires_at ? ` · Expires ${formatDateTime(token.expires_at)}` : ""}
                    </p>
                  </div>
                  {token.revoked_at ? null : (
                    <form action={revokeAction}>
                      <input type="hidden" name="projectId" value={projectId} />
                      <input type="hidden" name="tokenId" value={token.id} />
                      <SubmitButton variant="ghost" size="sm">
                        <Trash2 className="size-3.5" aria-hidden />
                        Revoke
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        <FormMessage error={createState.error ?? revokeState.error} success={revokeState.success} />

        <form action={createAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto]">
          <input type="hidden" name="projectId" value={projectId} />
          <input
            name="label"
            className="input"
            placeholder="Link label (e.g. Maya — main link)"
            defaultValue="Client link"
            maxLength={120}
          />
          <input
            name="clientEmail"
            type="email"
            className="input"
            placeholder="Client email (optional)"
          />
          <select name="expiresInDays" className="input" defaultValue="0">
            <option value="0">Never expires</option>
            <option value="7">Expires in 7 days</option>
            <option value="30">Expires in 30 days</option>
            <option value="90">Expires in 90 days</option>
          </select>
          <SubmitButton>Create link</SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}
