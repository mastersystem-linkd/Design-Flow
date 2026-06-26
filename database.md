# LinkD FMS — Database Brain (`database.md`)

> Single source of truth for the backend. Every table, its fields, its links, the
> rules that guard it (RLS / triggers / constraints), the RPCs, the storage
> buckets — and **where each table renders in the frontend**.
>
> **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime). Prod ref `jyfwyfpwbbgfpsntubfy`.
> **Frontend:** React 18 + Vite + TS, `@tanstack/react-query` v5, `@supabase/supabase-js` **pinned 2.45.4**.
> **Schema authority:** `linkd-fms/src/types/database.ts` (typed mirror) + `supabase/migrations/0001…0089`.
> Migrations are applied **manually** on prod (not via MCP); column-adding migrations end with `NOTIFY pgrst, 'reload schema';`.

---

## 0. Roles & cross-cutting rules

**Roles (`user_role` enum):** `super_admin`, `admin`, `design_coordinator`, `deo` (data-entry operator), `designer`.

**Permission helpers (SQL, used in RLS) — mirror `lib/permissions.ts`:**
- `auth_role()` → caller's `profiles.role`.
- `is_admin()` → `super_admin | admin`.
- `is_admin_or_coordinator()` → `super_admin | admin | design_coordinator`.
- `is_deo()` → `deo`.
- `super_admin` has a blanket `FOR ALL` permissive policy on every RLS table (migration 0057).

**Conventions baked into almost every table:**
- `id uuid default gen_random_uuid()` PK · `created_at` / `updated_at timestamptz` · `touch_updated_at` trigger stamps `updated_at` on UPDATE.
- Soft-delete is per-table (`tasks.deleted_at`, `profiles.is_active`), not global.
- FK columns referencing a person point at `profiles(id)` (which mirrors `auth.users(id)`).

**Realtime publication (`supabase_realtime`):** `notifications` (0013), `tasks` (0041, REPLICA IDENTITY FULL), `concepts` (0054, FULL), `task_assignments` (0060, FULL).

---

## 1. Enums & status vocabularies

| Enum / domain | Values | Where defined | Used by |
|---|---|---|---|
| `user_role` | super_admin · admin · design_coordinator · deo · designer | 0001 (+0006/0008/0022/0048) | `profiles.role` |
| `task_status` | pool · todo · in_progress · full_kitting · approved · sampling · **done** · **completed** | 0001 (`completed` 0039) | `tasks.status`, `task_logs` |
| `task_priority` | low · normal · high · urgent | 0001 | `tasks.priority`, `concepts.priority` |
| `md_status` (ConceptStatus) | pending · approved · rejected · revision_requested | 0001 | `concepts.md_status` |
| `concept_work_status` | not_started · in_progress · on_hold · done_partial · in_revision · changes_requested · completed | 0025 | `concepts.work_status` |
| `designer_status` | active · inactive | 0007 | `designer_codes.status` |
| `kitting_data_entry_status` | pending_image · pending_deo · in_progress · completed | 0021 | `full_kitting_details.data_entry_status` |
| `kitting_priority` | very_urgent · 2_days · 3_days · 4_days · 5_days | 0021 | `full_kitting_details.priority` |
| `sample_status` | pending · in_progress · completed | 0069 | `samples.sample_status` |
| sample `source` | manual · task_completion | 0069 | `samples.source` |
| `brief_type` | ld · job_work | 0038 | `tasks.brief_type` |
| `client_group` | ld · job_work | 0037 | `clients.client_group` |
| `order_or_sample` | order · sample · '' | 0010 | `samples.order_or_sample` |
| `packing_type` | standard · premium · bulk · custom | 0021 | `full_kitting_details.packing_type` |
| assignment `status` | assigned · in_progress · done · completed | 0060 | `task_assignments.status` |
| notification `type` | info · warning · urgent · success | 0013 | `notifications.type` |

> Most of these are stored as **text + CHECK** (not native PG enums), so values are extended by editing the CHECK, not `ALTER TYPE` — except `task_status` which IS a native enum (hence `ALTER TYPE … ADD VALUE 'completed'` in 0039).

---

## 2. Tables by domain

Legend for field tables — **PK** primary key · **FK→** foreign key · **gen** generated/stored · **N** nullable.

---

### 2A. Identity & lookups

#### `profiles` — users + roles
Mirror of `auth.users`; auto-created by `handle_new_user` trigger on signup.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| full_name | text | |
| role | user_role | default `designer` |
| avatar_url | text N | storage path in `avatars` |
| is_active | bool N | soft-delete flag; `active_profiles` view = `WHERE is_active` |
| deactivated_at / deactivated_by | timestamptz N / uuid N | |
| created_at / updated_at | timestamptz | `created_at` doubles as **date of joining** (editable in Team) |

