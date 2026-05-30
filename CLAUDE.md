# LinkD FMS — AI Assistant Instructions

## Role & Mission
Act as an expert full-stack developer (React 18, TypeScript, Supabase, Tailwind CSS) working on the LinkD FMS workspace. Prioritize elegant, accessible, and performant solutions following the established conventions.

## 1. Project Context & Environment
- **Active Directory:** All active development happens strictly inside the `./linkd-fms/` directory. Ignore any legacy Next.js files at the root.
- **Tech Stack:** React 18, Vite 5, TypeScript (strict), React Router v6, Tailwind CSS 3.
- **Backend:** Supabase (PostgreSQL, Auth, Storage). 
- **Strict Dependency Pin:** The `@supabase/supabase-js` version is **strictly pinned to 2.45.4**. Do not update it, as newer versions cause request-hang bugs in this Vite environment.

## 2. Code Style & Architecture
- **Imports:** Always use the `@/` path alias for absolute imports (e.g., `import { Button } from "@/components/ui"`). Never use relative paths for deep imports.
- **UI Components:** Import all UI primitives from the barrel file `@/components/ui`. **Do not use the `shadcn-ui` CLI** to generate components; they are hand-written.
- **Theming:** The app uses a dual-theme (light/dark) system powered by CSS custom properties. Never hardcode Tailwind colors (like `bg-blue-500` or `text-gray-700`). Always use semantic variables (e.g., `bg-primary`, `bg-background`, `text-muted-foreground`, `border-border`).
- **File Naming:** Name all new component files using `PascalCase.tsx`. Hooks use `camelCase.ts`.
- **Icons & Charts:** Exclusively use `lucide-react` for icons and `recharts` for charting.

## 3. State Management & Data Fetching
- **React Query (v5):** Use `@tanstack/react-query` for all data fetching. **NEVER** use manual `useState`/`useEffect` for API calls.
- **Cache Keys:** Always use centralized cache keys imported from `lib/queryKeys.ts`.
- **Mutations:** Mutation hooks must return `Promise<{ data, error }>` and **never throw exceptions**. Errors should be formatted as strings ready to be passed to `toast.error()`.
- **Invalidation:** After successful mutations, always invalidate the relevant React Query cache using `queryClient.invalidateQueries`.

## 4. UI/UX Rules & Interactivity
- **Toasts:** Use the custom toast system via `import { toast } from "@/components/ui"`. Do not install or use `sonner` or `react-toastify`.
- **Confirmations:** Never use `window.confirm()`. Always use the custom `<ConfirmDialog>` component for destructive actions.
- **Loading States:** Prefer `<AppShellSkeleton>` for full-page loads, `<SkeletonCard>` / `<SkeletonTable>` for localized loading, and `<LoadingButton>` for async form submissions.
- **Forms:** For multi-field forms where data might be lost, wrap inputs using the `useFormDraft` hook for `localStorage` persistence.

## 5. Security & Permissions
- **Role Checks:** Never write inline role checks like `role === 'admin'`. Always import and use the helper functions from `lib/permissions.ts` (e.g., `isAdmin(role)`, `isAdminOrCoordinator(role)`).
- **Auth State:** Rely solely on the `useAuth()` hook for user session, profile, and role state.
- **Image Compression:** Before uploading any image to Supabase Storage, you **must** process it through `compressImage()` from `@/lib/imageCompression`.
- **Storage Paths:** All file upload paths to Supabase Storage must start with `{auth.uid()}/` to satisfy Row Level Security (RLS) policies.
- **Service-role key:** The Supabase `service_role` (`sb_secret_*`) key bypasses RLS and **must never ship to the browser**. It lives only in Vercel env (`SUPABASE_SERVICE_ROLE_KEY`), never in `.env.local`, never prefixed with `VITE_`, never logged or pasted into chat. Treat any leak as a credential incident and rotate immediately.
- **Supabase key format:** Legacy JWT-style keys are disabled on this project. The SPA uses the publishable key (`sb_publishable_*`) as `VITE_SUPABASE_ANON_KEY`; servers use the secret key (`sb_secret_*`). If you see `legacy API keys are disabled` errors, the publishable key is missing or stale — do not re-enable legacy keys.

## 6. Common Scripts (`/linkd-fms`)
- **Dev Server:** `npm run dev` — runs Vite only; `/api/*` routes return 404 locally. The Email column on Team and the Edit-user dialog's pre-fill will show a friendly "needs `vercel dev`" note in dev, then work normally on deploys.
- **Type-Check / Lint:** `npm run type-check` (alias: `npm run lint`) — also run `npx tsc --noEmit -p api/tsconfig.json` to type-check serverless routes.
- **Build:** `npm run build`
- **API routes locally:** `npx vercel dev` (requires `vercel login` + env vars synced) — use this only when iterating on `/api/*` code itself.

