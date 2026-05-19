import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  can,
  canAccess,
  type Capability,
  type NavSection,
} from "@/lib/permissions";
import type { Profile } from "@/types/database";

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile;
}

/**
 * Ensures a profile exists, otherwise redirects to /login. Use at the top of
 * authed server components/pages.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Requires the current user to have a specific capability. Redirects to
 * /dashboard if they don't (so users land somewhere sensible instead of
 * a hard 403).
 */
export async function requireCapability(
  capability: Capability
): Promise<Profile> {
  const profile = await requireProfile();
  if (!can(profile.role, capability)) {
    redirect("/dashboard?forbidden=1");
  }
  return profile;
}

export async function requireSection(section: NavSection): Promise<Profile> {
  const profile = await requireProfile();
  if (!canAccess(profile.role, section)) {
    redirect("/dashboard?forbidden=1");
  }
  return profile;
}
