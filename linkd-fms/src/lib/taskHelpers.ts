import type { TaskWithRelations } from "@/types/database";
import { isAdminOrCoordinator } from "@/lib/permissions";

export function isFullKittingAdded(task: TaskWithRelations): boolean {
  return Boolean(task.full_kitting_image_url || task.full_kitting_details_added);
}

export function isFullKittingBlocking(task: TaskWithRelations): boolean {
  return Boolean(task.requires_full_kitting) && !isFullKittingAdded(task);
}

export function wasCreatedByAdminOrCoordinator(
  task: TaskWithRelations
): boolean {
  return Boolean(
    task.creator?.role && isAdminOrCoordinator(task.creator.role)
  );
}
