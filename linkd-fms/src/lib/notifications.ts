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
 * Send a notification to every user with one of the given roles.
 *
 * Accepts a single role or an array — most "instant" calls want both admins
 * AND coordinators at the same time, so passing `['admin', 'design_coordinator']`
 * is the common case.
 */
export async function sendNotificationToRole(
  roles: UserRole | UserRole[],
  title: string,
  message: string,
  type: NotificationType = "info",
  link?: string | null
): Promise<MutationResult<Notification[]>> {
  const roleList = Array.isArray(roles) ? roles : [roles];
  if (roleList.length === 0) return { data: [], error: null };

  const { data: profiles, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .in("role", roleList);

  if (profileErr) return { data: null, error: profileErr.message };
  if (!profiles || profiles.length === 0) return { data: [], error: null };

  const userIds = profiles.map((p) => p.id);
  return sendNotificationToMany(userIds, title, message, type, link);
}

// ============================================================================
// Admin nuke — clear all notifications across the whole system
// ============================================================================

/**
 * Delete every row in `public.notifications`. Admin-only operation.
 *
 * Called from SystemView's "Clear All Notifications" button after the spam
 * incident from the old in-browser polling system. RLS gates this — only
 * admins have DELETE on notifications, so a non-admin will get a permission
 * error instead of silently zeroing nothing (because `.delete()` without a
 * filter actually filters by RLS, returning 0 affected rows).
 *
 * Supabase's PostgREST requires every UPDATE/DELETE to have a `.filter()`
 * clause as a safety net — we use `id is not null` which matches every row.
 */
export async function clearAllNotifications(): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .not("id", "is", null);
  if (error) return { error: error.message };
  return { error: null };
}
