# LinkD FMS — Developer Skill Reference

Quick-reference for anyone working on this codebase. For AI assistant instructions see `CLAUDE.md`; for end-to-end system flow see `PROJECT_FLOW.md`.

---

## 1. Project Overview

**LinkD FMS (Design Flow System)** is a textile design workflow management system for LinkD Prints. It powers three independent systems:

| System | Purpose | Key Views |
|--------|---------|-----------|
| **Task Management** | Briefs → pipeline → completion | KanbanView, BriefingView, TaskDashboardView |
| **Concept Approval** | Designer submits → MD reviews → finalize | ConceptsView, AnalyticsView |
| **Sampling** | Daily sampling records + stats | ProductionView |

**Active directory:** All development happens inside `./linkd-fms/`. Ignore root-level legacy files.

---

## 2. Tech Stack & Dependencies

```
Frontend:     Vite 5 + React 18 + TypeScript 5.6 (strict) + Tailwind CSS 3
Routing:      React Router v6
Server state: @tanstack/react-query 5
Backend:      Supabase (PostgreSQL + Auth + Storage + RLS + Realtime)
Hosting:      Vercel (SPA + /api/* serverless functions)
Icons:        lucide-react
Charts:       recharts 3.8.1
Dates:        date-fns 4.1.0
UI:           Radix primitives (Dialog, Avatar, DropdownMenu, Label, Slot)
              + hand-written components (no shadcn CLI)
Font:         Inter (Google Fonts, 400/500/600/700)
```

**Pinned:** `@supabase/supabase-js` is locked to **2.45.4** — newer versions cause request-hang bugs.

---

## 3. Four Roles

| Role | Landing Page | Powers |
|------|-------------|--------|
| **admin** | `/task-dashboard` | Full power — concepts, scorecards, team, system CRUD, danger zone |
| **design_coordinator** | `/task-dashboard` | Admin-equivalent (no scorecards page) |
| **designer** | `/task-dashboard` | My Board, concepts, files, own scorecard |
| **deo** | `/kitting` | Kitting Queue only + notifications + profile |

**Permission checks:** Always use `lib/permissions.ts` helpers — never inline `role === "admin"`.

```ts
isAdmin(role)               // admin OR coordinator — both are "elevated"
isAdminOrCoordinator(role)  // same as isAdmin (they're equivalent now)
isDesigner(role)            // just designer
canReviewConcepts(role)     // alias for isAdmin
canManageTaskLifecycle(role) // alias for isAdminOrCoordinator
canCreateBriefs(role)       // admin + coordinator + designer
```

---

## 4. Directory Structure

```
linkd-fms/
├── api/                        # Vercel serverless functions (1 file)
│   └── admin-update-user.ts    # Service-role ops for Team CRUD
├── public/
│   └── flow-diagram.html       # Visual system architecture diagram
├── src/
│   ├── components/
│   │   ├── analytics/          # 16 files — KpiCard, charts, leaderboards, heroes
│   │   ├── concepts/           # 6 files — ConceptDetailDrawer, SubmitDialog, WorkBoard
│   │   ├── dashboard/          # 4 files — KPI cards, alerts, timeline, pipeline
│   │   ├── layout/             # 6 files — AppLayout, Sidebar, TopNav, MobileTabBar, ProtectedRoute
│   │   ├── sampling/           # 2 files — SamplingFormDialog, TaskPicker
│   │   ├── system/             # 9 files — Settings tabs (clients, fabrics, codes, danger zone)
│   │   ├── tasks/              # 10 files — TaskDetailDrawer, EditTaskDialog, Kitting dialogs
│   │   ├── ui/                 # 30 files — Button, Dialog, Sheet, Combobox, Toaster, etc.
│   │   └── ErrorBoundary.tsx
│   ├── hooks/                  # 24 custom hooks
│   ├── lib/                    # 17 utility modules
│   ├── types/
│   │   └── database.ts         # All types, enums, DB schema interfaces
│   └── views/                  # 23 page-level components
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
├── vercel.json
└── package.json

supabase/
├── migrations/                 # 42 SQL migration files (0001–0042)
└── functions/
    ├── admin-create-user/      # Edge Function — create new auth user
    └── daily-notifications/    # Edge Function — scheduled reminders (05:30 UTC)
```

---

## 5. Key Patterns

### 5.1 Imports — always use `@/` alias
```ts
import { Button } from "@/components/ui";          // barrel import
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import type { Task, UserRole } from "@/types/database";
```

