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
Fonts:        Sora — ONE family app-wide (display + body; font-sans/serif/display
              all resolve to Sora) · JetBrains Mono — opt-in for data numerals
              only (.font-mono-data). LoginView additionally loads Bricolage
              Grotesque + Hanken Grotesk, scoped to `.df-login` only.
3D:           three.js (login page woven-fabric backdrop, lazy-loaded chunk)
Excel:        exceljs (styled multi-sheet dashboard/scorecard exports)
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
| `lib/chartGradients.tsx` | Shared `<ChartGradients>` + `CHART_GRAD` gradient ids |
| `lib/exportExcel.ts` | Styled multi-sheet Excel exports (Concept/Task/Scorecards) |
| `lib/utils.ts` | `cn()` class merge helper (tailwind-merge) |

---

## 19. UI/UX & Frontend Design System

The whole design vocabulary. **Reuse these primitives — never invent new KPI tiles, chart frames, table looks, or card styles.** When in doubt, dial decoration *down*.

### 19.1 Design thesis
**Linear / Vercel / Stripe: restraint, crisp high-contrast type, 1px borders, tight spacing, ruthless hierarchy** — not maximalist glow/glass. The brand metaphor is the **selvedge** (the finished edge of woven cloth) + warp/weft "digital fabric printing" motif, used sparingly. Default theme is **light** (`<ThemeProvider defaultTheme="light">`); every surface is tuned to read in **both** light and dark.

### 19.2 Typography
- **Sora** — single family app-wide. `font-sans`, `font-serif`, `font-display` ALL resolve to Sora (so none can pull a different face). Headings `h1–h4` use Sora via `index.css`. Loaded via Google Fonts `<link>` in `index.html`.
- **JetBrains Mono** — opt-in ONLY via `.font-mono-data` / `font-mono-data` for tabular DATA numerals (chart ticks, some figures). Never global. Self-hosted (`@fontsource/jetbrains-mono/700.css`).
- **No serif anywhere.** `font-serif-accent` is de-serifed (letter-spacing only). All faces `font-display: swap` (no CLS).
- KPI/figure numerals render in **high-contrast `text-foreground`** — NOT the old washed-out indigo gradient-clip (`.metric-value`).

### 19.3 Color & theming — semantic tokens ONLY
Never hardcode Tailwind colors (`bg-blue-500`, `text-gray-700`). Tokens are CSS variables in `src/index.css` (`:root` + `.dark`), repaint on theme switch with zero per-component branching.

```
Surfaces:   bg-background  bg-card  bg-secondary  bg-popover  bg-muted
Text:       text-foreground  text-muted-foreground  text-primary
Brand:      bg-primary  text-primary  ring-primary  border-primary
Status:     bg-success / text-success · bg-warning · bg-destructive · bg-coral
Lines:      border-border  ring-ring  --ruler-tick
```
Status pills/dots are token-driven via `STATUS_COLORS`, `CONCEPT_STATUS_COLORS`, `WORK_STATUS_COLORS` in `lib/constants.ts`. Dark mode tuned so card/secondary/border/muted hold separation against the canvas — extend the tokens, never hardcode dark values. Body carries a global "cutting-mat" dot pattern via `--dot-color`.

### 19.4 Selvedge CSS utilities (`@layer components` in `index.css`)
| Class | Use |
|-------|-----|
| `swatch-edge` / `swatch-edge-actionable` | KPI tile left accent (indigo resting, warm on hover when actionable) |
| `nav-selvedge-active` | Sidebar active item — gradient left edge + brand glow |
| `row-selvedge` | Table row 2px inset left shadow on hover |
| `thead-selvedge` | 2px gradient top edge on table headers |
| `shuttle-dot` | 5px pulsing pipeline connector (hidden under reduced-motion) |
| `pill-gradient-ring` | Gradient ring on active stepper pill |
| `dialog-panel` / `dialog-ease` | 2px selvedge top edge + 350/200ms enter/exit on dialogs |
| `metric-value` / `.font-mono-data` | gradient-clip numerals (legacy) / mono tabular numerals |
| `warp-draw` / `weft-in` | Dashboard hero entrance (transform+opacity, ≤700ms) |
| `.aurora-blob` / `body::before` | Subtle drifting aurora canvas (richer dark, restrained light) |

Tokens: `--selvedge` (2px indigo gradient), `--selvedge-warm`, `--brand-glow`, `--ring-focus`, `--ruler-tick`.

