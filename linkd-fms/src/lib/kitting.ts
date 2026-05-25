// ---------------------------------------------------------------------------
// Helpers that translate between the display strings the KittingFormValues
// uses and the kitting_priority enum stored in Postgres.
// ---------------------------------------------------------------------------

import type { KittingFormValues } from "@/components/tasks/FullKittingFormFields";

export type KittingPriorityEnum =
  | "very_urgent"
  | "2_days"
  | "3_days"
  | "4_days"
  | "5_days";

export type KittingDataEntryStatus =
  | "pending_image"
  | "pending_deo"
  | "in_progress"
  | "completed";

const PRIORITY_TO_ENUM: Record<
  Exclude<KittingFormValues["priority"], "">,
  KittingPriorityEnum
> = {
  "Very Urgent": "very_urgent",
  "2 Days": "2_days",
  "3 Days": "3_days",
  "4 Days": "4_days",
  "5 Days": "5_days",
};

const ENUM_TO_PRIORITY: Record<
  KittingPriorityEnum,
  Exclude<KittingFormValues["priority"], "">
> = {
  very_urgent: "Very Urgent",
  "2_days": "2 Days",
  "3_days": "3 Days",
  "4_days": "4 Days",
  "5_days": "5 Days",
};

export function priorityToEnum(
  p: KittingFormValues["priority"]
): KittingPriorityEnum | null {
  if (!p) return null;
  return PRIORITY_TO_ENUM[p];
}

export function priorityFromEnum(
  p: KittingPriorityEnum | null
): KittingFormValues["priority"] {
  if (!p) return "";
  return ENUM_TO_PRIORITY[p];
}
