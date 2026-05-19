"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { ROLE_LABELS } from "@/lib/constants";
import { USER_ROLES, type UserRole } from "@/types/database";
import { updateUserRole } from "./actions";

export function RoleSelect({
  userId,
  current,
}: {
  userId: string;
  current: UserRole;
}) {
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as UserRole;
    if (newRole === current) return;

    const form = new FormData();
    form.set("user_id", userId);
    form.set("role", newRole);

    startTransition(async () => {
      const result = await updateUserRole(form);
      if (result?.error) {
        toast.error(result.error);
        e.target.value = current;
      } else {
        toast.success(`Role updated to ${ROLE_LABELS[newRole]}`);
      }
    });
  }

  return (
    <select
      defaultValue={current}
      onChange={handleChange}
      disabled={isPending}
      className="h-9 rounded-md border bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {USER_ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </select>
  );
}