### 19.5 KPI cards — THE single system
| Component | Where | Look |
|-----------|-------|------|
| **`<KpiCard>`** (`components/analytics/KpiCard`) | Concept Dash, Scorecards, **Sampling, Salvedge** | The shared tile. `centered` = clean bordered summary card (matches Task Dashboard, **no** left accent). `flat` = compact divided-strip tile. Card mode (non-centered, with `to`) keeps the `swatch-edge` actionable accent. Props: `icon, label, value, metric?, tintClass, valueColor?, sub?, sparklineData?, animateValue?, centered?, flat?, to?`. `metric` is OPTIONAL — omit for snapshot stats (trend pill drops). |
| **`MetricCard` / `StatusTile`** | Task Dashboard hero ONLY (local to `TaskDashboardView.tsx`) | Clean bordered cards — crisp `text-foreground` numeral, uppercase label, quiet sparkline. **Don't export/reuse elsewhere — use `<KpiCard centered>` grids.** |

Rules: hover lift only fires when `to`/`onClick` is set (non-actionable tiles must not fake interactivity). **No dim gradient numerals.** Trend pill (`DeltaBadge`/`TrendPill`) is **suppressed when there's no prior-period baseline** (`previous === 0`) so new-system "+7" noise doesn't show. Mobile: KPI cards are compacted (smaller icon/label/numeral, sparkline hidden) — desktop unchanged.

### 19.6 Charts — recharts + shared tokens
Pull ALL styling from `lib/chartConfig.ts`; never inline axis/tooltip styles.
```ts
import { CHART_THEME, CHART_GRID_PROPS, CHART_AXIS_PROPS, CHART_TOOLTIP_STYLE,
         CHART_TOOLTIP_LABEL_STYLE, CHART_TOOLTIP_CURSOR, CHART_BAR_RADIUS,
         CHART_LEGEND_STYLE, useChartAnimation } from "@/lib/chartConfig";
import { ChartGradients, CHART_GRAD } from "@/lib/chartGradients"; // <ChartGradients/> first child
```
- `useChartAnimation()` → `true` on first render only (no re-animate on refetch, StrictMode-safe).
- Axis ticks + tooltips use JetBrains Mono. Bars: `CHART_BAR_RADIUS`, gradient fills (`CHART_GRAD.barPrimary/barSuccess`), `maxBarSize`, `barCategoryGap`.
- Shared analytics chart components: `VolumeChart`, `PipelineHealth`, and `DashboardCharts.tsx` (`PriorityDonut` — donut + center total + full count/% legend; `CycleTimeChart` — column; `ScoreBars` — horizontal bars with value labels). Every chart has a clean **empty-state** when there's no data.
- `<ScoreRing>` — SVG embroidery-hoop gauge (threshold-colored, 1.2s mount ease, ref-guarded).

### 19.7 Tables — `lib/tableStyles` constants (§5.5) + extras
- Density toggle (comfortable/compact) — DB-backed via `useUserPreferences`; `.table-compact` overrides; `Rows3` toggle in toolbar.
- Per-stage column visibility (`<ColumnVisibilityMenu>`, "Set as my default" / Reset) — DB-backed, per pipeline stage.
- Concepts wide table: lifecycle **stage groups** (Concept Submitted / MD Approval / Designer Working / Final Approval) get a dark `border-l-2 border-l-border` divider at the first visible column of each stage (dynamic via `isStageStart`), plus a per-stage top accent bar.
- Hidden auto-IDs (`concept_code`, `uid`): keep in CSV export + delete-dialog copy + `title=` tooltip; never their own cell.
- Filter rows carry a leftmost **Clear** button (`FilterX`) shown only when a filter is non-default; does NOT reset view-mode tabs.
- Pagination footer ("Showing X of Y / Per page") only renders when `totalPages > 1`.

### 19.8 Dialogs & sheets — mobile-safe (`components/ui/dialog`)
Base `DialogContent`: `w-[calc(100%-2rem)] max-w-lg`, `rounded-lg` all breakpoints. **Do NOT override with bare `w-full`** (loses the mobile gutter). Tall forms use **(A)** the flex-col + scroll-body pattern (`flex max-h-[92vh] flex-col overflow-hidden p-0` + inner `flex-1 overflow-y-auto`) for combobox-heavy forms, or **(B)** `max-h-[90dvh] overflow-y-auto` for short admin forms. `<Combobox>` is NOT portaled (its menu is `absolute`) — any ancestor `overflow:auto/hidden` clips it, so prefer (A) for combobox forms. Entrance: scale `.96→1` 350ms; backdrop `bg-foreground/40 backdrop-blur-sm`. Sampling "Add Sample" must be a **center dialog**, not a drawer.

### 19.9 Confirmations, toasts, loading, empty states
- **Toasts:** `import { toast } from "@/components/ui"` → `toast.success/error/info/warning`. Never `sonner`/`react-toastify`.
- **Confirm:** `<ConfirmDialog>` for destructive actions — never `window.confirm()`. Danger Zone uses a **2-stage** confirm (ConfirmDialog → type `DELETE`).
- **Loading:** `<AppShellSkeleton>` (full page, theme-aware), `<SkeletonCard>` / `<SkeletonTable>` (localized), `<LoadingButton loading loadingText>` (async submits), `<TShirtLoader>` (auth gate). Skeletons carry `swatch-edge` / `thead-selvedge` / `row-selvedge`.
- **Empty:** `<EmptyState>` — inline SVG loom-swatch when no `icon`, token-stroked, both themes.

