# LinkD FMS — Design Flow System

Textile design workflow + file management for **LinkD Prints**. Three independent systems in one app:

- **System 1 — Task Management (Design Flow).** Coordinators write design briefs; tasks flow `pool → todo → in_progress → full_kitting → done`. Designers claim or are assigned tasks. Full kitting form (file upload + structured data) available at the full_kitting stage. Task Dashboard shows per-designer performance scoring.
- **System 2 — Concept Approval.** Designers submit concepts (min 50-char description + file). Admin (MD) reviews. Monthly target: 3 per designer. Concept Dashboard shows approval rates, turnaround speed, designer leaderboard.
- **System 3 — Sampling.** Coordinators log daily sampling records (party, fabric, qty, files). Sampling Hub with stats, filters, charts, batch entry.

**Roles (3):** `admin`, `design_coordinator`, `designer`.

- **`admin`** — top tier. Exclusive rights: concept approval (review / reject / revision) and changing other users' roles.
- **`design_coordinator`** — inherits *most* admin powers (briefs, sampling, task management, client CRUD, analytics, team viewing) but is **explicitly excluded** from concept approval and role management.
- **`designer`** — submits concepts, claims tasks from the open pool, works on assigned tasks.

History: original 4 roles (`super_admin`, `admin`, `designer`, `production`) were consolidated to 2 in [`0006_simplify_roles.sql`](supabase/migrations/0006_simplify_roles.sql); `design_coordinator` was added in [`0008_design_coordinator_role.sql`](supabase/migrations/0008_design_coordinator_role.sql) + [`0009_design_coordinator_policies.sql`](supabase/migrations/0009_design_coordinator_policies.sql).

---

## Two scaffolds in this repo

This directory has **two** project scaffolds. The Vite one is active; the Next.js one is legacy and should be deleted once we commit to Vite.

| Where | What | Status |
|---|---|---|
| `./linkd-fms/` | **Vite + React + TS + Tailwind SPA** | Active |
| `./` (root: `src/app/`, `next.config.js`, etc.) | Next.js 14 App Router | Legacy — no longer being worked on |

**All new work happens in `./linkd-fms/`.** When in doubt, paths in this document refer to `linkd-fms/` unless stated otherwise.

---

## Tech stack (active project)

- **Vite 5** + **React 18** + **TypeScript** (strict)
- **Tailwind CSS** with **dual-theme** (light + dark) via CSS custom properties + class-based toggle
- Font: **Inter everywhere** (body + headings + wordmark). Loaded from Google Fonts (weights 400/500/600/700); system-ui as fallback.
- **React Router v6** for routing
- **@supabase/supabase-js 2.45.4** (pinned — 2.105.x has a request-hang bug in this combo)
- **lucide-react** for icons, **date-fns** for relative timestamps, **recharts** for charts (RadialBarChart in ConceptDashboard)
- **shadcn-style** UI primitives at `linkd-fms/src/components/ui/` (no shadcn CLI — components were hand-written)

Backend: **Supabase** (project ref `jyfwyfpwbbgfpsntubfy`, region unknown — direct DB hostname is IPv6-only, use the connection pooler for non-IPv6 environments).

---

## Working directories & commands

Two cwds depending on what you're doing:

```powershell
# Active app — most work happens here
cd "C:\Users\Admin\Desktop\Design Flow\linkd-fms"
npm run dev         # → http://localhost:5173
npm run build       # type-check + vite build
npm run type-check  # tsc --noEmit

# Project root — for Supabase migrations + scripts
cd "C:\Users\Admin\Desktop\Design Flow"
node scripts/apply-migrations.mjs <files>  # requires DB_HOST + DB_PASSWORD env
node scripts/seed-user.mjs                  # seeds Harshali (admin); reads .env.local
node scripts/seed-data.mjs                  # seeds 4 clients + 8 sample tasks (idempotent)
node scripts/seed-clients.mjs               # bulk-seeds clients from clients.csv
node scripts/seed-fabrics.mjs               # bulk-seeds fabrics from fabrics.csv
node scripts/seed-concept-categories.mjs    # bulk-seeds concept categories from concepts.csv
```

---

## Folder structure (linkd-fms)

