export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================================
// Enum unions
// ============================================================================

export type UserRole = "super_admin" | "admin" | "design_coordinator" | "designer" | "deo";

export type TaskStatus =
  | "pool"
  | "todo"
  | "in_progress"
  | "full_kitting"
  | "approved"
  | "sampling"
  | "done"
  // Post-'done' state: design finished AND completion fabric/mtr captured.
  // Added in migration 0039.
  | "completed";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type DesignerStatus = "active" | "inactive";

// Business-segment split on the clients table (migration 0037). 'ld' covers
// parties in LinkD's own design pipeline; 'job_work' covers external
// job-work parties. The brief form has separate pickers for each.
export type ClientGroup = "ld" | "job_work";

// Per-task brief type (migration 0038). 'ld' = internal LinkD work, no
// external party — task.client_id is NULL. 'job_work' = external client work,
// task.client_id is required. Enforced by a CHECK constraint in the DB.
export type BriefType = "ld" | "job_work";

// Concept review status (called MdStatus in DB; ConceptStatus is the alias
// the views consume).
export type ConceptStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

export type MdStatus = ConceptStatus;

// Concept work-status — the post-approval lifecycle (designer Start → Hold →
// Mark Done → MD final review). Added in migration 0025. Independent of
// `md_status`; both columns coexist on the concepts row.
export type ConceptWorkStatus =
  | "not_started"
  | "in_progress"
  | "on_hold"
  | "done_partial"
  | "in_revision"
  | "changes_requested"
  | "completed";

/** A single entry in the concept completion history log.
 *
 * Legacy types (kept for back-compat with existing rows):
 *   `done`     — designer ticked the legacy "Mark as completed" button
 *   `revision` — MD asked for revisions at the final-approval step
 *   `resubmit` — designer re-submitted after legacy revision feedback
 *   `approved` — MD granted final approval
 *
 * Work-status types (added with migration 0026 lifecycle):
 *   `started`              — designer started a concept (T6)
 *   `held`                 — designer paused (T7); `feedback` carries the reason
 *   `resumed`              — designer resumed from hold (T8)
 *   `marked_done`          — designer sent to MD review (T9+T10)
 *   `design_approved`      — MD approved the finished design (T11, terminal)
 *   `changes_requested`    — MD asked for changes (T12); `feedback` carries the ask
 *   `start_changes`        — designer started reworking after MD feedback (T13)
 */
export interface CompletionHistoryEntry {
  type:
    | "done"
    | "revision"
    | "resubmit"
    | "approved"
    | "started"
    | "held"
    | "resumed"
    | "marked_done"
    | "design_approved"
    | "changes_requested"
    | "start_changes";
  date: string;
  by?: string;           // user full_name
  feedback?: string;     // MD revision notes OR hold reason — type-specific
  delay_days?: number;   // days late vs planned (legacy types only)
  /** Round number this entry belongs to — useful for marked_done/changes_requested. */
  round?: number;
}

