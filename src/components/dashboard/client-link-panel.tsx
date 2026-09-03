"use client";

import { useActionState, useState } from "react";
import { Check, Copy, Link2, Mail, MailCheck, Trash2 } from "lucide-react";
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
  emailConfigured,
  clientEmail,
}: {
  projectId: string;
  tokens: TokenRow[];
  emailConfigured: boolean;
  clientEmail: string;
}) {
  const [createState, createAction] = useActionState(createClientLink, INITIAL);
  const [revokeState, revokeAction] = useActionState(revokeClientLink, INITIAL);
  const [copied, setCopied] = useState(false);
  const [sendByEmail, setSendByEmail] = useState(emailConfigured);

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
        <Badge tone={active.length ? "success" : "neutral"}>{active.length} active</Badge>
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
            {tokens.map((token) => (
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
                    {token.emailed_at ? (
                      <Badge tone="info">
                        <MailCheck className="size-3" aria-hidden />
                        Emailed
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {token.emailed_at
                      ? `Sent to ${token.emailed_to} ${formatDateTime(token.emailed_at)} · `
                      : token.client_email
                        ? `${token.client_email} · `
                        : ""}
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
            ))}
          </ul>
        ) : null}

        {/* Each form renders its own result: the two useActionState hooks keep
            their last value independently, so sharing one slot would let a
            stale message from the other action shadow the current one. */}
        <FormMessage error={revokeState.error} success={revokeState.success} />

        <form action={createAction} className="space-y-3 rounded-lg border border-dashed border-ink-300 p-4">
          <input type="hidden" name="projectId" value={projectId} />

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px]">
            <input
              name="label"
              className="input"
              placeholder="Link label (e.g. Maya — main link)"
              defaultValue="Client link"
              maxLength={120}
              aria-label="Link label"
            />
            <input
              name="clientEmail"
              type="email"
              className="input"
              placeholder={clientEmail || "Client email"}
              defaultValue={clientEmail}
              aria-label="Client email"
            />
            <select name="expiresInDays" className="input" defaultValue="0" aria-label="Expiry">
              <option value="0">Never expires</option>
              <option value="7">Expires in 7 days</option>
              <option value="30">Expires in 30 days</option>
              <option value="90">Expires in 90 days</option>
            </select>
          </div>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              name="sendEmail"
              className="mt-0.5 size-4 rounded border-ink-300"
              checked={sendByEmail}
              onChange={(event) => setSendByEmail(event.target.checked)}
              disabled={!emailConfigured}
            />
            <span>
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-900">
                <Mail className="size-3.5" aria-hidden />
                Email this link to the client
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {emailConfigured
                  ? "Sends a branded email from your studio. Replies come back to you."
                  : "Email isn't set up on this deployment — add RESEND_API_KEY and RESEND_FROM_EMAIL to enable it."}
              </span>
            </span>
          </label>

          {sendByEmail ? (
            <textarea
              name="message"
              rows={2}
              maxLength={1000}
              className="input resize-y"
              placeholder="Optional note to include, in your own words."
              aria-label="Note to include in the email"
            />
          ) : null}

          <FormMessage
            error={createState.error}
            success={createState.success}
            warning={createState.warning}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-ink-400">
              Links can&apos;t be re-sent — only the hash is stored. Issue a new one instead.
            </p>
            <SubmitButton>{sendByEmail ? "Create & send" : "Create link"}</SubmitButton>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