## 7. Sampling Hub
- **Add Sample:** Do not use "Quick add form" for Add Sample. The sampling form must strictly be a pop-up form (center dialog) rather than a right-side drawer format.

## 8. Dashboards & Scorecards — Unified UI System

The app has five analytics surfaces: **Task Dashboard**, **Concept Dashboard**, **Sample Dashboard**, **Scorecards (list)**, and **Scorecard Detail**. They share one visual vocabulary. Do not invent new KPI tile styles, new chart frames, or new table looks for these views — extend the existing primitives.

### 8.1 KPI tiles
- **Single primitive:** `<KpiCard>` from `@/components/analytics/KpiCard`. Used in every dashboard's KPI grid (Concept Dashboard 4-card row, Scorecards 4-tile strip, Scorecard Detail 5-tile strip, etc.).
- The `metric` prop is **optional**. Omit it for snapshot stats with no period-over-period comparison (Scorecards summary) — the trend pill drops cleanly. Pass it when you have a `KpiMetric` to drive the trend arrow + sparkline color.
- Hover lift (`translate-y / ring / shadow`) only fires when `to` is set — non-actionable tiles must not fake interactivity.
- For the Task Dashboard's 7-tile divided **hero strip**, use the inline `HeroKpiTile` component in `TaskDashboardView.tsx`. It is a different layout (divided cells, no card wrapper per tile) but uses the same tone tokens. Don't duplicate this pattern in other views — use `<KpiCard>` grids there.

### 8.2 Textile aesthetic (warp/weft motif)
Every dashboard hero/KPI strip carries the same two decorative layers so the app reads in the visual language of digital fabric printing:

```tsx
<div className="relative overflow-hidden rounded-2xl border border-primary/10
                bg-gradient-to-br from-primary/[0.04] via-card to-card p-3 sm:p-4">
  {/* Woven dot grid */}
  <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.05]"
       style={{
         backgroundImage:
           "radial-gradient(circle, rgb(var(--foreground)) 1px, transparent 1px)",
         backgroundSize: "14px 14px",
       }} />
  {/* Warp-line accent (loom thread) */}
  <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0
                              h-[2px] bg-gradient-to-r
                              from-primary/60 via-warning/40 to-success/50" />
  <div className="relative …">{children}</div>
</div>
```
Apply this wrapper to every hero/KPI strip on Dashboards + Scorecards. Don't add it to non-analytics surfaces (Files, Team, Settings) — it would overload them.

### 8.3 Tables — shared style constants
All data tables in the app pull their styling from `@/lib/tableStyles`:
- `TABLE_HEAD`, `TABLE_TH`, `TABLE_TH_STICKY_RIGHT`
- `TABLE_ROW`, `TABLE_ROW_CLICKABLE`, `TABLE_TD`, `TABLE_TD_STICKY_RIGHT`

Always import and use these constants. Never re-invent a `<thead>` className. Currently applied across: Sampling Queue, Full Knitting (CompletedKittingPanel), DEO Knitting Queue, Salvedge, Team, Files. Header reads as light secondary surface with black `font-semibold` uppercase text, body rows have hover-tinted clickable variant.

### 8.4 Pipeline-status widgets
Both Task Dashboard's *Pipeline* card and Concept Dashboard's *Concept Status* card use the same per-status row pattern:
- 3px left border in the status color (`border-l-success`, `border-l-warning`, …)
- Label column: `w-[72px]` on mobile, `w-[90px]` on `sm:` and up (the responsive split is required — "In Progress" gets clipped on narrow phones at 72px and `truncate` ellipsizes cleanly).
- Flexed horizontal bar with `bg-secondary/60` track and a status-colored fill
- Right column: bold count + `(percentage)` in muted (`w-14 sm:w-16`)
- Row gap: `gap-2 sm:gap-3`

Reference implementations: `PipelineHealth.tsx` (concept) and `PipelineWidget` inside `TaskDashboardView.tsx` (task). New pipeline widgets must follow this pattern.

### 8.5 Page header layout
For dashboard / hub pages, the header row is:
```
[Title + record count]  …  [Tab-specific filters]  [Action buttons]
```
- Title block on the left (shrink-0).
- Filter controls in the middle, **right-aligned** on the same row when present (Sampling Queue search + status pills, Full Knitting search + Export CSV, Scorecards search + leader chip + period pills).
- Primary actions (Refresh, Export icon, + Add) on the far right (shrink-0).
- Period filter (Week / Month / Quarter) lives **in the same row as the tab strip** when tabs exist (Task Dashboard, Sampling, Scorecards).