// ============================================================================
// Database — matches supabase/migrations/0001_full_schema.sql
// ============================================================================

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          role: UserRole;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          is_active: boolean | null;
          deactivated_at: string | null;
          deactivated_by: string | null;
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          is_active?: boolean | null;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          is_active?: boolean | null;
          deactivated_at?: string | null;
          deactivated_by?: string | null;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          // Legacy: a flat string[]. Current: `{ current, defaults }` per-stage
          // maps keyed by pipeline stage (pool / in_progress / completed). The
          // hook (`normalizeStored`) tolerates all historical shapes — see §14.
          visible_columns: string[] | Record<string, unknown>;
          table_density: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          visible_columns?: string[] | Record<string, unknown>;
          table_density?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          visible_columns?: string[] | Record<string, unknown>;
          table_density?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      clients: {
        Row: {
          id: string;
          party_name: string;
          /** Business segment — see migration 0037. */
          client_group: ClientGroup;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          party_name: string;
          client_group: ClientGroup;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          party_name?: string;
          client_group?: ClientGroup;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      assigned_by_options: {
        Row: {
          id: string;
          name: string;
          context: string;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          context?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          context?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sampling_dropdowns: {
        Row: {
          id: string;
          field: string;
          name: string;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field: string;
          name: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          field?: string;
          name?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      received_by_options: {
        Row: {
          id: string;
          name: string;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      concept_categories: {
        Row: {
          id: string;
          name: string;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fabrics: {
        Row: {
          id: string;
          name: string;
          sort_order: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          sort_order?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      concepts: {
        Row: {
          id: string;
          concept_code: string;
          title: string;
          description: string | null;
          image_url: string;
          submitted_by: string;
          md_status: ConceptStatus;
          md_reviewed_by: string | null;
          md_reviewed_at: string | null;
          md_planned_date: string | null;
          md_actual_date: string | null;
          md_notes: string | null;
          designer_planned_date: string | null;
          designer_actual_date: string | null;
          created_at: string;
          updated_at: string;
          // Added in 0012
          start_date: string | null;
          designer_id: string | null;
          client_id: string | null;
          assigned_by: string | null;
          priority: TaskPriority;
          file_url: string | null;
          final_approval_planned_date: string | null;
          final_approval_actual_date: string | null;
          final_approval_notes: string | null;
          final_approved_at: string | null;
          approved_designs_count: number | null;
          /** Total designs the designer submitted (denominator at final approval). Added 0028. */
          designs_count: number | null;
          /** Fabric the concept is designed for (managed Fabrics lookup). Added 0058. */
          fabric: string | null;
          /** Storage paths for every uploaded file on this concept (added in 0018).
           *  First entry mirrors `image_url`; revisions append more entries. */
          files: string[] | null;
          remarks: string | null;
          completion_history: CompletionHistoryEntry[];
          // Added in 0026 — work-status lifecycle
          work_status: ConceptWorkStatus;
          work_started_at: string | null;
          work_held_at: string | null;
          work_resumed_at: string | null;
          work_completed_at: string | null;
          hold_reason: string | null;
          hold_count: number;
          revision_count: number;
          md_feedback: string | null;
          total_hold_duration: string | null;
        };
        Insert: {
          id?: string;
          concept_code?: string;
          title: string;
          description?: string | null;
          image_url: string;
          submitted_by: string;
          md_status?: ConceptStatus;
          md_reviewed_by?: string | null;
          md_reviewed_at?: string | null;
          md_planned_date?: string | null;
          md_actual_date?: string | null;
          md_notes?: string | null;
          designer_planned_date?: string | null;
          designer_actual_date?: string | null;
          created_at?: string;
          updated_at?: string;
          start_date?: string | null;
          designer_id?: string | null;
          client_id?: string | null;
          assigned_by?: string | null;
          priority?: TaskPriority;
          file_url?: string | null;
          final_approval_planned_date?: string | null;
          final_approval_actual_date?: string | null;
          final_approval_notes?: string | null;
          final_approved_at?: string | null;
          approved_designs_count?: number | null;
          designs_count?: number | null;
          fabric?: string | null;
          files?: string[] | null;
          remarks?: string | null;
          completion_history?: CompletionHistoryEntry[];
          work_status?: ConceptWorkStatus;
          work_started_at?: string | null;
          work_held_at?: string | null;
          work_resumed_at?: string | null;
          work_completed_at?: string | null;
          hold_reason?: string | null;
          hold_count?: number;
          revision_count?: number;
          md_feedback?: string | null;
          total_hold_duration?: string | null;
        };
        Update: {
          id?: string;
          concept_code?: string;
          title?: string;
          description?: string | null;
          image_url?: string;
          submitted_by?: string;
          md_status?: ConceptStatus;
          md_reviewed_by?: string | null;
          md_reviewed_at?: string | null;
          md_planned_date?: string | null;
          md_actual_date?: string | null;
          md_notes?: string | null;
          designer_planned_date?: string | null;
          designer_actual_date?: string | null;
          created_at?: string;
          updated_at?: string;
          start_date?: string | null;
          designer_id?: string | null;
          client_id?: string | null;
          assigned_by?: string | null;
          priority?: TaskPriority;
          file_url?: string | null;
          final_approval_planned_date?: string | null;
          final_approval_actual_date?: string | null;
          final_approval_notes?: string | null;
          final_approved_at?: string | null;
          approved_designs_count?: number | null;
          designs_count?: number | null;
          fabric?: string | null;
          files?: string[] | null;
          remarks?: string | null;
          completion_history?: CompletionHistoryEntry[];
          work_status?: ConceptWorkStatus;
          work_started_at?: string | null;
          work_held_at?: string | null;
          work_resumed_at?: string | null;
          work_completed_at?: string | null;
          hold_reason?: string | null;
          hold_count?: number;
          revision_count?: number;
          md_feedback?: string | null;
          total_hold_duration?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "concepts_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concepts_md_reviewed_by_fkey";
            columns: ["md_reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concepts_designer_id_fkey";
            columns: ["designer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "concepts_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          }
        ];
      };
      tasks: {
        Row: {
          id: string;
          task_code: string;
          /** NULL for LD (internal) briefs; required for Job Work briefs. */
          client_id: string | null;
          /** 'ld' (internal) or 'job_work' (external). Added 0038. */
          brief_type: BriefType;
          concept_id: string | null;
          concept: string;
          qty: number;
          qty_completed: number;
          fabric: string;
          priority: TaskPriority;
          status: TaskStatus;
          assigned_to: string | null;
          planned_deadline: string | null;
          due_time: string | null;
          whatsapp_group: string | null;
          /** Date the brief request arrived on WhatsApp (separate from
           *  created_at, which is when the coordinator logged it). 0036. */
          whatsapp_received_date: string | null;
          /** Time-of-day of the WhatsApp message (paired with the date
           *  above). Stored as "HH:MM:SS" / "HH:MM". 0036. */
          whatsapp_received_time: string | null;
          description: string | null;
          started_at: string | null;
          kitted_at: string | null;
          notes: string | null;
          mtr: number | null;
          requires_full_kitting: boolean;
          full_kitting_image_url: string | null;
          full_kitting_notes: string | null;
          full_kitting_submitted_at: string | null;
          full_kitting_submitted_by: string | null;
          assigned_by: string | null;
          started_late: boolean;
          concept_start_date: string | null;
          assigned_at: string | null;
          completed_at: string | null;
          delay_days: number | null;
          // Post-done completion fields + requirement timestamp (0040).
          completion_fabric: string | null;
          completion_mtr: number | null;
          completion_filled_by: string | null;
          completion_filled_at: string | null;
          requirement_received_at: string | null;
          // Sampling requirement flag (migration 0069)
          sampling_required: boolean;
          sampling_flagged_at: string | null;
          sampling_flagged_by: string | null;
          // Hand-off / carry-forward context (migration 0056)
          carry_forward_note: string | null;
          carry_forward_from: string | null;
          carry_forward_at: string | null;
          // Pool ordering (migration 0059)
          pool_sequence: number | null;
          pool_week_start: string | null;
          // Task split (migration 0060)
          is_split: boolean;
          qty_remaining: number | null;
          // External integration (migration 0073)
          external_source: string | null;
          external_ref_id: string | null;
          external_callback_url: string | null;
          external_brief: Record<string, unknown> | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          task_code?: string;
          client_id?: string | null;
          brief_type: BriefType;
          concept_id?: string | null;
          concept: string;
          qty: number;
          qty_completed?: number;
          fabric: string;
          priority?: TaskPriority;
          status?: TaskStatus;
          assigned_to?: string | null;
          planned_deadline?: string | null;
          due_time?: string | null;
          whatsapp_group?: string | null;
          whatsapp_received_date?: string | null;
          whatsapp_received_time?: string | null;
          description?: string | null;
          started_at?: string | null;
          kitted_at?: string | null;
          notes?: string | null;
          mtr?: number | null;
          requires_full_kitting?: boolean;
          full_kitting_image_url?: string | null;
          full_kitting_notes?: string | null;
          full_kitting_submitted_at?: string | null;
          full_kitting_submitted_by?: string | null;
          assigned_by?: string | null;
          started_late?: boolean;
          concept_start_date?: string | null;
          assigned_at?: string | null;
          completed_at?: string | null;
          delay_days?: number | null;
          completion_fabric?: string | null;
          completion_mtr?: number | null;
          completion_filled_by?: string | null;
          completion_filled_at?: string | null;
          requirement_received_at?: string | null;
          carry_forward_note?: string | null;
          carry_forward_from?: string | null;
          carry_forward_at?: string | null;
          pool_sequence?: number | null;
          pool_week_start?: string | null;
          is_split?: boolean;
          qty_remaining?: number | null;
          // Sampling requirement flag (migration 0069)
          sampling_required?: boolean;
          sampling_flagged_at?: string | null;
          sampling_flagged_by?: string | null;
          // External integration (migration 0073)
          external_source?: string | null;
          external_ref_id?: string | null;
          external_callback_url?: string | null;
          external_brief?: Record<string, unknown> | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          task_code?: string;
          client_id?: string | null;
          brief_type?: BriefType;
          concept_id?: string | null;
          concept?: string;
          qty?: number;
          qty_completed?: number;
          fabric?: string;
          priority?: TaskPriority;
          status?: TaskStatus;
          assigned_to?: string | null;
          planned_deadline?: string | null;
          due_time?: string | null;
          whatsapp_group?: string | null;
          whatsapp_received_date?: string | null;
          whatsapp_received_time?: string | null;
          description?: string | null;
          started_at?: string | null;
          kitted_at?: string | null;
          notes?: string | null;
          mtr?: number | null;
          requires_full_kitting?: boolean;
          full_kitting_image_url?: string | null;
          full_kitting_notes?: string | null;
          full_kitting_submitted_at?: string | null;
          full_kitting_submitted_by?: string | null;
          assigned_by?: string | null;
          started_late?: boolean;
          concept_start_date?: string | null;
          assigned_at?: string | null;
          completed_at?: string | null;
          delay_days?: number | null;
          completion_fabric?: string | null;
          completion_mtr?: number | null;
          completion_filled_by?: string | null;
          completion_filled_at?: string | null;
          requirement_received_at?: string | null;
          carry_forward_note?: string | null;
          carry_forward_from?: string | null;
          carry_forward_at?: string | null;
          pool_sequence?: number | null;
          pool_week_start?: string | null;
          is_split?: boolean;
          qty_remaining?: number | null;
          // Sampling requirement flag (migration 0069)
          sampling_required?: boolean;
          sampling_flagged_at?: string | null;
          sampling_flagged_by?: string | null;
          // External integration (migration 0073)
          external_source?: string | null;
          external_ref_id?: string | null;
          external_callback_url?: string | null;
          external_brief?: Record<string, unknown> | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_concept_id_fkey";
            columns: ["concept_id"];
            isOneToOne: false;
            referencedRelation: "concepts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_carry_forward_from_fkey";
            columns: ["carry_forward_from"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      task_assignments: {
        Row: {
          id: string;
          task_id: string;
          designer_id: string;
          assigned_by: string | null;
          qty_assigned: number;
          qty_completed: number;
          planned_deadline: string | null;
          started_at: string | null;
          completed_at: string | null;
          delay_days: number | null;
          status: "assigned" | "in_progress" | "done" | "completed";
          design_type: string | null;
          completion_fabric: string | null;
          completion_filled_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          designer_id: string;
          assigned_by?: string | null;
          qty_assigned: number;
          qty_completed?: number;
          planned_deadline?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          delay_days?: number | null;
          status?: "assigned" | "in_progress" | "done" | "completed";
          design_type?: string | null;
          completion_fabric?: string | null;
          completion_filled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          designer_id?: string;
          assigned_by?: string | null;
          qty_assigned?: number;
          qty_completed?: number;
          planned_deadline?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          delay_days?: number | null;
          status?: "assigned" | "in_progress" | "done" | "completed";
          design_type?: string | null;
          completion_fabric?: string | null;
          completion_filled_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_designer_id_fkey";
            columns: ["designer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      // ── External Integration tables (migration 0073) ──
      external_integrations: {
        Row: {
          id: string;
          name: string;
          api_key_hash: string;
          api_key_prefix: string | null;
          webhook_url: string | null;
          webhook_secret: string | null;
          is_active: boolean;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          api_key_hash: string;
          api_key_prefix?: string | null;
          webhook_url?: string | null;
          webhook_secret?: string | null;
          is_active?: boolean;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          api_key_hash?: string;
          api_key_prefix?: string | null;
          webhook_url?: string | null;
          webhook_secret?: string | null;
          is_active?: boolean;
          last_used_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_outbox: {
        Row: {
          id: string;
          event: string;
          entity_type: string;
          entity_id: string;
          ref_id: string | null;
          target_url: string;
          payload: Record<string, unknown>;
          status: "pending" | "sent" | "failed";
          attempts: number;
          max_attempts: number;
          last_attempt_at: string | null;
          last_error: string | null;
          next_retry_at: string | null;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          event: string;
          entity_type: string;
          entity_id: string;
          ref_id?: string | null;
          target_url: string;
          payload: Record<string, unknown>;
          status?: "pending" | "sent" | "failed";
          attempts?: number;
          max_attempts?: number;
          last_attempt_at?: string | null;
          last_error?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          event?: string;
          entity_type?: string;
          entity_id?: string;
          ref_id?: string | null;
          target_url?: string;
          payload?: Record<string, unknown>;
          status?: "pending" | "sent" | "failed";
          attempts?: number;
          max_attempts?: number;
          last_attempt_at?: string | null;
          last_error?: string | null;
          next_retry_at?: string | null;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      integration_events: {
        Row: {
          id: string;
          direction: string;
          event: string;
          entity_type: string | null;
          entity_id: string | null;
          ref_id: string | null;
          status: string | null;
          detail: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          direction: string;
          event: string;
          entity_type?: string | null;
          entity_id?: string | null;
          ref_id?: string | null;
          status?: string | null;
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          direction?: string;
          event?: string;
          entity_type?: string | null;
          entity_id?: string | null;
          ref_id?: string | null;
          status?: string | null;
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
        Relationships: [];
      };
      task_logs: {
        Row: {
          id: string;
          task_id: string;
          status_from: TaskStatus | null;
          status_to: TaskStatus;
          changed_by: string;
          note: string | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          status_from?: TaskStatus | null;
          status_to: TaskStatus;
          changed_by: string;
          note?: string | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          status_from?: TaskStatus | null;
          status_to?: TaskStatus;
          changed_by?: string;
          note?: string | null;
          timestamp?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_logs_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      task_comments: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          body: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          user_id?: string;
          body?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      files: {
        Row: {
          id: string;
          task_id: string;
          storage_url: string;
          file_name: string;
          file_size: number;
          uploaded_by: string;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          storage_url: string;
          file_name: string;
          file_size: number;
          uploaded_by: string;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          storage_url?: string;
          file_name?: string;
          file_size?: number;
          uploaded_by?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "files_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      sampling_logs: {
        Row: {
          id: string;
          task_id: string;
          meters_printed: number;
          proof_url: string | null;
          logged_by: string;
          logged_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          meters_printed: number;
          proof_url?: string | null;
          logged_by: string;
          logged_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          meters_printed?: number;
          proof_url?: string | null;
          logged_by?: string;
          logged_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sampling_logs_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sampling_logs_logged_by_fkey";
            columns: ["logged_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      designer_codes: {
        Row: {
          id: string;
          profile_id: string;
          code: string;
          joining_date: string;
          leaving_date: string | null;
          status: DesignerStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          code: string;
          joining_date: string;
          leaving_date?: string | null;
          status?: DesignerStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          code?: string;
          joining_date?: string;
          leaving_date?: string | null;
          status?: DesignerStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "designer_codes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      samples: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          sr_no: number | null;
          /** Auto-generated SMP-YYYY-NNNN code; never null after 0032 runs. */
          uid: string;
          party_name: string;
          quality: string | null;
          total_fabrics_received: number | null;
          requirement: string | null;
          assigned_by: string | null;
          sampling_done_by: string | null;
          printed_mtr: number;
          order_or_sample: "order" | "sample" | "";
          completion_timestamp: string | null;
          pending_qty: number;
          is_completed: boolean;
          fusing_operator: string | null;
          neatly_prepared: boolean;
          photo_url: string | null;
          video_url: string | null;
          signature_url: string | null;
          has_form: boolean;
          additional_comments: string | null;
          requires_full_kitting: boolean;
          full_kitting_image_url: string | null;
          created_by: string | null;
          /** Optional FK to the originating brief. Set when the coordinator
           *  picked the task in the sampling form; null for walk-in samples. */
          task_id: string | null;
          /** Sample lifecycle + provenance (migration 0069). Pending Samples
           *  sub-tab filters source='task_completion'. */
          sample_status: "pending" | "in_progress" | "completed" | "dropped";
          source: "manual" | "task_completion" | "sales_erp";
          /** Design type captured at completion (migration 0070). */
          design_type: string | null;
          // External integration (migration 0073)
          external_source: string | null;
          external_ref_id: string | null;
          external_callback_url: string | null;
          external_brief: Record<string, unknown> | null;
          // Review/approval + audit log (migration 0081)
          approved_by: string | null;
          approved_at: string | null;
          sample_history: Record<string, unknown>[];
          // QC completion (migration 0082)
          drop_reason: string | null;
          drop_notes: string | null;
          qc_summary: Record<string, unknown> | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sr_no?: number | null;
          uid?: string | null;
          party_name: string;
          quality?: string | null;
          total_fabrics_received?: number | null;
          requirement?: string | null;
          assigned_by?: string | null;
          sampling_done_by?: string | null;
          printed_mtr?: number;
          order_or_sample?: "order" | "sample" | "";
          completion_timestamp?: string | null;
          // pending_qty is GENERATED — never inserted directly
          is_completed?: boolean;
          fusing_operator?: string | null;
          neatly_prepared?: boolean;
          photo_url?: string | null;
          video_url?: string | null;
          signature_url?: string | null;
          has_form?: boolean;
          additional_comments?: string | null;
          requires_full_kitting?: boolean;
          full_kitting_image_url?: string | null;
          created_by?: string | null;
          task_id?: string | null;
          sample_status?: "pending" | "in_progress" | "completed" | "dropped";
          source?: "manual" | "task_completion" | "sales_erp";
          design_type?: string | null;
          // External integration (migration 0073)
          external_source?: string | null;
          external_ref_id?: string | null;
          external_callback_url?: string | null;
          external_brief?: Record<string, unknown> | null;
          // Review/approval + audit log (migration 0081)
          approved_by?: string | null;
          approved_at?: string | null;
          sample_history?: Record<string, unknown>[];
          // QC completion (migration 0082)
          drop_reason?: string | null;
          drop_notes?: string | null;
          qc_summary?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          sr_no?: number | null;
          uid?: string | null;
          party_name?: string;
          quality?: string | null;
          total_fabrics_received?: number | null;
          requirement?: string | null;
          assigned_by?: string | null;
          sampling_done_by?: string | null;
          printed_mtr?: number;
          order_or_sample?: "order" | "sample" | "";
          completion_timestamp?: string | null;
          // pending_qty is GENERATED — never updated directly
          is_completed?: boolean;
          fusing_operator?: string | null;
          neatly_prepared?: boolean;
          photo_url?: string | null;
          video_url?: string | null;
          signature_url?: string | null;
          has_form?: boolean;
          additional_comments?: string | null;
          requires_full_kitting?: boolean;
          full_kitting_image_url?: string | null;
          created_by?: string | null;
          task_id?: string | null;
          sample_status?: "pending" | "in_progress" | "completed" | "dropped";
          source?: "manual" | "task_completion" | "sales_erp";
          design_type?: string | null;
          // External integration (migration 0073)
          external_source?: string | null;
          external_ref_id?: string | null;
          external_callback_url?: string | null;
          external_brief?: Record<string, unknown> | null;
          // Review/approval + audit log (migration 0081)
          approved_by?: string | null;
          approved_at?: string | null;
          sample_history?: Record<string, unknown>[];
          // QC completion (migration 0082)
          drop_reason?: string | null;
          drop_notes?: string | null;
          qc_summary?: Record<string, unknown> | null;
        };
        Relationships: [];
      };
      sample_qc_rounds: {
        Row: {
          id: string;
          sample_id: string;
          attempt_no: number;
          passed: boolean;
          print_quality: "good" | "bad" | null;
          fusing_quality: "good" | "bad" | null;
          done_date: string | null;
          printing_operator: string | null;
          fusing_operator: string | null;
          outcome: "pass" | "resample" | "discard" | "drop";
          failure_reasons: string[];
          reinspect_date: string | null;
          notes: string | null;
          inspected_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          sample_id: string;
          attempt_no: number;
          passed: boolean;
          print_quality?: "good" | "bad" | null;
          fusing_quality?: "good" | "bad" | null;
          done_date?: string | null;
          printing_operator?: string | null;
          fusing_operator?: string | null;
          outcome: "pass" | "resample" | "discard" | "drop";
          failure_reasons?: string[];
          reinspect_date?: string | null;
          notes?: string | null;
          inspected_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          sample_id?: string;
          attempt_no?: number;
          passed?: boolean;
          print_quality?: "good" | "bad" | null;
          fusing_quality?: "good" | "bad" | null;
          done_date?: string | null;
          printing_operator?: string | null;
          fusing_operator?: string | null;
          outcome?: "pass" | "resample" | "discard" | "drop";
          failure_reasons?: string[];
          reinspect_date?: string | null;
          notes?: string | null;
          inspected_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      salvedge_records: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          designer_id: string | null;
          challan_no: string;
          party_name: string;
          qty: number;
          completed_qty: number;
          pending: number;
          completion_timestamp: string | null;
          is_completed: boolean;
          additional_comments: string | null;
          attachment_url: string | null;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          designer_id?: string | null;
          challan_no: string;
          party_name: string;
          qty: number;
          completed_qty?: number;
          // pending is GENERATED — never inserted directly
          completion_timestamp?: string | null;
          is_completed?: boolean;
          additional_comments?: string | null;
          attachment_url?: string | null;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          designer_id?: string | null;
          challan_no?: string;
          party_name?: string;
          qty?: number;
          completed_qty?: number;
          // pending is GENERATED — never updated directly
          completion_timestamp?: string | null;
          is_completed?: boolean;
          additional_comments?: string | null;
          attachment_url?: string | null;
          created_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "salvedge_records_designer_id_fkey";
            columns: ["designer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          message: string;
          type: "info" | "warning" | "urgent" | "success";
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          message: string;
          type?: "info" | "warning" | "urgent" | "success";
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          message?: string;
          type?: "info" | "warning" | "urgent" | "success";
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      coordinator_tasks: {
        Row: {
          id: string;
          requester_name: string;
          description: string;
          requested_at: string;
          is_completed: boolean;
          completed_at: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
          /** FK to-dos link back to the task they're about (migration 0072). */
          related_task_id: string | null;
        };
        Insert: {
          id?: string;
          requester_name: string;
          description: string;
          requested_at?: string;
          is_completed?: boolean;
          completed_at?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
          related_task_id?: string | null;
        };
        Update: {
          id?: string;
          requester_name?: string;
          description?: string;
          requested_at?: string;
          is_completed?: boolean;
          completed_at?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
          related_task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "coordinator_tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      full_kitting_details: {
        Row: {
          id: string;
          /** Set when this FK row was opened from a brief. Mutually
           *  exclusive with sample_id (DB CHECK enforces XOR). */
          task_id: string | null;
          /** Set when this FK row was opened from the Sampling screen.
           *  Mutually exclusive with task_id. */
          sample_id: string | null;
          submitted_by: string;
          fabric_details: string | null;
          colors: string | null;
          quantity: number | null;
          accessories: string | null;
          packing_type: "standard" | "premium" | "bulk" | "custom" | null;
          special_instructions: string | null;
          file_url: string | null;
          /** Storage paths for every attached file. First entry is mirrored
           *  into `file_url` so legacy single-file readers still work. */
          files: string[];
          created_at: string;
          // ── Added in 0021_full_kitting_form_fields.sql ───────────────
          form_payload:
            | Record<string, unknown>
            | null;
          data_entry_status:
            | "pending_image"
            | "pending_deo"
            | "in_progress"
            | "completed";
          priority:
            | "very_urgent"
            | "2_days"
            | "3_days"
            | "4_days"
            | "5_days"
            | null;
          form_date: string | null;
          party_name: string | null;
          image_url: string | null;
          completed_at: string | null;
          completed_by: string | null;
        };
        Insert: {
          id?: string;
          task_id?: string | null;
          sample_id?: string | null;
          submitted_by: string;
          fabric_details?: string | null;
          colors?: string | null;
          quantity?: number | null;
          accessories?: string | null;
          packing_type?: "standard" | "premium" | "bulk" | "custom" | null;
          special_instructions?: string | null;
          file_url?: string | null;
          files?: string[];
          created_at?: string;
          form_payload?: Record<string, unknown> | null;
          data_entry_status?:
            | "pending_image"
            | "pending_deo"
            | "in_progress"
            | "completed";
          priority?:
            | "very_urgent"
            | "2_days"
            | "3_days"
            | "4_days"
            | "5_days"
            | null;
          form_date?: string | null;
          party_name?: string | null;
          image_url?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
        };
        Update: {
          id?: string;
          task_id?: string | null;
          sample_id?: string | null;
          submitted_by?: string;
          fabric_details?: string | null;
          colors?: string | null;
          quantity?: number | null;
          accessories?: string | null;
          packing_type?: "standard" | "premium" | "bulk" | "custom" | null;
          special_instructions?: string | null;
          file_url?: string | null;
          files?: string[];
          created_at?: string;
          form_payload?: Record<string, unknown> | null;
          data_entry_status?:
            | "pending_image"
            | "pending_deo"
            | "in_progress"
            | "completed";
          priority?:
            | "very_urgent"
            | "2_days"
            | "3_days"
            | "4_days"
            | "5_days"
            | null;
          form_date?: string | null;
          party_name?: string | null;
          image_url?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "full_kitting_details_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: true;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "full_kitting_details_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      // 0023_deo_policies.sql — read-only view of kitting records awaiting
      // (or in the middle of) DEO data entry. The shape matches the SELECT
      // list in the migration exactly.
      deo_kitting_queue: {
        Row: {
          id: string;
          task_id: string | null;
          sample_id: string | null;
          image_url: string | null;
          party_name: string | null;
          priority:
            | "very_urgent"
            | "2_days"
            | "3_days"
            | "4_days"
            | "5_days"
            | null;
          data_entry_status:
            | "pending_image"
            | "pending_deo"
            | "in_progress"
            | "completed";
          form_date: string | null;
          created_at: string;
          task_code: string | null;
          concept: string | null;
          client_id: string | null;
          client_party_name: string | null;
          assignee_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      auth_role: { Args: Record<string, never>; Returns: UserRole };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_admin_or_coordinator: { Args: Record<string, never>; Returns: boolean };
      is_deo: { Args: Record<string, never>; Returns: boolean };
      create_fk_coordinator_task: {
        Args: { p_task_id: string; p_task_code: string; p_designer_name: string };
        Returns: undefined;
      };
      complete_fk_coordinator_task: {
        Args: { p_task_id: string; p_task_code: string };
        Returns: undefined;
      };
      split_my_claim: {
        Args: { p_task_id: string; p_keep: number };
        Returns: undefined;
      };
      next_task_code: { Args: Record<string, never>; Returns: string };
      next_concept_code: { Args: Record<string, never>; Returns: string };
      notify_user: {
        Args: {
          p_user_id: string;
          p_title: string;
          p_message: string;
          p_type?: string;
          p_link?: string | null;
        };
        Returns: string;
      };
      notify_users_batch: {
        Args: {
          p_user_ids: string[];
          p_title: string;
          p_message: string;
          p_type?: string;
          p_link?: string | null;
        };
        Returns: undefined;
      };
      update_assignment_claim: {
        Args: {
          p_id: string;
          p_new_qty: number;
        };
        Returns: { new_qty: number; deleted: boolean }[];
      };
      finalize_parent_task: {
        Args: {
          p_task_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: UserRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      md_status: ConceptStatus;
      concept_work_status: ConceptWorkStatus;
      designer_status: DesignerStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

// ============================================================================
// Helper generics
// ============================================================================

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

// ============================================================================
// Convenience aliases
// ============================================================================

export type Profile = Tables<"profiles">;
export type Client = Tables<"clients">;
export type Concept = Tables<"concepts">;
export type Task = Tables<"tasks">;
export type TaskLog = Tables<"task_logs">;
export type TaskComment = Tables<"task_comments">;
export type TaskCommentInsert = TablesInsert<"task_comments">;
export type TaskCommentUpdate = TablesUpdate<"task_comments">;
export type FileRecord = Tables<"files">;
export type SamplingLog = Tables<"sampling_logs">;
export type DesignerCode = Tables<"designer_codes">;
export type Sample = Tables<"samples">;
export type SalvedgeRecord = Tables<"salvedge_records">;
export type ConceptCategory = Tables<"concept_categories">;
export type Fabric = Tables<"fabrics">;
export type CoordinatorTask = Tables<"coordinator_tasks">;
export type Notification = Tables<"notifications">;
export type NotificationInsert = TablesInsert<"notifications">;
export type NotificationUpdate = TablesUpdate<"notifications">;
export type FullKittingDetail = Tables<"full_kitting_details">;
export type FullKittingDetailInsert = TablesInsert<"full_kitting_details">;
export type FullKittingDetailUpdate = TablesUpdate<"full_kitting_details">;
export type NotificationType = Notification["type"];
export type PackingType = FullKittingDetail["packing_type"];

/** Per-user UI preferences (column visibility). Migration 0040. */
export type UserPreferences = Tables<"user_preferences">;
export type UserPreferencesInsert = TablesInsert<"user_preferences">;
export type UserPreferencesUpdate = TablesUpdate<"user_preferences">;

export type ProfileInsert = TablesInsert<"profiles">;
export type ClientInsert = TablesInsert<"clients">;
export type ConceptInsert = TablesInsert<"concepts">;
export type TaskInsert = TablesInsert<"tasks">;
export type DesignerCodeInsert = TablesInsert<"designer_codes">;
export type SampleInsert = TablesInsert<"samples">;
export type SalvedgeInsert = TablesInsert<"salvedge_records">;

export type SampleUpdate = TablesUpdate<"samples">;
export type SalvedgeUpdate = TablesUpdate<"salvedge_records">;

/** Task assignment row — one designer's portion of a split task. Migration 0060. */
export type TaskAssignment = Tables<"task_assignments">;
export type TaskAssignmentInsert = TablesInsert<"task_assignments">;
export type TaskAssignmentUpdate = TablesUpdate<"task_assignments">;

/** External integration tables (migration 0073). */
export type ExternalIntegration = Tables<"external_integrations">;
export type WebhookOutbox = Tables<"webhook_outbox">;
export type WebhookOutboxInsert = TablesInsert<"webhook_outbox">;
export type IntegrationEvent = Tables<"integration_events">;
export type IntegrationEventInsert = TablesInsert<"integration_events">;

/** Task assignment joined with designer + assigner profiles. */
export interface TaskAssignmentWithDesigner extends TaskAssignment {
  designer: { id: string; full_name: string; avatar_url: string | null; role: string } | null;
  assigner: { full_name: string } | null;
}

// Joined shapes for common .select() expansions
type ProfileLite = Pick<Profile, "id" | "full_name" | "role" | "avatar_url">;
type ClientLite = Pick<Client, "id" | "party_name">;
type ConceptLite = Pick<
  Concept,
  "id" | "concept_code" | "title" | "image_url" | "md_status"
>;

export interface TaskWithRelations extends Task {
  client: ClientLite | null;
  assignee: ProfileLite | null;
  creator?: ProfileLite | null;
  /** Who filled the completion details (done → completed). */
  filler?: ProfileLite | null;
  /** The designer who previously held a carried-forward (handed-off) task. */
  carry_forwarder?: ProfileLite | null;
  concept_ref?: ConceptLite | null;
  task_logs?: TaskLog[];
  files?: FileRecord[];
  sampling_logs?: SamplingLog[];
  /** True when a full_kitting_details row exists for this task (joined as count). */
  full_kitting_details_added?: boolean;
}

export interface ConceptWithRelations extends Concept {
  submitter: ProfileLite | null;
  reviewer?: ProfileLite | null;
  designer?: ProfileLite | null;
  client?: ClientLite | null;
  tasks?: Pick<Task, "id" | "task_code" | "status">[];
}

/** Task comment row joined with the author's profile-lite shape. */
export interface TaskCommentWithAuthor extends TaskComment {
  author: ProfileLite | null;
}

/** Sample row joined with the auth user that created it (if any).
 *  Note: samples.created_by FK is to auth.users, not profiles — to render a
 *  full-name we have to fetch the corresponding profile by id separately or
 *  via a custom view. The hook will keep `creator` optional. */
export interface SamplesWithCreator extends Sample {
  creator?: ProfileLite | null;
}

/** Salvedge record joined with the designer profile. */
export interface SalvedgeWithDesigner extends SalvedgeRecord {
  designer: ProfileLite | null;
  creator?: ProfileLite | null;
}

// ============================================================================
// Runtime constants
// ============================================================================

export const TASK_STATUSES: readonly TaskStatus[] = [
  "pool",
  "todo",
  "in_progress",
  "full_kitting",
  "approved",
  "sampling",
  "done",
] as const;

export const USER_ROLES: readonly UserRole[] = [
  "admin",
  "design_coordinator",
  "designer",
] as const;

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const CONCEPT_STATUSES: readonly ConceptStatus[] = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
] as const;
