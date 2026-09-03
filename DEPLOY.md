# Deploying ClientDeck

Two accounts are needed and both are free to start: **Supabase** (the database,
auth and file storage) and **Vercel** (the app itself). Email is optional — the
app runs fine without it and disables the send options with a note.

Budget about ten minutes.

---

## 1. Create the Supabase project

1. Sign in at <https://supabase.com/dashboard> and create a new project. Pick a
   region near your clients and save the database password somewhere.
2. Wait for it to finish provisioning (a minute or two).
3. Open **Project Settings → API** and copy three values:

   | Supabase dashboard | Environment variable |
   |---|---|
   | Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
   | `anon` / `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
   | `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

   The `service_role` key bypasses row-level security. It is a server-only
   secret: never prefix it with `NEXT_PUBLIC_`, and never paste it into
   client-side code.

## 2. Apply the schema

> Already provisioned: the live project for this repo is `clientdeck`
> (`txmvtgjwqphrassowovt`, ap-southeast-1) with all six migrations applied.
> The steps below are for setting up a fresh one.


From a clone of this repo, with the [Supabase CLI](https://supabase.com/docs/guides/cli)
installed:

```bash
supabase link --project-ref <your-project-ref>   # the ref is in your project URL
supabase db push                                  # applies supabase/migrations/*
```

`db push` applies the migrations only. To also load the demo agency, project and
working client link, run `supabase/seed.sql` in the dashboard's **SQL Editor**.
Skip the seed on anything you intend to use for real work.

Verify it worked — the SQL Editor should return eight rows:

```sql
select tablename from pg_tables where schemaname = 'public' order by 1;
```

## 3. Deploy to Vercel

1. Push this branch to GitHub if you haven't already.
2. At <https://vercel.com/new>, import the repository.
3. Add the environment variables below before the first deploy. Framework
   preset, build command and output directory are all detected automatically.

| Variable | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | From step 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | From step 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | From step 1 |
| `NEXT_PUBLIC_APP_URL` | yes | Your deployment's URL, e.g. `https://clientdeck.vercel.app` |
| `CRON_SECRET` | for reminders | `openssl rand -base64 32` |
| `RESEND_API_KEY` | for email | From <https://resend.com/api-keys> |
| `RESEND_FROM_EMAIL` | for email | `Your Studio <portal@yourdomain.com>` on a domain verified in Resend |
| `RESEND_WEBHOOK_SECRET` | for bounces | From the Resend webhook you create in step 5 |

`NEXT_PUBLIC_APP_URL` is the one people forget. It is what portal links are
built from, so if it still says `localhost` every link you send a client is
broken. Set it to the real origin and redeploy.

## 4. Point Supabase Auth at the deployment

In **Authentication → URL Configuration**:

- **Site URL**: your deployment URL
- **Redirect URLs**: add `https://your-app.vercel.app/auth/callback`

Without this, OAuth and email confirmation bounce back to localhost.

To enable GitHub or Google sign-in, add the provider under
**Authentication → Providers**. Email and password work with no extra setup.

## 5. Email (optional)

1. Verify your sending domain in Resend and create an API key.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
3. Add a webhook at <https://resend.com/webhooks> pointing at
   `https://your-app.vercel.app/api/webhooks/resend`, with `email.bounced` and
   `email.complained` enabled. Copy its signing secret into
   `RESEND_WEBHOOK_SECRET`.

Step 3 is not optional once payment reminders are running. Without it a dead
address keeps receiving the whole reminder series, which is how a sending domain
gets a bad reputation.

## 6. Payments (optional)

ClientDeck never holds funds. Create a Stripe Payment Link (or a Midtrans Snap
link) per invoice and paste it into the invoice's **Payment link** field. Then:

- Stripe: add a webhook for `checkout.session.completed` pointing at
  `/api/webhooks/stripe`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
  Set the Payment Link's `client_reference_id` to the ClientDeck invoice id.
- Midtrans: set the payment notification URL to `/api/webhooks/midtrans` and put
  your server key in `MIDTRANS_SERVER_KEY`. Use the invoice id as `order_id`.

You can also just click **Mark paid** in the dashboard after a bank transfer.

---

## Platform limits worth knowing

These are Vercel's, not the app's, and the repo is already configured around them.

**Cron frequency.** Hobby accounts are limited to *daily* cron jobs — a
per-hour schedule fails at deploy time with "Hobby accounts are limited to daily
cron jobs". `vercel.json` therefore runs `/api/cron/email` once a day at 08:00
UTC, which deploys on any plan. On Pro, change it to hourly for tighter reminder
timing:

```json
{ "crons": [{ "path": "/api/cron/email", "schedule": "0 * * * *" }] }
```

Daily is fine in practice: the reminder schedule is measured in days, and
approval receipts do not wait for it — they are pushed out immediately after the
approval request finishes.

**Upload size.** Vercel rejects request bodies over 4.5 MB before they reach the
app, so deliverable uploads are capped at 4 MB and say so. Raise
`NEXT_PUBLIC_MAX_UPLOAD_MB` and `MAX_UPLOAD_BODY_SIZE` together only if you host
somewhere without that ceiling. The durable fix — uploading straight to Supabase
Storage with a signed URL, bypassing the function entirely — is in the roadmap.

**Function duration.** The cron route asks for 60 seconds, which is the Hobby
maximum. A very large backlog is drained across several runs rather than one.

---

## Trying it out

1. Open your deployment and sign up at `/login`. A workspace is created on first
   sign-in.
2. Create a project, add two or three milestones with prices.
3. In **Client links**, create a link — copy it, or tick "email this link" if
   Resend is configured.
4. Open that link in a private window. That is exactly what your client sees.
5. Send a milestone for review from the dashboard, then approve it from the
   portal. Watch the sign-off trail fill in.

If you ran the seed, the demo portal is at `/portal/demo-client-token-clientdeck`.
Revoke that link before using the deployment for anything real — the token is
public knowledge, it is in this repository.

## Troubleshooting

| Symptom | Cause |
|---|---|
| "ClientDeck isn't connected yet" | Supabase env vars missing or misspelled |
| Portal links point at localhost | `NEXT_PUBLIC_APP_URL` not set to the real origin |
| Sign-in redirects to localhost | Supabase **Site URL** / redirect URLs not updated (step 4) |
| Deploy fails on cron | A sub-daily schedule in `vercel.json` on a Hobby account |
| Portal 500s, dashboard fine | `SUPABASE_SERVICE_ROLE_KEY` missing — the portal resolves tokens with it |
| Email option greyed out | `RESEND_API_KEY` or `RESEND_FROM_EMAIL` missing |
| Sends rejected as unverified | The `RESEND_FROM_EMAIL` domain is not verified in Resend |
| Reminders never fire | `CRON_SECRET` unset — the endpoint refuses to run |
| Upload fails over 4 MB | Vercel's platform body limit; share it as a link deliverable |
