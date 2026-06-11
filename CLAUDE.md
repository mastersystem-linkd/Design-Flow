# LinkD FMS — AI Assistant Instructions

## Role & Mission
Act as an expert full-stack developer (React 18, TypeScript, Supabase, Tailwind CSS) working on the LinkD FMS workspace. Prioritize elegant, accessible, and performant solutions following the established conventions.

## 1. Project Context & Environment
- **Active Directory:** All active development happens strictly inside the `./linkd-fms/` directory. Ignore any legacy Next.js files at the root.
- **Tech Stack:** React 18, Vite 5, TypeScript (strict), React Router v6, Tailwind CSS 3.
- **Backend:** Supabase (PostgreSQL, Auth, Storage). 
- **Strict Dependency Pin:** The `@supabase/supabase-js` version is **strictly pinned to 2.45.4**. Do not update it, as newer versions cause request-hang bugs in this Vite environment.
- **Reference docs:** [`database.md`](database.md) (repo root) is the complete **schema brain** — every table, field, FK, constraint, RLS policy, trigger, RPC, storage bucket + **where each table renders in the UI**. [`PROJECT_FLOW.md`](PROJECT_FLOW.md) traces the whole app start-to-end. Keep both (and `linkd-fms/public/flow-diagram.html`) in sync whenever you change the schema or a major flow.

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
- **Vercel Deployment:** The **primary production project** is `design-flow` on the `mastersystem-linkds-projects` Vercel team. It deploys automatically on git push to `main`. Domain: `design-flow-sooty.vercel.app` (or custom domain when configured). There is also a legacy `linkd-fms` project on `harshali-bhopale-s-projects` used for CLI deploys — it can be removed. **Always deploy to `design-flow` (mastersystem-linkds-projects)** as the canonical production target.
- **Env vars (Vercel, build-time):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — must be set in the Vercel project's Environment Variables for Production. `SUPABASE_SERVICE_ROLE_KEY` is also needed for `/api/*` serverless routes. These are baked into the JS bundle at build time by Vite (`import.meta.env.VITE_*`).
- **Google OAuth:** Configured via Supabase Auth → Providers → Google. `redirectTo` in `LoginView.tsx` must match the production domain. Supabase → Authentication → URL Configuration must have the production domain in both Site URL and Redirect URLs.

## 7. Sampling Hub
- **Add Sample:** Do not use "Quick add form" for Add Sample. The sampling form must strictly be a pop-up form (center dialog) rather than a right-side drawer format.

## 8. Dashboards & Scorecards — Unified UI System

The app has five analytics surfaces: **Task Dashboard**, **Concept Dashboard**, **Sample Dashboard**, **Scorecards (list)**, and **Scorecard Detail**. They share one visual vocabulary. Do not invent new KPI tile styles, new chart frames, or new table looks for these views — extend the existing primitives.

### 8.1 KPI tiles
- **`<KpiCard>`** (`@/components/analytics/KpiCard`) still exists for simple snapshot stats (Scorecards summary). The `metric` prop is **optional** — omit it for tiles with no period-over-period comparison. Hover lift only fires when `to` is set.
- **`<MetricCard>`** (exported from `TaskDashboardView.tsx`) is now the **unified KPI component** across all dashboards — Task Dashboard, Concept Dashboard (via `AnalyticsView`), and Scorecard Detail. It renders a crisp `text-foreground` numeral, uppercase label, `DeltaBadge` trend indicator, and quiet sparkline. Both `DeltaBadge` and the `HeroTone` type are also exported for reuse.
- **Task Dashboard hero (rebuilt 2026-06, Linear/Vercel idiom):** the old 7-tile divided `HeroKpiTile` strip is **gone**. The admin hero is now two clean rows of bordered cards: four `MetricCard` (primary throughput) above three compact **`StatusTile`** (Active / Urgent / Overdue — horizontal icon + numeral + trailing note). No decorative/textile wrapper; hierarchy comes from grouping + contrast.
- **Designer Task Dashboard:** uses the same `MetricCard` grid as admin (period-filtered KPIs) + `DesignerWorkloadSummary` (a scalable workload overview showing active task details + completion stats, replaces a raw task list) + a compact pipeline widget. Designers see their own data only.
- **No dim gradient numerals.** KPI values render in high-contrast `text-foreground` (the `metric-value` indigo gradient-clip read as washed-out, especially in dark mode). The `.metric-value` utility still exists but is **not** the default for KPI figures anymore — `KpiCard` now defaults to `text-foreground`.

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

**Premium uplift (2026-06):** `<TextileHeroWrapper>` (`@/components/analytics/TextileHeroWrapper`) is still the wrapper for the **Concept Dashboard / Sample Dashboard / Scorecards** heroes (frosted `glass-panel`, `rounded-2xl/3xl`, `shadow-glow-soft`, three drifting `.aurora-blob`s). The **Task Dashboard no longer uses it** — its rebuilt hero (see §8.1) is intentionally chrome-free, clean bordered cards. App-wide, `body::before` paints a subtle gently-drifting **aurora canvas** behind all content (richer in dark, restrained in light). All aurora motion is killed under `prefers-reduced-motion`. **Design thesis = Linear / Vercel / Stripe: restraint, crisp high-contrast type, 1px borders, tight spacing, ruthless hierarchy — not maximalist glow/glass.** When in doubt, dial decoration *down*.

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
- Primary actions (Refresh, Export icon, + Add) on the far right (shrink-0). **Export buttons are icon-only** (Download icon, no text label) across all dashboard pages.
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

