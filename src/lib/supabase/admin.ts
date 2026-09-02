import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serviceRoleKey } from "@/lib/env";

/**
 * Service-role client. RLS does not apply, so it is only ever used where the
 * caller has been authorised by other means and the query is explicitly scoped:
 *
 *  - the client portal, after a magic-link token has been verified
 *  - payment webhooks, after signature verification
 *
 * Never import this from a "use client" module.
 */
export function createAdminClient() {
  const env = publicEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
