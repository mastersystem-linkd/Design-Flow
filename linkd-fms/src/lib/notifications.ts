/**
 * Reusable notification helpers.
 *
 * These use the browser-side Supabase client (anon key + user session).
 * For service-role inserts (edge functions, cron triggers), use the
 * service-role client in the server-side script instead — the same SQL
 * shape applies.
 */
import { supabase } from "@/lib/supabase";
import type {
  NotificationType,
  NotificationInsert,
  Notification,
  UserRole,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export type MutationResult<T> = { data: T | null; error: string | null };

// ============================================================================
// Single notification
// ============================================================================

/**
 * Insert a single notification for one user.
 *
 * Returns the inserted row on success, or `{ data: null, error }`.
 */
export async function sendNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = "info",
  link?: string | null
): Promise<MutationResult<Notification>> {
  const row: NotificationInsert = {
    user_id: userId,
    title,
    message,
    type,
    link: link ?? null,
  };
  const { data, error } = await supabase
    .from("notifications")
    .insert(row)
    .select("*")
    .single();
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

// ============================================================================
// Batch — many user IDs
// ============================================================================

/**
 * Insert the same notification for multiple users in a single batch.
 */
export async function sendNotificationToMany(
  userIds: string[],
  title: string,
  message: string,
  type: NotificationType = "info",
  link?: string | null
): Promise<MutationResult<Notification[]>> {
  if (userIds.length === 0) return { data: [], error: null };

  const rows: NotificationInsert[] = userIds.map((uid) => ({
    user_id: uid,
    title,
    message,
    type,
    link: link ?? null,
  }));

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("*");
  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

// ============================================================================
// By role
// ============================================================================

/**
 * Send a notification to every user with a given role.
 *
 * Fetches the profile IDs for `role`, then batch-inserts notifications.
 */
export async function sendNotificationToRole(
  role: UserRole,
  title: string,
  message: string,
  type: NotificationType = "info",
  link?: string | null
): Promise<MutationResult<Notification[]>> {
  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", role);

  if (profileErr) return { data: null, error: profileErr.message };
  if (!profiles || profiles.length === 0) return { data: [], error: null };

  const userIds = profiles.map((p) => p.id);
  return sendNotificationToMany(userIds, title, message, type, link);
}