- **Relationships:** referenced by almost every table's `*_by` / `assigned_to` / `designer_id`.
- **RLS:** read = any authed · self-update (name/avatar only, role preserved) · admin/coord update (incl. role) · no hard delete.
- **🖥 Frontend:** hook `useProfiles` (`useAuth` for session) → **TeamView** (roster), **ProfileView** (self-edit), **ScorecardsView**, designer pickers everywhere. Privileged email/password edits go through Vercel `api/admin-update-user.ts` (service-role).

#### `user_preferences` — per-user table prefs (§14/§20)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK→profiles **unique** | one row per user |
| visible_columns | jsonb | `{ current, defaults }` per pipeline stage (legacy shapes tolerated by `normalizeStored`) |
| table_density | text | `comfortable` \| `compact` (0047) |
| updated_at | timestamptz | |

- **RLS:** own row only (admin read-all). **🖥** hook `useUserPreferences` → **KanbanView** column menu + density toggle.

#### `designer_codes` — designer identifier letters (e.g. U/V/S)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK · profile_id | FK→profiles |
| code | text **unique** | the letter used in `task_code` regeneration on claim |
| joining_date / leaving_date | date / date N | |
| status | designer_status | active \| inactive |

- **RLS:** read any authed · write `is_admin()`. **🖥** hook `useDesignerCodes` → **TeamView**, **DesignerCodesTab** (Settings), **ProfileView**.

#### `clients` — party names (§12)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| party_name | text | **unique per group** (`(party_name, client_group)` since 0042) |
| client_group | client_group | `ld` \| `job_work` — same name may exist in both |

- **RLS:** read any authed · insert admin/coord/designer · update/delete admin/coord. **🖥** hook `useClients` (`ldClients`/`jobWorkClients`) → **BriefingView** party picker, **ClientManagementTab** (Settings CRUD), **SalvedgeView**.
- **Default LD party:** **LD briefs carry `client_id = NULL`** (no external party), but the canonical internal party **"LD Silk Mills"** is a real row in this table (LD group). `createPendingSample` resolves it via `resolveDefaultLdParty()` so sampled LD tasks store the real backend party name — **never hardcode the string** (rename in Settings → Party Name flows through). Frontend task tables still use a synchronous `brief_type==='ld' ? 'LD Silk Mills' : '—'` fallback in ~9 spots (display-only).

#### Managed dropdown lookups (§16) — shared shape `(id, name, sort_order, is_active, timestamps)`
| Table | Extra cols | Scopes | Defines (mig) | 🖥 Rendered |
|---|---|---|---|---|
| `concept_categories` | — | — | 0011 | BriefingView concept picker; Settings → Categories |
| `fabrics` | — | — | 0011 | BriefingView, **ClaimTaskModal**, KanbanView fabric column; Settings → Fabrics |
| `assigned_by_options` | `context` | **unique `(name, context)`**; context = task \| full_kitting \| sampling (0047) | 0045/0047 | "Assigned By" in BriefingView / FullKittingForm / sampling; Settings → Dropdowns |
| `received_by_options` | — | — | 0049 | "Received By" in FullKittingFormView; Settings |
| `sampling_dropdowns` | `field` | **unique `(name, field)`**; field = requirement \| sampling_done_by \| fusing_operator | 0051/0052 | sampling form pickers; Settings → Dropdowns |
| `requester_options` | — | — | 0083 | "Requester" in CoordinatorTasksView; Settings → Dropdowns |
| `task_sources` | `is_whatsapp` | — | 0086 | brief **Group** picker (BriefingView/EditTaskDialog); Settings → Dropdowns → Tasks → Task Source |

- **RLS (all):** read any authed · write `is_admin_or_coordinator()` (widened from admin-only in 0046). Hooks: `useConceptCategories`, `useFabrics`, `useAssignedByOptions(context)`, `useReceivedByOptions`, `useSamplingDropdowns`, `useRequesterOptions`, `useTaskSources`. Each falls back to a built-in list if the table is empty. **`task_sources`** adds an `is_whatsapp` boolean (per-row toggle in Settings) that drives the green WhatsApp icon in the brief Group picker — `LookupSection`'s optional `flagColumn` renders the toggle + add-form checkbox.

---

### 2B. Tasks (the core pipeline)