### 5.2 Data Fetching — React Query only
Never use `useState`/`useEffect` for API calls. All data hooks use `@tanstack/react-query`.

```ts
import { queryKeys } from "@/lib/queryKeys";

// Read hook pattern
const { data, isLoading } = useQuery({
  queryKey: queryKeys.tasks.all,
  queryFn: async () => { /* supabase query */ },
});

// Mutation pattern — always return { data, error }, never throw
const { mutateAsync } = useMutation({
  mutationFn: async (input) => {
    const { data, error } = await supabase.from("tasks").insert(input).select().single();
    if (error) return { data: null, error: error.message };
    return { data, error: null };
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
});
```

### 5.3 Cache Keys — centralized in `lib/queryKeys.ts`
```ts
queryKeys.tasks.all           // ["tasks"]
queryKeys.tasks.detail(id)    // ["tasks", "detail", id]
queryKeys.clients.all         // ["clients"]
queryKeys.profiles.byRole(k)  // ["profiles", "role", k]
queryKeys.concepts.all        // ["concepts"]
queryKeys.samples.all         // ["samples"]
queryKeys.fabrics.all         // ["fabrics"]
queryKeys.categories.all      // ["categories"]
queryKeys.designerCodes.all   // ["designerCodes"]
```

### 5.4 Theming — semantic tokens only
Never hardcode Tailwind colors (`bg-blue-500`, `text-gray-700`). Always use semantic variables:

```
bg-background    bg-card       bg-secondary     bg-primary
text-foreground  text-muted-foreground          text-primary
border-border    ring-ring
bg-success       bg-warning    bg-destructive
```

### 5.5 Tables — shared style constants
All data tables import from `@/lib/tableStyles`:

```ts
import {
  TABLE_CONTAINER, TABLE_SCROLL, TABLE_HEAD, TABLE_TH,
  TABLE_TH_STICKY_RIGHT, TABLE_ROW, TABLE_ROW_CLICKABLE,
  TABLE_TD, TABLE_TD_STICKY_RIGHT,
} from "@/lib/tableStyles";
```

### 5.6 Notifications — always use RPC helpers
Never `supabase.from("notifications").insert(...)` directly. Always use:

```ts
import { sendNotification, sendNotificationToMany, sendNotificationToRole } from "@/lib/notifications";

// Single user
sendNotification(userId, "Title", "Message", "success", "/link");

// Multiple users
sendNotificationToMany(userIds, "Title", "Message", "info");

// By role
sendNotificationToRole(["admin", "design_coordinator"], "Title", "Message", "success");
```

These call `notify_user` SECURITY DEFINER RPC — bypasses RLS for cross-user inserts.

### 5.7 Toasts — custom system
```ts
import { toast } from "@/components/ui";

toast.success("Task created");
toast.error("Something went wrong");
toast.info("Draft saved");
toast.warning("Deadline approaching");
```

Do NOT use `sonner`, `react-toastify`, or `window.confirm()`. Use `<ConfirmDialog>` for destructive actions.

### 5.8 Routes — use constants
```ts
import { ROUTES, roleHomePath, scorecardDetailPath, kittingDetailPath } from "@/lib/routes";

navigate(ROUTES.dashboard);            // "/dashboard"
navigate(ROUTES.briefNew);             // "/brief/new"
navigate(scorecardDetailPath(userId)); // "/scorecards/{userId}"
navigate(kittingDetailPath(recordId)); // "/kitting/{recordId}"
roleHomePath("admin");                 // "/task-dashboard"
roleHomePath("deo");                   // "/kitting"
```

---

## 6. All 24 Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Session + profile + role + signIn/signOut (context) |
| `useTheme` | Light/dark/system toggle (context, localStorage) |
| `useTasks` | List tasks with joins + status/assignee filters |
| `useTaskMutations` | createTask, updateTaskStatus, assignTask, selfAssignTask, markTaskDone, deleteTask |
| `useTaskDetail` | Single task + files + activity log in parallel |
| `useTaskComments` | Comment thread CRUD + Supabase Realtime |
| `useTaskAnalytics` | Task KPIs, pipeline, workload, designer stats |
| `useConcepts` | List + submit + review + finalize concepts |
| `useConceptReminders` | Client-side monthly concept target reminders (Day 8/17/24) |
| `useAnalytics` | Concept analytics (KPIs, volume, designer stats) |
| `useClients` | All clients + pre-filtered ldClients / jobWorkClients |
| `useProfiles` | All profiles, filterable by role + soft-delete |
| `useDesignerCodes` | Designer letter codes + Map<profile_id, codes[]> |
| `useDesignerScorecard` | Per-designer composite scorecard with date range |
| `useFabrics` | Fabric lookup (active-only by default) |
| `useConceptCategories` | Concept category lookup (active-only) |
| `useNotifications` | Notifications + Realtime subscription + Web Audio chime |
| `useFullKitting` | Kitting form CRUD for full_kitting_details |
| `useSamples` | Sample CRUD with filters (date, customer, status) |
| `useSalvedge` | Salvedge records CRUD + filters |
| `useFiles` | Recursive bucket listing + signed URLs + delete |
| `useFormDraft` | localStorage draft persistence (300ms debounce) |
| `usePagination` | Client-side pagination state |
| `useAnimatedNumber` | RAF-based counter with cubic ease-out |
| `useKeyboardShortcuts` | Global keydown registrar with auto-skip |
| `useUserPreferences` | User-level preferences (column visibility, etc.) |