### 19.10 Forms
- **`<Combobox>`** — searchable single-select; supports per-option `icon?` (used for the WhatsApp-group green icon). Managed dropdowns (Fabrics, Concept Categories, Assigned By per-context, Received By, Sampling fields) come from Settings → Dropdowns via `useAssignedByOptions` / `useReceivedByOptions` / `useSamplingDropdowns` (each falls back to a built-in list so pickers are never blank).
- **`useFormDraft`** — `localStorage` persistence (300ms debounce) for multi-field forms; "Resume draft?" prompt only fires when ≥2 required fields filled; File objects are NOT persisted.
- Validation: inline per-field errors with `aria-invalid` + `aria-describedby`; `validate()` blocks submit.

### 19.11 Motion & accessibility
- `useAnimatedNumber` — count-up 0→target, 800ms cubic ease-out, mount-only, StrictMode-safe, reduced-motion = instant. Used by KpiCard/MetricCard.
- **Reduced motion:** a blanket `@media (prefers-reduced-motion: reduce)` rule in `index.css` kills all animation/transition durations with `!important`; the login 3D canvas doesn't even start. Always honor it.
- **Focus:** `:focus-visible` ring (`outline: 2px solid var(--ring-focus)`) on every interactive element. **Never remove outlines.**
- Touch targets ≥44px; inputs ≥16px (no iOS zoom); `min-h-dvh` for mobile viewport.
- Status-pill discipline: only ONE indicator may use `animate-urgent-pulse` (the most severe); looping `animate-pulse` is reserved for skeletons/recording — never on status badges.

### 19.12 App shell & responsive
- **`AppLayout`** → **`Sidebar`** (collapsible to a 64px rail, `localStorage["sidebar-collapsed"]`; hover-overlay expand while collapsed) + **`TopNav`** (thin fixed strip: greeting block left, ConnectionDot · NotificationBell · Avatar · Sign-out right — **no page title**) + `<main>`. TopNav is `position:fixed` and tracks sidebar collapse via its own `left` (mirror this for any new fixed surface). Content padding follows the **pinned** state only, 200ms timing everywhere.
- **`MobileTabBar`** for small screens. Route splitting: all heavy views are `React.lazy` (via `lazyWithReload`, which hard-reloads once on a stale-chunk fetch error) so the main bundle stays small; a `<Suspense>` inside `ProtectedRoute` keeps the shell while a route chunk streams in.

### 19.13 Premium login (`LoginView.tsx`)
Faithful "digital loom" port: full-screen dark, **three.js** woven-fabric backdrop (N=64 weft+warp `LineSegments`, indigo↔teal iridescence, additive blend, pointer parallax — lazy-loaded, full cleanup, reduced-motion = single static frame), vignette + SVG-grain overlays, Bricolage Grotesque + Hanken Grotesk (scoped `.df-login`), glass card, real auth (signInWithPassword / Google OAuth / inline reset), autofill kept on-theme, focus rings, 16px inputs.

### 19.14 Reusable canonical patterns
- **Score/open-detail pill** (§clickable affordance): `inline-flex … rounded-lg border border-primary/30 bg-primary/5 … text-primary` + `<ChevronRight>`; `e.stopPropagation()` if the row is also clickable. Reuse — don't invent new "open detail" styles.
- **StatusChip / StatusPill / YourTurnPill** — token-driven status indicators.
- **Pipeline widgets** — 3px left status-color border, `w-[72px] sm:w-[90px]` label, flexed bar with `bg-secondary/60` track + status fill, bold count + `(percentage)` muted. (`PipelineHealth`, `PipelineWidget`.)
- **`TaskPipelineStepper`** — slim glass-pill stage switcher mounted as the task table header (Pool → In Progress → Completed + standalone Full Kitting side pill).
- **`TextileHeroWrapper`** — frosted glass hero wrapper for Concept/Sample/Scorecards heroes (Task Dashboard intentionally chrome-free; Salvedge/Sampling KPI strips moved to clean `<KpiCard>` grids).

### 19.15 UI primitives inventory (`components/ui/`, barrel `@/components/ui`)
Button · LoadingButton · Input · Label · Textarea · Combobox · Dialog/Sheet · ConfirmDialog · Badge · Avatar (+getInitials) · Card/CardContent · Toaster/toast · Skeleton (Card/Table/AppShell/ScoreRing) · TShirtLoader · Sparkline · Pagination · EmptyState · Tooltip. **All hand-written — never run the shadcn CLI.** Import from the barrel, not deep paths.
