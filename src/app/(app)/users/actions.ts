"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth";
import type { UserRole } from "@/types/database";

const ALLOWED_ROLES: readonly UserRole[] = [
  "super_admin",
  "admin",
  "designer",
  "production",
];

export async function updateUserRole(formData: FormData) {
  const actor = await requireCapability("users:manage_roles");

  const userId = String(formData.get("user_id") ?? "");
  const newRole = String(formData.get("role") ?? "") as UserRole;

  if (!userId) return { error: "Missing user id" };
  if (!ALLOWED_ROLES.includes(newRole)) return { error: "Invalid role" };
  if (userId === actor.id && newRole !== actor.role) {
    return { error: "You cannot change your own role." };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) return { error: error.message };

  revalidatePath("/users");
  return { ok: true };
}