```
linkd-fms/
├── index.html                             Vite entry, loads Inter from Google Fonts + FOUC prevention script
├── tailwind.config.ts                     Dual-theme palette via CSS variables + font extensions
├── .env.local                             VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (gitignored)
├── .env.example                           Template
└── src/
    ├── main.tsx                           ReactDOM.render → <ThemeProvider><AuthProvider><App/>
    ├── App.tsx                            Router setup + role-gated routes (incl. /home + /dashboard) + 404
    ├── index.css                          Tailwind + CSS custom properties (light/dark) + scrollbar + keyframes
    ├── lib/
    │   ├── supabase.ts                    Typed createClient<Database>(...)
    │   ├── routes.ts                      ROUTES constants + roleHomePath()
    │   ├── constants.ts                   Labels + colors for statuses, priorities, roles, concept statuses;
    │   │                                  COLUMN_BG / COLUMN_DOT / COLUMN_ACCENT for kanban columns;
    │   │                                  Month codes (A–L); ASSIGNED_BY_OPTIONS
    │   ├── days.ts                        daysUntil / daysSeverity / daysLabel / shouldPulse
    │   │                                  + DAYS_DOT_CLASS / DAYS_TEXT_CLASS / DAYS_SEVERITY_CLASS
    │   ├── permissions.ts                 isAdmin, isAdminOrCoordinator, canReviewConcepts, …
    │   │                                  — centralized capability checks; use instead of role-equals
    │   ├── notifications.ts               sendNotification, sendNotificationToMany, sendNotificationToRole
    │   │                                  — reusable helpers for inserting notifications via Supabase client
    │   └── utils.ts                       cn(), formatDate()
    ├── types/
    │   └── database.ts                    Full Database type (12 tables) + aliases + joined shapes
    ├── hooks/
    │   ├── useAuth.tsx                    AuthProvider + useAuth() — single source for auth state
    │   ├── useTheme.tsx                   ThemeProvider + useTheme() — light/dark/system toggle, localStorage
    │   ├── useTasks.ts                    Tasks list w/ joins + filters (status, mine, urgent, search, ...)
    │   ├── useTaskMutations.ts            createTask (DF code gen), updateTaskStatus, updateQtyCompleted,
    │   │                                  assignTask (code regen), selfAssignTask, markTaskDone (delay_days),
    │   │                                  updateTask (general field edit), deleteTask — { data, error }, never throws
    │   ├── useTaskDetail.ts               One task + its files + activity log, fetched together
    │   ├── useConcepts.ts                 Concepts list + submitConcept / reviewConcept / finalizeConcept
    │   ├── useClients.ts                  All clients, ordered by party_name
    │   ├── useProfiles.ts                 All profiles, optionally filtered by role
    │   ├── useDesignerCodes.ts            All designer_codes + profile join, with Map<profile_id, codes[]>
    │   ├── useFabrics.ts                  Fabric lookup taxonomy (active-only by default)
    │   ├── useConceptCategories.ts        Concept category taxonomy (active-only by default)
    │   ├── useNotifications.ts            Notifications with Realtime subscription, markAsRead, markAllAsRead
    │   ├── useFullKitting.ts              Structured kitting form: getKittingForTask, submitKitting
    │   ├── useSamples.ts                  Sample records full CRUD with filters (dateRange,
    │   │                                  customerName, status); createSample, updateSample, deleteSample
    │   ├── useAnalytics.ts                Concept Dashboard metrics: KPIs, status distribution, monthly volume
    │   │                                  (period-adaptive: days/weeks/months), designer concept stats + scoring,
    │   │                                  approval speed. Period filter: week | month | quarter.
    │   ├── useTaskAnalytics.ts            Task Dashboard metrics: completion KPIs, pipeline snapshot,
    │   │                                  volume (period-adaptive), designer task stats + scoring.
    │   │                                  Separate from useAnalytics — concepts and tasks are independent.
    │   └── useKeyboardShortcuts.ts        Generic global keydown registrar. Takes a list of
    │                                      { key, handler, description, category } shortcuts +
    │                                      enabled flag. Auto-skips when an input/textarea/select is
    │                                      focused, when any Radix dialog/sheet is open
    │                                      ([role='dialog']), or when ctrl/meta/alt modifiers are held.
    ├── components/
    │   ├── ui/                            ⬇ ALL UI primitives — barrel-exported via ./index.ts
    │   │   ├── index.ts                   Single import point: `from "@/components/ui"`
    │   │   ├── AppShellSkeleton.tsx       Full-app loading state (mimics real shell)
    │   │   ├── avatar.tsx                 Radix avatar + getInitials() helper
    │   │   ├── badge.tsx                  Variant pill (default/secondary/accent/outline)
    │   │   ├── button.tsx                 Primary buttons (variants + sizes)
    │   │   ├── card.tsx                   Card + Header/Title/Description/Content/Footer
    │   │   ├── ConceptImage.tsx           Signed-URL loader for sample-files + design-files buckets
    │   │   │                              (tries sample-files first, then design-files fallback);
    │   │   │                              showDownload prop for download overlay; non-image file support
    │   │   ├── ConfirmDialog.tsx          Modal confirm w/ default/danger/warning variants + focus trap
    │   │   ├── ConnectionDot.tsx          Realtime status pip (green/yellow/red, 30s grace)
    │   │   ├── DeadlineCell.tsx           Date + severity dot + relative "N days left" label
    │   │   ├── dialog.tsx                 Radix centered modal primitive
    │   │   ├── EmptyState.tsx             Centered "nothing here" panel w/ optional icon + CTA
    │   │   ├── FloatingInput.tsx          Material-style floating-label input (unused now)
    │   │   ├── input.tsx                  Plain styled input
    │   │   ├── label.tsx                  Radix label
    │   │   ├── LoadingButton.tsx          Button + inline spinner + auto-disable
    │   │   ├── LoadingScreen.tsx          Simple centered spinner (rarely used now; AppShellSkeleton preferred)
    │   │   ├── SearchInput.tsx            Debounced search input w/ clear × + focus ring.
    │   │   │                              Exports as `forwardRef<HTMLInputElement>` so consumers
    │   │   │                              (e.g. KanbanView) can focus it programmatically.
    │   │   ├── KeyboardShortcutsDialog.tsx  Radix Dialog showing shortcuts grouped by category.
    │   │   │                              Renders each shortcut as a `<kbd>` badge + description.
    │   │   │                              Used by KanbanView (`?` key or keyboard icon button)
    │   │   │                              with the shortcut list from `useKeyboardShortcuts`.
    │   │   ├── sheet.tsx                  Radix right-side drawer primitive
    │   │   ├── Skeleton.tsx              Skeleton + SkeletonCard/SkeletonTable/SkeletonText
    │   │   ├── TextilePattern.tsx         Decorative herringbone SVG for LoginView left panel
    │   │   ├── ThemeToggle.tsx            Light/Dark/System cycle button (Sun/Moon/Monitor icons)
    │   │   ├── NotificationBell.tsx       Bell icon + dropdown (15 recent, unread badge, mark-all-read)
    │   │   └── Toaster.tsx                Custom toast system: <Toaster/> + `toast.*` + useToast()
    │   ├── layout/
    │   │   ├── AppLayout.tsx              Shell — Sidebar + TopNav + main; fade-in on route change
    │   │   ├── Sidebar.tsx                Dark sidebar w/ Dashboard first, section labels ("Manage"),
    │   │   │                              ThemeToggle, user dropdown; role-filtered nav
    │   │   ├── TopNav.tsx                 Glassmorphism top bar — page title, ConnectionDot, user avatar
    │   │   ├── ProtectedRoute.tsx         Auth + onboarding + role gates; inline access-restricted
    │   │   └── RootRedirect.tsx           Auth-aware "/" redirect to roleHomePath / login / onboarding
    │   ├── tasks/
    │   │   ├── TaskDetailDrawer.tsx       Slide-in right panel — 8 sections incl. file upload,
    │   │   │                              qty tracker, activity log, role-aware action footer;
    │   │   │                              INLINE EDIT MODE (toggled via Edit button in header):
    │   │   │                              qty, mtr, deadline, priority, assignee, whatsapp, description,
    │   │   │                              notes — with Save/Cancel + change logging to task_logs;
    │   │   │                              Delete button (admin only) with ConfirmDialog
    │   │   ├── FullKittingModal.tsx       2-step dialog: Step 1 = "Full Kitting Required?" (Yes/No);
    │   │   │                              Step 2 = kitting form; confetti on completion
    │   │   ├── FullKittingDrawer.tsx      Mobile-friendly Sheet form: task context (UID/Designer/Concept/
    │   │   │                              Description) read-only + 100MB file upload + structured kitting
    │   │   │                              fields. Opens from "Full Kitting" action button on task rows.
    │   │   │                              Full-width on mobile, 440px on desktop.
    │   │   └── EditTaskDialog.tsx         Standalone edit dialog (used by KanbanView row ⋮ menu)
    │   ├── sampling/
    │   │   ├── SamplingFormDialog.tsx     Legacy sampling form (used in older flow)
    │   │   └── SamplingFormDrawer.tsx     Sheet-based add/edit form with Quick Add / Full Form toggle,
    │   │                                  batch entry (party_name persists), file uploads (5x100MB)
    │   ├── analytics/                    Charts + cards for dashboards
    │   │   ├── KpiCard.tsx                Metric card: icon + value + label + trend pill (↑↓ %)
    │   │   ├── VolumeChart.tsx            recharts BarChart: period-adaptive (days/weeks/months)
    │   │   ├── PipelineHealth.tsx         Horizontal bar chart: status/concept distribution
    │   │   ├── DesignerLeaderboard.tsx    Sortable table with rank, avatar, animated score bars
    │   │   ├── ConceptTurnaround.tsx      recharts AreaChart: approval speed with colored zones
    │   │   ├── ConceptFunnel.tsx          5-stage horizontal funnel: Submitted → Under Review → Decision
    │   │   │                              → Finalization → Complete; decision split + stale-review warning
    │   │   ├── MdReviewPanel.tsx          MD review speed circle + grid of approved/rejected/revision/
    │   │   │                              pending counts + reviews-per-week velocity
    │   │   ├── DesignerConceptMatrix.tsx  Per-designer concept-decision breakdown (admin/coordinator hero,
    │   │   │                              left pane). Self-contained — has its OWN W/M/Q/Y filter
    │   │   │                              independent of the dashboard top filter. Each row: avatar +
    │   │   │                              name + code · stacked bar (approved/revision/rejected/pending) ·
    │   │   │                              count chips · approval rate %. Team totals strip above the
    │   │   │                              rows, champion call-out, sortable columns (submitted / approved /
    │   │   │                              rejected / rate). Uses useConcepts + useProfiles +
    │   │   │                              useDesignerCodes directly so it stays decoupled from
    │   │   │                              useAnalytics' shared Period type.
    │   │   ├── TeamTargetHero.tsx         Monthly target hero (admin/coordinator): 120px SVG radial
    │   │   │                              of "% designers on target", headline numbers, champion badge,
    │   │   │                              inline stat strip (days left · on pace · not started · % through),
    │   │   │                              wrapping designer pip dock with per-designer progress rings.
    │   │   │                              Sits in narrow xl:col-span-2 of the hero grid.
    │   │   ├── TaskHealthHero.tsx         Task dashboard hero: single horizontal strip with dividers —
    │   │   │                              throughput + on-time radial | auto-generated headline insight
    │   │   │                              | active/urgent/overdue dock. Insight branches handle sparse
    │   │   │                              data ("First completions landed", "Pipeline running", "Quiet
    │   │   │                              period") and the 999 "no-previous-data" trend sentinel renders
    │   │   │                              as a "new activity" pill instead of "999%".
    │   │   ├── WorkloadDistribution.tsx   Stacked horizontal bars per designer (completed / in-progress
    │   │   │                              / remaining), sorted by total assigned. Auto-tags rows
    │   │   │                              "Overloaded" or "Light" vs the team average. `onDesignerClick`
    │   │   │                              prop wires the avatar/name to open the scorecard drawer.
    │   │   ├── AtRiskTasks.tsx            Tabbed Needs-Attention panel: Overdue vs Urgent lists, each
    │   │   │                              capped at 8 rows, with assignee avatar, days-late/age badge,
    │   │   │                              and deep-link to /dashboard.
    │   │   └── DesignerScorecardDrawer.tsx  Admin-only Sheet (560-600px) — quick-peek scorecard called
    │   │                                  from DesignerConceptMatrix / DesignerLeaderboard /
    │   │                                  WorkloadDistribution / TaskLeaderboard. Shows header +
    │   │                                  verdict pill + 4 KPI boxes + W/M/Q/Y period toggle +
    │   │                                  concept donut + task pipeline + 6-month area chart +
    │   │                                  recent activity + insights + admin actions (feedback,
    │   │                                  export, open team). Has prominent "Open full scorecard
    │   │                                  analysis" link that navigates to /scorecards/:id.
    │   └── concepts/
    │       ├── SubmitConceptDialog.tsx    Form + 100MB file upload to sample-files + min 50-char description
    │       ├── ConceptDetailDrawer.tsx    Review panel w/ admin approve/reject/revision + finalize
    │       └── ConceptDashboard.tsx       Role-specific dashboard sections above concepts table:
    │                                      DesignerConceptDashboard (monthly target tracker w/ RadialBarChart),
    │                                      CoordinatorConceptDashboard (team overview),
    │                                      AdminConceptDashboard (pending-review queue)
    └── views/
        ├── LoginView.tsx                  Split-screen login — labels above, eye toggle, success flash (FUNCTIONAL)
        ├── OnboardingView.tsx             Fallback when user has no profile row
        ├── AccessRestrictedView.tsx       Inline "you can't see this page" panel (renders inside AppLayout)
        ├── NotFoundView.tsx               404 page rendered inside AppLayout for authed users
        ├── DashboardView.tsx              /home — KPI cards, alert banners, recent activity,
        │                                  quick actions, pipeline visualization (FUNCTIONAL)
        ├── KanbanView.tsx                 /dashboard — tabbed status sections with wide tables,
        │                                  search dimming, sort per section, hover CTAs (FUNCTIONAL)
        ├── BriefingView.tsx               /brief/new — full task creation w/ DRAFT badge, full-kitting
        │                                  upload section, DB-backed pickers, success screen (FUNCTIONAL)
        ├── ConceptsView.tsx               /concepts — clean card-list layout, role-specific dashboards
        │                                  (Designer: radial progress ring + monthly warnings;
        │                                  Coordinator: designer progress table + at-risk alerts;
        │                                  Admin: KPI cards), status filter chips, submit + admin review (FUNCTIONAL)
        ├── TeamView.tsx                   /team — team roster table (FUNCTIONAL, read-only)
        ├── ProductionView.tsx             /sampling — "Sampling Hub": stats cards (today/month/customers/pending),
        │                                  customer search + status filters, samples table (full CRUD via
        │                                  SamplingFormDrawer), tasks-in-sampling-stage table with Mark Done,
        │                                  bar chart (samples per day, recharts); ⋮ row actions (edit/delete)
        │                                  (FUNCTIONAL)
        ├── NotificationsView.tsx          /notifications — full notification feed with type filters,
        │                                  date grouping (today/yesterday/week/older), pagination,
        │                                  mark-as-read, mark-all-read (FUNCTIONAL)
        ├── AnalyticsView.tsx              /analytics — Concept Dashboard. Section order (admin/coordinator):
        │                                  KPI cards → status badges → hero row (DesignerConceptMatrix +
        │                                  TeamTargetHero) → VolumeChart + PipelineHealth → ConceptFunnel
        │                                  → MdReviewPanel (admin only) → DesignerLeaderboard →
        │                                  ConceptTurnaround. Designer view: PersonalTargetRing (radial
        │                                  with milestone ticks at 1/2/3) + score card + personal KPIs.
        │                                  (FUNCTIONAL)
        ├── TaskDashboardView.tsx          /task-dashboard — Task Dashboard. Section order (admin/coordinator):
        │                                  TaskHealthHero (insight banner) → KPI cards → status badges →
        │                                  Volume bars + Pipeline bars → WorkloadDistribution + AtRiskTasks
        │                                  → TaskLeaderboard. Designer view: 4 personal KPIs + big score
        │                                  card. (FUNCTIONAL)
        ├── ScorecardsView.tsx             /scorecards — Admin-only grid of all designers as scorecard
        │                                  cards. 4-stat banner (designers / avg composite / on track /
        │                                  needs support) + top-performer call-out + search + designer
        │                                  cards (composite score, verdict pill, concept/task mini blocks,
        │                                  insights count). Clicking a card navigates to the full-page
        │                                  scorecard at /scorecards/:designerId. (FUNCTIONAL)
        ├── ScorecardDetailView.tsx        /scorecards/:designerId — Full-page deep-dive scorecard
        │                                  inspired by HR reliability dashboards. Sections (top→bottom):
        │                                  (1) Hero with Reliability gauge (composite + on-time/throughput/
        │                                  consistency bars + STRONG/SOLID/DEVELOPING/NEEDS SUPPORT tier);
        │                                  (2) 5 KPI tiles (Scheduled · Completed · On-Time % · Avg Delay
        │                                  · Best Streak); (3) Concept Performance + Task Performance
        │                                  pair (donut + score bars + section pill); (4) 6-Month Momentum
        │                                  area chart; (5) Compact calendar heatmap (36×36 cells, Mon-first,
        │                                  click any cell to drill in) + Composition donut (fills card
        │                                  with stacked bar + summary verdict) + Weekly Throughput
        │                                  sparkline; (6) Trend (6mo on-time %) + Weekday pattern +
        │                                  Cycle Time histogram; (7) Priority breakdown donut + Vs Team
        │                                  comparison bars + Concept Pipeline funnel; (8) Activity
        │                                  timeline + Insights. Date-range filter (7d/30d/90d/6mo/12mo/
        │                                  custom from→to) drives every KPI + chart. Selected day opens
        │                                  drill-in panel listing all events. Admin gets Export CSV +
        │                                  Send Feedback + Open Team actions; designer self-view hides
        │                                  rank pill and admin actions. (FUNCTIONAL)
        ├── SalvedgeView.tsx               /salvedge — Salvedge / challan-based fabric distribution
        │                                  records. All roles; designers see their own. (FUNCTIONAL)
        └── SystemView.tsx                 /system — Admin data management: row counts per table, expandable
                                           data browser (search + per-row delete + pagination), bulk clear
                                           per table with FK-safe ordering, "Clear All" with ConfirmDialog.
                                           Admin-only. (FUNCTIONAL)
```

---

## Routes & role mapping

Canonical routes are constants in [`linkd-fms/src/lib/routes.ts`](linkd-fms/src/lib/routes.ts). After sign-in, [`roleHomePath()`](linkd-fms/src/lib/routes.ts) sends users to `/task-dashboard` regardless of role. The old `/home` route redirects to `/dashboard`.

| Path | View | Admin | Design Coordinator | Designer |
|---|---|---|---|---|
| `/login` | LoginView (enhanced split-screen) | public | same | same |
| `/onboarding` | OnboardingView | authed, no profile | same | same |
| `/` | RootRedirect | — | — | — |
| `/home` | redirect → /dashboard | — | — | — |
| `/task-dashboard` | TaskDashboardView (landing page) | yes | yes | yes |
| `/dashboard` | KanbanView | All Tasks | All Tasks | My Board |
| `/dashboard/tasks` | KanbanView | alias | same | same |
| `/brief/new` | BriefingView | yes | yes | AccessRestricted |
| `/concepts` | ConceptsView (22-col workflow) | yes | yes | yes |
| `/analytics` | AnalyticsView (Concept Dashboard) | yes | yes | yes (personal) |
| `/sampling` | ProductionView (Sampling Hub) | yes | yes | AccessRestricted |
| `/salvedge` | SalvedgeView | yes | yes | yes |
| `/team` | TeamView (role mgmt + codes) | yes | yes | AccessRestricted |
| `/scorecards` | ScorecardsView (admin grid) | yes | inline restriction | inline restriction |
| `/scorecards/:id` | ScorecardDetailView (full-page) | yes (any designer) | inline restriction | self only (gated in view) |
| `/profile` | ProfileView (avatar + password) | yes | yes | yes |
| `/system` | SystemView (CRUD + data mgmt) | yes | yes | AccessRestricted |
| `/notifications` | NotificationsView (realtime) | yes | yes | yes |
| `*` | NotFoundView (inside AppLayout) | authed | authed | authed |

