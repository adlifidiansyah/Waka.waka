# SQL tests

`rls.test.sql` asserts the guarantees that the TypeScript layer cannot enforce
on its own: tenant isolation under row-level security, the service-role
function boundaries, audit-trail immutability, and plan entitlements.

`email_queue.test.sql` does the same for the outbox: that a dedupe key cannot
be queued twice, that a claimed message is leased rather than handed to a
second worker, that retries back off and eventually stop, and that suppressing
an address cancels everything queued for it. It also asserts the *absence* of a
write policy on `email_messages` — with one, any signed-in user could queue
arbitrary mail from the deployment's verified sending domain.

It needs a real Postgres with the migrations applied. Locally:

```bash
supabase start
npm run test:sql
```

Against any other database:

```bash
psql "$DATABASE_URL" -f tests/sql/rls.test.sql
```

The whole file runs in a transaction and rolls back, so it leaves no rows
behind and is safe to run against a database that already has data.

Every check is a PL/pgSQL `assert`, so a failure aborts with the message naming
what leaked. A clean run prints one notice per file.
