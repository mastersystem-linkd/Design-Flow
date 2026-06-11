/**
 * Centralised React Query keys. All query keys live here so cache
 * invalidations in mutations stay consistent with the read hooks.
 *
 * Convention: queries are namespaced by resource. `.all` is the broad
 * invalidation point — invalidating it dumps every list/detail under that
 * resource.
 */
export const queryKeys = {
  tasks: {
    all: ["tasks"] as const,
    list: (filters: Record<string, unknown>) =>
      ["tasks", "list", filters] as const,
    detail: (id: string) => ["tasks", "detail", id] as const,
  },
  clients: {
    all: ["clients"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    byRole: (rolesKey: string) => ["profiles", "role", rolesKey] as const,
  },
  concepts: {
    all: ["concepts"] as const,
    list: (filters: Record<string, unknown>) =>
      ["concepts", "list", filters] as const,
  },
  samples: {
    all: ["samples"] as const,
    list: (filters: Record<string, unknown>) =>
      ["samples", "list", filters] as const,
  },
  fabrics: {
    all: ["fabrics"] as const,
    list: (activeOnly: boolean) => ["fabrics", "list", { activeOnly }] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: (activeOnly: boolean) =>
      ["categories", "list", { activeOnly }] as const,
  },
  assignedByOptions: {
    all: ["assignedByOptions"] as const,
    list: (context: string, activeOnly: boolean) =>
      ["assignedByOptions", "list", { context, activeOnly }] as const,
  },
  receivedByOptions: {
    all: ["receivedByOptions"] as const,
    list: (activeOnly: boolean) =>
      ["receivedByOptions", "list", { activeOnly }] as const,
  },
  samplingDropdowns: {
    all: ["samplingDropdowns"] as const,
    list: (activeOnly: boolean) =>
      ["samplingDropdowns", "list", { activeOnly }] as const,
  },
  designerCodes: {
    all: ["designerCodes"] as const,
  },
  userPreferences: {
    all: ["userPreferences"] as const,
    detail: (userId: string) => ["userPreferences", userId] as const,
  },
  taskAssignments: {
    all: ["taskAssignments"] as const,
    detail: (taskId: string) => ["taskAssignments", taskId] as const,
  },
  integration: {
    all: ["integration"] as const,
    config: ["integration", "config"] as const,
    events: ["integration", "events"] as const,
    queueStats: ["integration", "queueStats"] as const,
  },
} as const;