---

## 7. All 23 Views

| Route | View | Access |
|-------|------|--------|
| `/login` | LoginView | Public |
| `/reset-password` | ResetPasswordView | Public |
| `/onboarding` | OnboardingView | Authed, no profile |
| `/task-dashboard` | TaskDashboardView | Admin + Coord + Designer (landing) |
| `/dashboard` | KanbanView | Admin + Coord + Designer |
| `/home` | DashboardView | Admin + Coord + Designer |
| `/brief/new` | BriefingView | Admin + Coord + Designer |
| `/concepts` | ConceptsView | Admin + Coord + Designer |
| `/orders` | OrdersView | Admin + Coord (placeholder) |
| `/sampling` | ProductionView | Admin + Coord |
| `/salvedge` | SalvedgeView | Admin + Coord |
| `/kitting` | KittingQueueView | Admin + Coord + DEO |
| `/kitting/:recordId` | FullKittingFormView | Admin + Coord + DEO |
| `/files` | FilesView | Admin + Coord + Designer |
| `/team` | TeamView | Admin + Coord |
| `/scorecards` | ScorecardsView | Admin only |
| `/scorecards/:id` | ScorecardDetailView | Admin + Designer (self only) |
| `/profile` | ProfileView | All roles |
| `/notifications` | NotificationsView | All roles |
| `/system` | SystemView | Admin + Coord |
| `/analytics` | AnalyticsView | Redirect → `/task-dashboard?tab=concepts` |
| `*` | NotFoundView | All |
| Access denied | AccessRestrictedView | Inline (URL stays put) |

---

## 8. Database Schema

### 8.1 Tables (15+)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | Users (4 roles, soft-delete) | id, full_name, role, is_active, avatar_url |
| `tasks` | Design briefs/pipeline | 30+ cols, task_code, status, assigned_to, client_id, brief_type |
| `concepts` | Concept submissions | md_status, work_status, files JSONB, completion_history |
| `clients` | Party names | party_name, client_group (ld/job_work) |
| `task_logs` | Audit trail (append-only) | task_id, old_status, new_status, changed_by |
| `task_comments` | Discussion threads | task_id, body, author_id |
| `files` | Task attachments | task_id, file_url, file_name |
| `notifications` | Bell notifications | user_id, title, message, type, link, is_read |
| `samples` | Sampling records | party_name, fabric, qty, uid |
| `salvedge_records` | Fabric distribution | designer_id, challan_no |
| `full_kitting_details` | Kitting workflow | image_url, form_payload JSONB, data_entry_status |
| `concept_categories` | Lookup (dropdown) | name, is_active |
| `fabrics` | Lookup (dropdown) | name, is_active |
| `designer_codes` | Letter codes (K/V/S/W/T) | profile_id, code |
| `sampling_logs` | Meters printed | sample_id, meters |
| `task_counters` | Internal per-year sequence | year, counter |

### 8.2 Enums

```
user_role                → admin | design_coordinator | designer | deo
task_status              → pool | todo | in_progress | full_kitting | approved | sampling | done | completed
task_priority            → low | normal | high | urgent
md_status (ConceptStatus)→ pending | approved | rejected | revision_requested
concept_work_status      → not_started | in_progress | on_hold | done_partial | in_revision | changes_requested | completed
designer_status          → active | inactive
client_group             → ld | job_work
brief_type               → ld | job_work
kitting_data_entry_status→ pending_image | pending_deo | in_progress | completed
kitting_priority         → very_urgent | 2_days | 3_days | 4_days | 5_days
```

### 8.3 RPC Functions (SECURITY DEFINER)