**Coordinator now has admin-equivalent access** — `isAdmin()` returns true for both admin and design_coordinator. All permissions are equal except UI labeling.

Legacy aliases: `/kanban → /dashboard`, `/briefing → /brief/new`, `/production → /sampling`.

**Wrong-role behavior:** the **URL stays put**; ProtectedRoute renders `AccessRestrictedView` inside the normal AppLayout.

**Per-role sidebar contents** (defined in `Sidebar.tsx`'s `getNavGroups(role)`):

- **admin** → Task Dashboard, All Tasks, Concepts, Concept Dashboard | **Manage**: Sampling, Salvedge, Files, Team, **Scorecards**, System
- **design_coordinator** → Task Dashboard, All Tasks, Concepts, Concept Dashboard | **Manage**: Sampling, Salvedge, Files, Team, System *(no Scorecards — admin-only feature)*
- **designer** → Task Dashboard, My Board, Salvedge, Concepts, Concept Dashboard

A "Notifications" row (with unread badge) is appended below the main nav for every role. A **ThemeToggle** (light/dark/system cycle) appears above the user profile block in the sidebar. **Sign Out** button is in both the TopNav (top-right) and the Sidebar user dropdown. **Profile** link is in the user dropdown.

A "Notifications" row (with unread badge) is appended below the main nav for every role — links to `/notifications`. A **ThemeToggle** (light/dark/system cycle) appears above the user profile block in the sidebar.

---

## App shell architecture

```
<ThemeProvider defaultTheme="light">       <- main.tsx
  <AuthProvider>
    <App>
      <BrowserRouter>
        <Toaster />                          <- custom toaster (mounted once)
        <Routes>
          <Route path="/login" .../>         <- public; LoginView
          <Route path="/onboarding" .../>    <- public-ish
          <Route path="/" element={<RootRedirect/>} />
          <Route element={<ProtectedRoute />}>  <- auth + onboarding + role gates
            ↓ renders one of:
              <AppShellSkeleton/>            (while auth resolves)
              <Navigate to="/login" />       (not authed)
              <AppLayout>                    <- the shell
                <Sidebar /> + <TopNav /> + <main key={pathname} animate-fade-in>
                  <AccessRestrictedView/>    (role mismatch — URL preserved)
                    OR
                  {Outlet | children}        (allowed)
                </main>
              </AppLayout>
          </Route>
          <Route path="*" element={<ProtectedRoute><NotFoundView/></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </App>
  </AuthProvider>
</ThemeProvider>
```

**Sidebar** ([`Sidebar.tsx`](linkd-fms/src/components/layout/Sidebar.tsx)):
- 220px wide, fixed left, dark sidebar background (`rgb(var(--sidebar))`), full height.
- Brand block (logo image on white card + "Design Flow System" label) — click navigates to `roleHomePath(role)` (= `/task-dashboard`).
- **Dashboard (Home icon) is the first nav item** for all roles, above All Tasks / My Board.
- Nav groups have optional section labels (e.g. "Manage" for the admin/coordinator second group) rendered as `10px` uppercase headers.
- Active link styled `bg-primary text-white shadow-sm shadow-primary/20`; hover is `bg-white/[0.07]`. Links use `rounded-lg`, `13px` font size.
- **ThemeToggle** renders above the user profile block (not inside the dropdown). Cycles light → dark → system.
- Avatar color in the user block varies by role: `admin = primary`, `designer = muted`.
- User block at the bottom is a Radix `DropdownMenu.Trigger`. "Sign Out" opens `ConfirmDialog`.
- On `<md`: hidden by default, slides in as overlay with backdrop.

**TopNav** ([`TopNav.tsx`](linkd-fms/src/components/layout/TopNav.tsx)):
- Fixed top, height 14 (56px). Glassmorphism: `bg-background/80 backdrop-blur-xl`, subtle border.
- Page title computed from pathname + role via `getPageTitle()`. Recognizes `/home` as "Dashboard". Breadcrumb for sub-pages.
- Right side: `<ConnectionDot>` + `<NotificationBell>` (bell icon with unread badge + dropdown) + first name + avatar with `ring-2 ring-border`.
- Recognizes `/notifications` route as "Notifications" title.
- Search bar was removed from TopNav (was decorative); search is page-local in KanbanView.

**AppLayout** ([`AppLayout.tsx`](linkd-fms/src/components/layout/AppLayout.tsx)):
- Owns mobile sidebar state. Calls `useNotifications()` and passes `unreadCount` to Sidebar as `notificationCount` prop.
- Content area is `md:pl-[220px]`; `<main>` has `pt-20` to clear the fixed TopNav.
- **`<main>` is keyed by `useLocation().pathname` + has `animate-fade-in`** — every route change re-mounts main and the new view fades in over 200 ms.

**ProtectedRoute** ([`ProtectedRoute.tsx`](linkd-fms/src/components/layout/ProtectedRoute.tsx)):
- 5-step guard: `isLoading → AppShellSkeleton`, `!authed → /login`, `needsOnboarding → /onboarding`, role mismatch → AppLayout + `AccessRestrictedView`, allowed → AppLayout + children.

---

## Theme system

The app supports **light, dark, and system** themes via [`useTheme.tsx`](linkd-fms/src/hooks/useTheme.tsx).

**Architecture:**
- `ThemeProvider` wraps the entire app in `main.tsx` (defaultTheme = `"light"`).
- `useTheme()` returns `{ theme, resolvedTheme, setTheme }`.
- Theme stored in `localStorage` under key `linkd-fms-theme`.
- On mount, applies `light` or `dark` class to `<html>`.
- When `theme === "system"`, monitors `window.matchMedia("(prefers-color-scheme: dark)")` for OS changes.
- **FOUC prevention**: [`index.html`](linkd-fms/index.html) has an inline `<script>` that reads localStorage and applies the `dark` class before React hydrates.

**CSS custom properties** in [`index.css`](linkd-fms/src/index.css):
- All color tokens are defined as space-separated RGB channels (e.g. `--primary: 37 99 235`) so Tailwind's `<alpha-value>` opacity interpolation works: `bg-primary/50` → `rgb(37 99 235 / 0.5)`.
- `:root` defines light mode values; `.dark` overrides for dark mode.
- Tailwind config references these via `rgb(var(--token) / <alpha-value>)`.

**ThemeToggle** ([`ThemeToggle.tsx`](linkd-fms/src/components/ui/ThemeToggle.tsx)):
- Cycles: light (Sun icon) → dark (Moon icon) → system (Monitor icon).
- Rendered in the Sidebar user dropdown area.
- Exported from the barrel: `import { ThemeToggle } from "@/components/ui"`.

---

## Auth model — `useAuth()`

Single context at [`linkd-fms/src/hooks/useAuth.tsx`](linkd-fms/src/hooks/useAuth.tsx) wraps `<App />` in `main.tsx`. Returns:

```ts
{
  user, session, profile, role,    // role: "admin" | "design_coordinator" | "designer" | null
  isLoading,           // true until profile is loaded AFTER session resolves
  isAuthenticated,     // !!user
  needsOnboarding,     // user exists, profile lookup returned null
  signIn(email, password),
  signOut(),
  refreshProfile(),
}
```

Handles `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`. Uses a module-level generation counter so React 18 StrictMode double-mounts don't race. `fetchProfile` has a 10s watchdog that surfaces hangs as errors instead of wedging the UI.

**Important fix to know about**: `isLoading` is computed as `rawIsLoading || (isAuthenticated && !profileChecked)` so consumers never see the intermediate "authed but profile not yet loaded" state. Without this, `ProtectedRoute` rendered nothing for a beat after sign-in.

---

## Dual-theme color system

The app uses CSS custom properties for all colors, with light and dark variants defined in [`index.css`](linkd-fms/src/index.css). The Tailwind config ([`tailwind.config.ts`](linkd-fms/tailwind.config.ts)) references these variables via `rgb(var(--token) / <alpha-value>)`.

**Light mode** (`:root`):

| Token | Value | Role |
|---|---|---|
| `background` | `#F8FAFC` (slate-50) | Page background |
| `foreground` | `#0F172A` (slate-900) | Primary text |
| `card` | `#FFFFFF` | Card/surface background |
| `primary` / `accent` / `ring` | `#2563EB` (blue-600) | CTAs, links, focus rings |
| `secondary` | `#F1F5F9` (slate-100) | Secondary surfaces |
| `muted` | `#94A3B8` (slate-400) | Disabled text |
| `muted-foreground` | `#64748B` (slate-500) | Secondary text |
| `destructive` / `coral` | `#EF4444` (red-500) | Errors, urgent |
| `border` / `input` | `#E2E8F0` (slate-200) | Border lines |
| `success` | `#22C55E` (green-500) | Done, approve |
| `warning` | `#F59E0B` (amber-500) | Caution, sampling |
| `sidebar` | `#1E293B` (slate-800) | Sidebar stays dark even in light mode |
| `ink` | `#0F172A` | Legacy — maps to foreground |
| `cream` | `#FFFFFF` | Legacy — maps to card |
| `gold` | `#2563EB` | Legacy — maps to primary |

**Dark mode** (`.dark`):

| Token | Value | Role |
|---|---|---|
| `background` / `dashboard` | `#1A1B25` | Page background |
| `foreground` | `#FFFFFF` | Primary text |
| `card` / `secondary` / `popover` / `cream` | `#22232F` | Card surfaces |
| `primary` / `accent` / `ring` / `gold` | `#4F6EF7` | Blue accent |
| `muted` / `muted-foreground` | `#8B8FA8` | Secondary text |
| `destructive` / `coral` | `#F26C6C` | Errors, urgent |
| `border` / `input` | `#2E2F3E` | Border lines |
| `success` | `#3CC97A` | Done, approve |
| `warning` | `#F5A623` | Caution, sampling |
| `sidebar` | `#12131A` | Sidebar background |
| `ink` | `#FFFFFF` | Legacy — maps to foreground |

**Key design decisions:**
- Sidebar is **always dark** in both themes (`--sidebar` is dark slate-800 in light, near-black in dark).
- Legacy tokens (`ink`, `cream`, `gold`) remap per theme so existing class usage (`bg-ink`, `text-cream`, `bg-gold`) auto-resolves without markup changes.
- `body` has `transition: background-color 200ms, color 200ms` for smooth theme switches.
- Animations use `rgb(var(--primary) / 0.55)` and `rgb(var(--destructive) / 0.5)` so highlight/urgent pulses adapt to the active theme.

---

## UX utilities (shared, brand-styled)

All in `@/components/ui` — import via the barrel:

```ts
import {
  Button, Card, CardContent, Badge,
  Skeleton, SkeletonCard, SkeletonTable, SkeletonText,
  EmptyState,
  ConfirmDialog,
  LoadingButton,
  SearchInput, ConnectionDot, DeadlineCell, ThemeToggle,
  toast, useToast, Toaster,
  AppShellSkeleton,
  Dialog, DialogContent, Sheet, SheetContent,
} from "@/components/ui";
```

| Utility | Notes |
|---|---|
| `<Toaster />` + `toast.{success,error,info,warning}` + `useToast()` | Custom system. Mounts once in App. Up to 3 visible. Bottom-right on desktop, top on mobile. Auto-dismiss: 4s success/info, 6s warning, sticky error. Slide-in-right entrance, fade-out exit. Errors get `role="alert"` + `aria-live="assertive"`. |
| `<Skeleton>` / `<SkeletonCard>` / `<SkeletonTable rows cols>` / `<SkeletonText lines>` | Pure CSS pulse animation. |
| `<AppShellSkeleton>` | Full-page replica of the real shell (pulsing dark sidebar + top bar + card grid). |
| `<EmptyState icon title description action>` | Centered "nothing here" with optional CTA button. |
| `<ConfirmDialog ...>` | Radix Dialog underneath — Esc/click-outside/focus-trap built in. `variant`: default / danger / warning. |
| `<LoadingButton loading loadingText>` | Brand `<Button>` with inline `Loader2` and `disabled` while loading. |
| `<ConnectionDot>` | Supabase Realtime heartbeat: green = SUBSCRIBED, yellow pulse = transitioning ≤30s, red = disconnected >30s. |
| `<SearchInput value onChange placeholder debounceMs>` | Generic version. Focus ring. |
| `<DeadlineCell deadline>` | Severity dot + formatted date + relative "N days left" label. Uses `daysUntil`/`daysSeverity`/`shouldPulse` from `lib/days.ts`. Used in task tables on `/dashboard`, `/sampling`, `/concepts`. |
| `<ThemeToggle>` | Cycles light → dark → system. Sun/Moon/Monitor icons + label. Placed in sidebar. |
| `<NotificationBell>` | Bell icon with unread count badge (capped at 9+). Dropdown shows 15 most recent notifications with type icons (info/warning/urgent/success), relative timestamps, mark-all-read. Pulse animation on new arrival. Links to `/notifications`. Placed in TopNav. |

**Global CSS animations** in [`index.css`](linkd-fms/src/index.css):
- `animate-slide-in-right` / `animate-slide-out-right` — Toaster + drawers
- `animate-fade-in` / `animate-fade-out` — route transitions, error messages
- `animate-card-enter` — scale 0.95 → 1 + fade; cards landing in a new kanban column
- `animate-highlight-pulse` — 2s primary-color box-shadow pulse; flags just-moved cards
- `animate-urgent-pulse` — 1.2s scale + destructive-color box-shadow ring; URGENT badges on mount

---

## Data hooks

All hooks live in `linkd-fms/src/hooks/`. Read patterns return `{ data, isLoading, error, refetch }`. Mutation patterns return `Promise<{ data, error }>` and **never throw** — error is always a string ready for `toast.error()`.

| Hook | Purpose |
|---|---|
| `useAuth` | Session + profile + signIn/signOut. Context-based; single instance. |
| `useTheme` | Light/dark/system theme toggle. Context-based; persists to localStorage. Returns `{ theme, resolvedTheme, setTheme }`. |
| `useTasks(filters?)` | List tasks with client/assignee/creator/files joined. Filters: status, assignedTo, myTasksOnly, clientId, priority, search, dateRange. Sort: priority DESC → deadline ASC → created DESC. Soft-deleted rows hidden by RLS for designers. |
| `useTaskMutations()` | createTask (generates DF-format task code), updateTaskStatus (forward-only for designers; admin can move backward), updateQtyCompleted (auto-advances status), assignTask (pool→todo + code regeneration), selfAssignTask (designer claims from pool), markTaskDone (stamps completed_at + calculates delay_days), updateTask (general field edit via `UpdateTaskFields` — concept, description, fabric, qty, deadline, assignee, priority, etc.), deleteTask (soft — admin only). Exports `UpdateTaskFields` interface. Tracks per-op pending state via `isPending(op, id?)`. |
| `useTaskDetail(taskId)` | One task + its files (with uploader) + activity log (with changer). Fetches all three in parallel on `taskId` change. Used by `TaskDetailDrawer`. |
| `useConcepts(filters?)` | List concepts with submitter/reviewer/designer/client joined. Dual-schema support (pre/post 0012 fallback). Includes submitConcept, reviewConcept (admin only — flips md_status), finalizeConcept (submitter, post-approval). |
| `useClients()` | All clients, ordered by party_name. |
| `useProfiles({ roles? })` | All profiles, optionally filtered by role array. |
| `useDesignerCodes()` | All `designer_codes` joined with the owner profile. Returns a flat list AND a `Map<profile_id, codes[]>` for per-designer lookups. Admin-write-only at the DB layer. |
| `useFabrics({ activeOnly? })` | Fabric lookup rows from `fabrics` table (added in 0011). Active-only by default. Sorted by `sort_order` (nulls last), then `name`. Used by Briefing/Concept forms. |
| `useConceptCategories({ activeOnly? })` | Concept category lookup rows from `concept_categories` table (added in 0011). Active-only by default. Sorted by `sort_order` (nulls last), then `name`. Used by Briefing/Concept forms. |
| `useNotifications()` | Notifications for current user. Subscribes to Supabase Realtime (INSERT events scoped to user_id). Returns `{ notifications, unreadCount, isLoading, error, refetch, markAsRead, markAllAsRead, isPending }`. New notifications auto-prepend without full refetch. |
| `useFullKitting()` | Structured kitting form CRUD for `full_kitting_details` table. `getKittingForTask(taskId)` fetches existing record; `submitKitting(taskId, formData)` inserts record + advances task to done. |
| `useSamples(filters?)` | Sample records with full CRUD. Filters: `dateRange`, `customerName` (ILIKE), `status` (pending/completed/all). Mutations: `createSample(input)`, `updateSample(id, data)`, `deleteSample(id)`. All auto-refetch after mutation. Filter key memoized for stable deps. |
| `useAnalytics(period?)` | Concept Dashboard data layer. Computes all metrics from `useConcepts` + `useProfiles` + `useDesignerCodes`. Period-adaptive volume data (days for week, weeks for month, months for quarter). Returns KPIs (submitted/approved/rate/turnaround), status distribution, volume points, designer concept stats with weighted scoring, approval speed. |
| `useTaskAnalytics(period?)` | Task Dashboard data layer. Computes all metrics from `useTasks` + `useProfiles` + `useDesignerCodes`. Period-adaptive volume data. Returns KPIs (completed/on-time/avg days/created), pipeline snapshot, volume points, designer task stats with weighted scoring, **plus the raw `tasks` array re-exported so consumers don't double-fetch**. Separate from `useAnalytics` — the two systems are independent. |
| `useDesignerScorecard(designerId, period?)` | Per-designer scorecard data layer. Composes `useConcepts` + `useTasks` + `useProfiles` + `useDesignerCodes`. No new DB queries. Reuses the 30/35/20/15 scoring formulas. Returns: profile + designer codes, concept block (submitted/approved/rejected/revisions/pending/approvalRate/avgReviewHours/score/breakdown/monthlyTargetProgress), task block (assigned/completed/onTime/inProgress/avgDays/score/breakdown/teamAvgDays), composite score, rank (concept/task/overall + total), 6-month trend, 365-day dailyActivity (for heatmap), last-10 activity feed (merged concept + task events), and insights array (rule-based strengths/watchouts capped at 4 with watchouts first). Period = `week`/`month`/`quarter`/`year`. |

---

## Task code generation

Task codes are generated in [`useTaskMutations.ts`](linkd-fms/src/hooks/useTaskMutations.ts) with the format:

```
DF {NN}-{D}{MMYY}-{CONC}-{QQQ}M
```

| Part | Meaning | Example |
|---|---|---|
| `DF` | Fixed prefix | `DF` |
| `NN` | Per-year sequence (min 2 digits) | `01`, `09`, `123` |
| `D` | Designer letter from `designer_codes` table, or `P` for Pool/unassigned | `S`, `K`, `P` |
| `MMYY` | Month + year at creation time | `0526` (May 2026) |
| `CONC` | First 4 alpha chars of the concept name, uppercased | `FLOR`, `ABST` |
| `QQQ` | Quantity in meters, rounded | `200`, `50` |

Examples: `DF 01-S0526-FLOR-200M`, `DF 09-P0526-CONC-2M`

**Key behaviors:**
- The `NN` sequence comes from the DB trigger's per-year counter (resets each January). Extracted from the trigger-generated `task_code` via `extractSeq()`.
- `fetchDesignerLetter(designerId)` looks up the designer's first code letter from `designer_codes`. Falls back to `"X"` if not found, `"P"` if unassigned.
- **Pool code detection**: `isPoolCode()` matches codes with `P` as the designer letter. When a pool task is assigned, the code is regenerated with the real designer letter.
- On `createTask`: insert row → get trigger-generated code → extract sequence → rebuild with proper designer letter → update row.
- On `assignTask`: if old code was a pool code → regenerate with new designer letter.

---

## Database (Supabase)

Schema source of truth: [`supabase/migrations/0001_full_schema.sql`](supabase/migrations/0001_full_schema.sql) (~470 lines). Additive migrations: [`0003_storage_buckets.sql`](supabase/migrations/0003_storage_buckets.sql), [`0004_design_storage.sql`](supabase/migrations/0004_design_storage.sql), [`0005_task_additions.sql`](supabase/migrations/0005_task_additions.sql), [`0006_simplify_roles.sql`](supabase/migrations/0006_simplify_roles.sql), [`0007_designer_codes.sql`](supabase/migrations/0007_designer_codes.sql), [`0008_design_coordinator_role.sql`](supabase/migrations/0008_design_coordinator_role.sql), [`0009_design_coordinator_policies.sql`](supabase/migrations/0009_design_coordinator_policies.sql), [`0010_workflow_additions.sql`](supabase/migrations/0010_workflow_additions.sql), [`0011_lookup_tables.sql`](supabase/migrations/0011_lookup_tables.sql), [`0012_concept_extensions.sql`](supabase/migrations/0012_concept_extensions.sql), [`0013_notifications_and_kitting.sql`](supabase/migrations/0013_notifications_and_kitting.sql), [`0014_task_completion_fields.sql`](supabase/migrations/0014_task_completion_fields.sql).

**Why there's no 0002.** Original setup had four split migrations. When consolidated, **0001 + 0002 + 0004 were merged into the single `0001_full_schema.sql`**. The numbering gap is intentional; continue from `0015` for new migrations.

| File | What it does |
|---|---|
| `0001_full_schema.sql` | Enums, 7 tables, all triggers, helper functions (`auth_role`, `is_admin`), **and all RLS policies for the public schema** (section 12) |
| ~~0002~~ | gone — merged into 0001 |
| `0003_storage_buckets.sql` | `task-files` + `sampling-proofs` + `avatars` buckets + policies |
| `0004_design_storage.sql` | `design-files` (50 MB) + `proof-photos` (10 MB) buckets with MIME/size limits + RLS |
| `0005_task_additions.sql` | Adds `due_time` / `whatsapp_group` / `description` / `deleted_at` to tasks; rewrites the two tasks policies for soft-delete |
| `0006_simplify_roles.sql` | Drops `super_admin` + `production` from the enum, remaps users to `admin`, rebuilds every dependent function + policy |
| `0007_designer_codes.sql` | New `designer_codes` table (one-to-many to profiles) for designer sample-identifier codes (U/V/S/W/R/T…); plus `designer_status` enum (`active`/`inactive`) |
| `0008_design_coordinator_role.sql` | Adds `'design_coordinator'` to the `user_role` enum (one-line migration — must commit before 0009 runs) |
| `0009_design_coordinator_policies.sql` | New `is_admin_or_coordinator()` helper, rewritten `handle_new_user()`, and **every "admin or coordinator" RLS rewrite** across clients/tasks/task_logs/files/sampling_logs + 5 storage policies |
| `0010_workflow_additions.sql` | **Two new tables** (`samples`, `salvedge_records`), 9 new task columns (`mtr`, full-kitting fields, `assigned_by`, `started_late`, `concept_start_date`), 4 new triggers (updated_at + auto-complete), 8 indexes, RLS for the new tables (**admin-strict, NOT widened to coordinator**), `sample-files` storage bucket (100 MB, images + video) |
| `0011_lookup_tables.sql` | **Two new lookup tables** (`concept_categories`, `fabrics`) for briefing form dropdowns. Admin-managed taxonomy (`is_admin()` strict). Both have `sort_order`, `is_active`, unique `name`, `updated_at` trigger. |
| `0012_concept_extensions.sql` | **Extends `concepts` table** with 12 new columns: `start_date`, `designer_id` (FK → profiles), `client_id` (FK → clients), `assigned_by`, `priority` (task_priority, default 'normal'), `file_url`, `final_approval_planned_date`, `final_approval_actual_date`, `final_approval_notes`, `final_approved_at`, `approved_designs_count`, `remarks`. Plus 4 indexes. |
| `0013_notifications_and_kitting.sql` | **Two new tables**: `notifications` (user_id, title, message, type CHECK info/warning/urgent/success, link, is_read; RLS: own-only SELECT, admin/coordinator INSERT, own UPDATE, admin DELETE; Realtime-enabled) and `full_kitting_details` (task_id UNIQUE, submitted_by, fabric_details, colors, quantity, accessories, packing_type CHECK standard/premium/bulk/custom, special_instructions; RLS: authed SELECT, self INSERT, admin/coordinator UPDATE, admin DELETE). |
| `0014_task_completion_fields.sql` | Adds `assigned_at` (timestamptz), `completed_at` (timestamptz), `delay_days` (integer) to tasks table for completion tracking. |

**14 tables**: `profiles`, `clients`, `concept_categories`, `fabrics`, `concepts`, `tasks`, `task_logs`, `files`, `sampling_logs`, `designer_codes`, `samples`, `salvedge_records`, `notifications`, `full_kitting_details`.
Plus `task_counters` (internal, per-year sequence for task codes).

**Tables added in 0010** (no UI consumes them yet — schema-only landing):
- **`samples`** — daily customer-sample records. Wide table (24 cols) — `party_name` is **free text** (not FK to clients), `pending_qty` is a `GENERATED` column (`total_fabrics_received - printed_mtr`), `order_or_sample` is a 3-value CHECK (`'order' | 'sample' | ''`), three storage-path columns (`photo_url`, `video_url`, `signature_url`) all point at `sample-files`. `created_by → auth.users` (set null on delete).
- **`salvedge_records`** — challan-based fabric distribution tracking. `designer_id → profiles`, `qty > 0` check, `pending` is `GENERATED` (`qty - completed_qty`), auto-complete trigger flips `is_completed = true` + stamps `completion_timestamp` when `completed_qty >= qty`.

**Tables added in 0011** (consumed by `useFabrics()` and `useConceptCategories()` hooks):
- **`concept_categories`** — design-style taxonomy (e.g. "Block print", "Damask"). `name` (unique), `sort_order`, `is_active`, timestamps.
- **`fabrics`** — fabric types used on briefs (e.g. "Cotton Voile"). Same schema shape as `concept_categories`.

**Enums**:
- `user_role` — **`admin`, `design_coordinator`, `designer`** (3 values, after 0008).
- `task_status` — `pool | todo | in_progress | full_kitting | approved | sampling | done`
- `task_priority` — `low | normal | high | urgent`
- `md_status` (aliased as `ConceptStatus` in TS) — `pending | approved | rejected | revision_requested`
- `designer_status` — `active | inactive`

**Auto-generated IDs (human-readable):**
- `tasks.task_code` → DB trigger generates `ORD-YYYY-NNNN`; app immediately overwrites with `DF NN-D{MMYY}-CONC-QM` format (see "Task code generation" section)
- `concepts.concept_code` → `C-YYYYMMDD-XXXX` (4-char alphabet without `I/O/0/1`)

**Triggers (in 0001, updated by 0006 for the new enum):**
- `on_auth_user_created` (via `handle_new_user`) — auto-provisions a profile row when an auth user signs up. Defaults role to `designer`.
- `tasks_before_save_trg` — assigns `task_code` on insert, stamps `started_at` / `kitted_at` on status transitions
- `tasks_log_change_trg` — appends to `task_logs` on insert + status change
- `concepts_before_insert_trg` — assigns `concept_code`, sets `md_planned_date = created_at + 1`
- `concepts_before_update_trg` — stamps `md_actual_date` + `md_reviewed_at` on verdict; on `approved`, sets `designer_planned_date = today + 4`
- `*_touch_updated_at` — generic `updated_at` toucher on profiles, clients, tasks, concepts, concept_categories, fabrics

**Helper functions** (recreated in 0006; extended in 0009):
- `auth_role()` — SECURITY DEFINER, bypasses profile RLS to avoid recursion. Returns `user_role`.
- `is_admin()` — `auth_role() = 'admin'`. **Reserved for admin-exclusives** (concept review, role management, lookup taxonomy, samples/salvedge full CRUD).
- `is_admin_or_coordinator()` — `auth_role() in ('admin', 'design_coordinator')`. **The default elevated check** for tasks, briefs, clients, sampling.

**Storage buckets:**
- `design-files` (0004) — 50 MB, **private**, uploaded into `{user_id}/...`, image/PSD/octet-stream. Concept images go under `{uid}/concepts/...`; task files under `{uid}/tasks/{task_id}/...`. Read via signed URLs (1-hour TTL).
- `proof-photos` (0004) — 10 MB, **private**, **admin-only upload**, image/jpeg+png.
- `sample-files` (0010) — 100 MB, **private**, uploaded into `{user_id}/...`, image (jpeg/png/gif) + video (mp4/quicktime). Also used for full-kitting uploads in BriefingView.
- `task-files`, `sampling-proofs`, `avatars` (0003) — earlier placeholders, kept for back-compat.

---

## RLS pattern

Helper functions live in 0001 (recreated by 0006): `auth_role()` and `is_admin()`.

**Per-table summary:**

| Table | Admin | Design Coordinator | Designer |
|---|---|---|---|
| profiles | read all; update any (no self-escalate) | read all; update self (no role change) | read all; update self (no role change) |
| clients | full CRUD | full CRUD | read + insert |
| concept_categories | full CRUD (`is_admin()` strict) | read only | read only |
| fabrics | full CRUD (`is_admin()` strict) | read only | read only |
| concepts | read all; **review (md_status)**; edit; delete | read (no UI surface); cannot submit / review / delete | submit; edit own while pending/revision; edit own finalization fields when approved |
| tasks | read all incl. deleted; full CRUD | read all incl. deleted; full CRUD | read non-deleted; create (as creator); update if creator/assignee (cannot tombstone) |
| task_logs | read all; insert | read all; insert | read all |
| files | full CRUD on own; can delete any | full CRUD on own; can delete any | upload + own delete |
| sampling_logs | read all; insert; delete | read all; insert; delete | read all |
| designer_codes | full CRUD | read all | read all |
| samples (0010) | full CRUD (`is_admin()` strict) | read only | read all; insert own; update own |
| salvedge_records (0010) | full CRUD (`is_admin()` strict) | read only | read all; insert own; update own |
| notifications (0013) | insert (admin/coordinator); delete (admin only) | insert; read own | read own; update own (is_read only) |
| full_kitting_details (0013) | update; delete | update | read all; insert own (submitted_by = self) |

`task_logs` has no UPDATE/DELETE policies → effectively append-only audit trail.

---

## Dashboard (`/home`) — overview page

The dashboard ([`DashboardView.tsx`](linkd-fms/src/views/DashboardView.tsx)) is the **landing page** for all roles after sign-in. It provides a high-level overview of the pipeline.

**Sections:**
1. **Greeting** — "Welcome back, {firstName}" + subtitle
2. **KPI Cards** (4 across, responsive grid) — Active Tasks, In Progress (+ review count), Completed (+ % done), Open Pool (admin) or Sampling (designer). Each card has an icon with tinted background.
3. **Alert banners** — Shown conditionally: urgent tasks (destructive), overdue (warning), pending concepts (primary, admin only). Each links to the relevant page.
4. **Main grid** (3 cols on lg):
   - **Recent Activity** (2 cols) — Last 6 updated tasks. Each row shows concept name, priority badge, client, status, date, assignee avatar, deadline cell. Links to `/dashboard/tasks`.
   - **Quick Actions** (1 col) — Role-aware links: New Brief (admin), All Tasks/My Board, Concepts, Sampling, Team. Each has icon, label, description, arrow.
   - **Pipeline** — Horizontal bar chart showing distribution across Pool → In Progress → Review → Sampling → Done. Each bar is proportional to `count/total`.

**Data sources:** `useTasks()`, `useConcepts()`, `useProfiles()` — all fetched on mount.

**Skeleton:** Full skeleton with placeholder cards and rows while loading.

---

## Kanban (`/dashboard`) — UX rules

The kanban ([`KanbanView.tsx`](linkd-fms/src/views/KanbanView.tsx)) is a **tabbed wide-table layout** (not a traditional column-based kanban).

**Dashboard statuses**: 5 tabs — Pool, To-Do, In Progress, Full Kitting, Done. (`approved` removed from dashboard — approval is concepts-only now; `sampling` lives on its own `/sampling` page.)

**Status tabs**: horizontal row at top with count badges + colored dots + accent stripe per tab. Clicking a tab shows a wide sortable table for that status.

**Filter tabs (`My Tasks` / `All Tasks` / `Urgent Only`):**
- Designer default → My Tasks, status tab → In Progress. Admin default → All Tasks, status tab → Pool.
- In **My Tasks** mode, designers still see the **whole Pool** (so they can claim from it), but other statuses are filtered to `assigned_to = me`.
- **Urgent Only** drops the my/all filter and shows only `priority='urgent'`.

**Table columns** (22+, varies by status — wide table with `min-w-[2800px]` horizontal scroll):
- Date/Time, Designer (avatar), Concept (with file count), Description, Party Name, Fabric, Mtr, WhatsApp Group, Date, Time, Assigned By, QTY, Completion Timestamp, Qty Completed, Pending, Done?, Started Late, Concept Start Date, Full Kitting (Yes/No), FK Image, FK Form, **Action** (sticky right, 180px)

**Per-section sorting**: each status tab has its own sort state. Sortable by deadline (default), code, qty, priority.

**Search behavior**: Non-matching rows dim to 30% opacity (`opacity-30 pointer-events-none`). Preserves spatial context. Matches against `task_code`, concept, client name, designer name.

**Row actions (per status):**
| Status | Who | Action |
|---|---|---|
| pool (unassigned) | designer or admin | "Accept" → assigns + moves to todo |
| todo | assignee or admin | "Start" → in_progress |
| in_progress | assignee or admin | "Submit" → full_kitting (or opens drawer for file upload if zero files) |
| full_kitting | all users | "Approve/Completed" → done; admin can also "Revise" → in_progress |
| done | — | no action |

**Card movement animation:** Just-moved task IDs added to `enteringIds` set for ~1.8s; rows play `animate-highlight-pulse`.

**URGENT badge** uses `animate-urgent-pulse` on each mount.

**Designer stats** (non-admin): Active / Done / Total cluster in top bar.

**Mobile (<768px)**: responsive column hiding; compact info inline.

**Keyboard shortcuts** (wired via [`useKeyboardShortcuts`](linkd-fms/src/hooks/useKeyboardShortcuts.ts) — auto-disabled while typing in inputs or when any Radix dialog/sheet is open, so they don't conflict with the search box, drawer, or modals):

| Key | Action |
|---|---|
| `J` | Move highlight to next task (sets `activeRowIndex`, scrolls into view via `scrollIntoView({ block: "nearest" })`) |
| `K` | Move highlight to previous task |
| `Enter` | Open the highlighted task in `TaskDetailDrawer` |
| `Esc` | Close drawer if open, otherwise clear the row highlight (`activeRowIndex = -1`) |
| `/` or `F` | Focus the search input (uses the `forwardRef` on `SearchInput`) |
| `1`–`4` | Switch to status tab — Pool / To-Do / In Progress / Done (mapped from `DASHBOARD_STATUSES` indices) |
| `?` | Open `KeyboardShortcutsDialog` (also accessible via the keyboard icon button in the TopBar, left of Refresh) |

Implementation notes:

- Highlighted row gets `bg-primary/[0.04] ring-2 ring-inset ring-primary` + `aria-selected`; a per-row `useEffect` scrolls it into view when `active` flips true
- `activeRowIndex` resets to `-1` whenever the user switches tabs (effect on `statusTab`)
- It does **not** reset when the drawer opens — so Esc on the drawer puts focus back on the same row
- A guard effect clamps `activeRowIndex` back to range if the underlying task list shrinks (e.g. a task advances out of the current tab)
- `visibleTasks` is a separate memo in `KanbanView` that mirrors `TaskTableSection`'s internal sort, so J/K/Enter can map the index back to the right task

---

## Concepts (`/concepts`) — UX rules

The concepts view ([`ConceptsView.tsx`](linkd-fms/src/views/ConceptsView.tsx)) has a **role-specific dashboard** at the top plus **two data sections**:

### Role-specific concept dashboard (`ConceptDashboard.tsx`)
Rendered above the main table based on role:
- **Designer** (`DesignerConceptDashboard`) — Monthly target tracker with recharts `RadialBarChart`. Shows progress toward `MONTHLY_TARGET = 3` concepts/month, days remaining, on-track/behind indicator.
- **Coordinator** (`CoordinatorConceptDashboard`) — Team overview with concept counts per designer.
- **Admin** (`AdminConceptDashboard`) — Pending review queue with quick-action buttons.

### 1. Concept-track briefs
Tasks where `concept` field matches `"Concepts"` (the concept_categories name). Shown in a simpler table: Title, Client, Fabric, Designer, Deadline, Status. Click opens TaskDetailDrawer.

### 2. Workflow table (main)
Multi-stage workflow table mirroring the team's Google Sheet structure. **22 columns across 5 stage groups** (min-width 2400px):

| Stage Group | Color | Columns |
|---|---|---|
| Concept Creation | primary (blue) | Start, Designer, Concept, Description, Party Name, Assigned By |
| Approval | `#7C5CFC` (purple) | Planned, Actual, Status, Delay |
| Concept Completion | success (green) | Planned, Actual, Status, Delay |
| Final Approval | success/70 | Planned, Actual, Status, Delay |
| Aggregates | primary | Approved #, Remarks |

**Status tabs**: All, Pending, Approved, Rejected, Revision — with auto-calculated counts.

**Helpers:**
- `computeDelay(planned, actual)` → days difference
- `deriveCompletionStatus()` → "Done", "Waiting", "Planning", "Late", "In progress"
- `deriveFinalStatus()` → "Approved", "—", "Pending", "Late", "Scheduled"
- `DelayCell` — on-time green vs +Nd red
- `StatusPill` — multi-tone status badges

**Actions:**
- "Submit concept" button → opens `SubmitConceptDialog`
- "Refresh" button
- Row click → opens `ConceptDetailDrawer` (admin approve/reject/revision + designer finalize)

---

## Briefing (`/brief/new`) — form details

The briefing form ([`BriefingView.tsx`](linkd-fms/src/views/BriefingView.tsx), ~1173 lines) creates tasks with full-kitting support.

**Form sections:**
1. **Client** — picker from `useClients()` + inline "Add new" mode
2. **WhatsApp Group** — dropdown: "New Creation", "Job Work Concept", "Linkd Design", "LD-Garments Sublimation Prints"
3. **The Work** — Concept (picker from `useConceptCategories()`), Description (textarea), Fabric (picker from `useFabrics()`), Quantity (required), Meters/Mtr (optional)
4. **Timing** — Planned deadline (date) + Due time (time) + Concept start date (optional)
5. **Priority** — Normal / Urgent toggle
6. **Assign to** — Open Pool (default) or specific designer (avatar buttons from `useProfiles`)
7. **Assigned By** — text input (coordinator/stakeholder name)
8. **Full Kitting Requirements** (collapsible) — toggle switch, drag-drop file upload (100 MB, `.jpg/.jpeg/.png/.psd/.gif/.mp4/.mov` to `sample-files` bucket), progress bar, remarks textarea (1000 char limit)

**Validation:** `FormErrors` interface for required fields; errors shown after first submit attempt.

**Success screen:** Green checkmark + generated task code (monospace) + badges (Full Kitting, Fabric, Mtr, WhatsApp) + "Create another" / "View on dashboard" CTAs.

---

## Sampling (`/sampling`) — UX rules

The sampling view ([`ProductionView.tsx`](linkd-fms/src/views/ProductionView.tsx)) is a **table-based queue** showing tasks with `status = 'sampling'`.

**Features:**
- Sortable columns: deadline (default, ascending), code, qty, priority — click toggles direction.
- Search: same dimming pattern as kanban (30% opacity on non-matches).
- Designer filter dropdown (admin/coordinator only) — filters by `assigned_to`.
- Designers see only their own tasks.
- "Mark Done" button (emerald green, admin/coordinator only) advances to `done` status.
- Task rows are clickable → opens `TaskDetailDrawer`.
- Columns: Concept, Client, Fabric, Qty (with mtr if present), Designer (avatar + name), Deadline (`DeadlineCell`), Priority, Action.
- Empty state: "Nothing in sampling" with role-appropriate message.

---

## Conventions

**Path aliases.** `@/*` → `linkd-fms/src/*`. Configured in `tsconfig.json` + `vite.config.ts`. Always use `@/` rather than relative imports.

**Component naming.** PascalCase files match the component they export. UI primitives in `components/ui/` are a mix — newer ones use PascalCase, older shadcn ones (`avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `dialog.tsx`, `input.tsx`, `label.tsx`, `sheet.tsx`) use kebab-case. Both work via the barrel; prefer PascalCase for new files.

**Import from the barrel.** Use `from "@/components/ui"` rather than individual files.

**Brand colors in Tailwind:**
- All colors are CSS-variable-backed (via `rgb(var(--token) / <alpha-value>)`) and adapt to light/dark theme automatically.
- Use semantic tokens: `bg-primary`, `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`
- Legacy tokens (`bg-ink`, `text-cream`, `bg-gold`) still work and remap per theme.
- **Functional accents**: `emerald-600/text-white` for "Approve / Mark Done", `destructive` for urgent/overdue
- **Forbidden:** purple/violet gradients (except the `#7C5CFC` used specifically for the Approval stage header in ConceptsView).

**Typography:**
- Unified **Inter** for everything. Stack: `"Inter", system-ui, -apple-system, sans-serif`. Loaded from Google Fonts (weights 400/500/600/700).
- Both `font-sans` and `font-serif` map to the same Inter stack.
- Headings: `font-weight: 600`, `letter-spacing: -0.01em`.

**Toasts.** `import { toast } from "@/components/ui"`. Supports `toast.success()`, `toast.error()`, `toast.info()`, `toast.warning()`, `toast.dismiss()`, `toast.dismissAll()`.

**Confirmation prompts.** Use `<ConfirmDialog variant="danger">` rather than `window.confirm()`.

**Loading states.** Prefer `<AppShellSkeleton>` for full-page loading. Prefer `<SkeletonCard>` / `<SkeletonTable>` / `<SkeletonText>` inside existing layouts.

**File uploads.**
- Use `supabase.storage.from('design-files').upload(path, file, { contentType })`.
- Path **must** start with `{auth.uid()}/` — RLS rejects anything else.
- Conventional paths: `{uid}/concepts/{ts}-{rand}.{ext}` and `{uid}/tasks/{task_id}/{ts}-{safe_name}.{ext}`.
- Full-kitting uploads go to `sample-files` bucket.
- For display, fetch a signed URL: `supabase.storage.from('design-files').createSignedUrl(path, 3600)`.
- The reusable [`ConceptImage`](linkd-fms/src/components/ui/ConceptImage.tsx) component handles the signed-URL dance for an `<img>`.

**Permission helpers.** Don't write `role === "admin"` inline anywhere. Import from [`lib/permissions.ts`](linkd-fms/src/lib/permissions.ts):
- `isAdmin(role)` — strictly admin. Use for concept review + role management + lookup taxonomy only.
- `isAdminOrCoordinator(role)` — admin OR design_coordinator. **Default "elevated" check**.
- `isCoordinator(role)` — just design_coordinator. Rarely needed.
- `isDesigner(role)` — just designer.
- Capability aliases: `canReviewConcepts`, `canChangeUserRoles` (=isAdmin), `canCreateBriefs`, `canLogSampling`, `canMoveTaskBackward`, `canManageTaskLifecycle` (=isAdminOrCoordinator), `canViewConcepts`, `canSubmitConcept` (=admin+designer).

**Concept categories + fabrics.** DB-backed lookup tables (migration 0011). Use `useConceptCategories()` and `useFabrics()` hooks. Admin-managed via `is_admin()` RLS.

**Assigned-by options.** `ASSIGNED_BY_OPTIONS` in [`lib/constants.ts`](linkd-fms/src/lib/constants.ts) — static list of internal stakeholder names.

**Month codes.** `A`–`L` map to Jan–Dec in [`lib/constants.ts`](linkd-fms/src/lib/constants.ts). Helpers: `monthCodeForDate()`, `monthCodeFromNumber()`, `monthNumberFromCode()`.

**Optimistic UI.** Hooks don't manage row state — components do. The kanban/sampling use refetch-after-mutation + highlight animation via `enteringIds`.

---

## Environment variables

### `linkd-fms/.env.local` (browser-exposed)
```
VITE_SUPABASE_URL=https://jyfwyfpwbbgfpsntubfy.supabase.co
VITE_SUPABASE_ANON_KEY=<jwt>
```

### Root `.env.local` (server-only, for scripts)
```
NEXT_PUBLIC_SUPABASE_URL=...   # used by Node scripts (apply-migrations, seed-user, seed-data)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...  # service role, NEVER expose to browser
```

Vite reads `.env.local` at server start. After editing it, restart `npm run dev` — HMR doesn't reload env files.

---

## Scripts

All scripts live in `scripts/` at the project root. Run with `node scripts/<name>.mjs`.

| Script | Purpose |
|---|---|
| `apply-migrations.mjs <files>` | Applies SQL migration files to the DB. Requires `DB_HOST` + `DB_PASSWORD` env vars. |
| `seed-user.mjs` | Creates Harshali (admin) auth user + profile. |
| `seed-data.mjs` | Creates 4 clients + 8 sample tasks across pipeline statuses. Idempotent. |
| `seed-clients.mjs` | Bulk-seeds clients from `scripts/clients.csv`. |
| `seed-fabrics.mjs` | Bulk-seeds fabrics from `scripts/fabrics.csv`. Requires 0011. |
| `seed-concept-categories.mjs` | Bulk-seeds concept categories from `scripts/concepts.csv`. Requires 0011. |
| `seed-designer-codes.mjs` | Upserts designer codes. Requires 0007. |
| `delete-auth-user.mjs <email>` | Deletes an auth user (cascades to profile). |
| `verify-roles.mjs` | Verifies role enum + helper functions post-migration. |
| `verify-0010.mjs` | Verifies migration 0010 tables + triggers. |
| `probe-db.mjs` | Probes DB connection (tests pooler connectivity). |
| `reset-data.mjs` | Wipes transactional data while preserving users/clients/fabrics/categories/codes. |

**Data files** in `scripts/`: `clients.csv` (~25 KB), `fabrics.csv` (~9 KB), `concepts.csv` (~864 B).

---

## User accounts

All passwords follow the pattern: `{FirstName}123` with a **capital first letter**.

| Name | Email | Role | Password |
|---|---|---|---|
| Harshali Bhopale | harshali.linkd@gmail.com | Admin | Harshali123 |
| Mahesh Ghawane | maheshgavhane150@gmail.com | Admin | Mahesh123 |
| Aditya Lohar | aditya.linkd@gmail.com | Admin | Aditya123 |
| Aman Ahmed | amandeolinkd@gmail.com | Admin | Aman123 |
| Naushi Ma'am | naushi.linkdprints@gmail.com | Admin | Naushi123 |
| Supriya | designcoordinator.linkdprints@gmail.com | Design Coordinator | Supriya123 |
| Krupesh Late | krupeshlate12@gmail.com | Designer | Krupesh123 |
| Ketan Bhoir | bhoirketan07@gmail.com | Designer | Ketan123 |
| Kavita Rane | kavitarane80@gmail.com | Designer | Kavita123 |
| Nikita Sahu | nikita888sahu@gmail.com | Designer | Nikita123 |
| Manav Khandale | manavlinkd@gmail.com | Designer | Manav123 |
| Shadab Khan | sk8660081@gmail.com | Designer | Shadab123 |

**Designer codes** (mapped via `designer_codes` table):
- Krupesh → `K`, Ketan → `V`, Kavita → `S`, Nikita → (none yet), Manav → `W`, Shadab → `T`

---

## Known issues / things to watch

1. **supabase-js pinned to 2.45.4.** Versions 2.105.x cause REST requests to hang in this Vite/browser combo. Don't bump without full testing.
2. **`useAuth` has a 10s fetchProfile watchdog.** If exceeded, you'll see `fetchProfile timed out` in console. Real network issue, not a hook bug.
3. **`useAuth.isLoading` exposes an effective-loading flag**, not the raw state. Don't expose `rawIsLoading` directly.
4. **Direct DB host is IPv6-only.** Use the pooler from Windows/non-IPv6 environments.
5. **DB password and service role were exposed in chat during initial setup.** Rotate both.
6. **5173 sometimes lingers.** Kill the owning process in PowerShell, then re-run `npm run dev`.
7. **`useTasks` filterKey trick.** Uses `JSON.stringify(filters)` as dep, so callers can pass fresh objects.
8. **Single custom toaster.** `<Toaster>` from `@/components/ui/Toaster.tsx`. Sonner has been fully removed.
9. **Bundle size ~572 KB.** Acceptable for internal tool; code-split per route if needed.
10. **Wrong-role behavior is inline, not redirect.** ProtectedRoute renders `AccessRestrictedView` inside AppLayout — URL preserved.
11. **TopNav search is local-only.** Captures input + `Ctrl+K` focus, but only filters the kanban's local list.
12. **Migration 0006 dropped `super_admin` and `production` enum values.** Can't reference them anymore.
13. **Postgres enum value + same-transaction usage conflict.** Split into two migrations (see 0008/0009 pattern).
14. **0010 auto-complete triggers fire on UPDATE only, not INSERT.** Stamp `completion_timestamp` manually if inserting already-complete rows.
15. **0010 + 0011 RLS is admin-strict** for `samples`, `salvedge_records`, `concept_categories`, `fabrics`. Coordinators only get read access.
16. **Legacy token remapping.** `bg-ink` = white (light) / white (dark); `bg-cream` = white (light) / dark card (dark); `bg-gold` = blue. Semantic tokens (`bg-primary`, `bg-background`) are clearer — prefer those in new code.
17. **FOUC prevention script in index.html.** Reads `linkd-fms-theme` from localStorage and applies `dark` class before React mounts. If you change the localStorage key in `useTheme`, update this script too.
18. **`useConcepts` dual-schema fallback.** Tries a full SELECT with designer/client joins (post-0012); if it gets a "relationship not found" error, falls back to a legacy SELECT without those joins. This gracefully handles databases where 0012 hasn't been applied yet.
19. **Task code is overwritten after insert.** The DB trigger generates `ORD-YYYY-NNNN`; `useTaskMutations.createTask` immediately overwrites with the `DF NN-D{MMYY}-CONC-QM` format. The trigger-generated code is only used to extract the per-year sequence number.
20. **Dashboard excludes `approved` and `sampling`.** The kanban only shows 5 statuses (pool, todo, in_progress, full_kitting, done). `approved` status is treated as a concepts-only concept; `sampling` has its own `/sampling` page.
21. **Notifications use Supabase Realtime.** The `useNotifications` hook subscribes to `postgres_changes` INSERT events on the `notifications` table filtered by `user_id`. New rows auto-prepend without refetch. The channel is cleaned up on unmount. Requires Realtime enabled on the `notifications` table in Supabase Dashboard.
22. **`full_kitting_details` has a UNIQUE constraint on `task_id`.** One kitting record per task. Attempting a second INSERT for the same task will error — the UI should call `getKittingForTask()` first to check.
23. **0014 added `assigned_at`, `completed_at`, `delay_days` to tasks.** These are nullable columns with no triggers — the app is responsible for stamping them at the appropriate lifecycle points.

---

## What's implemented vs placeholder

**Done:**
- Vite scaffold + **dual-theme** (light/dark/system) Tailwind + Inter font + FOUC prevention
- Full DB schema (12 tables, triggers, RLS, storage) — migrations 0001/0003–0012 applied
- **Theme system**: `useTheme` hook + `ThemeProvider` + `ThemeToggle` component + CSS custom properties for all tokens in both light and dark modes
- **3-role architecture** (admin / design_coordinator / designer)
- Centralized [`lib/permissions.ts`](linkd-fms/src/lib/permissions.ts)
- `AuthProvider` / `useAuth()` with all 4 auth events + StrictMode safety + 10s watchdog
- **UX utility layer**: Toaster, Skeleton (x3), AppShellSkeleton, EmptyState, ConfirmDialog, LoadingButton, ConnectionDot, SearchInput, DeadlineCell, ThemeToggle + global CSS keyframes + barrel export
- **App shell**: AppLayout + Sidebar (Dashboard first, section labels, glassmorphism TopNav) + RootRedirect
- **UI polish**: Custom scrollbars, `rounded-xl` cards with hover shadow, subtle `fadeIn` with Y-translate, deeper dark mode, smoother animations
- **`/login`** — split-screen, labels-above inputs, password eye toggle, focus rings, success flash
- **`/onboarding`** — fallback for profile-less users
- **AccessRestrictedView** — inline, friendly, keeps sidebar + URL
- **NotFoundView** — 404 inside app shell
- **`/home`** (Dashboard) — KPI cards (Active Tasks, In Progress, Completed %, Open Pool/Sampling), alert banners (urgent/overdue/pending concepts with links), recent activity list (6 tasks), quick actions (role-aware), pipeline distribution bar chart. Full skeleton loading state.
- **`/dashboard`** (Kanban) — tabbed wide-table layout (5 status tabs), per-section sorting, search dimming, row actions per status, designer filter (admin), personal stats (designer), TaskDetailDrawer integration
- **`/brief/new`** — full task creation with: DB-backed concept category + fabric pickers, full-kitting upload section (drag-drop, 100 MB, progress bar, remarks), WhatsApp group picker, assignee selection, DF-format task code generation, success screen
- **`/concepts`** — clean card-list layout with role-specific dashboards above: Designer (radial progress ring, monthly target 3/3, warning banners at day 7/24), Coordinator (designer progress table, at-risk alerts), Admin (4 KPI cards). Status filter chips with colored dots. Submit dialog (min 50-char description + char counter). Admin review drawer. Dual-schema fallback (pre/post 0012).
- **`/team`** — read-only roster table (avatar + name + role badge + designer code pills + joined date)
- **`/sampling`** — "Sampling Hub": 4 stat cards (Today/Month/Customers/Pending — admin only), customer search + status filters, full samples table with edit/delete row actions (via `SamplingFormDrawer`), "Tasks in Sampling Stage" section with Mark Done, bar chart of samples per day (recharts BarChart, last 14 days). Batch entry via Quick Add mode.
- **TaskDetailDrawer** — 8 sections: header, pipeline progress, brief grid, qty tracker, file upload, files grid, activity timeline, action footer
- **Task code generation** — `DF NN-D{MMYY}-CONC-QM` format with designer letter lookup, pool code detection, code regeneration on assignment
- **Notifications system** — `notifications` table (0013) + `useNotifications` hook with Supabase Realtime subscription (INSERT events). `NotificationBell` in TopNav (bell + dropdown + unread badge). Full `/notifications` page with type filters (info/warning/urgent/success), date grouping (today/yesterday/this week/older), pagination, mark-as-read, mark-all-read.
- **Full kitting details** — `full_kitting_details` table (0013) + `useFullKitting` hook + `FullKittingModal` component. Structured kitting form (fabric_details, colors, quantity, accessories, packing_type, special_instructions). One record per task (UNIQUE constraint).
- **Sampling system** — `useSamples` hook with full CRUD + filters (dateRange, customerName, status). `SamplingFormDrawer` (Sheet-based) with Quick Add / Full Form toggle, batch entry (party name persists), file uploads (5x100MB to `sample-files` bucket). `SamplingFormDialog` for legacy flow.
- **Task completion tracking** — `assigned_at`, `completed_at`, `delay_days` columns on tasks (0014). `markTaskDone()` in useTaskMutations stamps `completed_at` and calculates `delay_days`.
- **Task CRUD** — `EditTaskDialog` for standalone editing (via ⋮ menu on table rows); **inline edit mode** in `TaskDetailDrawer` (toggles BriefDetails between read-only and form fields: qty, mtr, deadline, priority, assignee, whatsapp, description, notes + Save/Cancel + field-change logging to task_logs). Delete via `ConfirmDialog` (admin only, soft-delete). `updateTask()` mutation from useTaskMutations with `UpdateTaskFields` interface. Row ⋮ action menu on KanbanView (View/Edit/Delete, role-gated, portal-rendered to escape overflow-hidden).
- **Concept dashboard** — `ConceptDashboard.tsx` with 3 role-specific sections: `DesignerConceptDashboard` (monthly target tracker with recharts RadialBarChart, 3/month target), `CoordinatorConceptDashboard` (team overview), `AdminConceptDashboard` (pending-review queue). Rendered above concepts table in ConceptsView.
- **Notification helpers** — [`lib/notifications.ts`](linkd-fms/src/lib/notifications.ts): `sendNotification(userId, title, msg, type?, link?)`, `sendNotificationToMany(userIds, ...)`, `sendNotificationToRole(role, ...)`. Reusable for inserting notifications from any view or hook.
- **Seed data**: seed-user, seed-data, seed-clients (CSV), seed-fabrics (CSV), seed-concept-categories (CSV), seed-designer-codes

**Dashboards (FUNCTIONAL):**

- **Concept Dashboard** (`/analytics`) — Admin/coordinator section order: (1) 4 KPI cards (submitted/approved/rate/avg review time) with trend %; (2) status badges (pending review · in revision · approved · awaiting finalization), clickable; (3) **hero row** — `DesignerConceptMatrix` (per-designer breakdown with own W/M/Q/Y filter, stacked bars by approved/revision/rejected/pending, team totals strip, champion call-out, sortable columns) + `TeamTargetHero` (radial dial of "% designers hit 3 approved", inline stat strip days-left/pace/not-started, designer pip dock); (4) volume chart (period-adaptive: days for week, weeks for month, months for quarter) + concept status bars; (5) `ConceptFunnel` (5-stage funnel with conversion rates + stale-review warning); (6) `MdReviewPanel` (admin only — review-speed circle + counts grid + velocity); (7) `DesignerLeaderboard` (sortable, animated score bars, scoring: volume 30 + approval rate 35 + speed 20 + low revisions 15); (8) `ConceptTurnaround` (approval-speed area chart with success/warning/destructive zones). Designer personal view: `PersonalTargetRing` (radial with milestone ticks at 1/2/3 + contextual message) + 4 personal KPIs + big score card.
- **Task Dashboard** (`/task-dashboard`) — Admin/coordinator section order: (1) `TaskHealthHero` (horizontal strip with dividers: throughput + on-time radial | auto-generated headline insight | active/urgent/overdue dock; handles sparse-data / no-previous-period without leaking the 999 trend sentinel); (2) 4 KPI cards (completed/on-time/avg days/created) with trend %; (3) status badges (active in pipeline · urgent · overdue); (4) volume bar chart + pipeline health bars (clickable, links to `/dashboard`); (5) `WorkloadDistribution` (stacked horizontal bars per designer, auto-tagged Overloaded/Light vs team avg, `onDesignerClick` opens scorecard drawer) + `AtRiskTasks` (tabbed Overdue/Urgent with deep-link); (6) `TaskLeaderboard` (sortable, animated score bars, scoring: volume 30 + on-time 35 + speed 20 + active work 15, row click opens scorecard drawer). Designer personal view: 4 personal KPIs + big score card.
- **Designer Scorecards** (`/scorecards`, admin only) — Grid landing page that judges every designer at a glance. 4-stat banner (designers/avg composite/on track/needs support) + top-performer call-out + search + designer cards (composite score, verdict pill, concept/task mini blocks, strengths/watchouts count). Each card click → full-page scorecard at `/scorecards/:designerId`.
- **Full-page scorecard** (`/scorecards/:designerId`) — Deep-dive performance analysis. Sections: **(1) Hero** with Reliability gauge (composite + on-time/throughput/consistency bars, tiered STRONG/SOLID/DEVELOPING/NEEDS SUPPORT). **(2) 5 KPI tiles** (Scheduled · Completed · On-Time % · Avg Delay · Best Streak) with trend pills. **(3) Concept Performance + Task Performance cards** (donut + 4-bar score breakdown + section pill + avg review/completion footnote with team-avg delta). **(4) 6-Month Momentum** recharts AreaChart (concepts approved + tasks completed). **(5) Calendar heatmap** (compact 36×36 cells, Mon-first, click any cell → drill-in panel with all that day's events listed by tone) + **Composition donut** (140px + stacked summary bar + verdict footnote) + **Weekly Throughput sparkline** (12 weeks, stacked tasks + concepts). **(6) Trend (6mo on-time % bars) + Day-of-week pattern + Cycle Time histogram** (delay buckets 0d / 1d / 2-3d / 4-7d / 8+d). **(7) Priority breakdown donut + Vs Team comparison bars (delta-colored) + Concept Pipeline funnel** (Submitted → Reviewed → Approved → Finalized with drop-off %). **(8) Activity timeline + Insights**. Date-range filter (7d/30d/90d/6mo/12mo/Custom from→to) drives all KPIs + charts. Admin gets Export CSV + Send Feedback (inline) + Open Team actions. Designer self-view hides rank + admin actions ("My Performance" subtitle).
- **System** (`/system`) — Admin data management page: live row counts per table, expandable data browser (search by any column + per-row delete + pagination 20/page), bulk "Clear" per table (FK-safe dependency ordering), "Clear All Data" with task counter reset. Protected tables: profiles, auth.users, designer_codes never deleted.

**Not yet built:**
- In-app role management on `/team`
- Cross-page search
- Edit own pending concept (DB permits it; UI doesn't expose it)
- Concept → Task promotion (`tasks.concept_id` FK exists, no UI)
- Drag-and-drop reordering in Kanban
- **0010 surfaces**: Salvedge view (challan-based fabric distribution) — `useSalvedge()` hook not yet created
- **Lookup taxonomy admin UI**: no in-app interface for managing `concept_categories` or `fabrics`

---

## Quick navigation cheatsheet

| Need to ... | Look at |
|---|---|
| Add a new route or change role gating | [`App.tsx`](linkd-fms/src/App.tsx), [`lib/routes.ts`](linkd-fms/src/lib/routes.ts) |
| Change the dashboard overview KPIs | [`DashboardView.tsx`](linkd-fms/src/views/DashboardView.tsx) — `stats` useMemo + `KpiCard` |
| Tweak sidebar nav per role | [`Sidebar.tsx`](linkd-fms/src/components/layout/Sidebar.tsx) — `getNavGroups(role)` |
| Tweak page-title for a route | [`TopNav.tsx`](linkd-fms/src/components/layout/TopNav.tsx) — `getPageTitle()` |
| Change auth behavior | [`useAuth.tsx`](linkd-fms/src/hooks/useAuth.tsx) |
| Change theme behavior | [`useTheme.tsx`](linkd-fms/src/hooks/useTheme.tsx) + [`index.css`](linkd-fms/src/index.css) CSS variables |
| Change theme colors | [`index.css`](linkd-fms/src/index.css) `:root` / `.dark` sections |
| Change wrong-role / 404 messages | [`AccessRestrictedView.tsx`](linkd-fms/src/views/AccessRestrictedView.tsx), [`NotFoundView.tsx`](linkd-fms/src/views/NotFoundView.tsx) |
| Change kanban column styling | [`lib/constants.ts`](linkd-fms/src/lib/constants.ts) — `COLUMN_BG`, `COLUMN_DOT`, `COLUMN_ACCENT` |
| Adjust deadline thresholds | [`lib/days.ts`](linkd-fms/src/lib/days.ts) |
| Change kanban row actions | [`KanbanView.tsx`](linkd-fms/src/views/KanbanView.tsx) — action handlers + `DASHBOARD_STATUSES` |
| Change kanban keyboard shortcuts | [`KanbanView.tsx`](linkd-fms/src/views/KanbanView.tsx) — `shortcuts` useMemo (J/K/Enter/Esc/1-4//F/?) |
| Add a global keyboard shortcut to a different view | [`useKeyboardShortcuts.ts`](linkd-fms/src/hooks/useKeyboardShortcuts.ts) — call with a list of `Shortcut` objects; render `<KeyboardShortcutsDialog>` to show help |
| Change keyboard shortcut help dialog styling | [`KeyboardShortcutsDialog.tsx`](linkd-fms/src/components/ui/KeyboardShortcutsDialog.tsx) — `<kbd>` badges + KEY_LABELS map |
| Change task code format | [`useTaskMutations.ts`](linkd-fms/src/hooks/useTaskMutations.ts) — `buildTaskCode()` |
| Add a task drawer section | [`TaskDetailDrawer.tsx`](linkd-fms/src/components/tasks/TaskDetailDrawer.tsx) |
| Add a briefing form field | [`BriefingView.tsx`](linkd-fms/src/views/BriefingView.tsx) + `useTaskMutations.createTask` + types |
| Change notifications behavior | [`useNotifications.ts`](linkd-fms/src/hooks/useNotifications.ts) (data + realtime) + [`NotificationBell.tsx`](linkd-fms/src/components/ui/NotificationBell.tsx) (dropdown) + [`NotificationsView.tsx`](linkd-fms/src/views/NotificationsView.tsx) (full page) |
| Change full kitting form fields | [`FullKittingModal.tsx`](linkd-fms/src/components/tasks/FullKittingModal.tsx) + [`useFullKitting.ts`](linkd-fms/src/hooks/useFullKitting.ts) |
| Change the task edit dialog fields | [`EditTaskDialog.tsx`](linkd-fms/src/components/tasks/EditTaskDialog.tsx) + `UpdateTaskFields` in [`useTaskMutations.ts`](linkd-fms/src/hooks/useTaskMutations.ts) |
| Change concept dashboard KPIs/charts | [`ConceptDashboard.tsx`](linkd-fms/src/components/concepts/ConceptDashboard.tsx) (3 role-specific exports) |
| Send a notification programmatically | `import { sendNotification } from "@/lib/notifications"` — also `sendNotificationToMany`, `sendNotificationToRole` |
| Change sampling form fields | [`SamplingFormDrawer.tsx`](linkd-fms/src/components/sampling/SamplingFormDrawer.tsx) |
| Change sampling page layout/charts | [`ProductionView.tsx`](linkd-fms/src/views/ProductionView.tsx) (stats cards, filters, samples table, bar chart) |
| Edit a task inline in drawer | [`TaskDetailDrawer.tsx`](linkd-fms/src/components/tasks/TaskDetailDrawer.tsx) — `EditableBriefDetails` component |
| Change Concept Dashboard KPIs/charts | [`useAnalytics.ts`](linkd-fms/src/hooks/useAnalytics.ts) + [`AnalyticsView.tsx`](linkd-fms/src/views/AnalyticsView.tsx) |
| Change the Designer Concept Matrix hero | [`DesignerConceptMatrix.tsx`](linkd-fms/src/components/analytics/DesignerConceptMatrix.tsx) — per-designer rows + W/M/Q/Y filter (independent of dashboard top filter) |
| Change the Monthly Target hero | [`TeamTargetHero.tsx`](linkd-fms/src/components/analytics/TeamTargetHero.tsx) — radial dial, stat strip, designer pip dock |
| Change Task Dashboard KPIs/charts | [`useTaskAnalytics.ts`](linkd-fms/src/hooks/useTaskAnalytics.ts) + [`TaskDashboardView.tsx`](linkd-fms/src/views/TaskDashboardView.tsx) |
| Change the Task Health hero | [`TaskHealthHero.tsx`](linkd-fms/src/components/analytics/TaskHealthHero.tsx) — throughput/on-time + headline insight + risk dock (`buildInsight()`) |
| Change designer workload bars | [`WorkloadDistribution.tsx`](linkd-fms/src/components/analytics/WorkloadDistribution.tsx) — stacked bars + Overloaded/Light tagging |
| Change the at-risk task panel | [`AtRiskTasks.tsx`](linkd-fms/src/components/analytics/AtRiskTasks.tsx) — Overdue/Urgent tabs |
| Change the scorecards listing grid | [`ScorecardsView.tsx`](linkd-fms/src/views/ScorecardsView.tsx) — admin grid, verdict tiering, top-performer call-out |
| Change full-page scorecard layout | [`ScorecardDetailView.tsx`](linkd-fms/src/views/ScorecardDetailView.tsx) — Reliability hero, KPI tiles, calendar heatmap, all 10+ chart panels |
| Change scorecard data shape | [`useDesignerScorecard.ts`](linkd-fms/src/hooks/useDesignerScorecard.ts) — concept + task block, rank, 6mo trend, 365-day dailyActivity, insights rules |
| Change the quick-peek scorecard drawer | [`DesignerScorecardDrawer.tsx`](linkd-fms/src/components/analytics/DesignerScorecardDrawer.tsx) — Sheet variant called from leaderboards / matrix / workload |
| Tweak Reliability scoring tiers (STRONG / SOLID / etc.) | `reliabilityTier()` in [`ScorecardDetailView.tsx`](linkd-fms/src/views/ScorecardDetailView.tsx) — thresholds 80 / 60 / 40 |
| Change calendar heatmap cell color rules | `dayTier()` in [`ScorecardDetailView.tsx`](linkd-fms/src/views/ScorecardDetailView.tsx) — green/amber/red/blue based on on-time / delayed / mixed / pending-only |
| Change verdict tiers shown on listing cards | `verdictFor()` in [`ScorecardsView.tsx`](linkd-fms/src/views/ScorecardsView.tsx) — Top/Solid/Developing/Needs Support |
| Change designer scoring formula | `useAnalytics.ts` (concept scoring) or `useTaskAnalytics.ts` (task scoring) — search for "score" |
| Change period filter behavior | Both hooks: `getPeriodRange()` + volume data generation logic |
| Add a new chart component | `components/analytics/` + import in the relevant view |
| Manage data / clear tables | [`SystemView.tsx`](linkd-fms/src/views/SystemView.tsx) — admin-only at `/system` |
| Open full kitting form from task row | [`FullKittingDrawer.tsx`](linkd-fms/src/components/tasks/FullKittingDrawer.tsx) — mobile-friendly Sheet |
| Change MD review actions | [`ConceptDetailDrawer.tsx`](linkd-fms/src/components/concepts/ConceptDetailDrawer.tsx) |
| Add a global animation | [`index.css`](linkd-fms/src/index.css) — `@keyframes` + utility class |
| Add a UI primitive | `components/ui/` + re-export from `index.ts` |
| Add a DB table or column | New file `supabase/migrations/0015_*.sql` + update `types/database.ts` |
| Add a permission check | Use [`lib/permissions.ts`](linkd-fms/src/lib/permissions.ts) helpers |
| Seed clients/fabrics/categories | `scripts/seed-clients.mjs`, `seed-fabrics.mjs`, `seed-concept-categories.mjs` |
| Show a toast | `import { toast } from "@/components/ui"` |
| Confirm a destructive action | `<ConfirmDialog variant="danger" ... />` |
| Show a deadline cell | `<DeadlineCell deadline={task.planned_deadline} />` |
| Toggle theme programmatically | `const { setTheme } = useTheme()` |