### 8.6 Sound + realtime notifications
- `useNotifications` subscribes via Supabase realtime and plays a Web Audio chime (880 Hz, 200ms, 10s debounce) on every `INSERT` when the tab is visible. Tab-title flashes when hidden.
- Scheduled daily notifications run via the `daily-notifications` Edge Function at 05:30 UTC / 11:00 IST. See `NOTIFICATIONS_SETUP.md` for deployment.
- Per-task / per-concept notifications are deduped by `(user_id × kind × entity_id × day)` — never insert raw rows that don't follow this scheme or the user gets repeats.
- **Sending notifications:** Always go through `sendNotification` / `sendNotificationToMany` / `sendNotificationToRole` in `lib/notifications.ts`. These call the `notify_user` / `notify_users_batch` Postgres RPC functions (SECURITY DEFINER) so the insert succeeds regardless of the caller's role. Do **not** `supabase.from("notifications").insert(...)` directly from the client — that route is gated by `notifications_insert_authenticated` and will break for some legitimate flows (e.g. a designer notifying admins on concept submission).
- **Client-side concept reminders:** `useConceptReminders` runs once per app shell mount inside `AppLayout` (designers only). It checks escalating monthly concept targets on three checkpoint days:
  - **Day 8** — need ≥ 1 concept submitted this month
  - **Day 17** — need ≥ 2 concepts
  - **Day 24** — need ≥ 3 concepts
  If the designer is below target, a `warning` notification is sent via the `notify_user` RPC (deduped: skips if a "Concept Submission Reminder" already exists for today). Use the same hook pattern for any new client-only reminder; do not duplicate the polling loop.
- **Task completion notifications:** When a designer marks a task done (`markTaskDone`), three notifications fire: one `success` to the designer ("You completed X"), and one `success` to all admins + coordinators ("Designer completed X"). Both go through `sendNotificationToRole`.
- **`sendNotificationToMany` implementation:** Uses `Promise.allSettled` with individual `notify_user` RPC calls (not the batch RPC) to avoid partial-failure issues. Each user gets their own RPC call.

### 8.7 Theme tokens (dark mode)
- All surface contrast comes from CSS variables in `src/index.css`. The dark palette has been tuned so card / secondary / border / muted-foreground all hold separation against the canvas. **Do not hardcode dark-mode values** — extend the tokens if a new surface tier is needed.
- The body has a global "cutting-mat" dot pattern driven by `--dot-color`. Theme switches re-paint it automatically. Don't add page-level background patterns that fight this.

### 8.8 Clickable-row affordance (score pill)
Any row that opens a detail drawer/page must surface the action visibly — `cursor-pointer` and a browser `title` tooltip are not enough. Canonical pattern:

```tsx
<button
  type="button"
  onClick={(e) => { e.stopPropagation(); openDetail(id); }}
  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5
             px-3 py-1.5 text-xs font-semibold tabular-nums text-primary transition-all
             hover:border-primary hover:bg-primary/15 hover:shadow"
>
  {score}/100
  <ChevronRight className="h-3 w-3" />
</button>
```

Used by Task Dashboard's per-designer score and Concept Dashboard's Designer Concept Performance leaderboard. Both pages share the look so users learn one affordance. Do not invent new "open detail" styles — re-use this pill. The row may also be clickable; if so, `e.stopPropagation()` on the pill prevents double-fire.

### 8.9 Hiding auto-generated identifiers
System-generated IDs (`concept_code`, samples `uid`, etc.) clutter primary table views. Convention:
- **Do not** render them as their own cell or sub-line.
- **Do** keep them in: CSV exports, delete-confirmation dialog copy, and as a `title=` tooltip on the row's primary label (so admins can hover to find them when needed).

Examples: Concepts table hides `concept_code` (still in export + tooltip on title); Sampling Queue hides `uid` (still in export + tooltip on party name).

### 8.10 Filter row — Clear button
Filter rows on list pages (All Tasks, Concepts, Sampling Queue) carry a leftmost **Clear** button that resets every filterable input in that row:
- Rendered only when at least one filter is non-default (search, designer, date range, status pill, etc.).
- Style: `inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive`
- Icon: `FilterX` from lucide-react, with `<span className="hidden sm:inline">Clear</span>` so mobile shows icon only.
- **Does not** reset view-mode tabs (My/All/Urgent on Tasks, Samples/Dashboard/Kitting on Sampling) — those are navigation, not filters.

## 9. Privileged Admin Operations (Vercel API routes)
Operations that require the Supabase `service_role` key — editing any user's email/password, listing all auth users' emails, changing another user's `created_at` — **must not** run from the browser. They live as Vercel serverless functions at `linkd-fms/api/*.ts`.

- **Pattern:** Define each operation as a default-export handler `(req: VercelRequest, res: VercelResponse) => Promise<void>`. Always verify the caller's JWT (`req.headers.authorization` → `auth.getUser`) and look up their profile role before touching the admin client.
- **Env vars (Vercel only):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The SPA reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time, same values, different names.
- **Client helper:** Call API routes via `callAdminApi(route, body)` from `@/lib/adminApi`, which attaches the user's access token as `Authorization: Bearer …` and returns `{ data, error }` with parsed server messages (it surfaces the body of non-2xx responses, so the UI shows real reasons instead of "Failed to send a request").
- **Reference:** `api/admin-update-user.ts` — fetch / list_emails / update modes for the Team Management screen.
- **vercel.json:** rewrites must keep `/api/*` out of the SPA catch-all (`{ "source": "/((?!api/).*)", "destination": "/index.html" }`) — otherwise Vercel serves `index.html` for API paths and you get HTML-instead-of-JSON errors.
- **Do not** add new Supabase Edge Functions for new admin endpoints. The existing `admin-create-user` and `daily-notifications` stay on Supabase for historical reasons; new privileged endpoints go through Vercel.