| Function | Purpose |
|----------|---------|
| `notify_user(p_user_id, p_title, p_message, p_type?, p_link?)` | Insert notification for any user |
| `notify_users_batch(p_user_ids[], p_title, p_message, p_type?, p_link?)` | Batch notifications |

### 8.4 Storage Buckets

| Bucket | Max Size | Contents |
|--------|----------|----------|
| `design-files` | 50 MB | Concept images + task files |
| `sample-files` | 100 MB | Kitting photos + sample files + videos |
| `proof-photos` | 10 MB | Admin-only uploads |
| `task-files` | — | Placeholder (back-compat) |
| `avatars` | — | User profile photos |

All private. Access via signed URLs (1-hour TTL). Always compress images before upload:
```ts
import { compressImage } from "@/lib/imageCompression";
const compressed = await compressImage(file); // max 1920px, 0.85 quality
```

### 8.5 Migrations (42 files: 0001–0042)

Latest notable:
- `0034` — Broadened notification INSERT policy to any authenticated user
- `0035` — `notify_user` / `notify_users_batch` SECURITY DEFINER RPCs
- `0036` — WhatsApp received date/time columns on tasks
- `0037` — `clients.client_group` (ld / job_work)
- `0038` — `tasks.brief_type` + CHECK constraint (job_work → client_id NOT NULL)
- `0039` — `completed` status (post-done terminal state)
- `0040` — Pool system columns
- `0041` — Tasks realtime
- `0042` — Clients group unique constraint

---

## 9. Task Pipeline

```
Pool → In Progress → Full Kitting → Done → Completed
 │         ↑              │
 │    (auto on assign)    │
 │                        ↓ (admin revise)
 └─────────────────── In Progress
```

- Assigned tasks skip `todo` → go straight to `in_progress`
- `todo` enum exists but is never entered by the app
- `approved` and `sampling` statuses exist but not shown on kanban
- `done` = design finished, awaiting completion details
- `completed` = terminal (fabric + mtr captured)

**Task code format:** `DF {NN}-{D}{MMYY}-{CONC}-{QQQ}M`
- Example: `DF 01-S0526-FLOR-200M` (1st task, designer S, May 2026, Floral, 200m)

---

## 10. Concept Workflow

```
Designer submits → Pending → Admin reviews
                               ├─ Approve → Designer finalizes (+4 days) → Final Approval
                               ├─ Revision Requested → Re-submit → loops back
                               └─ Reject (terminal)
```

**Monthly target:** 3 concepts per designer.
**Auto-reminders** (client-side, `useConceptReminders`): Day 8 (≥1), Day 17 (≥2), Day 24 (≥3).

---

## 11. Kitting Workflow (2-Stage)

```
Stage A: Coordinator uploads paper form photo → pending_deo → notifies DEOs
Stage B: DEO opens /kitting/:id → side-by-side form → 12 fields → submit → completed
Stage C: Coordinator reviews completed form
```

---

## 12. Notification System (3-Layer)

| Layer | What |
|-------|------|
| **DB + RPC** | `notifications` table + `notify_user`/`notify_users_batch` SECURITY DEFINER |
| **Sending helpers** | `sendNotification` / `sendNotificationToMany` / `sendNotificationToRole` in `lib/notifications.ts` |
| **Realtime + sound** | `useNotifications` subscribes to INSERT events, plays 880Hz chime, flashes tab title |
| **Client reminders** | `useConceptReminders` — Day 8/17/24 concept targets for designers |

**Who gets notified:**

| Event | Recipients |
|-------|-----------|
| Task assigned | Designer |
| Task self-claimed | Previous assignee |
| Task marked done | Designer + admins + coordinators |
| Concept submitted | All admins |
| Concept reviewed | Submitter |
| Concept re-submitted | All admins |
| Kitting form uploaded | All DEOs |
| Kitting form digitized | Admin + coordinator |
| Concept reminder (Day 8/17/24) | Designer (client-side) |

---

## 13. Brief Form Fields

The New Brief form (`BriefingView.tsx`) sections:

| Section | Fields |
|---------|--------|
| **Brief Type** | Toggle: LD (internal) / Job Work (external client) |
| **Client** | Combobox — Job Work clients only (hidden for LD) |
| **WhatsApp** | Group dropdown + received date + received time |
| **The Work** | Concept (Combobox), Description, Quantity (optional, defaults 1) |
| **Timing** | Planned deadline, Due time |
| **Priority** | Toggle: Normal / Urgent |
| **Assign To** | Open Pool (default) or specific designer |
| **Assigned By** | Fixed roster dropdown + "Other" free-text |
| **Full Kitting** | Toggle + file upload + remarks |