- **Brief Details section** in `TaskDetailDrawer` is **collapsible** (collapsed by default). Shows a compact one-line summary when collapsed; expands to full brief fields on click.

### 8.10 Filter row — Clear button
Filter rows on list pages (All Tasks, Concepts, Sampling Queue) carry a leftmost **Clear** button that resets every filterable input in that row:
- Rendered only when at least one filter is non-default (search, designer, date range, status pill, etc.).
- Style: `inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive`
- Icon: `FilterX` from lucide-react, with `<span className="hidden sm:inline">Clear</span>` so mobile shows icon only.
- **Does not** reset view-mode tabs (My/All/Urgent on Tasks, Samples/Dashboard/Kitting on Sampling) — those are navigation, not filters.

### 8.11 Date range filtering
- **`<DateRangePicker>`** (`@/components/ui/DateRangePicker`) — reusable From/To date picker. Used on Task Dashboard, Concept Dashboard (via `AnalyticsView`), and Scorecards.
- `useTaskAnalytics` and `useAnalytics` accept an optional `customRange?: { from: Date; to: Date }` parameter that overrides the period-based filtering when set.
- Clicking a period pill (Week / Month / Quarter) **resets** any active custom range — the two filter modes are mutually exclusive.

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
- **WhatsApp received date/time** (`tasks.whatsapp_received_date` / `whatsapp_received_time`, migration `0036`) capture when the brief arrived on WhatsApp — independent of `created_at`. **Both are now required.** Message time uses `<MessageTimeInput>`, a 12-hour AM/PM picker with auto-advance between hour/minute/period segments, arrow key navigation, and blur-padding (single digits pad to `0X` on blur). Don't replace with a native `<input type="time">`.
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