#### `tasks` — briefs / orders
Pipeline: **pool → in_progress → done → completed** (`full_kitting` displays as In Progress; `todo`/`approved`/`sampling` legacy).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK · task_code | text **unique** `ORD-YYYY-NNNN` (`next_task_code(prefix)`); regenerated with designer letter on claim; **ERP tasks (`external_source='sales_erp'`) get `EORD-YYYY-NNNN`** (0080), not relettered |
| client_id | uuid N FK→clients | **NULL for `ld`**, required for `job_work` (CHECK `tasks_brief_type_client_consistency`, 0038) |
| brief_type | brief_type | ld \| job_work (0038) |
| concept_id | uuid N FK→concepts · concept | text label |
| qty / qty_completed | int | `qty >= 0` (0056); `qty_completed >= 0` **may exceed qty** (extra designs; upper bound dropped 0043/0044) |
| fabric | text · mtr | int N (legacy) |
| priority | task_priority · status | task_status |
| assigned_to | uuid N FK→profiles | the working designer (null = Open Pool) |
| planned_deadline / due_time | date N / time N | designer sets deadline at claim |
| whatsapp_group | text N | brief source/group; options from the managed **`task_sources`** table (0086) — `lib/whatsappGroups.ts` is now only the fallback |
| whatsapp_received_date / _time | date N / text N | brief arrival on WhatsApp (0036, both required at submit) |
| description / notes | text N | |
| requires_full_kitting | bool | gate: must add FK before completing |
| full_kitting_image_url / _notes / _submitted_at / _submitted_by | — | legacy inline FK fields (now mostly in `full_kitting_details`) |
| assigned_by | text N | from `assigned_by_options` (task context) |
| started_at / kitted_at / assigned_at / completed_at | timestamptz N | lifecycle stamps |
| started_late | bool · delay_days | int N |
| completion_fabric / completion_mtr / completion_filled_by / completion_filled_at | — | post-done completion (0040) |
| requirement_received_at | timestamptz N | pool FIFO anchor |
| sampling_required / sampling_flagged_at / sampling_flagged_by | bool / ts N / uuid N | sampling toggle (0069) |
| carry_forward_note / _from / _at | text N / uuid N / ts N | hand-off context (0056) |
| pool_sequence / pool_week_start | int N / date N | weekly pool ordering (0059) |
| is_split / qty_remaining | bool / int N | split-task rollup (0060) |
| created_by | uuid FK→profiles · created_at / updated_at · deleted_at | timestamptz N (soft-delete) |

- **FK:** client_id→clients, concept_id→concepts, assigned_to/created_by/carry_forward_from→profiles.
- **Key constraints/indexes:** brief-type consistency CHECK; pool FIFO index `(priority desc, requirement_received_at asc, created_at asc) WHERE status='pool'` (0040); pool-sequence index (0059).
- **Triggers:** `tasks_before_save` (auto `task_code`, stamp `started_at`/`kitted_at`); `tasks_log_change` → writes `task_logs`; `trg_assign_pool_sequence` (0059, resets Monday).
- **RLS:** read any authed (hide `deleted_at` from non-admins) · insert admin/coord/designer (self as creator) · update admin/coord any field, assignee/creator limited, **any authed may claim a `status='pool'` row** (0016) · delete admin/coord.
- **Realtime:** yes (0041). 
- **🖥 Frontend:** hooks `useTasks` (+ `usePoolWithGhosts`), `useTaskMutations` (`createTask`, `claimPoolTask`, `markTaskDone`, `completeTask`, `returnToPool`, `flagSamplingRequired`…). Rendered in **KanbanView** (All Tasks board), **PoolQueueTable**, **TaskDetailDrawer**, **ClaimTaskModal**, dashboards.

#### `task_assignments` — split-task portions (§30)
One row per designer's slice of a task. The DB owns the parent rollup.

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| task_id | uuid FK→tasks · designer_id uuid FK→profiles | **unique `(task_id, designer_id)`** |
| assigned_by | uuid N FK→profiles | |
| qty_assigned | int | CHECK `> 0` |
| qty_completed | int | `>= 0`, **may exceed** qty_assigned; **< qty_assigned blocks done/completed** (0068) |
| planned_deadline / started_at / completed_at | — · delay_days int N | |
| status | text | assigned · in_progress · done · completed |
| design_type | text N | per-design sampling key (0070) |
| completion_fabric / completion_filled_at | — | per-portion completion |
| notes · created_at / updated_at | | |

