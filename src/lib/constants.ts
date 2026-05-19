import type {
  TaskStatus,
  UserRole,
  TaskPriority,
  MdStatus,
} from "@/types/database";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pool: "Pool",
  todo: "To Do",
  in_progress: "In Progress",
  full_kitting: "Full Kitting",
  approved: "Approved",
  sampling: "Sampling",
  done: "Done",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  pool: "bg-slate-100 text-slate-700 border-slate-200",
  todo: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  full_kitting: "bg-purple-100 text-purple-700 border-purple-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  sampling: "bg-cyan-100 text-cyan-700 border-cyan-200",
  done: "bg-zinc-200 text-zinc-700 border-zinc-300",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  designer: "Designer",
  production: "Production",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-gray-100 text-gray-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export const MD_STATUS_LABELS: Record<MdStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  revision_requested: "Revision requested",
};

export const MD_STATUS_COLORS: Record<MdStatus, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  revision_requested: "bg-amber-100 text-amber-800 border-amber-200",
};
