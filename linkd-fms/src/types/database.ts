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

export type UserRole = "admin" | "design_coordinator" | "designer";

export type TaskStatus =
  | "pool"
  | "todo"
  | "in_progress"
  | "full_kitting"
  | "approved"
  | "sampling"
  | "done";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type DesignerStatus = "active" | "inactive";

// Concept review status (called MdStatus in DB; ConceptStatus is the alias
// the views consume).
export type ConceptStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

export type MdStatus = ConceptStatus;

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
        };
        Insert: {
          id: string;
          full_name: string;
          role?: UserRole;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          role?: UserRole;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          party_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          party_name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          party_name?: string;
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
          remarks: string | null;
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
          remarks?: string | null;
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
          remarks?: string | null;
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
          client_id: string;
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
          created_by: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          task_code?: string;
          client_id: string;
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
          created_by: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          task_code?: string;
          client_id?: string;
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
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
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
          uid: string | null;
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
      full_kitting_details: {
        Row: {
          id: string;
          task_id: string;
          submitted_by: string;
          fabric_details: string | null;
          colors: string | null;
          quantity: number | null;
          accessories: string | null;
          packing_type: "standard" | "premium" | "bulk" | "custom";
          special_instructions: string | null;
          file_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          submitted_by: string;
          fabric_details?: string | null;
          colors?: string | null;
          quantity?: number | null;
          accessories?: string | null;
          packing_type: "standard" | "premium" | "bulk" | "custom";
          special_instructions?: string | null;
          file_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          submitted_by?: string;
          fabric_details?: string | null;
          colors?: string | null;
          quantity?: number | null;
          accessories?: string | null;
          packing_type?: "standard" | "premium" | "bulk" | "custom";
          special_instructions?: string | null;
          file_url?: string | null;
          created_at?: string;
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
      [_ in never]: never;
    };
    Functions: {
      auth_role: { Args: Record<string, never>; Returns: UserRole };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_admin_or_coordinator: { Args: Record<string, never>; Returns: boolean };
      next_task_code: { Args: Record<string, never>; Returns: string };
      next_concept_code: { Args: Record<string, never>; Returns: string };
    };
    Enums: {
      user_role: UserRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      md_status: ConceptStatus;
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
export type FileRecord = Tables<"files">;
export type SamplingLog = Tables<"sampling_logs">;
export type DesignerCode = Tables<"designer_codes">;
export type Sample = Tables<"samples">;
export type SalvedgeRecord = Tables<"salvedge_records">;
export type ConceptCategory = Tables<"concept_categories">;
export type Fabric = Tables<"fabrics">;
export type Notification = Tables<"notifications">;
export type NotificationInsert = TablesInsert<"notifications">;
export type NotificationUpdate = TablesUpdate<"notifications">;
export type FullKittingDetail = Tables<"full_kitting_details">;
export type FullKittingDetailInsert = TablesInsert<"full_kitting_details">;
export type FullKittingDetailUpdate = TablesUpdate<"full_kitting_details">;
export type NotificationType = Notification["type"];
export type PackingType = FullKittingDetail["packing_type"];

export type ProfileInsert = TablesInsert<"profiles">;
export type ClientInsert = TablesInsert<"clients">;
export type ConceptInsert = TablesInsert<"concepts">;
export type TaskInsert = TablesInsert<"tasks">;
export type DesignerCodeInsert = TablesInsert<"designer_codes">;
export type SampleInsert = TablesInsert<"samples">;
export type SalvedgeInsert = TablesInsert<"salvedge_records">;

export type SampleUpdate = TablesUpdate<"samples">;
export type SalvedgeUpdate = TablesUpdate<"salvedge_records">;

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
  concept_ref?: ConceptLite | null;
  task_logs?: TaskLog[];
  files?: FileRecord[];
  sampling_logs?: SamplingLog[];
}

export interface ConceptWithRelations extends Concept {
  submitter: ProfileLite | null;
  reviewer?: ProfileLite | null;
  designer?: ProfileLite | null;
  client?: ClientLite | null;
  tasks?: Pick<Task, "id" | "task_code" | "status">[];
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
