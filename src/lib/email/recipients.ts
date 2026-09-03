import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Email addresses of the people who run a studio.
 *
 * Membership lives in `organization_members` but addresses live in
 * `auth.users`, which is not exposed through PostgREST, so this goes through
 * the Auth admin API. Team sizes are capped at eight seats by the plan tiers,
 * so a lookup per member is cheap and avoids mirroring emails into a table
 * that could drift.
 */
export async function organizationEmails(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string[]> {
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .returns<{ user_id: string }[]>();

  if (!members?.length) return [];

  const results = await Promise.all(
    members.map(async ({ user_id }) => {
      try {
        const { data } = await supabase.auth.admin.getUserById(user_id);
        return data.user?.email ?? null;
      } catch {
        return null;
      }
    }),
  );

  return [...new Set(results.filter((email): email is string => Boolean(email)))];
}