- **Trigger `recalc_task_from_assignments()`** (0060/0063, AFTER ins/upd/del) → recomputes parent `tasks`: `qty_completed = Σ`, `qty_remaining = GREATEST(qty − Σqty_assigned,0)`, `is_split = COUNT>1`, `status` (completed if all completed · done if all done · in_progress if any). **Never compute parent status in React.**
- **Trigger `trg_enforce_assignment_constraints`** (0062/0068): min-qty gate, auto `assigned→in_progress` on first design, over-assign guard `Σqty_assigned ≤ task.qty`.
- **RLS:** read any authed · insert self (`designer_id=auth.uid()`) or admin/coord · update own/admin · delete admin/coord. **Realtime:** yes (0060).
- **🖥** hook `useTaskAssignments(taskId)` → **AssignmentsPanel** (in TaskDetailDrawer), **ClaimTaskModal** (claim portion), **SplitTaskDialog**, **PoolQueueTable** (remaining/total).

#### `task_logs` — append-only status audit
`id · task_id FK→tasks · status_from N · status_to · changed_by FK→profiles · note N · timestamp`.
- Written by `tasks_log_change` trigger. **Immutable** (no update/delete). **🖥** Activity timeline in **TaskDetailDrawer** (via `useTaskDetail`).

#### `task_comments` — discussion thread (§ realtime)
`id · task_id FK→tasks · user_id FK→profiles · body · timestamps`.
- **RLS:** read any authed · insert self · update own · delete own/admin-coord. **🖥** hook `useTaskComments` (useState + realtime) → comments section in **TaskDetailDrawer**.

#### `files` — task file metadata
`id · task_id FK→tasks · storage_url · file_name · file_size · uploaded_by FK→profiles · uploaded_at`.
- Points at objects in the **design-files** bucket (`{uid}/tasks/{taskId}/…`). **RLS:** read any authed · insert self · delete own/admin-coord.
- **🖥** joined into `useTasks` (`files(...)`) + `useTaskDetail`; rendered as **Reference** chips in KanbanView, TaskDetailDrawer, ClaimTaskModal; uploaded by BriefingView (after task create) & EditTaskDialog.

---

### 2C. Concepts (the design-approval pipeline)

#### `concepts` — 4-stage concept workflow (§23–29)
Pipeline: **Submit → MD Approval → Designer Completion → Final Approval**, with a parallel `work_status` lifecycle.

| Field group | Fields |
|---|---|
| identity | id · concept_code (text **unique** `C-YYYYMMDD-XXXX`) · title · description N · image_url · files[] N · fabric N (0058) · remarks N |
| people | submitted_by FK→profiles · designer_id N FK→profiles · md_reviewed_by N FK→profiles · client_id N FK→clients · assigned_by N · priority |
| MD stage | md_status (ConceptStatus) · md_planned_date N · md_actual_date N · md_reviewed_at N · md_notes N · md_feedback N |
| designer stage | designer_planned_date N · designer_actual_date N · start_date N · designs_count N · approved_designs_count N |
| final stage | final_approval_planned_date N · final_approval_actual_date N · final_approval_notes N · final_approved_at N |
| work lifecycle (0026) | work_status · work_started_at N · work_held_at N · work_resumed_at N · work_completed_at N · hold_reason N · hold_count · revision_count · total_hold_duration N |
| audit | completion_history (jsonb[]) · created_at / updated_at |

- **FK:** submitted_by / md_reviewed_by / designer_id → profiles; client_id → clients.
- **Triggers:** auto `concept_code` + `md_planned_date = created+1d`; on MD-approval stamp dates & flip `work_status→in_progress` (0026/0029); designer_planned_date = +4d on approval.
- **RLS (stage-gated, §24):** read any authed · insert self · update owner during pending/revision, owner during approval window (work_status transitions), admin/coord for finalization · delete admin/coord OR submitter OR designer (0053). **MD-approve = admin/super_admin only** (`isMdRole`); coordinators cannot.
- **Realtime:** yes (0054).
- **🖥** hook `useConcepts` (+ realtime) and mutations (`submitConcept`, `editConcept`, `reviewConcept`, `startConcept`, `holdConcept`, `resumeConcept`, `markConceptDone`, `approveDesign`, `suggestChanges`, `deleteConcept`). Rendered in **ConceptsView**, **ConceptDetailDrawer**, Concept Dashboard (`AnalyticsView`/`useAnalytics`).

---

### 2D. Sampling

#### `samples` — sampling / order records (§7)
Walk-in (manual) **and** auto-created on task completion (`source='task_completion'`, §13/§ sampling-required).