The All Tasks wide table (`KanbanView`) has per-user **column visibility**, DB-backed so it persists across sessions/devices. **Column choices are per pipeline stage** — Pool, In Progress, and Completed each remember their own visible set, so switching tabs swaps the columns to that stage's selection.
- **Hook:** `useUserPreferences()` (React Query, `user_preferences` table from migration `0040` — `visible_columns` JSONB). Auto-creates the row on first read, optimistic updates. Returns `{ visibleColumnsByStage, getVisibleColumns(stage), getDefaultColumns(stage), hasCustomDefault(stage), setVisibleColumns(stage, columns), setDefaultColumns(stage), tableDensity, setTableDensity, isLoading, isSaving }`.
- **Per-stage storage:** `visible_columns` JSONB now holds `StoredColumnPrefs` = `{ current: VisibleColumnsByStage, defaults: Partial<VisibleColumnsByStage> }` — `current` is the live per-stage selection; `defaults` is the user's *own* pinned default per stage (the Reset target; a stage absent here falls back to the built-in default). `normalizeStored()` tolerates three historical shapes: a legacy flat `string[]` (→ Pool current view), a flat per-stage map (→ `current`, no custom defaults), or the `{ current, defaults }` object (used as-is). No DB migration was needed — the JSONB column absorbs the new shape. `VisibleColumnsByStage = Record<PipelineStage, string[]>`; `PipelineStage = "pool" | "in_progress" | "completed"`; `done` tasks live in the In Progress tab so `KanbanView`'s `toColumnStage()` maps any non pool/completed tab to `in_progress`. Full Kitting has its own separate column system (`fkCols` / `FkColumnMenu`) — unaffected.
- **Per-stage built-in defaults:** `defaultColumnsForStage(stage)` — In Progress returns `IN_PROGRESS_DEFAULT_COLUMNS` (date, designer, concept, description, party_name, fabric, whatsapp_group, assigned_by, qty, pending, full_kitting); Completed returns `COMPLETED_DEFAULT_COLUMNS` (date, designer, concept, description, party_name, fabric, whatsapp_group, assigned_by, qty, completion_timestamp, completed, started_late); Pool returns the generic `DEFAULT_COLUMNS`.
- **User-defined default ("Set as my default"):** `<ColumnVisibilityMenu>` shows a **Set as my default** button (`onSetDefault` prop) that pins the stage's current selection into `defaults[stage]` via `setDefaultColumns(stage)`. **Reset** (`defaultColumns` prop = `getDefaultColumns(stage)`) then restores *that* user default, falling back to the built-in stage default if none is pinned. The button reads "This is your default" (disabled) when the current view already equals the effective default, and flashes "Saved as your default" on click. `hasCustomDefault(stage)` only adjusts the Reset tooltip copy.
- **Column model** lives in the hook: `ColumnKey`, `ALL_COLUMNS` (key + label), `DEFAULT_COLUMNS`, `REQUIRED_ONE_OF`. Toggleable keys map 1:1 to the **real** `<th>`/`<td>` pairs: `date, designer, concept, description, files, party_name, fabric, whatsapp_group, message_date, message_time, assigned_by, qty, claimed, deadline, completion_timestamp, completed, pending, started_late`. There is **no** Status/Priority column — don't add phantom keys. (`mtr` was removed.)
- **`date`** column is labelled **"Briefed"** (shows `created_at` — when the brief was created). **`claimed`** column is labelled **"Claimed"** (shows `started_at` — when the designer claimed the task).
- **Always-on columns (NOT toggleable, absent from `ALL_COLUMNS`):** bulk-select checkbox and the sticky **Action** column only. The **Reference** column (`files`, label "Reference") IS toggleable as of this change — it shows in the Columns menu and is part of `DEFAULT_COLUMNS`. (Existing users whose saved `visible_columns` predate this won't see it until they enable it via the menu / Show All.)
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
- **Dialog entrance:** scale `.96→1` at 350ms `cubic-bezier(.16,1,.3,1)`, exit 200ms. `dialog-panel` adds a 2px `--selvedge` gradient top edge. Desktop `sm:rounded-2xl`. Backdrop is `bg-foreground/40 backdrop-blur-sm`. Reduced-motion: instant.

## 19. Selvedge Design Language — CSS tokens + utilities

The app's visual identity is the **selvedge** — the finished edge of woven cloth. Every surface, border, and animation references this metaphor. Tokens live in `src/index.css`, utilities in `@layer components`.

### 19.1 Depth + focus tokens (`:root` and `.dark`)
- `--selvedge` — 2px horizontal gradient (indigo). Light: `#4338CA→#6366F1`. Dark: `#6366F1→#818CF8`.
- `--selvedge-warm` — indigo→madder, from `rgb(var(--primary))` + `rgb(var(--warning))`.
- `--brand-glow` — box-shadow. Light: `0 0 8px` at 12% alpha. Dark: `0 0 20px` at 30%.
- `--ring-focus` — `rgb(var(--ring))` for keyboard focus outlines.
- `--ruler-tick` — `rgb(var(--border))` for metric underlines.

### 19.2 Accessibility base
- **Reduced motion:** `@media (prefers-reduced-motion: reduce)` blanket rule kills ALL `animation-duration`, `animation-iteration-count`, `transition-duration`, `scroll-behavior` on `*` with `!important`. Additional per-utility overrides on `.warp-draw`, `.weft-in`, `.shuttle-dot`.
- **Focus-visible ring:** `outline: 2px solid var(--ring-focus); outline-offset: 2px; border-radius: 4px` on `a, button, [role="button"], input, select, textarea, [tabindex]` via `:focus-visible`. NEVER remove outlines.

### 19.3 Selvedge utilities (CSS classes)
- `.nav-selvedge-active` — sidebar active: gradient left edge + inset `--brand-glow`.
- `.swatch-edge` / `.swatch-edge-actionable` — KPI tile left edge (indigo resting, warm on hover when actionable).
- `.row-selvedge` — table row 2px inset left `box-shadow` on hover.
- `.thead-selvedge` — 2px gradient top edge on table headers.
- `.shuttle-dot` — 5px pulsing dot (pipeline active connector). Hidden under reduced-motion.
- `.pill-gradient-ring` — gradient ring on active stepper pill via `::after` mask.
- `.dialog-panel` — 2px `--selvedge` top edge on dialog panels.
- `.dialog-ease` — enter 350ms, exit 200ms, custom easing.
- `.metric-value` / `.metric-value-ruled` — gradient-clipped numerals with solid fallback.
- `.greeting-gradient` — time-band gradient on TopNav greeting word.
- `.table-compact` — density override (trimmed `py` + `text-xs` on `th`/`td`).
- `.font-mono-data` — JetBrains Mono 700, `tabular-nums` (opt-in for data numerals).
- `.warp-draw` / `.weft-in` — dashboard hero entrance (transform+opacity only, ≤700ms).

### 19.4 Fonts
- **ONE family app-wide: Sora.** `tailwind.config.js` maps `sans`, `serif`, **and** `display` all to `Sora` (only `mono-data` differs), and `src/index.css` declares `font-family: "Sora"` **once** on the body with an explicit "do not declare font-family anywhere else" rule. Headings (`h1–h4`) keep weight + tight tracking but inherit Sora. Loaded via the Google Fonts `<link>` in `index.html` (weights 400–800). Don't reintroduce a second family outside the login page.
- **Data numerals:** JetBrains Mono 700 — self-hosted via `@fontsource/jetbrains-mono/700` (imported in `main.tsx`) + Google Fonts, `font-display: swap`. Opt-in ONLY via `.font-mono-data` / `font-mono-data` (tabular figures on KPIs, charts, data tables). Never global.
- **Login page only (`/login`):** the `.df-login`-scoped CSS in `LoginView.tsx` uses **Bricolage Grotesque** (wordmark + h1 + card headings) and **Hanken Grotesk** (body/labels) for a distinct editorial look, isolated from the rest of the app. Both are loaded from Google Fonts for the login screen only.
- **Removed (do NOT reference):** **Manrope** (old body) and **Fraunces** (old serif accent) are gone — the app was normalized to the single Sora family. `.font-display` and `.font-serif-accent` utilities still exist but now resolve to Sora (kept as no-op back-compat).
- All faces use `font-display: swap` — no CLS on first paint.
- **Default theme is `light`** (`<ThemeProvider defaultTheme="light">` in `main.tsx`). The premium uplift was tuned to read well in **both** themes (the aurora is richer in dark, restrained in light) — never hardcode theme-specific values, keep extending the `:root` / `.dark` tokens.

### 19.5 Status pill discipline
- Only ONE indicator may use `.animate-urgent-pulse` (single-run) — the most severe (overdue/urgent).
- `animate-pulse` (looping) is reserved for skeleton loaders and genuine temporary states (recording, connecting, export progress). NEVER on status badges, dots, or icons.
- All pills are token-driven via constants in `lib/constants.ts` (`STATUS_COLORS`, `CONCEPT_STATUS_COLORS`, `WORK_STATUS_COLORS`).

### 19.6 Charts (recharts)
- Axis ticks + tooltips use JetBrains Mono via `CHART_AXIS_TICK.fontFamily` in `lib/chartConfig.ts`.
- `useChartAnimation()` hook — returns `true` on first render, `false` after (prevents re-animation on refetch). StrictMode-safe.
- Dark mode: `.dark .recharts-area-curve` / `.recharts-line-curve` get `brightness(1.15) + drop-shadow`. `.dark .recharts-bar-rectangle path` gets `brightness(1.1)`.

### 19.7 Components
- **`<ScoreRing>`** (`@/components/analytics/ScoreRing`) — SVG embroidery hoop. Dashed guide + solid fill arc, round caps, -90deg rotation, 1.2s ease-out on mount (ref-guarded, StrictMode-safe). Track `--secondary`, fill by threshold (success 80+ / warning 60–79 / orange 40–59 / destructive <40). Dark glow via `drop-shadow`. Used in ScorecardsView + ScorecardDetailView. Does NOT replace the ScorePill navigation affordance (§8.8).
- **`useAnimatedNumber`** — count-up 0→target, 800ms cubic ease-out, mount-only. `done` is React state (StrictMode-safe). Reduced-motion: instant. Applied to KpiCard, HeroKpiTile, DashboardKpiCards.
- **`<TargetRing>`** — SVG target-progress ring used in the Designer Concept Dashboard. Replaces `RadialBarChart` for the monthly concept target. Renders a dashed guide track + solid fill arc with threshold-based coloring, similar to `ScoreRing` but purpose-built for target/actual counts.
- **`<EmptyState>`** — inline SVG loom swatch (warp/weft/selvedge in tokens) when no `icon` prop. Token-stroked, both themes.
- **Skeletons** — `SkeletonCard` has `swatch-edge`, `SkeletonTable` has `thead-selvedge` + `row-selvedge`, `SkeletonScoreRing` is a dashed circle. `AppShellSkeleton` is theme-aware (light sidebar in light mode).

## 20. Table density toggle

Per-user comfortable/compact row density for wide tables, DB-backed via `useUserPreferences` (§14).

- **DB:** `user_preferences.table_density` column (`text NOT NULL DEFAULT 'comfortable'`), migration `0047`.
- **Hook:** `useUserPreferences()` returns `tableDensity` + `setTableDensity(d)` with optimistic mutation.
- **CSS:** `.table-compact th/td` overrides in `@layer components` — trims `py` by ~60%, drops font one step.
- **UI:** `Rows3` icon button in KanbanView toolbar (next to Columns menu). Highlights `bg-primary/10` when compact.
- **Wiring:** `table-compact` class applied to the table scroll wrapper via `tableDensity` prop threaded through TopBar → TaskTableSection.

## 21. Danger Zone — dynamic record management

The Danger Zone (`DangerZoneTab.tsx` in Settings) supports both bulk-clear and targeted record deletion.

### 21.1 Expandable sections
- Each table section is an accordion — click to expand, shows up to 200 records.
- Records display identifiable info (name, code, status, date, UUID prefix) per table.
- `selectCols` and `orderCol` per table match the actual DB schema (e.g. `task_logs` uses `timestamp` not `created_at`, `files` uses `uploaded_at`, `task_comments` uses `body` not `content`).

### 21.2 Search + selection
- Per-section search bar filters records client-side by display text or ID.
- Checkbox selection on every record + "Select All" header.
- **Delete Selected** button triggers the same 2-stage confirmation (ConfirmDialog + type DELETE).
- **Clear All** button per section still available for full table wipe.

### 21.3 Confirmation flow
- Stage 1: ConfirmDialog (danger variant) — "I understand, continue".
- Stage 2: Type `DELETE` in a modal input — exact match required.
- Both stages apply to all actions: clear-notifs, clear-table, delete-selected, clear-all.

## 22. Voice/audio features — removed

Voice feedback (recording + transcript + audio playback) has been removed from the Concepts workflow.

- **Removed:** `VoiceFeedback` component usage from `ConceptDetailDrawer` (3 instances replaced with plain `<textarea>`).
- **Removed:** Audio state variables (`reviewAudioUrl`, `finalAudioUrl`, `voiceBusy`, `suggestAudioUrl`).
- **Simplified:** `FeedbackDisplay` now renders text only — strips legacy `🎙 Voice feedback:` markers from old records.
- **Dead code:** `VoiceFeedback.tsx` is no longer imported anywhere. Can be deleted.
- **No DB changes** — the `md_notes` / `md_feedback` / `final_approval_notes` columns still store text; old records with audio markers display the text portion only.

## 23. Concept editing (designer self-edit)

Designers can edit their own concepts until the MD approves at each stage.

- **Mutation:** `editConcept` in `useConcepts` — updates the concept row with revised fields (title, description, category, fabric, images, etc.).
- **Dialog reuse:** `<SubmitConceptDialog>` supports edit mode via `editConcept` + `onEdit` props. Pre-fills all fields from the existing concept.
- **Entry point:** Edit button (pencil icon) in `ConceptDetailDrawer` header, visible when `canDesignerEdit` is true.
- **Editable stages:** `pending` / `revision_requested` (Stage 1–2, pre-MD-approval); `approved` without `final_approved_at` (Stage 3–4, pre-final-approval). Once the stage's approver acts, the concept locks for that stage.

## 24. Concept permissions — stage-based role split

The 4-stage concept pipeline has strict role gating per stage:
- **Stage 1 (Submit):** designer submits.
- **Stage 2 (MD Approval):** `admin` / `super_admin` only — gated by `isMdRole()`. Coordinators cannot MD-approve.
- **Stage 3 (Designer Completion):** designer-only actions (`isMine` check).
- **Stage 4 (Final Approval):** `admin` / `super_admin` + `design_coordinator`.
- **"Your Turn" pill** in `ConceptsView` respects this split — shows only for concepts the current user's role can act on.
- **`reviewConcept` mutation** has a role check — rejects if the caller lacks the required role for the concept's current stage.

## 25. Editable feedback notes

Feedback text blocks are editable in-place by the appropriate role while the concept is in the right state.

- **`<EditableFeedbackBlock>`** component — renders a text block with an inline edit affordance (pencil icon). Saves on blur/Enter.
- **MD notes (`md_notes`):** editable by admin/super_admin while concept is `revision_requested`.
- **Final approval notes (`final_approval_notes`):** editable by admin/super_admin + coordinator while concept is `changes_requested`.
- **Designer resubmission notes:** `<DesignerResubmitNote>` — designers can add/edit a note explaining their revisions before resubmitting. Notes lock once the designer resubmits (concept leaves `revision_requested` / `changes_requested`).

## 26. Concept activity timeline

The concept detail drawer shows a chronological activity timeline synthesized from concept fields + persisted history.

- **MD review events** are now logged to `completion_history` JSONB (not just synthesized from `md_status` field changes). This ensures timeline entries persist even if later mutations overwrite the status fields.
- **Timeline sorting:** entries sort by timestamp within each stage group.
- **`resubmitForReview`** no longer duplicates MD feedback in the timeline — it appends a resubmission event only.
- **`buildConceptTimeline`** prefers persisted `completion_history` entries over synthesized ones (from field sniffing). If both exist for the same event, the persisted entry wins.

## 27. Held concept alerts

- **`useHeldConceptAlerts`** hook — runs in `AppLayout` for admin/coordinator roles. Checks for concepts stuck in `on_hold` status for more than 4 days.
- Sends a `warning` notification via `notify_user` RPC when a held concept exceeds the threshold.
- Deduped per `(user_id × concept_id × day)` — one alert per held concept per day.

## 28. Coordinator Tasks

The `/coordinator-tasks` route gives coordinators a personal task-tracking surface (separate from the design-task pipeline).

- **KPI header:** compact `KpiChip` components that double as filter toggles (click a chip to filter the table to that status).
- **Date range filter:** From/To date inputs scoping the table and KPIs.
- **CSV export** of filtered records.
- **12-hour AM/PM time picker** in the log form (`TimeInput12h`) — same pattern as `MessageTimeInput` (auto-advance, arrow keys, blur-padding).
- **Table layout:** 4 columns — Requester, Description, Requested (date), Status.
- **FK to-do redirect (§33.4):** rows auto-created by the FK workflow carry a `related_task_id` and render an **"Add FK ↗"** button (only when `related_task_id && !is_completed`). It jumps to All Tasks **focused on that one task** so the coordinator adds Full Knitting in one hop; the to-do then auto-completes (Pending → Done) when FK is saved.

## 29. Designer Concept Dashboard

The designer's Concept Dashboard (`ConceptDashboard` section in `AnalyticsView`) is a scalable summary — not a full concept list.

- **Target ring:** `<TargetRing>` SVG showing monthly concept progress (submitted vs target). Replaces the old `RadialBarChart`.
- **4 mini stats:** Total / Approved / Pending / Revision — compact `MetricCard`-style chips.
- **Active concepts:** max 4 rows with a pipeline stage indicator dot. Shows only the designer's in-flight concepts — not a full table.
- **Lifetime overview:** cumulative stats (total submitted, approval rate, avg turnaround).
- **Monthly trend chart:** recharts `BarChart`, period-aware (responds to the same period pills as the admin dashboard).
- **Recent activity feed:** last N timeline events across the designer's concepts.
- **Scales at any count** — the view never renders an unbounded list; all sections are capped or aggregated.

## 30. Task Split System — one task, multiple designers

A single task (e.g. 100 designs) can be worked on by several designers at once. The task stays **ONE `tasks` record**; each designer gets a *portion* via a row in the **`task_assignments`** table. **This is in active development — treat the files as the source of truth.**

### 30.1 Data model (migration `0060_task_assignments.sql`)
- **`task_assignments`** — one row per designer's portion: `task_id`, `designer_id`, `assigned_by`, `qty_assigned` (CHECK > 0), `qty_completed` (default 0), `planned_deadline`, `started_at`, `completed_at`, `delay_days`, `status`, `completion_fabric`, `completion_filled_at`, `notes`.
- **Per-portion status:** `assigned → in_progress → done → completed` (CHECK-constrained). *Caveat:* nothing currently transitions a portion to `in_progress` — rows are created `assigned` and go straight to `done` via Mark Done. The enum value exists but is unused.
- **`tasks` gains** `is_split BOOLEAN DEFAULT false` and `qty_remaining INTEGER` (qty not yet handed out; NULL when not split).
- **Unique index** `(task_id, designer_id)` — a designer can't be assigned twice to the same task.
- `task_assignments` is in the `supabase_realtime` publication for live updates.
- **`database.ts`:** `TaskAssignment` / `TaskAssignmentWithDesigner` types; `is_split` + `qty_remaining` on tasks Row/Insert/Update.

### 30.2 The recalc trigger is the source of truth (do NOT duplicate in the frontend)
`recalc_task_from_assignments()` fires `AFTER INSERT/UPDATE/DELETE` on `task_assignments` and rolls each portion up to the parent task:
- `tasks.qty_completed` = Σ portions' `qty_completed`
- `tasks.qty_remaining` = `GREATEST(task.qty − Σ qty_assigned, 0)`
- `tasks.is_split` = `COUNT(*) > 1`
- `tasks.status` = **completed** if ALL portions completed · **done** if ALL done/completed · **in_progress** if ANY in_progress · else unchanged

Never compute parent task status from assignments in React — the DB owns it. The frontend only reads the recalculated `tasks` row + the assignment rows.

### 30.3 RLS
read = any authed (`auth.uid() IS NOT NULL`); insert = `is_admin_or_coordinator()` **OR** `auth.uid() = designer_id` (self-claim); update = own portion or admin; delete = admin.

### 30.4 Hook — `useTaskAssignments(taskId)`
Returns `{ assignments, totalAssigned, totalCompleted, isLoading, error, splitTask, removeAssignment, updateAssignmentQty, claimPortion, markPortionDone, completePortionWithFabric, refetch }`. Cache key `queryKeys.taskAssignments.detail(taskId)`. All mutations return `{ error }` (string|null), never throw, and invalidate `taskAssignments` + `tasks.all`.
- **`splitTask(taskId, splits[])`** — admin: inserts N assignment rows, sets parent `is_split=true`, `status='in_progress'`, `qty_remaining`; notifies each designer.
- **`claimPortion(taskId, qty, deadline, fabric?)`** — designer: inserts *their own* assignment row (`status='assigned'`), sets parent `is_split=true`, `status='in_progress'`.
- **`updateAssignmentQty(id, qtyCompleted)`** — progress only, no status change.
- **`markPortionDone(id)`** — `→ done`, stamps `completed_at`, notifies admins/coordinators.
- **`completePortionWithFabric(id, fabric)`** — `done → completed`, stores `completion_fabric`.
- **`removeAssignment(id)`** — admin delete.

### 30.5 Two entry points
- **Admin pre-split:** `<SplitTaskDialog>` (`components/tasks/SplitTaskDialog.tsx`) — dynamic designer/qty/deadline rows + live "Assigned X / total" counter. Deadline input opens the native calendar on click (`showPicker()`). Validation is **UI-side** (`isValid`: ≥2 rows, each has designer + qty≥1, Σ ≤ total, no dupes).
- **Designer self-claim portion:** `<ClaimTaskModal>` shows a **"How many designs?"** input when `isPartiallyAssigned || task.qty > 1` (default = remaining). Claiming **less than full** → `claimPortion()`; claiming **full** → normal `claimPoolTask()` (no split). An "Available: X of Y" hint + "Already working (avatars)" list render for split/partially-assigned tasks.

### 30.6 Per-portion lifecycle UI — `<AssignmentsPanel>` (in `TaskDetailDrawer`)
Renders only when the task has assignments. Each row: designer avatar/name, `qty_completed/qty_assigned` + progress bar, status badge, deadline. On **their own** row a designer gets an **`InlineQtyStepper`** (click to edit progress → `updateAssignmentQty`), **Mark Done** (assigned/in_progress → `markPortionDone`), and **Complete** (done → fabric select → `completePortionWithFabric`). Admins get a per-row **remove (X)** with `ConfirmDialog`. Footer shows overall `totalCompleted/task.qty`.

### 30.7 Where splits surface elsewhere
- **Pool table** (`PoolQueueTable.tsx`): split rows show `remaining/total`; a "Fully Assigned" ghost row when `qty_remaining = 0`.
- **My Tasks** (`KanbanView`): fetches `task_assignments` where `designer_id = me` into `myAssignmentTaskIds` and merges those into the visible filter, so a designer's portion-tasks appear even though `tasks.assigned_to` isn't them.

### 30.8 Known gaps (as of this writing)
- **DB-level qty guard** — `enforce_assignment_constraints()` trigger (migration 0062, relaxed by 0068) now blocks over-assign (Σ`qty_assigned` ≤ `task.qty`). However, `qty_completed` may exceed `qty_assigned` (extra work OK).
- Per-portion **`in_progress`** transition is never set (see §30.1).
- **Notifications** cover split + mark-done only — not claim-joined / all-done / other §STEP-8 points.
- **Dashboard crediting** — the designer leaderboard does **not** yet credit a designer's `qty_completed` on split tasks (no `task_assignments` usage in `useTaskAnalytics`).
- The migration must be applied in Supabase or every split/claim-portion call errors with `relation "task_assignments" does not exist`.

## 31. FK Gate — Full Kitting Completion Blocking

Tasks that `requires_full_kitting = true` cannot be completed until the coordinator uploads FK details.

### 31.1 Helper functions (`lib/taskHelpers.ts`)
- **`isFullKittingAdded(task)`** — returns `true` when the task has a `full_kitting_image_url` OR a linked `full_kitting_details` record. Checks both the task's direct image field and the joined FK details.
- **`isFullKittingBlocking(task)`** — returns `true` when `requires_full_kitting && !isFullKittingAdded(task)`. This is the gate.
- **`wasCreatedByAdminOrCoordinator(task)`** — checks if the task was created by an admin/coordinator role (used to determine if FK flagging should happen on claim).

### 31.2 Where the gate is enforced
- **`markTaskDone(taskId)`** in `useTaskMutations` — before setting `status='done'`, calls `isFullKittingBlocking()`. If true, returns `{ error: "Full Kitting details must be added before marking done" }`. The task stays in_progress.
- **`completeTask(taskId, ...)`** — same check. Blocks `done → completed` if FK is missing.
- **TaskDetailDrawer** — shows a warning banner when the task is FK-blocked: "Full Kitting details needed before completion." The Mark Done / Complete buttons are visually disabled with a tooltip explaining the block.

### 31.3 Unblocking
The coordinator adds FK details via `KittingStageADialog` → upload image → the task's `full_kitting_image_url` or `full_kitting_details` row gets populated → `isFullKittingBlocking()` returns false → designer can now complete.

## 32. Sampling Automation — task completion → pending sample

When a designer completes a task and flags "Sampling Required", a pending sample is auto-created.

### 32.1 PostDoneModal changes
`PostDoneModal.tsx` now collects three fields:
- **Fabric** (required) — Combobox from `useFabrics()`
- **Design Type** (required) — Combobox from `useConceptCategories()`
- **Sampling Required** toggle — `<Switch>` component (`@/components/ui/Switch`). Defaults to OFF.

### 32.2 completeTask signature
`completeTask(taskId, { fabric, designType?, samplingRequired? })` in `useTaskMutations`:
1. FK gate check (`isFullKittingBlocking`)
2. Optimistic lock on `.eq('status','done')`
3. Stamps `completion_fabric`, `completion_filled_by`, `completion_filled_at`
4. If `samplingRequired === true` → calls `createPendingSample(taskId, fabric, designType)`
5. Sets `tasks.sampling_required`, `sampling_flagged_at`, `sampling_flagged_by` on the task

### 32.3 createPendingSample (`lib/createPendingSample.ts`)
`createPendingSample({ taskId, fabric, designType, createdBy, summary })`:
1. Resolves **party name + uid via two plain queries** (`tasks` then `clients`) — **NOT** a nested embed. The `samples→task→client` embed returns a null client, which is what made party names come through blank.
2. **LD briefs** (no `client_id`) resolve their party from the **default LD party in the `clients` table** (LD group — "LD Silk Mills") via `resolveDefaultLdParty()` (cached). This is **backend-driven — never hardcode the `"LD Silk Mills"` string**; renaming it in Settings → Party Name flows through. A null result here only means a Job Work brief that genuinely lost its client.
3. Dedup: skips if a sample already exists for `(task_id, fabric, design_type)` with `source='task_completion'`.
4. Inserts `source='task_completion'`, `sample_status='pending'`, `party_name`, `quality=fabric`, `design_type`. Unique index `uq_samples_task_completion` (0070) is the DB backstop.
5. **Errors are surfaced, not swallowed:** a real insert failure (anything but the 23505 dedup) toasts "Task saved, but adding it to Sampling failed: …" so a stale PostgREST schema cache / missing column / RLS denial is diagnosable. The caller's task completion still succeeds (best-effort).

> **Schema-cache gotcha:** migrations 0069/0070 add `samples.source` / `sample_status` / `design_type` but **do not** `NOTIFY pgrst, 'reload schema'`. If pending samples silently stop being created, reload the cache (`NOTIFY pgrst, 'reload schema';`) — the insert was failing on an unknown column.

### 32.4 Pending Samples UI (`PendingSamplesPanel.tsx`)
- Renders in the Sampling Hub as a dedicated tab
- Filters: `useSamples({ source: 'task_completion', sampleStatus: 'pending' })`
- Each row: party_name (resolved from task→client), fabric, design_type, linked task_code, date
- Actions: "Process" (opens SamplingFormDialog pre-filled → changes status to in_progress), "Delete"
- The main Samples tab uses `excludePendingTaskSamples: true` to hide these until processed

### 32.5 DB columns (migrations 0069–0070)
- `tasks`: `sampling_required` (BOOLEAN), `sampling_flagged_at`, `sampling_flagged_by`
- `samples`: `sample_status` ('pending'|'in_progress'|'completed'), `source` ('manual'|'task_completion'), `design_type`
- Unique index: `(task_id, COALESCE(quality,''), COALESCE(design_type,''))` — allows different fabric/design combinations per task

### 32.6 Flag-sampling-later + role-safe menu (KanbanView row ⋮)
A **completed** task can be flagged for sampling after the fact: row ⋮ → **"Mark Sampling Required"** → `flagSamplingRequired(taskId)` (idempotent `.eq('sampling_required', false)`) sets the flags **and** calls `createPendingSample`. Once flagged the item reads **"Sampling Flagged ✓"**:
- **Admin/coordinator** (`isAdmin = isAdminOrCoordinator(role)`) → clicking navigates to `/sampling`.
- **Designer** → it's a **non-clickable confirmation**. Designers can't open `/sampling` (admin/coord-only route), so navigating there rendered "Access restricted" — gate the navigate on `isAdmin` and render a static `<div>` otherwise.

## 33. FK Coordinator Workflow — auto-created to-dos

When a designer claims a task that needs FK but doesn't have it yet, a coordinator to-do is auto-created so the coordinator knows to add FK details.

### 33.1 Flagging (`lib/fkCoordinatorTask.ts`)
**`flagFkPendingToCoordinator(taskId, taskCode, designerName)`** fires **ONLY on a successful claim, never on intent.** It's called from the `onClaimed` callback of `<ClaimTaskModal>` (in **both** `KanbanView` and `TaskDetailDrawer`), gated on `isFullKittingBlocking(task)`:
- A designer who clicks **"Continue Without Full Knitting"** then **closes the form without claiming sends nothing**. (The old bug fired on that button click → the coordinator got a spurious, repeated to-do for a task nobody actually claimed.)
- The to-do reflects the designer who **actually** claimed — if designer A starts the flow but designer B commits the claim, the coordinator is told about **B**.
- Calls `create_fk_coordinator_task(p_task_id, p_task_code, p_designer_name)` (SECURITY DEFINER, 0071 → 0072 added `p_task_id`) → inserts a `coordinator_tasks` row with `related_task_id`. **Deduped: one open FK to-do per task.** Best-effort — never blocks the claim.

### 33.2 Auto-close (`lib/fkCoordinatorTask.ts`)
**`completeFkCoordinatorTask(taskId, taskCode)`** — called by `KittingStageADialog` after successful FK upload:
- Calls the `complete_fk_coordinator_task` RPC (SECURITY DEFINER, migration 0072)
- RPC finds the open coordinator_tasks row with `related_task_id = taskId` and marks it completed
- If no open to-do exists (e.g. FK was added before claim), the RPC is a no-op

### 33.3 DB schema
- `coordinator_tasks.related_task_id` (UUID FK tasks, ON DELETE SET NULL) — added in migration 0072
- `create_fk_coordinator_task(p_task_id, p_task_code, p_designer_name)` — SECURITY DEFINER RPC (0072 replaced the 2-arg 0071 version; dedup matches `related_task_id` OR the legacy description)
- `complete_fk_coordinator_task(p_task_id, p_task_code)` — SECURITY DEFINER RPC (closes every open FK to-do for the task)

### 33.4 Coordinator redirect → focus (the "Add FK ↗" button)
The coordinator never hunts for the task. In `CoordinatorTasksView`, an FK to-do row (`related_task_id && !is_completed`) shows an **"Add FK ↗"** button → `navigate('/dashboard?status=in_progress&focus=<related_task_id>')`.
- `KanbanView` reads `?focus=<id>` into `focusTaskId` and **hard-filters the visible table rows to that one task** — applied at the **render level** (`renderStageSection` + `visibleTasks`), NOT in `scoped`, so the pipeline stepper counts stay the **true pipeline totals** (not "1").
- A **focus banner** above the table shows "Focused on <task_code>" with an **Add Full Knitting** button (opens `KittingStageADialog` via `setFkDrawerTask`) when the task is still FK-blocking, plus a **Clear focus** button (drops the `focus` URL param).
- Legacy to-dos created before 0072 have `related_task_id = NULL` → no button; the `complete_fk_coordinator_task` description-fallback still closes them.

## 34. Pool Skip & FK Warning Chain

The claim flow for designers includes a multi-step warning chain before the claim modal opens.

### 34.1 Flow: `openClaimOrWarn(task)`
```
openClaimOrWarn(task)
  ↓
Is this the front-of-queue task? (first eligible pool task by FIFO order)
  ├─ YES → proceed to FK check
  └─ NO  → show PoolSkipDialog
           "This isn't the next task in line. Are you sure you want to skip?"
           ├─ Confirm → proceed to FK check
           └─ Cancel → abort
  ↓
Does task need FK but FK isn't added yet? (isFullKittingBlocking)
  ├─ NO  → open ClaimTaskModal
  └─ YES → show FK Warning Dialog
           "This task requires Full Kitting details that haven't been added yet.
            You can still claim it, but completion will be blocked until a
            coordinator adds the FK details."
           ├─ Proceed → open ClaimTaskModal (with yellow FK banner)
           └─ Cancel → abort
  ↓
ClaimTaskModal opens — shows full task details, planned deadline input,
optional fabric picker, optional designType, portion qty for split tasks.
FK warning banner (yellow) shown inside modal if applicable.
```

### 34.2 Entry points
The chain works from three places:
- **Pool table rows** — "Claim" button triggers `openClaimOrWarn(task)`
- **Task detail drawer** — "Accept Task" button in the action footer
- **Pool summary card** — the single-task claim button for designers

### 34.3 ClaimTaskModal FK banner
When the task needs FK but doesn't have it, `ClaimTaskModal` shows a yellow warning banner at the top: "This task requires Full Kitting — a coordinator will need to add it before you can complete." Non-blocking — the designer can still claim.

## 35. Return to Pool & Handoff

### 35.1 Return to Pool (3 modes)
Available via the ⋮ row menu on in_progress tasks. `returnToPool(taskId, mode, options?)` in `useTaskMutations`:

| Mode | What happens | When to use |
|------|-------------|------------|
| `reset` | Wipes everything — task goes back to pool as if never claimed. `qty_completed=0`, `assigned_to=null`, `status='pool'`, clears `started_at`, `planned_deadline`, `fabric`. | Designer hasn't started any work |
| `split-pool` | Preserves current designer's work (creates/keeps their assignment). Remaining qty goes back to pool — parent task gets `is_split=true`, `qty_remaining` updated. | Designer did partial work, rest should be first-come |
| `split-assign` | Same as split-pool but the remaining qty is assigned to a specific other designer (creates their assignment row). | Admin knows who should pick up the rest |

### 35.2 Handoff
`handoffTask(taskId, toDesignerId, carryForward)` in `useTaskMutations`:
- Transfers the task to another designer preserving `qty_completed` progress
- Updates `assigned_to`, resets `started_at` to now, new `planned_deadline` (new designer chooses)
- `carryForward` includes fields to preserve from the outgoing designer's work
- Notifies both the outgoing and incoming designers via `sendNotification`

## 36. Switch Component

`@/components/ui/Switch.tsx` — a new toggle component for boolean inputs. Exported from the UI barrel file. Used in PostDoneModal for the "Sampling Required" toggle. Styled with semantic tokens (primary color when on, muted when off). Accessible: proper `role="switch"` + `aria-checked`.
