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

export type UserRole = "super_admin" | "admin" | "designer" | "production";

export type TaskStatus =
  | "pool"
  | "todo"
  | "in_progress"
  | "full_kitting"
  | "approved"
  | "sampling"
  | "done";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type MdStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revision_requested";

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
      concepts: {
        Row: {
          id: string;
          concept_code: string;
          title: string;
          description: string | null;
          image_url: string;
          submitted_by: string;
          md_status: MdStatus;
          md_reviewed_by: string | null;
          md_reviewed_at: string | null;
          md_planned_date: string | null;
          md_actual_date: string | null;
          md_notes: string | null;
          designer_planned_date: string | null;
          designer_actual_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          concept_code?: string;
          title: string;
          description?: string | null;
          image_url: string;
          submitted_by: string;
          md_status?: MdStatus;
          md_reviewed_by?: string | null;
          md_reviewed_at?: string | null;
          md_planned_date?: string | null;
          md_actual_date?: string | null;
          md_notes?: string | null;
          designer_planned_date?: string | null;
          designer_actual_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          concept_code?: string;
          title?: string;
          description?: string | null;
          image_url?: string;
          submitted_by?: string;
          md_status?: MdStatus;
          md_reviewed_by?: string | null;
          md_reviewed_at?: string | null;
          md_planned_date?: string | null;
          md_actual_date?: string | null;
          md_notes?: string | null;
          designer_planned_date?: string | null;
          designer_actual_date?: string | null;
          created_at?: string;
          updated_at?: string;
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
          started_at: string | null;
          kitted_at: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
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
          started_at?: string | null;
          kitted_at?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
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
          started_at?: string | null;
          kitted_at?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
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
      task_counters: {
        Row: {
          year: number;
          last_num: number;
        };
        Insert: {
          year: number;
          last_num?: number;
        };
        Update: {
          year?: number;
          last_num?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      auth_role: {
        Args: Record<string, never>;
        Returns: UserRole;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      next_task_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_concept_code: {
        Args: Record<string, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      md_status: MdStatus;
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

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

// ============================================================================
// Convenience aliases
// ============================================================================

export type Profile = Tables<"profiles">;
export type ProfileInsert = TablesInsert<"profiles">;
export type ProfileUpdate = TablesUpdate<"profiles">;

export type Client = Tables<"clients">;
export type ClientInsert = TablesInsert<"clients">;
export type ClientUpdate = TablesUpdate<"clients">;

export type Concept = Tables<"concepts">;
export type ConceptInsert = TablesInsert<"concepts">;
export type ConceptUpdate = TablesUpdate<"concepts">;

export type Task = Tables<"tasks">;
export type TaskInsert = TablesInsert<"tasks">;
export type TaskUpdate = TablesUpdate<"tasks">;

export type TaskLog = Tables<"task_logs">;
export type TaskLogInsert = TablesInsert<"task_logs">;
export type TaskLogUpdate = TablesUpdate<"task_logs">;

export type FileRecord = Tables<"files">;
export type FileInsert = TablesInsert<"files">;
export type FileUpdate = TablesUpdate<"files">;

export type SamplingLog = Tables<"sampling_logs">;
export type SamplingLogInsert = TablesInsert<"sampling_logs">;
export type SamplingLogUpdate = TablesUpdate<"sampling_logs">;

// ============================================================================
// Joined / view-shaped types — match common .select() expansions
// ============================================================================

type ProfileLite = Pick<Profile, "id" | "full_name" | "role" | "avatar_url">;
type ClientLite = Pick<Client, "id" | "party_name">;
type ConceptLite = Pick<Concept, "id" | "concept_code" | "title" | "image_url" | "md_status">;

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
  tasks?: Pick<Task, "id" | "task_code" | "status">[];
}

export interface TaskLogWithUser extends TaskLog {
  changer: ProfileLite | null;
}

// ============================================================================
// Runtime constants — useful for dropdowns, zod schemas, kanban columns
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
  "super_admin",
  "admin",
  "designer",
  "production",
] as const;

export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

export const MD_STATUSES: readonly MdStatus[] = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
] as const;