| Field | Type | Notes |
|---|---|---|
| id · uid | uuid PK · text **unique** `SMP-YYYY-NNNN` (`next_sample_uid(prefix)`, 0032); **ERP samples (`source='sales_erp'`) get `ESMP-YYYY-NNNN`** (0080) |
| sr_no | int N | |
| party_name | text | |
| quality / requirement / assigned_by / sampling_done_by / fusing_operator | text N | dropdown-driven |
| total_fabrics_received | int N · printed_mtr int |
| pending_qty | int **gen** | = total_fabrics_received − printed_mtr (stored) |
| order_or_sample | text | order \| sample \| '' |
| is_completed bool · completion_timestamp ts N | |
| neatly_prepared / has_form bool · photo_url / video_url / signature_url / full_kitting_image_url N | |
| requires_full_kitting | bool | |
| additional_comments | text N | |
| created_by | uuid N FK→profiles | |
| task_id | uuid N FK→tasks | set when created from a brief (null for walk-ins) |
| sample_status | text | pending · in_progress · completed (0069) · **dropped** (0082, ERP QC discard/drop) |
| source | text | manual · task_completion (0069) · sales_erp (0074) |
| design_type | text N | per-design (0070) |
| external_source / external_ref_id / external_callback_url | text N | Sales-ERP provenance + per-request callback (0073) |
| external_brief | jsonb N | original ERP brief; pre-fills the review/development form (0073) |
| approved_by / approved_at | uuid N FK→auth.users · ts N | reviewer + time of the ERP review→approve gate (0081) |
| sample_history | jsonb | append-only audit log (approved + qc events); default `[]` (0081) |
| drop_reason / drop_notes | text N | abandon reason + notes; feed the `sample.dropped` webhook (0082) |
| qc_summary | jsonb N | passing-round summary (quality/operators/date); feeds the `sample.completed` webhook (0082) |