**Removed from form (UI only):** Fabric, Meters, Concept start date. DB columns still exist; submit sends defaults.

---

## 14. Privileged Operations

### Vercel API Routes (`linkd-fms/api/`)

| Route | Modes | Purpose |
|-------|-------|---------|
| `POST /api/admin-update-user` | `list_emails` / `fetch` / `update` | Team CRUD (email, password, role, joining date) |

**Pattern:** Verify caller's JWT → check admin/coordinator role → use service-role client.
**Client helper:** `callAdminApi(route, body)` from `@/lib/adminApi`.
**New privileged endpoints** go here, NOT into Supabase Edge Functions.

### Supabase Edge Functions (historical)

| Function | Purpose |
|----------|---------|
| `admin-create-user` | Create new auth user (called from Team → Add User) |
| `daily-notifications` | Scheduled via pg_cron at 05:30 UTC / 11:00 IST |

---

## 15. Scripts

```bash
cd linkd-fms

npm run dev          # Vite dev server (/api/* returns 404)
npm run build        # tsc --noEmit + vite build
npm run type-check   # tsc --noEmit (alias: npm run lint)
npx vercel dev       # Full stack locally (requires vercel login + env vars)

# Type-check API routes separately:
npx tsc --noEmit -p api/tsconfig.json
```

---

## 16. File Inventory

| Category | Count | Location |
|----------|-------|----------|
| Views | 23 | `src/views/` |
| Hooks | 24 | `src/hooks/` |
| Components | 92 | `src/components/` (9 subdirectories) |
| Libraries | 17 | `src/lib/` |
| Migrations | 42 | `supabase/migrations/` |
| API Routes | 1 | `api/` |
| Edge Functions | 2 | `supabase/functions/` |
| Types | 1 | `src/types/database.ts` |
| **Total** | **~200** | |

---

## 17. Common Gotchas

1. **Never `supabase.from("notifications").insert()`** — use `sendNotification()` RPC helpers
2. **Never hardcode colors** — use semantic tokens (`bg-primary`, not `bg-blue-500`)
3. **Never inline role checks** — use `lib/permissions.ts` helpers
4. **Never use `useState`/`useEffect` for API calls** — use React Query hooks
5. **Never use `window.confirm()`** — use `<ConfirmDialog>`
6. **Never use relative imports** for deep paths — use `@/` alias
7. **Always compress images** before upload via `compressImage()`
8. **Always prefix storage paths** with `{auth.uid()}/`
9. **Supabase SDK pinned to 2.45.4** — do not upgrade
10. **Service-role key** (`sb_secret_*`) — never in browser, never in `.env.local`, never prefixed `VITE_`
11. **`todo` status** exists in DB but app never enters it — tasks go pool → in_progress directly
12. **`isAdmin()` returns true** for both admin AND design_coordinator
13. **Draft auto-save** prompt only fires when ≥2 required fields filled
14. **Concept start date** — auto-set to today on submit, no UI field
15. **`sendNotificationToMany`** uses `Promise.allSettled` loop (not batch RPC)

---

## 18. Key Library Modules

| Module | Purpose |
|--------|---------|
| `lib/supabase.ts` | Singleton Supabase client |
| `lib/queryKeys.ts` | Centralized React Query cache keys |
| `lib/permissions.ts` | Role-based capability checks |
| `lib/notifications.ts` | Notification send helpers (RPC-based) |
| `lib/constants.ts` | Status colors, labels, column styling, priority maps |
| `lib/routes.ts` | Route constants + role landing page helper |
| `lib/tableStyles.ts` | Shared table CSS class constants |
| `lib/adminApi.ts` | Client helper for Vercel API routes |
| `lib/imageCompression.ts` | Canvas-based image resize before upload |
| `lib/exportCSV.ts` | Generic CSV export with column selection |
| `lib/whatsappGroups.ts` | WhatsApp group catalogue (shared by brief + edit dialog) |
| `lib/kittingQueries.ts` | Kitting form Supabase queries |
| `lib/kitting.ts` | Priority mapping (display ↔ DB enum) |
| `lib/days.ts` | Deadline severity helpers + day calculations |
| `lib/conceptStatus.ts` | Concept status labels + colors |
| `lib/chartConfig.ts` | Recharts default config |
| `lib/utils.ts` | `cn()` class merge helper |
