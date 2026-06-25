// ============================================================================
// WhatsApp Group catalogue (FALLBACK only)
// ============================================================================
//
// The "Task Source" / Group picker is now a DB-managed dropdown — see the
// `task_sources` table (migration 0086) + `useTaskSources()`, managed from
// Settings → Dropdowns → Tasks → Task Source. This list is kept ONLY as the
// fallback `useTaskSources` uses when that table is empty / the migration
// hasn't been applied yet, so the brief picker never goes blank. Edit sources
// in Settings, not here.
//
// `isWhatsApp` controls whether the picker renders the green WhatsApp icon
// next to the label — a few entries here aren't actual WhatsApp groups
// (e.g. "Personal — Design Coordinator", "Own Creation") and should stay
// plain.
//
// Note on existing data: the `tasks.whatsapp_group` column stores the literal
// label, so renaming an entry here does NOT update past briefs. Old rows
// continue to show their original string in tables; only new briefs created
// after the rename adopt the new name.
// ============================================================================

export interface WhatsAppGroupOption {
  /** Stored verbatim in `tasks.whatsapp_group`. Keep it human-readable. */
  name: string;
  /** When true, the picker prefixes the label with a WhatsApp icon. */
  isWhatsApp: boolean;
}

export const WHATSAPP_GROUPS: WhatsAppGroupOption[] = [
  { name: "Linkd Design New Creation",     isWhatsApp: true  },
  { name: "LinkD Jobwork Concept",          isWhatsApp: true  },
  { name: "LinkD Design Group",             isWhatsApp: true  },
  { name: "LD-Garments Sublimation Prints", isWhatsApp: false },
  { name: "LD Cotton Mills Design Group",   isWhatsApp: true  },
  { name: "Own Creation",                   isWhatsApp: false },
];
