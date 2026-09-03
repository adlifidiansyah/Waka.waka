-- Transactional email delivery state.
--
-- Only the hash of a magic-link token is stored, so a link cannot be re-sent —
-- it can only be re-issued. That makes "was this link actually delivered?" a
-- question the freelancer genuinely needs answered in the UI, rather than
-- something they can work around by looking the link up again.

alter table public.client_access_tokens
  add column emailed_at timestamptz,
  add column emailed_to text,
  add column email_provider_id text;

comment on column public.client_access_tokens.emailed_at is
  'When ClientDeck last sent this link by email. Null means it was copied by hand.';
comment on column public.client_access_tokens.emailed_to is
  'Recipient of that email, recorded separately from client_email so a later edit does not rewrite delivery history.';
comment on column public.client_access_tokens.email_provider_id is
  'Provider message id, for tracing a delivery in the Resend dashboard.';