- **Dedup:** `unique (task_id, quality, design_type)` for `source='task_completion'` (0070) → one sample per (task, fabric, design).
- **Triggers:** auto `uid` (`ESMP-` prefix when `source='sales_erp'`, else `SMP-` — 0080); auto-complete stamp on `is_completed`.
- **ERP review→approve (0081):** ERP samples land `sample_status='pending'` ("Awaiting Review" in **Pending Samples**); the reviewer opens the pre-filled `SampleDevelopmentDialog` ("Review ERP Sample Request"), edits if needed, then **Approve & Start Development** → `useSamples.approveSample` sets `in_progress`, stamps `approved_by/at`, appends `{event:'approved'}` to `sample_history`. Manual/task samples are unaffected (simple Completed toggle).
- **ERP QC completion (0082, ERP-only):** an `in_progress` ERP sample can only be completed via **Run QC** (`SampleQcDialog`, gated in `SamplingFormDialog`). `useSamples.recordQc` writes a `sample_qc_rounds` row + appends to `sample_history`: **Pass** → `completed` + `qc_summary` (hard interlock: can't pass with a Bad reading) → existing `sample.completed` webhook; **Resample** → stays `in_progress`, attempt_no++ (loop, same ref_id); **Discard/Drop** → `dropped` + `drop_reason`/`drop_notes` → **`sample.dropped`** webhook. Manual samples keep the simple Completed toggle.
- **RLS:** read any authed · insert self/admin-coord · update own/admin-coord · delete admin-coord (widened 0048).
- **🖥** hook `useSamples`; auto-insert via `lib/createPendingSample.ts` (called by `completeTask`/`flagSamplingRequired`/`completePortion`). Rendered in **ProductionView** (Completed Samples + **Pending Samples** tabs via `PendingSamplesPanel`), sampling form (`SamplingFormDialog`/`BatchSampleEntry`), FilesView.
- **`createPendingSample` (party + errors):** resolves `party_name` + `uid` via **two plain queries** (`tasks` then `clients`), NOT a nested embed (the `samples→task→client` embed returns a null client → blank party). **LD briefs** fall back to the default LD party from `clients` (`resolveDefaultLdParty()`). A real insert failure (not the 23505 dedup) is **surfaced via toast** — the task completion still succeeds.
- **⚠ Schema-cache gotcha:** 0069/0070 add `source` / `sample_status` / `design_type` but **do not** `NOTIFY pgrst, 'reload schema'`. After applying them, reload the cache or every auto-sample insert silently fails on an "unknown column" (this is exactly what makes Pending Samples stay empty).

#### `sample_qc_rounds` — ERP QC inspection rounds (0082)
One row per QC attempt on an ERP sample: `id · sample_id FK→samples (cascade) · attempt_no (unique per sample) · passed bool · print_quality good|bad · fusing_quality good|bad · done_date · printing_operator · fusing_operator · outcome pass|resample|discard|drop · failure_reasons text[] · reinspect_date · notes · inspected_by FK→auth.users · created_at`.
- **RLS:** read any authed · write `is_admin_or_coordinator()`.
- **Written by** `useSamples.recordQc` (one insert per Run-QC submit). Resample loops keep the same `sample_id` and bump `attempt_no`; the parent sample's status / `qc_summary` / `drop_*` update in the same call. The `samples` webhook trigger then emits `sample.completed` (pass) or `sample.dropped` (discard/drop). **🖥** `SampleQcDialog` (Run QC, ProductionView row menu).

#### `sampling_logs` — legacy per-print log
`id · task_id FK→tasks · meters_printed · proof_url N · logged_by FK→profiles · logged_at`. Superseded by `samples`; still read in TaskDetailDrawer sampling history.

---

### 2E. Full Knitting (DEO workflow)

#### `full_kitting_details` — the kitting form + DEO digitization (§13/§16)
Opened from **either** a task **or** a sample (XOR).

| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| task_id | uuid N FK→tasks **unique** | XOR with sample_id (CHECK `full_kitting_details_link_xor`, 0031) |
| sample_id | uuid N | **unique** (0031); XOR with task_id |
| submitted_by | uuid FK→profiles | |
| fabric_details / colors / accessories / special_instructions | text N · quantity int N | |
| packing_type | text N | standard · premium · bulk · custom |
| file_url N · files[] | storage paths (first mirrors file_url) |
| form_payload | jsonb N | full 12-field digital form (0021) |
| data_entry_status | text | pending_image · pending_deo · in_progress · completed (0021) |
| priority | text N | very_urgent · 2_days … 5_days |
| form_date N · party_name N · image_url N | coordinator's uploaded form photo (Stage A) |
| completed_at N · completed_by N · created_at | |

- **Trigger:** on `form_payload` non-null → `data_entry_status='completed'` + stamp.
- **RLS:** read any authed · insert self · update admin/coord any, **DEO may edit form/status when image_url present** (0023) · delete admin.
- **🖥** lib `kittingQueries.ts` (`initiateKitting`, `claimKitting`, `submitKittingForm`, `approveKitting`) + hook `useFullKitting`. Rendered in **KittingStageADialog** (coordinator Stage A upload — also fires designer "FK added" notify + `complete_fk_coordinator_task`), **FullKittingDrawer/FormView**, **KittingQueueView** (DEO), **CompletedKittingPanel**, FK column in KanbanView/TaskDetailDrawer.

#### `deo_kitting_queue` — **view** (0023/0031)
Read-only SELECT joining `full_kitting_details → tasks → clients`, filtered to `data_entry_status IN (pending_deo, in_progress)`; supports both task- and sample-sourced rows. **🖥** **KittingQueueView** (DEO landing).

---

### 2F. Salvedge, coordination & notifications

#### `salvedge_records` — challan fabric distribution (§15)
`id · designer_id N FK→profiles · challan_no · party_name · qty · completed_qty · pending (gen) · is_completed · completion_timestamp N · additional_comments N · attachment_url N · created_by N`.
- **gen** `pending = qty − completed_qty`; auto-complete trigger when `completed_qty ≥ qty`.
- **RLS:** read any authed · insert self/admin-coord · update own (designer_id) /admin-coord · delete admin-coord (0048). **🖥** hook `useSalvedge` → **SalvedgeView** (designers see own rows only).

#### `coordinator_tasks` — coordinator to-do log (§28, FK feature §0071/0072)
| Field | Type | Notes |
|---|---|---|
| id | uuid PK | |
| requester_name | text | who asked (or the designer who claimed without FK) |
| description | text | e.g. "Add Full Knitting details for ORD-… — designer started working without them." |
| requested_at · is_completed · completed_at N · notes N | | |
| created_by | uuid FK→profiles | |
| **related_task_id** | uuid N FK→tasks (ON DELETE SET NULL) | **0072** — hard link enabling the "Add FK ↗" redirect + auto-complete |

- **RLS:** `is_admin_or_coordinator()` full CRUD (0049). The FK rows are **created/closed by SECURITY DEFINER RPCs** so a designer's claim can insert one.
- **🖥** hook `useCoordinatorTasks` (useState, refetch-on-mount) → **CoordinatorTasksView**. FK rows show **Add FK ↗** (when `related_task_id && !is_completed`) → `/dashboard?status=in_progress&focus=<id>` (KanbanView focus banner). Auto-flips Pending→Done when the coordinator uploads FK.

#### `notifications` — in-app feed (§8.6)
`id · user_id FK→profiles · title · message · type (info|warning|urgent|success) · link N · is_read · created_at`.
- **RLS:** select own · insert any authed (or via `notify_user` RPC) · update own (is_read) · delete admin. **Realtime:** yes (0013) — `useNotifications` plays a chime on INSERT.
- **Always send via** `lib/notifications.ts` (`sendNotification`/`sendNotificationToMany`/`sendNotificationToRole`) → `notify_user`/`notify_users_batch` RPCs. **🖥** **NotificationBell** (TopNav) + **NotificationsView**.
- **Coordinator = actionable-only feed (§8.6):** completion/status/claim sends target `["admin"]`, **not** `["admin","design_coordinator"]` — coordinators were drowning in noise (task/portion completed, claim joined/released/resized, concept started/on-hold/resumed/added, Stage-2 resubmit, FK submitted, DEO digitized, QC pass/fail/drop). They KEEP only **actionable** sends: Full Knitting Needed, New Sample Pending (task-completion + Sales ERP), held-concept >4-day alerts, Stage-4 concept final review, server-side ERP new-task/new-sample, and the daily overdue cron. Recipient set is decided per call site; **don't re-add `design_coordinator` to a completion send.**

> Counter tables `task_counters` / `sample_counters` back the ID generators (no RLS, server-only).

#### `deleted_records` — Recycle Bin / recoverable deletes (§37, migration 0087)
`id · table_name · record_id · data jsonb (to_jsonb(OLD)) · deleted_at · deleted_by N FK→profiles · batch_id (txid_current) · expires_at (now()+30d) · restored_at N`.
- **Capture:** SECURITY DEFINER trigger `fn_archive_deleted_row()` is `BEFORE DELETE FOR EACH ROW` on **tasks, samples, concepts, salvedge_records, task_comments, notifications, task_assignments, full_kitting_details, files, task_logs, sampling_logs, coordinator_tasks**. Snapshots every delete (service-role, RLS, AND cascade children) — no app code involved. Same transaction ⇒ same `batch_id` = one restore point. The `files` branch ALSO bins the `design-files` blob as a `__storage__` row (same batch). `table_name='__storage__'` rows hold `{bucket,path,name,size}` and are NOT removed from Storage until purge.
- **RLS:** super_admin only. **Realtime:** no. **Auto-purge:** pg_cron `purge-recycle-bin` daily → `fn_purge_expired_recycle_bin()` (DB snapshots); expired file blobs swept by the route on `list`/`counts`.
- **🖥** **Settings → Recycle Bin** (`RecycleBinTab`, super_admin) via `useRecycleBin` → `api/admin-recycle-bin.ts` (list/batch/restore/purge/counts). Restore re-inserts parents-first with original codes (generator triggers no-op on non-null). Client file-trash goes through `lib/recycleFiles.ts` (`fn_bin_storage_files` / `fn_binned_storage_paths`). `useFiles` hides binned files.

---

## 3. RPC functions (callable from the client)

| Function | Args | Security | Purpose |
|---|---|---|---|
| `next_task_code(prefix='ORD')` | — | DEFINER | `{prefix}-YYYY-NNNN`, per-year atomic, resets Jan 1; **`EORD-` for ERP tasks** (0080) |
| `next_concept_code()` | — | DEFINER | `C-YYYYMMDD-XXXX` randomized |
| `next_sample_uid(prefix='SMP')` | — | DEFINER | `{prefix}-YYYY-NNNN`, per-year (0032); **`ESMP-` for ERP samples** (0080) |
| `notify_user` | p_user_id, p_title, p_message, p_type='info', p_link | DEFINER | insert a notification for anyone (bypasses role RLS) |
| `notify_users_batch` | p_user_ids[], … | DEFINER | broadcast to many |
| `fn_archive_deleted_row` | (trigger) | DEFINER | snapshots `OLD` into `deleted_records` before any delete; bins every storage column's blob in the same batch (Recycle Bin, §37/0087, extended 0089) |
| `fn_bin_one_blob` | p_bucket, p_path, p_by, p_batch | DEFINER | bin a single blob (dedup-guarded); used by the archive trigger to recycle a deleted entity's every storage column (0089) |
| `fn_bin_storage_files` | p_files jsonb | DEFINER | bin storage files (record only, no blob removal); dedups active `(bucket,path)` (0088); used by `trashFiles()` |
| `fn_binned_storage_paths` | — | DEFINER | active `(bucket,path)` in the bin so the Files browser hides them |
| `fn_purge_expired_recycle_bin` | — | DEFINER | daily pg_cron purge of expired DB snapshots |
| `fn_clear_all_transactional` | — | DEFINER (service_role only) | Danger Zone "Clear all" in ONE txn ⇒ one Recycle-Bin batch; does NOT reset task_counters (0088) |
| `update_assignment_claim` | p_id, p_new_qty | DEFINER | resize a split portion; guards: not below qty_completed, not over remaining, abandon only if 0 done (0064) |
| `finalize_parent_task` | p_task_id | DEFINER | stamp parent completed when last portion done (0066) |
| `recalc_task_from_assignments` | — (trigger) | — | parent rollup from portions (0063) |
| `create_fk_coordinator_task` | **p_task_id, p_task_code, p_designer_name** | DEFINER | designer claimed without FK → deduped coordinator to-do, sets `related_task_id` (0071→**0072**) |
| `complete_fk_coordinator_task` | **p_task_id, p_task_code** | DEFINER | coordinator added FK → auto-close open FK to-do(s) (0072) |
| `reset_pool_sequences` | — | DEFINER | weekly pool re-sort (0059) |
| `auth_role` / `is_admin` / `is_admin_or_coordinator` / `is_deo` | — | stable | RLS helpers |

> **Privileged admin ops** (edit any user's email/password, list emails, change `created_at`) do **not** use RPCs — they run on **Vercel** serverless `linkd-fms/api/*.ts` with the service-role key, called via `lib/adminApi.ts`.

---

## 4. Storage buckets

| Bucket | Limit | Path convention | Policies |
|---|---|---|---|
| `design-files` | 100 MB, any MIME (0016) | `{uid}/tasks/{taskId}/…`, `{uid}/…` | read any authed · insert own folder · delete admin-coord |
| `sample-files` | 100 MB | `{uid}/kitting/…`, `{uid}/…` | read any authed · insert own folder · delete admin-coord |
| `proof-photos` | 100 MB | — | read any authed · insert/delete admin-coord |
| `task-files` / `sampling-proofs` / `avatars` | (legacy/minimal, 0003) | — | avatars public-read/self-write; others authed-read |

> RLS requires upload paths to start with `{auth.uid()}/`. Images must pass through `compressImage()` before upload.

---

## 5. Lifecycles at a glance

**Task:** `pool → in_progress → done → completed`
- Claim a pool task (FIFO, `claimPoolTask`) or split it (`task_assignments`). `done` = work finished, awaiting fabric. `completed` = fabric recorded. FK-required tasks are **gated** from completing until `full_kitting_details` exists.

**Full-Knitting coordinator loop (§0071/0072):**
`designer ACTUALLY claims FK-pending task (fires on the claim's onClaimed, not the "Continue Without FK" intent) → create_fk_coordinator_task (to-do, linked via related_task_id, deduped) → coordinator clicks "Add FK ↗" → KanbanView focus-filters to that task → uploads form (KittingStageADialog) → initiateKitting + notify designer + complete_fk_coordinator_task (to-do → Done)`.

**Concept:** `Submit → MD Approval (admin only) → Designer Completion → Final Approval (admin+coord)`, with `work_status` (not_started→in_progress→on_hold/…→completed) tracked in parallel.

**Sampling:** brief completion with `sampling_required` (or flag-later via the row ⋮) → `createPendingSample` inserts a `samples` row (`source=task_completion`, `sample_status=pending`, party from the task's client **or the default LD party for LD briefs**, deduped per task+quality+design_type) → appears in **Pending Samples** → coordinator processes the form → **Completed Samples**.

**Split task:** `splitTask`/`claimPortion` write `task_assignments`; `recalc_task_from_assignments` trigger owns the parent task's qty/status. Frontend only reads the rollup.

---

## 6. Where to look in code

| Concern | File(s) |
|---|---|
| Typed schema | `linkd-fms/src/types/database.ts` |
| Migrations / DDL / RLS / triggers / RPCs | `supabase/migrations/0001…0089` |
| Query cache keys | `linkd-fms/src/lib/queryKeys.ts` |
| Permission helpers | `linkd-fms/src/lib/permissions.ts` |
| Notifications | `linkd-fms/src/lib/notifications.ts` |
| Admin (service-role) ops | `linkd-fms/api/*.ts` + `linkd-fms/src/lib/adminApi.ts` |
| Per-feature rules | `CLAUDE.md` §§12–32 |

> Keep this file in sync when you add a table, column, RPC, or migration. It is the database's brain — stale entries here cause real bugs.
