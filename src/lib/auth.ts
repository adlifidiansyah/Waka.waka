import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { MemberRole, Organization } from "@/lib/database.types";

export interface Workspace {
  userId: string;
  email: string;
  organization: Organization;
  role: MemberRole;
}

/**
 * The signed-in freelancer plus their organization, creating a personal
 * organization on first sign-in so nobody lands on an empty shell.
 */
export async function requireWorkspace(): Promise<Workspace> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ role: MemberRole; organization: Organization }>();

  if (membership?.organization) {
    return {
      userId: user.id,
      email: user.email ?? "",
      organization: membership.organization,
      role: membership.role,
    };
  }

  const displayName =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "My Studio";

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: displayName, slug: slugify(`${displayName}-${user.id.slice(0, 6)}`) })
    .select("*")
    .single<Organization>();

  if (orgError || !organization) {
    throw new Error(`Could not create a workspace: ${orgError?.message ?? "unknown error"}`);
  }

  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({ organization_id: organization.id, user_id: user.id, role: "owner" });

  if (memberError) {
    throw new Error(`Could not join the new workspace: ${memberError.message}`);
  }

  return { userId: user.id, email: user.email ?? "", organization, role: "owner" };
}

/** Throws unless the current user can reach `projectId`. RLS backs this up. */
export async function assertProjectAccess(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, organization_id")
    .eq("id", projectId)
    .maybeSingle<{ id: string; organization_id: string }>();

  if (!data) throw new Error("Project not found");
  return data;
}