## 10. Team Management
Team-member CRUD lives in `src/views/TeamView.tsx`:
- Edit dialog edits full_name, email, password, role, date-of-joining (`profiles.created_at`), and active status — all in a single Save. Only fields that changed are sent; the dialog fetches the current email + created_at via `/api/admin-update-user` on open.
- Row actions (View scorecard / Edit / Remove) live behind a `⋮` portal menu (`TeamRowActionsMenu`) so each row stays narrow — never re-introduce inline action buttons.
- The Email column only renders for `canManage` viewers; on dev (`npm run dev`) it shows a low-key note instead of a yellow warning since the API route 404s locally.

## 11. Orders (placeholder)
`/orders` (admin + design_coordinator) is a reserved sidebar slot above Sampling in the Manage section. The view at `src/views/OrdersView.tsx` is intentionally a "coming soon" placeholder until the data model + workflow are finalized. Until then:
- **Do not** add data wiring, hooks, or new tables to OrdersView. Production orders are still managed inside the Sampling queue (via the `order_or_sample` field on the `samples` row).
- When you build out the real Orders surface, treat it as the canonical home for the `samples` rows where `order_or_sample = 'order'`; don't fork the model.

## 12. Brief Form & Party Name (LD vs Job Work)
The New Brief form (`src/views/BriefingView.tsx`) and the clients table model two business segments. **This is load-bearing — read before touching either.**

### 12.1 Brief type (`tasks.brief_type`)
- Every task is `'ld'` (internal LinkD work) or `'job_work'` (external client work). Migration `0038`.
- **LD briefs**: `client_id` is **NULL** — there is no external party. The brief form shows no party picker when LD is selected.
- **Job Work briefs**: `client_id` is **required** and must point to a `job_work`-group client.
- A DB CHECK (`tasks_brief_type_client_consistency`) enforces this: `brief_type='job_work'` ⇒ `client_id IS NOT NULL`. `tasks.client_id` is now **nullable** (was NOT NULL pre-0038).
- The brief form's `BriefType` toggle defaults to `'ld'`. Switching to LD clears `clientId` so a stale Job Work pick can't submit with the wrong type. The mutation (`useTaskMutations.createTask`) zeroes `client_id` whenever `brief_type==='ld'` defensively.
- **Display**: task tables render `task.client?.party_name ?? "—"`; an LD brief shows "—". Don't crash on null client.

### 12.2 Party Name groups (`clients.client_group`)
- `clients.client_group` is `'ld'` or `'job_work'` (migration `0037`). The same party name MAY exist in both groups (no cross-group uniqueness) — same client can give both kinds of work.
- `useClients()` returns `clients` (all), plus pre-filtered `ldClients` / `jobWorkClients`, plus the `CLIENT_GROUP_LABEL` map. Use these instead of re-filtering.
- **Settings → Party Name** (`ClientManagementTab.tsx`): two pill tabs (LD / Job Work) scope the count, search, dedup detection, and add-form. Duplicates are detected **within** a group only.
- **Admins add parties only from Settings.** The brief form does NOT have an inline "add party" button — don't re-introduce one.

