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
  designerCodes: {
    all: ["designerCodes"] as const,
  },
} as const;