### 12.3 Brief form field rules
- **Required fields:** Design Type, Description, **Quantity** (≥ 1), **Group** (`whatsapp_group`), **Message date** + **Message time** (`whatsapp_received_date` / `_time`), **Assigned By**, and **Assign To**. `validate()` blocks submit and shows inline errors for each. For Job Work briefs, the party picker is also required.
- **Fabric / Meters / Planned deadline / Due time** were removed from the form (UI only). The DB columns still exist; submit sends `fabric: ""`, the rest `null`. Designers set `planned_deadline` themselves at claim time (see §13). Don't re-add these inputs without a product ask.
- **Quantity** is **required** and must be ≥ 1 (satisfies the `qty > 0` CHECK).
- **WhatsApp received date/time** (`tasks.whatsapp_received_date` / `whatsapp_received_time`, migration `0036`) capture when the brief arrived on WhatsApp — independent of `created_at`. **Both are now required.**
- **WhatsApp group** options live in `src/lib/whatsappGroups.ts` (single source of truth, shared by brief form + EditTaskDialog). Entries flagged `isWhatsApp` render a green `<WhatsAppIcon>` in the Combobox.
- **Assigned By** is an admin/coordinator-managed dropdown (`useAssignedByOptions("task")`, see §16) + an "Other" free-text escape hatch (`ASSIGNED_BY_OTHER`); required, defaults to nothing selected. The old hard-coded `ASSIGNED_BY_OPTIONS` array is gone.
- **Assign To** defaults to **Open Pool** (sentinel `ASSIGN_TO_POOL` → submits `assigned_to: null` → `status='pool'`). Picking a designer submits their id → `status='in_progress'`. There is no blank option, so the field is always satisfied. Don't reintroduce a "Select…" placeholder.
- **Draft auto-save**: the "Resume your draft?" prompt only fires when ≥ 2 of the required fields (client/concept/description) are filled — guards against the prompt nagging on near-empty drafts. Reference files are NOT persisted (File objects don't serialise).

### 12.4 Reference files (optional)
- The brief form has a **Reference Files** field beside the Group picker (`ReferenceFilesField`). Optional, multi-file, **any type, 50 MB each** (`REF_FILE_MAX_BYTES`).
- Files are held as raw `File` objects and **uploaded only after the task is created** (in `handleSubmit`), to the `design-files` bucket under `{uid}/tasks/{taskId}/brief-…`, then inserted into the `files` table (`task_id`, `storage_url`, `file_name`, `file_size`, `uploaded_by`). Cancelling the form never leaves orphaned uploads. A per-file failure warns but doesn't fail the brief.
- These files surface in the **task detail drawer**, the **claim modal** detail panel (§13), and the **Reference Files** column in All Tasks (§14). `useTasks` joins `files(id, file_name, file_size, storage_url)`.

### 12.5 Combobox per-option icons
`ComboboxOption` accepts an optional `icon?: React.ReactNode`, rendered before the label in both the trigger and the dropdown rows. Used for the WhatsApp-group icon; reuse it rather than hacking emoji into label strings.

## 13. Pool System — claim flow + done → completed

The task pipeline is now `pool → in_progress → done → completed`. `done` and `completed` are **both terminal-ish**; the distinction is load-bearing:
- **`done`** = design work finished, but completion details (fabric + mtr) not yet captured (an intermediate "awaiting metadata" state).
- **`completed`** = fully closed (terminal). Added in migration `0039` (`ALTER TYPE task_status ADD VALUE 'completed'`).

**`qty_completed` may EXCEED `qty`** (designers can log extra designs). The original inline `check (qty_completed >= 0 and qty_completed <= qty)` referenced two columns, so Postgres promoted it to a TABLE-level constraint auto-named **`tasks_check`** (NOT `tasks_qty_completed_check`). Migration `0043` dropped the wrong name; **`0044`** drops the real `tasks_check` and re-asserts only `qty_completed >= 0`. The `QtyTracker` clamp has no upper bound — don't re-add one. (Lesson: an inline column CHECK that references another column is named `<table>_check`, not `<table>_<col>_check`.)

### 13.1 Claiming from the Pool (designers)
- Designers don't browse the pool table — they see `<PoolSummaryCard>` + a **Claim** flow via `<ClaimTaskModal>`. Admins/coordinators still get the full pool table.
- `getNextPoolTasks(limit)` returns the top eligible pool tasks (sorted urgent-first, then oldest `requirement_received_at`, then oldest `created_at` — `comparePoolFifo`). The claim modal calls it with `limit=1` and shows **only the single front task** — the designer does **not** choose between tasks (keeps the queue strictly fair, no cherry-picking). They claim the one shown or cancel.
- The modal shows that task's **full details** (all brief fields + reference files via signed URLs) so the designer can size up the work before committing.
- The claim form asks for a **planned deadline (required)** and a **fabric (optional)**. Fabric is optional here but required to *complete* later — a short note says so. If provided, it's stored on `tasks.fabric` so the completion modal pre-fills it.
- `claimPoolTask(taskId, plannedDeadline, fabric?)` claims the **chosen** task: busy-check (blocked if the designer has any `in_progress` task), optimistic lock on `.eq('status','pool')`, regenerates the `task_code` with the designer's letter, sets `assigned_to/at`, `started_at`, `planned_deadline`, optional `fabric`, `status='in_progress'`. On a lost race it surfaces "already claimed by {name} on {datetime}" (`fetchClaimedByMessage`).
- Both functions live in `useTaskMutations`. Realtime keeps the pool honest across sessions — `tasks` is in the `supabase_realtime` publication (migration `0041`, `REPLICA IDENTITY FULL`).

### 13.2 Completing a task (done → completed)
- `markTaskDone(taskId)` sets `status='done'`, stamps `completed_at` + `delay_days`, and notifies the designer + admins/coordinators. Marking done does **NOT** auto-open any modal — the task simply lands in Done.
- The designer then clicks **"Complete"** (per-row CTA on Done, or the prompt in the task detail drawer). The handler (`handleComplete`) is conditional on whether fabric was already chosen at claim time (`tasks.fabric`):
  - **Fabric already set** → `completeTask` runs immediately, **no popup** (task → `completed`).
  - **No fabric yet** → `<PostDoneModal>` ("Add Fabric to Complete") opens to capture the **required fabric** (MTR was removed). On save, `completeTask(taskId, fabric, null)` runs.
- `completeTask(taskId, fabric, mtr?)` moves `done → completed` (optimistic lock on `.eq('status','done')`), stamping `completion_fabric`, `completion_filled_by`, `completion_filled_at` (migration `0040`). A task is only **completed** once fabric is recorded; until then it sits in `done`. The drawer's `CompletionSection` reflects this — "Ready to Complete" (green, fabric present) vs "Completion Details Needed" (warning, no fabric).
- `<TaskDetailDrawer>` shows a "Completion Details Needed" prompt for `done` tasks (opens PostDoneModal) and a read-only completion panel (fabric / mtr / filled-by name / filled-at) for `completed` tasks. The drawer joins `filler:profiles!completion_filled_by`.

### 13.3 Dashboards & `completed`
- Treat `completed` as terminal everywhere `done` was. `useTaskAnalytics` has an `isFinished(t)` helper (`done || completed`) used for active-pipeline / urgent / overdue exclusions; `completionDate(t)` anchors on `completed_at` so KPIs/leaderboards count both. On the **dashboards** the pipeline "Done" bar **merges** done + completed (a high-level summary). Home Dashboard (`DashboardView` / `DashboardKpiCards`) follows the same rule. **Concept Dashboard (`useAnalytics.ts`) is unaffected.**
- On the **board** (`KanbanView`) there is **no Done tab** — just `DASHBOARD_STATUSES = pool, in_progress, completed` (+ a Full Knitting sub-view). A `done` task (design finished, awaiting fabric) **stays in In Progress**, badged a green **"Done"** in the Concept cell, and carries the per-row **"Complete"** CTA. Adding fabric moves it to **Completed**. The designer `StatCluster` shows Active (incl. done) / Completed / Total.
- The status switcher is a **compact `<TaskPipelineStepper>`** mounted **as the task table's header** (passed to `TaskTableSection` via `headerSlot`) — not a separate top card. It renders as a **single slim row of "glass pills"**: the connected pipeline is **Pool → In Progress → Completed** (joined by chevrons that fill once the upstream stage has items), and **Full Kitting is a standalone side pill divided off to the right** (via the `sideStage` prop) — it's a separate data tab, NOT a pipeline stage. Clicking a pill routes through `handleStageClick` to the same `statusTab` / `kittingView` state. The stepper is purely visual; all filtering/sorting/table logic is unchanged.

## 14. Task-table column visibility

The All Tasks wide table (`KanbanView`) has per-user **column visibility**, DB-backed so it persists across sessions/devices.
- **Hook:** `useUserPreferences()` (React Query, `user_preferences` table from migration `0040` — `visible_columns` JSONB). Auto-creates the row on first read, optimistic `setVisibleColumns`. Returns `{ visibleColumns, isLoading, setVisibleColumns }`.
- **Column model** lives in the hook: `ColumnKey`, `ALL_COLUMNS` (key + label), `DEFAULT_COLUMNS`, `REQUIRED_ONE_OF`. Toggleable keys map 1:1 to the **real** `<th>`/`<td>` pairs: `date, designer, concept, description, party_name, fabric, whatsapp_group, message_date, message_time, assigned_by, qty, deadline, completion_timestamp, completed, pending, started_late`. There is **no** Status/Priority column — don't add phantom keys. (`mtr` was removed.)
- **Always-on columns (NOT toggleable, absent from `ALL_COLUMNS`):** bulk-select checkbox, the sticky **Action** column, and the **Reference** column (`files`) — Reference was made permanent so it's never hidden.
- **`message_date` / `message_time`** render `whatsapp_received_date` / `whatsapp_received_time` (the brief's Message date/time), via `formatDateOnly` / `formatTimeOnly`.
- **`deadline`** column is labelled **"Planned Deadline"** (was "Due Date"); the cell renders inline (single line, severity dot + date) to match the other date columns — NOT the shared `<DeadlineCell>` (that's still used in the mobile card).
- **`started_late`** keeps its legacy key but is labelled **"Completed Late"**: it's now deadline-based — Yes when the task finished AFTER `planned_deadline` (see `isCompletedLate`), not the old cycle-time meaning. No-deadline / not-completed = No.
- **Menu:** `<ColumnVisibilityMenu>` (the "Columns" button) — checkboxes + "Show All" + "Reset". Saves immediately. Can't hide both identifying columns (`REQUIRED_ONE_OF = [concept, party_name]`).
- **Wiring:** `KanbanView` gates each toggleable `<th>`/`<td>` with `visibleColumns.includes(key)` (thead + `TaskRow` must stay in lockstep). The table is `w-full` with the **Description** column greedy (`w-full max-w-0` + truncate) so other columns hug their content — no forced `min-w-[2800px]` stretch.
- **Reference column** (`files`) renders clickable chips (`RefFilesCell`) opening a short-lived signed URL from `design-files`; click `stopPropagation`. The **Concept cell's 📎 chip** is also clickable (opens the reference file via `openDesignFile`), and the **FK badge** is a button that opens the full-knitting file via `openFullKittingFile` (`sample-files` bucket; prefers the DEO image, falls back to `task.full_kitting_image_url`).
- The **Pool status tab** shows an urgent/normal split so the queue makeup is visible from any tab.

## 15. Salvedge — Designer Access & Workflow

Salvedge tracks challan-based fabric distribution. Coordinators create records and assign designers; designers work on their assigned records.

### 15.1 Role access
- **Admin / design_coordinator:** Full CRUD — create, edit, delete records, view dashboard analytics. RLS policy `salvedge_admin_or_coordinator_all` uses `is_admin_or_coordinator()`.
- **Designer:** Read-only view of records assigned to them (`designer_id = auth.uid()`). Can update `completed_qty` inline and mark records as done. Cannot create, edit, or delete records. RLS policies: `salvedge_designer_read` (select, any authenticated), `salvedge_designer_update_own` (update, `designer_id = auth.uid()`).
- The `/salvedge` route is open to all three roles (`ProtectedRoute allowedRoles`). The sidebar shows "Salvedge" for designers between Concepts and Files.

### 15.2 Designer view behavior
- `SalvedgeView` filters records client-side: `allRecords.filter(r => r.designer_id === profile?.id)` for designers.
- Designers see only the **Records** tab (no Dashboard tab). The "Add Record", "Edit", and "Delete" buttons are hidden (`isAdmin` gating).
- Each row has an inline `completed_qty` input and a "Done" button (enabled when `pending === 0`). These are available to all roles, not gated by `isAdmin`.

### 15.3 Form dialog remount
- `SalvedgeFormDialog` uses `key={editRecord?.id ?? "new"}` to force React to remount when switching between add/edit modes, ensuring form fields re-initialize with the correct record data.

### 15.4 RLS policies (migration `0048`)
- `salvedge_admin_or_coordinator_all` — replaced the old `salvedge_admin_all` (which only matched `is_admin()`). Now uses `is_admin_or_coordinator()`.
- `samples_admin_or_coordinator_all` — same fix applied to the `samples` table for consistency.
- The migration is idempotent (drops old + new policy names before re-creating). It was renamed from a clashing `0046_salvedge_*` → `0048_salvedge_coordinator_policy.sql`.

## 16. Managed form dropdowns (Settings → Dropdowns)

Several form dropdowns are admin/coordinator-managed lookups (like Fabrics / Concept Categories), instead of hard-coded arrays. **One Settings tab — "Dropdowns"** (`DropdownsTab.tsx`, group "data") manages them all via a two-level picker: context pills (Tasks / Full Knitting / Sampling) → dropdown chips → one `<LookupSection>` editor at a time. Coordinators have access (not admin-only).

### 16.1 Tables (one per concern; all share the lookup shape `id, name, sort_order, is_active`)
- **`assigned_by_options`** (migration `0045`) — the "Assigned By" roster. **Per-form via a `context` column** (`'task' | 'full_kitting' | 'sampling'`, migration `0047`), with `UNIQUE(name, context)` so the same name can exist per context. Tasks context covers New Brief + Edit Task + Submit Concept.
- **`received_by_options`** (migration `0049`) — Full Knitting form's "Received By". Single list (no context).
- **`sampling_dropdowns`** (migration `0051`, synced `0052`) — Sampling form's **Requirement / Sampling Done By / Fusing Operator**, one table scoped by a `field` column (`UNIQUE(name, field)`). Seeded from `scripts/Sampling Dropdowns.csv`.
- RLS on all three: read = any authed; write = `is_admin_or_coordinator()`. Coordinator write access to `concept_categories` / `fabrics` / `assigned_by_options` was widened in migration `0046`.

### 16.2 Hooks (each falls back to a built-in default list if the table is empty / pre-migration, so pickers are never blank)
- `useAssignedByOptions(context, { activeOnly })` → `{ options, names, … }`. `ASSIGNED_BY_OTHER` sentinel + `ASSIGNED_BY_CONTEXTS` live here.
- `useReceivedByOptions({ activeOnly })` → `{ options, names, … }`.
- `useSamplingDropdowns({ activeOnly })` → `{ rowsByField, names, … }` (grouped by field in one query).

### 16.3 Wiring
- Forms read the hooks and map `names` → Combobox options. **Assign-by contexts:** New Brief / Edit Task / Submit Concept use `"task"` (the hook default); Full Knitting uses `"full_kitting"`; Sampling uses `"sampling"`. The "Other" free-text escape hatch is preserved everywhere.
- `<LookupSection>` gained an **`insertExtra`** prop merged into every insert (e.g. `{ context }` or `{ field }`) and its `table` union includes the new tables. The parent owns fetching/filtering; the section owns add/edit/activate/delete/search.
- **Adding a new managed dropdown:** create the table (mirror an existing migration), add it to `database.ts` + `queryKeys`, a hook (or extend `useSamplingDropdowns`'s field set), the `LookupSection` `table` union, a chip in `DropdownsTab`, and wire the form's Combobox. Don't reintroduce hard-coded option arrays.

## 17. App shell — TopNav + collapsible sidebar

The desktop app shell is **`AppLayout`** → **`Sidebar`** (pinned left, can collapse to a 64px rail) + **`TopNav`** (thin fixed utility strip) + `<main>`. The two pieces are coupled — touch one, check the other.

### 17.1 Sidebar collapse
- State: `collapsed` boolean in `AppLayout`, persisted per-device under `localStorage["sidebar-collapsed"]`. Toggle button lives in the sidebar (`PanelLeftClose` / `PanelLeftOpen`).
- Width: `md:w-[220px]` when pinned-expanded, `md:w-16` when pinned-collapsed. While collapsed, hovering the rail expands an **overlay** (shadow + full width) over the page — content does NOT reflow on hover; only on pin/unpin.
- Content padding follows the **pinned** state only: `cn("transition-[padding] duration-200", collapsed ? "md:pl-[64px]" : "md:pl-[220px]")` on the outer div in `AppLayout`. Same 200ms timing everywhere.

### 17.2 TopNav rules
- **No page title.** The TopNav deliberately renders no route-derived heading — each page already has its own in-content heading and the old "Sampling Queue / Dashboards / …" duplicated it. Don't reintroduce a `getPageTitle`/`<h1>` in TopNav.
- **Left anchor:** a two-line greeting block — time-based greeting + first name (`Good {morning|afternoon|evening}, {first}`), date underneath on `sm+`. Anchors the bar so it doesn't read as empty.
- **Right cluster:** ConnectionDot (`hidden sm:inline-flex`) · NotificationBell · Avatar (`hidden sm:inline-flex`) · Sign out (label `hidden md:inline`). The name is NOT duplicated here — it's in the greeting.
- **Tracks sidebar collapse.** TopNav is `position: fixed`, so it ignores AppLayout's `pl-*`. It uses its own `left`: `cn("... transition-[left] duration-200 md:px-6", collapsed ? "md:left-[64px]" : "md:left-[220px]")`. AppLayout passes `collapsed={collapsed}` as a prop. If you add a new top-level fixed surface (banner, secondary bar), mirror this pattern or it will float in the wrong place when the sidebar collapses.

## 18. Dialog mobile-safe defaults

The base `DialogContent` in `@/components/ui/dialog` carries mobile-safe defaults so every dialog reads well on a phone. `cn` uses `tailwind-merge`, so any caller's class wins via `twMerge` last-write semantics.

- **Width:** base is `w-[calc(100%-2rem)] max-w-lg` — keeps a 1rem gutter on phones so dialogs never touch the screen edges; `max-w-lg` caps desktop width. **Do NOT override with bare `w-full`** — you lose the gutter. To go wider, use a larger `max-w-*` or `sm:max-w-[Npx]`. To go full-bleed on mobile, set `w-[95vw]` explicitly (TaskDetailDrawer does this).
- **Rounding:** `rounded-lg` applies on ALL breakpoints (was `sm:rounded-lg` pre-mobile-polish — sharp on phones because there was no gutter). Caller's `sm:rounded-xl` etc. still wins on larger screens.
- **Vertical overflow is NOT in the base.** A tall form must either:
  - **(A) The flex-col + scroll-body pattern** (use for combobox-heavy forms like SamplingFormDialog, TaskDetailDrawer, EditTaskDialog): `DialogContent` className includes `flex max-h-[92vh] flex-col overflow-hidden p-0` + an inner `<div className="flex-1 overflow-y-auto …">` for the scrollable body. Header/footer outside the scroll box stay pinned. Combobox dropdowns are clipped only by the inner body, which is usually fine; if a dropdown opens near the bottom of the body, the user can scroll the body first.
  - **(B) The lazy retrofit** (use only for short admin forms): add `max-h-[90dvh] overflow-y-auto` to `DialogContent` and let the whole thing scroll. Applied to FullKittingModal, KittingStageADialog, TeamView add/edit. **Beware Combobox in this mode** — its dropdown is `absolute` and gets clipped by the dialog's scroll container, so prefer (A) for combobox-heavy forms.
- **`<Combobox>` is NOT portaled** — its menu is `absolute` inside the trigger's relative wrapper. Any ancestor with `overflow: auto/hidden` clips it. This shapes the dialog scroll choices above; don't add `overflow-y-auto` to ancestors of a Combobox unless you're OK with clipping.
