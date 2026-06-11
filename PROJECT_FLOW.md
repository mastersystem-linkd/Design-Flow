# LinkD FMS — Complete Project Flow (Start to End)

This document traces the entire application from the moment a user opens the browser to every feature, every data flow, and every piece of logic that powers the system.

---

## 1. THE BIG PICTURE

LinkD FMS is a **textile design workflow management system** for LinkD Prints. It tracks four independent systems:

1. **Task Management (Design Flow)** — Coordinators write design briefs; tasks flow through a pipeline: `pool → in_progress → done → completed`. Assigned tasks skip `todo` and go straight to `in_progress`. Designers **claim from the pool** by accepting the single next queued task (urgent-first, then FIFO — no cherry-picking) and committing a deadline + design type, or are assigned directly at brief time. Tasks can be **split across multiple designers** — each gets a portion tracked via `task_assignments`. `done` is an intermediate "design finished, awaiting completion details (fabric + design type)" state; `completed` is terminal (fabric is required). Full kitting form (file upload + structured data) handled via the separate DEO workflow. Tasks requiring Full Knitting cannot be completed until the coordinator adds FK details (FK gate).
2. **Concept Approval** — Designers submit concepts (min 50-char description + file). Admin (MD) reviews. Monthly target: 3 per designer. Concept analytics (tab inside Dashboards) shows approval rates, turnaround speed, designer leaderboard.
3. **Sampling** — Coordinators log daily sampling records (party, fabric, qty, files). Sampling Hub with stats, filters, charts, batch entry. Tasks can auto-create **pending samples** on completion when "Sampling Required" is toggled — these appear in the Pending Samples tab for coordinator processing.
4. **Coordinator Tasks** — Design coordinators have a personal to-do surface (`/coordinator-tasks`) separate from the design-task pipeline. FK-pending tasks auto-generate coordinator to-dos when designers claim tasks without Full Knitting details.

**Five roles** control everything:
- **Super Admin** — All admin powers + exclusive Danger Zone access (bulk data clearing). Can approve concepts at Stage 2 (MD review). Only role that can access `canAccessDangerZone`.
- **Admin** — Full power. Can approve concepts (Stage 2 MD review + Stage 4 final), manage roles, manage lookup data, view scorecards, create briefs, manage team.
- **Design Coordinator** — Admin-equivalent powers (briefs, sampling, task management, client CRUD, analytics, team CRUD, concept Stage 4 final approval). `isAdmin()` returns true for both admin AND coordinator. **Cannot** do Stage 2 MD concept approval — that requires `isMdRole()` (admin/super_admin only). Has personal Coordinator Tasks page.
- **Designer** — Submits concepts, claims tasks from pool, works on assigned tasks, claims split portions, views own scorecard, manages own salvedge records. Can edit own concepts until MD approves.
- **DEO (Data Entry Operator)** — Restricted dashboard. Sees ONLY the Kitting Queue (`/kitting`). Picks up kitting forms the coordinator uploaded, digitizes the 12-field paper form into structured JSON. Cannot create tasks or alter upstream data.

---

## 2. TECH STACK

```
Frontend:     Vite 5 + React 18 + TypeScript 5.6 (strict) + Tailwind CSS 3
Routing:      React Router v6
Server state: @tanstack/react-query 5.100 (staleTime 2min, gcTime 10min, retry 1)
Backend:      Supabase (PostgreSQL + Auth + Storage + RLS + Realtime)
Supabase SDK: @supabase/supabase-js 2.45.4 (PINNED — newer versions hang in Vite)
Hosting:      Vercel (SPA + /api/* serverless for service-role ops)
Icons:        lucide-react
Charts:       recharts 3.8.1
Dates:        date-fns 4.1.0
Toasts:       Custom system (Sonner fully removed)
Confetti:     canvas-confetti 1.9.4
Excel:        exceljs (workbook generation for exports)
Fonts:        Sora — ONE family app-wide (body + headings + display, Google Fonts)
              + JetBrains Mono (data numerals, opt-in .font-mono-data, @fontsource)
              + Bricolage Grotesque & Hanken Grotesk (login page only). Manrope/Fraunces removed.
Theme:        Light / Dark / System (CSS custom properties + class toggle)
UI:           Radix primitives (Dialog, Avatar, DropdownMenu, Label, Slot)
              + hand-written components (no shadcn CLI)
Design lang:  Selvedge — woven-cloth metaphor (gradient edges, dot grids, loom threads)
```

---

## 3. APPLICATION BOOT SEQUENCE

### 3.1 HTML loads (`index.html`)
```
1. Browser loads index.html
2. FOUC prevention script runs BEFORE React:
   - Reads "linkd-fms-theme" from localStorage
   - If "system" → checks OS prefers-color-scheme
   - Adds "dark" class to <html> if needed
3. Sora + JetBrains Mono load from Google Fonts (+ Bricolage/Hanken for /login)
4. /src/main.tsx loads as ES module
```

### 3.2 React bootstraps (`main.tsx`)
```
<React.StrictMode>
  <ErrorBoundary>                              ← Catches render errors, dev stack trace
    <ThemeProvider defaultTheme="light">       ← Theme context (light/dark/system)
      <QueryClientProvider client={queryClient}>← React Query (staleTime 2min, gcTime 10min)
        <AuthProvider>                          ← Auth context (user/session/profile/role)
          <LoaderProvider>                      ← Global T-shirt loader (useLoader())
            <App />                             ← Router + all routes
          </LoaderProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
</React.StrictMode>
```

### 3.3 ThemeProvider initializes (`useTheme.tsx`)
```
1. Read localStorage["linkd-fms-theme"] → fallback to "light"
2. Resolve: if "system" → check window.matchMedia("(prefers-color-scheme: dark)")
3. Apply "light" or "dark" class to document.documentElement
4. If theme="system" → listen for OS preference changes
5. Expose: { theme, resolvedTheme, setTheme }
```

### 3.4 QueryClient configured
```
staleTime: 2 minutes     ← data refetched after 2min of staleness
gcTime: 10 minutes        ← garbage-collected after 10min unused
retry: 1                  ← one automatic retry on failure
refetchOnWindowFocus: false
```

### 3.5 AuthProvider initializes (`useAuth.tsx`)
```
1. Generation counter pattern (prevents React 18 StrictMode double-mount races)
2. Call supabase.auth.getSession() → get existing session
3. Subscribe to onAuthStateChange (INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED)
4. If session exists → fetchProfile():
   a. Query profiles table WHERE id = user.id
   b. 10-second timeout watchdog (prevents wedged UI)
   c. Set profile, role, needsOnboarding
5. Compute effectiveLoading = rawIsLoading || (isAuthenticated && !profileChecked)
   ↑ This prevents the "authed but no profile yet" flash
6. Expose: { user, session, profile, role, isLoading, isAuthenticated, needsOnboarding, signIn, signOut, refreshProfile }
```

### 3.6 Router resolves (`App.tsx`)
```
<BrowserRouter>
  <Toaster />              ← Custom toast system (mounted once, bottom-right)
  <Routes>
    /login             → LoginView              (public)
    /reset-password    → ResetPasswordView       (public)
    /onboarding        → OnboardingView          (public-ish)
    /home              → redirect → /dashboard   (legacy)
    /task-dashboard    → TaskDashboardView        (admin + coordinator + designer) ← LANDING PAGE
    /dashboard         → KanbanView              (admin + coordinator + designer)
    /dashboard/tasks   → KanbanView              (alias)
    /brief/new         → BriefingView            (admin + coordinator + designer)
    /concepts          → ConceptsView            (admin + coordinator + designer)
    /orders            → OrdersView (placeholder)(admin + coordinator)
    /sampling          → ProductionView          (admin + coordinator)
    /analytics         → redirect → /task-dashboard?tab=concepts
    /team              → TeamView                (admin + coordinator)
    /notifications     → NotificationsView       (admin + coordinator + designer)
    /profile           → ProfileView             (admin + coordinator + designer)
    /files             → FilesView               (admin + coordinator + designer)
    /salvedge          → SalvedgeView            (admin + coordinator)
    /system            → SystemView              (admin + coordinator)
    /scorecards        → ScorecardsView          (admin only)
    /scorecards/:id    → ScorecardDetailView     (admin + designer self-view)
    /kitting           → KittingQueueView        (admin + coordinator + deo)
    /kitting/:recordId → FullKittingFormView      (admin + coordinator + deo)
    /kanban            → redirect → /dashboard
    /briefing          → redirect → /brief/new
    /production        → redirect → /sampling
    /                  → RootRedirect
    *                  → NotFoundView (inside app shell)
  </Routes>
</BrowserRouter>

Role landing pages (roleHomePath):
  admin / coordinator / designer → /task-dashboard
  deo                            → /kitting
```

---

## 4. AUTHENTICATION FLOW

### 4.1 Login (`LoginView.tsx`)
```
User lands on /login
  ↓
Already authenticated? → redirect to roleHomePath(role)
  ↓
Split-screen layout: layered left panel (radial glow + dot grid + floating
orbs + "LINKD" wordmark + tagline) + right panel with form
  ↓
User enters email + password → handleSubmit()
  ↓
signIn(email, password) → supabase.auth.signInWithPassword()
  ↓
  ├─ Error → humaniseAuthError() → show inline error, clear password
  │   - "Invalid login credentials" → "Incorrect email or password"
  │   - "Email not confirmed" → "Please confirm your email..."
  │   - "rate limit" → "Too many attempts..."
  │   - Network error → "Unable to reach server"
  │
  └─ Success → successFlash animation (300ms green checkmark)
       ↓
     AuthProvider receives SIGNED_IN event → fetchProfile()
       ↓
       ├─ Profile exists → navigate to roleHomePath(role)
       └─ No profile → navigate to /onboarding

Inline "Forgot password?" flow:
  → Sends supabase.auth.resetPasswordForEmail()
  → User receives email with reset link → /reset-password
```

### 4.2 Password Reset (`ResetPasswordView.tsx`)
```
User arrives via email link at /reset-password (public route)
  ↓
Same split-screen layout as login
  ↓
Enter new password + confirm (eye toggles, min 8 chars)
  ↓
supabase.auth.updateUser({ password }) → success → auto-redirect to /login
```

### 4.3 Onboarding (`OnboardingView.tsx`)
```
User has auth account but NO profile row in the database
  ↓
Show "Your account is being set up" message
  ↓
Two actions:
  - "Check again" → refreshProfile() → if profile exists, redirect to roleHomePath
  - "Sign out" → signOut() → redirect to /login
  ↓
Auto-redirect effect: watches for profile to materialize
```

### 4.4 Route Protection (`ProtectedRoute.tsx`)
```
Every protected route goes through this 5-step guard:

Step 1: isLoading?          → <AppShellSkeleton />
Step 2: !isAuthenticated?   → <Navigate to="/login" />
Step 3: needsOnboarding?    → <Navigate to="/onboarding" />
Step 4: role not allowed?   → <AppLayout><AccessRestrictedView /></AppLayout>
                              ↑ URL stays put! Inline "you can't see this" panel
Step 5: OK                  → <AppLayout>{children}</AppLayout>
```

### 4.5 Root Redirect (`RootRedirect.tsx`)
```
User visits "/"
  ↓
Loading? → <AppShellSkeleton />
Not authed? → /login
No profile? → /onboarding
Has profile? → roleHomePath(profile.role)
  admin / coordinator / designer → /task-dashboard
  deo                            → /kitting
```

---

## 5. APP SHELL (What the user sees on every page)

### 5.1 Layout structure
```
┌──────────────────────────────────────────────────────────────┐
│ Sidebar (220px, always dark)  │  TopNav (56px, glassmorphism)│
│                               │──────────────────────────────│
│ ┌─────────────────────┐      │                              │
│ │ Logo + Brand        │      │  <main key={pathname}        │
│ │ Design Flow System  │      │   animate-fade-in>           │
│ └─────────────────────┘      │    {current view}            │
│                               │  </main>                    │
│ Dashboards       ← LANDING   │                              │
│ All Tasks / My Board         │                              │
│ Concepts                     │                              │
│ ─── Manage ───  (admin/coord)│                              │
│ Orders        (placeholder)  │                              │
│ Sampling                     │                              │
│ Salvedge                     │                              │
│ Files                        │                              │
│ Scorecards  (admin only)     │                              │
│ Settings    (Team sub-tab)   │                              │
│ ─── ─── ─── ───             │                              │
│ Notifications (with badge)   │                              │
│                               │                              │
│ [Theme Toggle]               │                              │
│ [User Avatar + Role]         │                              │
└──────────────────────────────────────────────────────────────┘

Mobile (<md): Sidebar hidden, slides in as overlay
              + MobileTabBar fixed at bottom (role-specific 4 tabs)
```

### 5.2 Per-role sidebar contents (`Sidebar.tsx → getNavGroups(role)`)
```
admin:
  Dashboards, All Tasks, Concepts
  ─── Manage ───
  Orders (placeholder), Sampling, Salvedge, Files, Scorecards, Settings
  Notifications

design_coordinator:
  Dashboards, All Tasks, Concepts
  ─── Manage ───
  Orders (placeholder), Sampling, Salvedge, Coordinator (My Tasks), Files, Settings
  Notifications

(Team Management lives inside Settings as a sub-tab — not its own sidebar entry.)

designer:
  Dashboards, My Board, Concepts, Files
  Notifications

deo:
  Kitting Queue
  Notifications
```

### 5.3 Sidebar (`Sidebar.tsx`) — collapsible + pinnable
```
- Pinned-expanded: 220px wide.   Pinned-collapsed: 64px slim icon rail.
- State: AppLayout `collapsed` boolean, persisted to localStorage["sidebar-collapsed"].
- Collapse toggle: PanelLeftClose / PanelLeftOpen button at the bottom of the rail.
- Hover-expand: while collapsed, hovering the rail expands an overlay
  (shadow + full 220px width) over the page WITHOUT reflowing content.
  Only pinning (the toggle) reflows the page.
- "LD" brand on the rail when collapsed; full "Logo + Brand" when expanded.
- bg-sidebar (dark in both themes); logo → roleHomePath(role).
- Active link: bg-primary text-white shadow-sm. Count badges shrink to a
  dot on the rail (NavRow `collapsed` prop hides labels via md:hidden).
- ThemeToggle above user block (ThemeToggle gained labelClassName so the
  text label hides cleanly when railed).
- User block: Radix DropdownMenu → Profile + Sign Out (ConfirmDialog).
- Mobile (<md): hidden by default, slides in as overlay with backdrop.
```

### 5.4 TopNav (`TopNav.tsx`) — thin utility strip
```
- 56px height, fixed top, glassmorphism (bg-background/80 backdrop-blur-xl).
- NO page title. Each page renders its own in-content heading; the topnav
  used to repeat it (Sampling Queue / Dashboards / …) and was removed.
- Left: greeting block (anchors the bar so it doesn't read as empty)
        - Line 1: "Good {morning|afternoon|evening}, {first_name}"
          (time-based; computed from new Date().getHours())
        - Line 2 (sm+): "Weekday, D Month YYYY"
- Right: ConnectionDot (sm+) · NotificationBell (badge + dropdown + chime)
         · Avatar (sm+) · Sign out (icon mobile, icon+label md+).
         Name is NOT shown again on the right — it's already in the greeting.
- Tracks sidebar collapse: fixed positioning ignores AppLayout's pl-*, so
  TopNav uses its own left value — md:left-[64px] when collapsed,
  md:left-[220px] when pinned-expanded, with a matching 200ms
  transition-[left]. AppLayout passes collapsed={collapsed} as a prop.
- Mobile: hamburger menu button on the far left.
```

### 5.5 Mobile bottom tab bar (`MobileTabBar.tsx`)
```
- Fixed bottom on <md screens
- Role-specific 4-tab layout:
  admin:      Home / All Tasks / Concepts / Alerts
  coordinator: Home / All Tasks / Sampling / Alerts
  designer:   Home / My Board / Concepts / Alerts
- active:scale-95 press feedback
```

### 5.6 Route transitions
```
<main key={pathname}> → React remounts on every navigation
  → animate-fade-in (0.2s ease-out, subtle Y-translate)
  → smooth transition between pages
```

---

## 6. PAGE-BY-PAGE FLOW

### 6.1 Dashboard Overview (`/dashboard` via redirect from `/home` — DashboardView.tsx)

**Purpose:** Overview page with KPIs, alerts, recent activity, and pipeline snapshot.

**Data fetched:** `useTasks()` + `useConcepts()` + `useProfiles()`

**Composed from sub-components:**
- `DashboardKpiCards` — 4 KPI cards with sparklines + trend pills
- `DashboardAlerts` — Collapsible alert banners (urgent/overdue/pending concepts)
- `DashboardTimeline` — Recent activity timeline
- `DashboardPipeline` — Animated pipeline status bar

**What it shows:**
```
Good morning, Harshali

┌─────────────┬──────────────┬──────────────┬──────────────┐
│ Active Tasks │ In Progress  │ Completed    │ Open Pool    │  ← KPI Cards
│     12       │      4       │   8 (67%)    │     3        │  (each with sparkline
│   ↑ 15%      │    ↑ 8%      │    ↑ 12%     │    ↓ 5%      │   + trend pill)
└─────────────┴──────────────┴──────────────┴──────────────┘

⚠ 2 urgent tasks  ⏰ 1 overdue  💡 3 pending concepts     ← Alert banners (clickable)

┌──── Recent Activity (2/3 width) ────┬── Quick Actions (1/3) ──┐
│ Floral Print — Trent — In Progress  │ + Create New Brief      │
│ Block Print — Reliance — Pool       │   All Tasks             │
│ Damask — Pantaloons — Done          │   Concepts              │
│ ...                                 │   Sampling Queue (2)    │
│                                     │   Team (6 designers)    │
│                                     ├─────────────────────────│
│                                     │ Pipeline                │
│                                     │ Pool       ████░░  3    │
│                                     │ In Progress ██████ 4    │
│                                     │ Review      ██░░░░ 2    │
│                                     │ Sampling    █░░░░░ 1    │
│                                     │ Done        ████████ 8  │
└─────────────────────────────────────┴─────────────────────────┘
```

**Logic:**
- Greeting varies by time of day ("Good morning/afternoon/evening, {firstName}")
- Admin sees "Open Pool" KPI; designer sees "Sampling" KPI
- Alert banners only show if count > 0; each links to the relevant page
- Recent tasks sorted by `updated_at` DESC, last 6
- Quick actions are role-aware (admin sees "Create Brief", designer doesn't)
- Pipeline bars are clickable, link to `/dashboard`

---

### 6.2 Task Dashboard (`/task-dashboard` — TaskDashboardView.tsx) — THE LANDING PAGE

**Purpose:** Task performance insights with KPIs, charts, leaderboards. This is the first page users see after login (admin/coordinator/designer).

**Data fetched:** `useTaskAnalytics(period)` + `useTasks()` + `useProfiles()` + `useDesignerCodes()`

**Admin/Coordinator view:**
```
┌────────────────────────────────────────────────────────────────┐
│ TaskHealthHero: throughput + on-time radial | headline insight │
│                 | active / urgent / overdue dock               │
├──────────┬──────────┬──────────┬───────────┐                  │
│Completed │ On-Time  │ Avg Days │  Created  │ ← KPI Cards      │
│   42     │   85%    │   3.2    │    48     │   (with sparklines│
│  ↑ 12%   │  ↑ 5%    │  ↓ 8%   │   ↑ 15%   │    + trend pills) │
├──────────┴──────────┴──────────┴───────────┘                  │
│ [Active in pipeline: 18] [Urgent: 3] [Overdue: 2] ← badges   │
├────────────────────────────┬───────────────────────────────────│
│ Volume bars (days/wks/mos) │ Pipeline health (status bars)     │
├────────────────────────────┼───────────────────────────────────│
│ WorkloadDistribution       │ AtRiskTasks (Overdue/Urgent tabs) │
│ (stacked bars per designer)│ (capped at 8 rows each)          │
├────────────────────────────┴───────────────────────────────────│
│ TaskLeaderboard (sortable, animated score bars)                │
│ Scoring: volume 30 + on-time 35 + speed 20 + active 15        │
└────────────────────────────────────────────────────────────────┘

Tab: [Tasks] [Concepts]   ← Concepts tab renders AnalyticsView content
```

**Designer view:**
```
MetricCard KPIs (unified with admin view — same component, designer-scoped data)
  + DesignerWorkloadSummary (scalable component for personal stats)
  + compact pipeline visualization
  + big score card (composite score + breakdown)
```

**Custom date ranges:** `useTaskAnalytics` and `useAnalytics` both accept an optional
`customRange: { from: Date, to: Date }` parameter, enabling DateRangePicker-driven
filtering across all dashboard surfaces.

**The "Concepts" tab** renders the full Concept Analytics (formerly `/analytics`):
```
Admin/coordinator:
  KPI cards (submitted/approved/rate/avg review time)
  → status badges (pending/in revision/approved/awaiting finalization)
  → hero row: DesignerConceptMatrix + TeamTargetHero
  → VolumeChart + PipelineHealth
  → ConceptFunnel (5-stage with conversion rates)
  → MdReviewPanel (admin only — review speed + counts)
  → DesignerLeaderboard (scoring: volume 30 + approval 35 + speed 20 + low revisions 15)
  → ConceptTurnaround (area chart with colored zones)

Designer:
  PersonalTargetRing (radial with milestone ticks at 1/2/3) + score card + personal KPIs
```

---

### 6.3 All Tasks / My Board (`/dashboard` — KanbanView.tsx)

**Purpose:** The main task management board. Where designers live day-to-day.

**Layout:** Tabbed wide-table (NOT traditional kanban columns)

**Data fetched:** `useTasks()` + `useProfiles()` + `useTaskMutations()`

**Status switcher = Pipeline Stepper** (`TaskPipelineStepper.tsx`): a slim single-row of **"glass
pills"** mounted **as the task table's header** (via `TaskTableSection`'s `headerSlot`) — it replaced
both the old tab pills and the per-section header. The connected pipeline is **Pool → In Progress →
Completed** (chevrons fill once the upstream stage has items); **Full Kitting is a standalone side pill
divided off to the right** (`sideStage` prop) — a separate data tab, NOT a pipeline stage. Clicking a
pill filters the table (same state as the old tabs). **No Done tab**: a `done` task (design finished,
awaiting fabric) stays in **In Progress**, badged a green **"Done"** with the **"Complete"** CTA;
adding fabric moves it to **Completed**. Legacy `todo`/`full_kitting` fold into In Progress.
(Dashboards still summarise done+completed together in one "Done" pipeline bar.)
(excluded: `approved` → concepts-only; `sampling` → own page at /sampling)

**Pool tab** shows an urgent/normal split (e.g. "1 urgent · 2 normal") so the queue makeup is
visible from any tab. Designers see a `<PoolSummaryCard>` + claim flow instead of the table (see §8).

**Column visibility:** the "Columns" toolbar button (`<ColumnVisibilityMenu>`) lets each user
choose which columns show; the choice is DB-backed per user (`user_preferences.visible_columns`,
`useUserPreferences`). The bulk-select checkbox and sticky **Action** column are always visible.
A **Reference Files** column renders clickable chips that open the brief's attached files via
signed URLs.

**Flow:**
```
1. Top bar: Search + Filter tabs + Designer filter (admin) + New Brief button
   │
   ├─ Filter tabs: [My Tasks] [All Tasks] [Urgent Only]
   │   - Designer default → "My Tasks" + status tab "In Progress"
   │   - Admin default → "All Tasks" + status tab "Pool"
   │   - "My Tasks" keeps Pool visible (so designers can claim)
   │
   └─ Search: matches against task_code, concept, client, designer name
              Non-matches DIM to 30% opacity (don't disappear — preserves spatial context)

2. Status tabs: horizontal row, each with count badge + colored dot
   │
   └─ Clicking a tab shows a wide sortable table for that status

3. Table (w-full; Description column is greedy so others hug content — no forced
   2800px min-width; horizontal scroll only when needed):
   │
   ├─ Date/Time, Designer, Concept (📎 chip + FK badge — both clickable to open
   │    files), Description, Reference (always-on), Party Name, Fabric
   ├─ WhatsApp Group, Message Date, Message Time, Assigned By, QTY
   ├─ Planned Deadline (was "Due Date"), Completion Timestamp, Completed, Pending
   ├─ Completed Late (key `started_late`; Yes = finished after planned_deadline)
   └─ Action (sticky right column)

4. Per-section sorting: each status tab has its own sort state
   - Sortable by: deadline (default), code, qty, priority
   - Click toggles direction (asc ↔ desc)

5. Row actions (context-aware by status):
   ┌──────────────┬────────────────────────────────────────────┐
   │ Pool         │ "Accept" → assigns to self, in_progress    │
   │              │ (designers use the Claim modal instead)    │
   │ In Progress  │ "Submit" → marks done* (FK gate check)     │
   │ Done         │ "Complete" → PostDoneModal collects fabric  │
   │              │ + designType + samplingRequired toggle      │
   │              │ → completed (auto-creates pending sample    │
   │              │ when samplingRequired=true)                 │
   │ Completed    │ —                                          │
   └──────────────┴────────────────────────────────────────────┘
   *Submit checks qty-completed AND isFullKittingBlocking(). FK gate: if the task
    requires full kitting but the coordinator hasn't uploaded it, markTaskDone
    returns an error — the task cannot move to 'done' until FK details are added.

   On "Complete": PostDoneModal collects fabric (required), designType (required),
   and a "Sampling Required" toggle (Switch). completeTask() receives all three;
   when samplingRequired=true, calls createPendingSample() to auto-insert a pending
   sample row (source='task_completion', sample_status='pending').

6. Row ⋮ menu: View / Edit (EditTaskDialog) / Full Kitting (KittingStageADialog) /
   Split (SplitTaskDialog, admin/coordinator only) / Return to Pool /
   Handoff to another designer / Delete (admin only, soft-delete)
   — role-gated, portal-rendered

7. Row click → opens TaskDetailDrawer (slide-in right panel)

8. Animation: tasks that just moved get highlight-pulse for 1.8s
   URGENT badge uses urgent-pulse animation on each mount

9. SPLIT TASK UI (split tasks surface throughout):
   - Pool table: split rows show "remaining/total"; a dimmed "Fully Assigned"
     ghost row appears when qty_remaining = 0 (task fully handed out)
   - My Tasks: fetches task_assignments where designer_id = me into
     myAssignmentTaskIds; those tasks appear even if tasks.assigned_to ≠ me
   - Ghost rows: immediately after claiming, the just-claimed task shows as a
     dimmed ghost row in the pool table for visual continuity

10. POOL SKIP + FK WARNING CHAIN (claim flow for designers):
    openClaimOrWarn(task) → checks:
    a) Can the designer skip this task? (is it the front-of-queue task or not?)
       If not → PoolSkipDialog ("Are you sure you want to skip?")
    b) Does the task need full kitting but FK isn't added yet?
       If yes → FK Warning Dialog (yellow non-blocking banner: "This task
       requires full kitting that hasn't been added yet")
    c) Then → ClaimTaskModal opens with full task details
    This chain works from: pool table rows, task detail drawer, pool summary cards.
    ClaimTaskModal also shows an FK warning banner (yellow) when applicable.

11. RETURN TO POOL (3 modes via ⋮ menu on in_progress tasks):
    ┌──────────────┬────────────────────────────────────────────┐
    │ reset        │ Wipe everything — task goes back to pool   │
    │              │ as if never claimed. qty_completed=0.      │
    │ split-pool   │ Preserve current work. Remaining qty goes  │
    │              │ back to pool (new split assignment created).│
    │ split-assign │ Preserve current work. Remaining qty is    │
    │              │ assigned to a specific other designer.      │
    └──────────────┴────────────────────────────────────────────┘

12. HANDOFF (transfer between designers):
    handoffTask(taskId, toDesignerId, carryForward) — transfers the task to
    another designer preserving qty_completed progress. Updates assigned_to,
    started_at, planned_deadline (new designer chooses). Notifies both designers.
```

**Keyboard shortcuts (via `useKeyboardShortcuts`):**
```
J       → Move highlight to next task
K       → Move highlight to previous task
Enter   → Open highlighted task in TaskDetailDrawer
Esc     → Close drawer if open, otherwise clear highlight
/ or F  → Focus search input
1-4     → Switch status tab (Pool / To-Do / In Progress / Done)
?       → Open KeyboardShortcutsDialog

Auto-disabled: when typing in inputs, when Radix dialog/sheet is open
```

**CSV Export:** ExportDialog with date range picker + column selection + preview count.

---

### 6.4 New Brief (`/brief/new` — BriefingView.tsx)

**Purpose:** Create a new task (design brief). Admin + coordinator + designer.

**Data fetched:** `useTaskMutations()` + `useClients()` + `useProfiles()` + `useConceptCategories()`

**Form sections** (see CLAUDE.md §12 for the load-bearing rules):
```
1. PARTY NAME        → LD / Job Work toggle (brief_type). LD = internal, no party.
                       Job Work → required party picker (jobWorkClients). No inline add.
2. GROUP*            → Dropdown from src/lib/whatsappGroups.ts (WhatsApp icon on flagged
                       entries). REQUIRED.
   REFERENCE FILES   → Optional multi-file picker beside Group (any type, 50 MB each).
                       Uploaded after task creation → files table (see §12.4 in CLAUDE.md).
3. MESSAGE date*+time*→ When the brief arrived on WhatsApp. BOTH REQUIRED.
4. DESIGN TYPE*      → Combobox from useConceptCategories() (DB-backed). REQUIRED.
   QUANTITY*         → Number input. REQUIRED (≥ 1).
5. DESCRIPTION*      → Textarea. REQUIRED.
6. ASSIGN TO*        → Dropdown, defaults to "Open Pool" (→ status='pool'); or a designer
                       (→ status='in_progress'). No blank option.
   ASSIGNED BY*      → Fixed roster dropdown + "Other" free-text. REQUIRED.
   PRIORITY          → Toggle: Normal / Urgent
7. FULL KNITTING REQUIREMENTS (collapsible toggle)
   ├─ Toggle switch + drag-drop upload (100 MB) + progress + preview + remarks
   └─ Optional inline 12-section knitting form (skips the DEO queue when filled)
```
(Fabric / Meters / Planned deadline / Due time were removed from the form — designers set
 their own deadline when claiming. `* = required`.)

**Submit flow:**
```
handleSubmit()
  ↓
validate() → checks all required fields → returns FormErrors
  ↓
If errors → scroll to first error, show inline messages
  ↓
createTask(input) from useTaskMutations()
  ↓
  ├─ Insert row into tasks table
  │   ├─ status = "pool" (if no assignee) or "in_progress" (if assigned)
  │   ├─ created_by = current user
  │   ├─ assigned_at + started_at stamped on assignment
  │   ├─ full_kitting fields set if toggle enabled
  │   └─ DB trigger auto-generates task_code (ORD-YYYY-NNNN)
  │
  ├─ Fetch designer letter from designer_codes table
  │   ├─ Has assignee → first letter of their code (e.g. "S")
  │   ├─ No assignee → "P" (for Pool)
  │   └─ Code not found → "X" (fallback)
  │
  ├─ Extract sequence from trigger-generated code
  │
  ├─ Build new code: DF {seq}-{letter}{MMYY}-{concept4}-{qty}M
  │   e.g. "DF 01-S0526-FLOR-200M"
  │
  └─ Update row with the new DF-format code
  ↓
If assigned → send notification to designer
  ↓
Show success screen:
  ├─ Green checkmark
  ├─ Task code in monospace (e.g. "DF 01-S0526-FLOR-200M")
  ├─ Badges: Full Kitting, Fabric, Mtr, WhatsApp
  └─ CTAs: "Create another" (resets form) or "View on dashboard"
```

**Dialog behavior:** Prevents accidental close (no outside click / escape dismiss).

---

### 6.5 Task Detail Drawer (`TaskDetailDrawer.tsx`)

**Purpose:** Side panel for viewing/editing a single task. Opens from kanban, sampling, or concepts.

**Data fetched:** `useTaskDetail(taskId)` → task + files + activity log in parallel;
`useTaskAssignments(taskId)` → split-task portions (if any)

**9+ Sections:**
```
1. HEADER         → Task code + status badge + concept + client + urgent flag
                    Edit button toggles INLINE EDIT MODE
                    "Briefed" date (created_at) + "Claimed" date (assigned_at) shown in header
                    FK GATE INDICATOR: if task requires_full_kitting && FK not yet added,
                    a warning banner shows "Full Kitting details needed before completion"
2. PIPELINE       → Visual progress indicator (status dots)
3. BRIEF DETAILS  → Collapsible section (collapsed by default). When collapsed, shows a compact
                     one-line summary (concept · party · qty · deadline). Expand to see full
                     2×3 grid: Fabric, Qty (with progress bar), Deadline (with days-left),
                     Due time, Priority, Assigned to
                     IN EDIT MODE: qty, mtr, deadline, priority, assignee, whatsapp,
                     description, notes — with Save/Cancel + change logging to task_logs
4. FULL KITTING   → (if requires_full_kitting) Image preview + notes + upload
                     Upload via KittingStageADialog (auto-closes FK coordinator to-do)
5. ASSIGNMENTS    → (if task has assignments / is_split) <AssignmentsPanel>:
   PANEL             Each row: designer avatar/name, qty_completed/qty_assigned + progress bar,
                     status badge, deadline.
                     DESIGNER ACTIONS on own row:
                       - InlineQtyStepper (click to edit progress → updateAssignmentQty)
                       - "Mark Done" button (assigned/in_progress → markPortionDone)
                       - "Complete" button (done → fabric select → completePortionWithFabric)
                     ADMIN ACTIONS:
                       - Per-row remove (X) with ConfirmDialog → removeAssignment
                     Footer: totalCompleted / task.qty overall progress
6. QTY TRACKER    → (if in_progress, non-split) Progress bar + stepper (+/-) + "Update" button
                     Auto-advances: qty=total → full_kitting; qty>0 → in_progress
6b. COMPLETION    → (if done) "Completion Details Needed" prompt + button → PostDoneModal
                     PostDoneModal collects: fabric (required), designType (required),
                     samplingRequired toggle (Switch). On save → completeTask() which also
                     calls createPendingSample() when sampling flagged.
                     (if completed) read-only panel: fabric / filled-by name / filled-at
7. LINKED SAMPLES → (if task has linked samples) Shows samples auto-created from this task
                     via getSamplesForTask(). Displays party_name, fabric, design_type, status.
8. DESIGN FILES   → Drag-drop upload zone + grid of file tiles (thumbnail + download)
                     Upload to design-files bucket → {uid}/tasks/{task_id}/{filename}
                     Client-side image compression applied before upload
9. DISCUSSION     → Comment thread (useTaskComments). Author avatar/name/role per comment.
                     Edit/delete own comments. Admin/coordinator can moderate (delete any).
                     2000 char limit with counter. Supabase Realtime subscription for
                     live updates (INSERT events on task_comments).
10. ACTION FOOTER → Context-aware buttons per status:
                     Pool → "Accept Task" (runs through skip/FK warning chain)
                     In Progress → "Mark Done" (FK gate check — blocked if FK missing)
                     Done → "Complete" (PostDoneModal with fabric + designType + sampling)
                     Completed → completion summary
                     Split tasks: "Split Task" button (admin/coordinator, opens SplitTaskDialog)

DELETE button (admin only) → ConfirmDialog → soft-delete
```

---

### 6.6 Concepts (`/concepts` — ConceptsView.tsx)

**Purpose:** Concept submission and approval workflow. Admin + coordinator + designer.

**Data fetched:** `useConcepts()` + `useTasks()` + `useProfiles()`

**Role-specific dashboard at top (ConceptDashboard.tsx):**
```
Designer (DesignerConceptDashboard):
  Monthly target tracker with recharts RadialBarChart
  Progress toward MONTHLY_TARGET = 3 concepts/month
  Days remaining, on-track/behind indicator
  Warning banners at day 7 / day 24

Coordinator (CoordinatorConceptDashboard):
  Team overview with concept counts per designer
  At-risk alerts

Admin (AdminConceptDashboard):
  4 KPI cards + pending-review queue with quick-action buttons
```

**Designer Work Board (DesignerWorkBoard.tsx):**
```
Groups concepts by lifecycle stage:
  Ready / In Progress / On Hold / Changes Needed / In Revision / Completed
  Inline transition buttons per group
```

**Two data sections:**

```
SECTION 1: Concept-track briefs
  Tasks where concept field = "Concepts"
  Simple table: Title | Client | Fabric | Designer | Deadline | Status
  Row click → opens TaskDetailDrawer

SECTION 2: Workflow table (mirrors Google Sheet)
  22 columns across 5 stage groups:

  ┌── Concept Creation (blue) ──┬── Approval (purple) ──┬── Completion (green) ──┬── Final (green/70) ──┬── Aggregates ──┐
  │ Start                       │ Planned               │ Planned                │ Planned              │ Approved #     │
  │ Designer                    │ Actual                 │ Actual                 │ Actual               │ Remarks        │
  │ Concept                     │ Status                 │ Status                 │ Status               │                │
  │ Description                 │ Delay                  │ Delay                  │ Delay                │                │
  │ Party Name                  │                        │                        │                      │                │
  │ Assigned By                 │                        │                        │                      │                │
  └─────────────────────────────┴────────────────────────┴────────────────────────┴──────────────────────┴────────────────┘
```

**Status filter tabs:** All, Pending, Approved, Rejected, Revision — with auto-calculated counts.

**Concept submission flow:**
```
User clicks "Submit concept" → SubmitConceptDialog opens
  ↓
Fill form: title, description (min 50 chars + char counter), start_date,
           priority, designer, client, assigned_by, file upload (multi-file)
  ↓
Form draft auto-persisted to localStorage via useFormDraft (300ms debounce)
  ↓
Upload file(s) to sample-files bucket → {uid}/concepts/{timestamp}-{random}.{ext}
  (client-side image compression applied first)
  ↓
submitConcept() → INSERT into concepts table
  ├─ DB trigger auto-generates concept_code (C-YYYYMMDD-XXXX)
  ├─ DB trigger sets md_planned_date = created_at + 1 day
  ├─ concepts.files JSONB stores array of storage paths
  ├─ Tries extended payload first (0012 fields); falls back to base if columns missing
  └─ Schema fallback: retries without `files` column on pre-0018 databases
  ↓
Send notification to all admins
```

**Concept review flow (4-stage, role-gated):**
```
Stage 1 — Submission:
  Designer submits concept → md_status='pending'

Stage 2 — MD Approval (admin/super_admin ONLY — NOT coordinator):
  Admin/super_admin clicks a concept row → ConceptDetailDrawer opens
    ↓
  Shows: code, title, image, submitter, description, timeline, review notes
  ConceptWorkflowStage shows 5-stage progress bar:
    Submitted → Review → Decision → Finalize → Complete
    ↓
  Reviewer chooses one:
    ├─ APPROVE  → md_status='approved'
    │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now, designer_planned_date=today+4
    │   └─ Notification sent to submitter
    │   └─ MD review event logged to completion_history JSONB
    ├─ REJECT   → md_status='rejected'
    │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now
    │   └─ Notification sent to submitter
    └─ REVISION → md_status='revision_requested' (mandatory notes)
        └─ DB trigger: md_actual_date=now, md_reviewed_at=now
        └─ Notification sent to submitter
        └─ completion_history JSONB tracks revision cycles

Stage 3 — Designer Completion (designer-only actions):
  After approval, designer has +4 days
    ↓
  Designer clicks "Mark Finalized" → designer_actual_date = today
    ↓
  Re-submission after revision:
    resubmitConcept → appends to completion_history JSONB
    → DesignerResubmitNote allows designer to add resubmission notes
    → Notification sent to all admins

Stage 4 — Final Approval (admin/super_admin + coordinator):
  Final review/sign-off on completed concepts

Concept editing by designers:
  Designers can edit their own concepts until MD approves (editConcept mutation
  in useConcepts). Once md_status leaves 'pending', editing is locked.

Editable feedback notes:
  EditableFeedbackBlock component allows in-place editing of review/feedback
  text on concept detail views.
```

---

### 6.7 Sampling Hub (`/sampling` — ProductionView.tsx)

**Purpose:** Full sampling management with stats, CRUD, charts. Admin + coordinator only.

**Data fetched:** `useSamples()` + `useTasks()` + `useProfiles()` + `useTaskMutations()`

**Tabs:** Samples | Pending Samples | Dashboard | Kitting

**Sections:**
```
1. STAT CARDS (admin only)
   ├─ Today (samples logged today)
   ├─ Month (monthly count)
   ├─ Customers (unique party names)
   └─ Pending (incomplete samples)

2. FILTERS
   ├─ Customer search (ILIKE)
   ├─ Status filter: All / Pending / Completed
   └─ Date range filter

3. SAMPLES TABLE (full CRUD via SamplingFormDialog)
   ├─ Columns: Party Name, Fabric, Qty, Status, Date, Actions
   ├─ Row ⋮ menu: Edit / Delete
   ├─ Add new: SamplingFormDialog (Dialog-based, center dialog NOT drawer)
   │   └─ Full Form mode (all fields)
   │   └─ Batch entry (party_name persists between entries)
   │   └─ File uploads (5x100MB to sample-files bucket)
   │   └─ Managed dropdowns: Requirement, Sampling Done By, Fusing Operator
   │       (from useSamplingDropdowns hook → sampling_dropdowns table)
   └─ TaskPicker: search-as-you-type to link samples to tasks
   NOTE: "Completed Samples" tab uses excludePendingTaskSamples=true filter
   to hide pending auto-created samples (those live in Pending Samples tab)

4. PENDING SAMPLES TAB (<PendingSamplesPanel>)
   ├─ Shows samples auto-created by task completion (source='task_completion',
   │   sample_status='pending'). Created by createPendingSample() when a
   │   designer completes a task with samplingRequired=true.
   ├─ Each row shows: party_name (resolved at write time — see below), fabric,
   │   design_type, linked task_code, creation date
   ├─ Party name resolution (createPendingSample): two plain queries (task → client),
   │   NOT a nested embed (the embed returns a null client → blank party). LD briefs
   │   (no client_id) resolve the default LD party from the clients table (LD group
   │   "LD Silk Mills") via resolveDefaultLdParty() — backend-driven, never hardcoded
   ├─ Actions: "Process" (→ opens SamplingFormDialog pre-filled for editing,
   │   changes sample_status to 'in_progress'), "Delete" (with ConfirmDialog)
   └─ Dedup: unique index (task_id, COALESCE(quality,''), COALESCE(design_type,''))
      prevents duplicate auto-samples per task+fabric+designType combination

5. TASKS IN SAMPLING STAGE
   ├─ Tasks WHERE status = 'sampling'
   ├─ "Mark Done" button → updateTaskStatus(id, 'done')
   └─ Designers see only their own; admins see all

6. BAR CHART
   └─ Samples per day (last 14 days, recharts BarChart)
```

**Sampling automation flow (end to end):**
```
Designer completes task (PostDoneModal):
  ↓ fabric (required) + designType (required) + samplingRequired toggle
  ↓
completeTask(taskId, { fabric, designType, samplingRequired: true })
  ↓
task.status → 'completed', stamps completion fields
  ↓
createPendingSample({ taskId, fabric, designType, createdBy, summary }) called automatically
  ↓
  ├─ Resolves party + uid via two plain queries (task → client). LD briefs resolve the
  │   default LD party from the clients table (resolveDefaultLdParty) — never hardcoded
  ├─ Dedup check: if sample already exists for this (task_id, fabric, design_type) → skip
  ├─ Inserts sample row: source='task_completion', sample_status='pending',
  │   party_name, quality=fabric, design_type=designType
  ├─ On a real insert failure (not the 23505 dedup) → toasts the error (no silent failures)
  └─ Sets task flags: sampling_required=true, sampling_flagged_at, sampling_flagged_by
  ↓
Sample appears in Pending Samples tab for coordinator to process
  ↓
Coordinator clicks "Process" → pre-filled SamplingFormDialog → edits/completes
```

---

### 6.8 Team Management (`/team` — TeamView.tsx)

**Purpose:** Full team CRUD. Admin + coordinator only.

**Data fetched:** `useProfiles()` + `useDesignerCodes()`

**Features:**
```
1. ADD USER
   ├─ Email + full name + role selection
   ├─ supabase.auth.signUp() creates auth user
   ├─ DB trigger (handle_new_user) auto-provisions profile row
   └─ Notification sent to new user

2. EDIT NAME
   └─ Inline edit with save/cancel

3. ROLE MANAGEMENT
   ├─ Inline role dropdown with confirmation dialog
   ├─ Role change notifies the affected user
   └─ Admin + coordinator can change roles

4. SOFT-DELETE / DEACTIVATE
   ├─ Sets is_active = false + deactivated_at + deactivated_by
   ├─ Deactivated users hidden from all hooks by default
   │   (useProfiles filters is_active=false unless includeInactive=true)
   └─ Deactivated designers drop from leaderboards immediately

5. DESIGNER CODE MANAGEMENT
   ├─ Assign/remove letter codes per designer
   └─ Shows avatar + name + current codes
```

---

### 6.9 Full Kitting Workflow (`/kitting` — 2-stage pipeline)

**Purpose:** Two-stage handover: Coordinator photographs paper kitting form → DEO digitizes it into a structured web form.

**Stage A — Coordinator uploads the form photo:**
```
Trigger: ⋮ menu → "Full Kitting" on /dashboard
  ↓
Opens KittingStageADialog
  ↓
Coordinator uploads image/PDF of paper form
  → file lands in sample-files/{uid}/kitting/{task_id}-{ts}-{name}
  ↓
initiateKitting() → inserts full_kitting_details row
  ├─ image_url set
  ├─ data_entry_status = 'pending_deo'
  └─ tasks.requires_full_kitting flipped to true
  ↓
Notification sent to all DEOs: "New kitting form ready to digitize"
```

**Stage B — DEO digitizes the form:**
```
DEO lands on /kitting (KittingQueueView)
  ↓
Reads from deo_kitting_queue view (joins full_kitting_details × tasks × clients)
  ↓
Queue tab: pending_deo + in_progress records
  Each card: form photo thumbnail + task context + priority pill + "Open form"
  ↓
"Open form" → /kitting/:recordId (FullKittingFormView)
  ↓
Side-by-side layout: image pane (sticky desktop, accordion mobile) + 12-field form

FullKittingFormFields — 12 sections:
  1. Fabric          7. Garment
  2. Width           8. Motive size
  3. Design count    9. Concept
  4. Type            10. APC
  5. Theme           11. Additional
  6. Background      12. Priority

Plus header: Party / Date / Day / Channel / Assigned By / Received By

Draft auto-saved to localStorage (key: kitting-form-draft:{recordId})
  ↓
Submit → submitKittingForm()
  ├─ Writes form_payload JSONB + denormalized party_name / form_date / priority / completed_by
  ├─ DB trigger auto-flips data_entry_status → 'completed' + stamps completed_at
  └─ Confetti animation on success
  ↓
Notification to admin + coordinator: "Kitting form digitized — ready to review"
```

**Stage C — Coordinator review:**
```
Coordinator re-opens the row's Full Kitting menu → dialog shows status=Completed
  + thumbnail + "Open digital form" link
```

**Completed tab:** CompletedKittingPanel — read-only table with search + CSV export.

**Priority mapping** (`lib/kitting.ts`):
```
Display string     ↔  DB enum (kitting_priority)
"Very Urgent"      ↔  very_urgent
"2 Days"           ↔  2_days
"3 Days"           ↔  3_days
"4 Days"           ↔  4_days
"5 Days"           ↔  5_days
```

---

### 6.10 Designer Scorecards (`/scorecards` — admin only)

**Grid landing page (ScorecardsView.tsx):**
```
4-stat banner (MetricCard replaces KpiCard): designers / avg composite / on track / needs support
  + designer dropdown (replaces top-performer chip) for quick navigation
  + search
  + DateRangePicker for custom date range filtering
  + export is icon-only (no label text)
  ↓
Designer cards grid:
  Each card: composite score + verdict pill (Top/Solid/Developing/Needs Support)
             + concept/task mini blocks + insights count
  ↓
Click a card → navigates to /scorecards/:designerId
```

**Full-page scorecard (ScorecardDetailView.tsx):**
```
Data: useDesignerScorecard(designerId, period)
Date-range filter: 7d / 30d / 90d / 6mo / 12mo / Custom (from→to)

Sections (top → bottom):
1. Reliability Hero
   - Composite gauge + on-time / throughput / consistency bars
   - Tiered: STRONG (80+) / SOLID (60-80) / DEVELOPING (40-60) / NEEDS SUPPORT (<40)

2. 5 KPI tiles: Scheduled · Completed · On-Time % · Avg Delay · Best Streak

3. Concept Performance + Task Performance pair
   - Donut + 4-bar score breakdown + section pill + avg footnote with team-avg delta

4. 6-Month Momentum area chart (concepts approved + tasks completed)

5. Calendar heatmap (36×36 cells, Mon-first)
   - Click any cell → drill-in panel listing all that day's events
   + Composition donut (140px + stacked bar + verdict)
   + Weekly Throughput sparkline (12 weeks)

6. Trend (6mo on-time % bars) + Day-of-week pattern + Cycle Time histogram

7. Priority breakdown donut + Vs Team comparison bars + Concept Pipeline funnel

8. Activity timeline + Insights (rule-based, strengths/watchouts capped at 4)

Admin actions: Export CSV + Send Feedback (inline) + Open Team
Designer self-view: hides rank pill + admin actions
```

---

### 6.11 File Browser (`/files` — FilesView.tsx)

**Purpose:** Browse files across all 3 storage buckets. Admin + coordinator + designer.

**Data fetched:** `useFiles()`

**Features:**
```
- Grid / list toggle
- Bucket filter pills: design-files, sample-files, task-files
- Search
- Image thumbnails on hover
- Download via signed URL (1h TTL)
- Delete with confirmation
```

---

### 6.12 Notifications (`/notifications` — NotificationsView.tsx)

**Purpose:** Full notification feed with filtering and bulk actions.

**Data fetched:** `useNotifications()`

**Features:**
```
- Type filters: info / warning / urgent / success
- Date grouping: today / yesterday / this week / older
- Pagination (via usePagination)
- Mark individual as read
- Mark all as read
- Click notification → navigate to linked page
```

---

### 6.13 Profile (`/profile` — ProfileView.tsx)

**Purpose:** User profile management. All roles.

**Features:**
```
- Avatar upload (to avatars bucket)
- Name editing
- Password change (eye toggles, min 8 chars validation)
- Appearance section: 3 theme cards (Light / Dark / System)
- Designer code display (read-only)
```

---

### 6.14 System Admin Hub (`/system` — SystemView.tsx)

**Purpose:** Admin hub with tabbed management interface. Admin + coordinator only.
Concept Categories / Fabrics / Dropdowns are now **coordinator-accessible** (not
admin-only) — both nav gating and the per-tab render check use `isAdminOrCoordinator`.

**Tabs:**
```
1. App Info (AppInfoTab)
   - User counts, table row counts
   - Environment info (Vite, React, TS versions)
   - Theme status

2. Concept Categories (ConceptCategoriesTab)
   - Lookup management for concept_categories table
   - Add / edit name / toggle active / delete
   - Uses LookupSection component

3. Fabrics (FabricsTab)
   - Lookup management for fabrics table
   - Same UI pattern as Categories

4. Dropdowns (DropdownsTab)  ← see §16 of CLAUDE.md
   - Manages every form dropdown roster in one place. Two-level picker:
     context pills (Tasks / Full Knitting / Sampling) → dropdown chips → one
     LookupSection editor at a time.
     • Tasks        → Assigned By (assigned_by_options, context='task')
     • Full Knitting→ Assigned By + Received By (received_by_options)
     • Sampling     → Assigned By + Requirement + Sampling Done By + Fusing
                      Operator (sampling_dropdowns, field-scoped)

5. Clients / Party Name (ClientManagementTab)
   - Client CRUD: add, edit name, merge duplicates, delete
   - LD / Job Work pill tabs, search + pagination

6. Designer Codes (DesignerCodesTab)
   - Assign/remove letter codes per designer
   - Shows avatar + name + current codes

7. Storage (StorageTab)
   - File counts per bucket
   - On-demand size scan
   - "Empty bucket" per bucket — permanently deletes every storage object in it
     (recursive walk + batched .remove(), ConfirmDialog gated). Note: the Danger
     Zone's "Clear all data" only wipes the `files` TABLE rows (metadata); the
     actual storage objects are removed here.

8. Danger Zone (DangerZoneTab)
   - Two-stage destructive data clearing:
     Stage 1: ConfirmDialog (variant danger/warning)
     Stage 2: modal with "type DELETE" text input
   - Per-table clear with live row counts
   - FK-safe ordering
   - Nuclear "Clear All" option
   - Protected tables (never deleted): profiles, auth.users, designer_codes
```

---

### 6.15 Salvedge (`/salvedge` — SalvedgeView.tsx)

**Purpose:** Challan-based fabric distribution records. Admin + coordinator only.

**Data fetched:** `useSalvedge(filters)`

**Features:**
```
- Full CRUD: createSalvedge, updateSalvedge, deleteSalvedge
- Filters: designerId, dateRange, search
- Designer-scoped view (designers see their own)
```

---

## 7. TASK CODE GENERATION LOGIC

The most complex piece of business logic in the frontend:

```
Format: DF {NN}-{D}{MMYY}-{CONC}-{QQQ}M

  DF    → Fixed prefix
  NN    → Per-year sequence (min 2 digits), from DB trigger counter
  D     → Designer letter from designer_codes table:
            - Assigned designer → first letter of their code (e.g. "S", "K")
            - Unassigned (pool) → "P"
            - Code not found → "X"
  MMYY  → Month + year at creation (e.g. "0526" = May 2026)
  CONC  → First 4 alpha chars of concept name, uppercased (e.g. "FLOR")
  QQQ   → Quantity in meters, rounded
  M     → Fixed suffix (meters)

Examples:
  DF 01-S0526-FLOR-200M   → 1st task of year, designer S, May 2026, Floral, 200m
  DF 09-P0526-CONC-2M     → 9th task, unassigned pool, Concepts, 2m
  DF 42-K1226-DAMA-50M    → 42nd task, designer K, Dec 2026, Damask, 50m

Pool code regeneration:
  When a pool task (P code) is assigned to a designer:
    1. Detect pool code via isPoolCode() regex
    2. Fetch new designer's letter
    3. Rebuild code with same sequence but new letter
    4. Update task row
  Non-pool codes are NEVER regenerated (stable through reassignment)
```

---

## 8. STATUS TRANSITION RULES

```
Pipeline flow:
  pool → in_progress → done → completed

  - 'done'      = design work finished, awaiting completion details (fabric + mtr) — intermediate.
  - 'completed' = fully closed — terminal (enum value added in migration 0039).
  - Assigned tasks skip 'todo' and go straight to 'in_progress'.
  - 'todo' / 'full_kitting' / 'approved' / 'sampling' enum values still exist but are
    not entered by the app's main flow; the board folds them into In Progress / Done.

Pool claim (designers) — see §6.3 + ClaimTaskModal:
  - getNextPoolTasks(limit) → top pool tasks, sorted urgent-first, then oldest
    requirement_received_at, then oldest created_at (comparePoolFifo). The claim modal
    calls it with limit=1 and shows ONLY the single front task — no choice / no cherry-picking.
  - The claim form shows that task's full details + reference files, and asks planned
    deadline (required) + fabric (optional; required only at completion).
    claimPoolTask(taskId, deadline, fabric?) → busy-check (one in_progress task max),
    optimistic lock on status='pool', regenerates task_code, sets assigned_to/at +
    started_at + planned_deadline + optional fabric, status='in_progress'. Lost race →
    "already claimed by {name}" message.
  - tasks is in the supabase_realtime publication (0041) so claims propagate live.

Forward transitions:
  pool → in_progress (claim/assign) → done (markTaskDone) → completed (completeTask)

Backward transitions (admin/coordinator ONLY):
  Any status can move backward (e.g. for revisions)

Full Knitting gate (FK gate):
  - Both markTaskDone() and completeTask() check:
    requires_full_kitting && !full_kitting_image_url && !full_kitting_details_added
  - If FK is required but not added → mutation is BLOCKED with error message
  - Designer CAN claim and work, but CANNOT complete until coordinator adds FK
  - Source of truth: isFullKittingBlocking(task) in lib/taskHelpers.ts

Completion tracking:
  - markTaskDone(taskId) → status='done', stamps completed_at + delay_days, notifies.
    Does NOT auto-open the completion modal — the task just lands in Done.
    Checks FK gate before allowing.
  - completeTask(taskId, {fabric, designType?, samplingRequired?}) → status='completed',
    stamps completion_fabric / _filled_by / _filled_at (0040). Optimistic lock on
    status='done'. Checks FK gate before allowing. Triggered by "Complete":
    opens PostDoneModal which collects fabric (required), design type (required),
    and "Sampling Required?" toggle (optional, default off).
  - When samplingRequired=true → completeTask() calls createPendingSample() which
    auto-inserts a sample row (source='task_completion', sample_status='pending')
    and notifies admin/coordinators. Deduped by (task_id, fabric, design_type).
  - MTR field was REMOVED from the completion flow. Only fabric + design type remain.

Split task completion:
  - Each designer's portion completes independently via completePortionWithFabric()
  - DB trigger recalc_task_from_assignments() rolls up: parent task becomes
    'completed' only when ALL portions are completed
  - Each portion can create its own pending sample (different fabric/design_type
    yields separate samples via the composite unique index)

Return to pool (3 modes — ReturnToPoolDialog):
  - reset:        Delete all assignments, clear progress, status→pool, code→"P"
  - split-pool:   Preserve designer's completed work as a task_assignment, return
                  remaining qty to pool (status→pool, assigned_to→null)
  - split-assign: Preserve completed work + assign remaining to a specific designer
                  (status stays in_progress, both designers have assignments)

Handoff (admin/coordinator):
  - handoffTask(taskId, target, note): Transfer to another designer or back to pool
  - Preserves qty_completed, fabric, deadline, task_code (code stays stable)
  - Stores carry_forward_note, carry_forward_from, carry_forward_at for audit trail
  - Requires a carry-forward note (mandatory)

DB trigger side-effects:
  - status → in_progress: stamps started_at
  - Any status change: appends to task_logs (audit trail)
  - INSERT/UPDATE/DELETE on task_assignments → recalc_task_from_assignments()
    rolls up qty_completed, qty_remaining, is_split, and parent status
```

---

## 9. PERMISSION MODEL

### 9.1 Frontend (`lib/permissions.ts`)
```
isSuperAdmin(role)         → role === "super_admin"
                              Includes ALL admin permissions + Danger Zone access
isAdmin(role)              → role === "admin" || role === "design_coordinator"
                              ↑ Admin + coordinator are NOW EQUIVALENT for most operations
isAdminOrCoordinator(role) → role === "admin" || role === "design_coordinator"
                              (alias for isAdmin — same logic)
isCoordinator(role)        → role === "design_coordinator"
isDesigner(role)           → role === "designer"
isMdRole(role)             → role === "admin" || role === "super_admin"
                              For Stage 2 concept MD review ONLY — coordinators excluded

Capability aliases:
  canReviewConcepts        → isAdmin (admin + coordinator) — Stage 4 final approval
  canViewConcepts          → admin + coordinator + designer (all 3 main roles)
  canSubmitConcept         → admin + coordinator + designer
  canChangeUserRoles       → isAdmin (admin + coordinator)
  canManageTaskLifecycle   → isAdminOrCoordinator (soft-delete, revert, split, handoff)
  canCreateBriefs          → admin + coordinator + designer (all 3 main roles)
  canLogSampling           → isAdminOrCoordinator
  canMoveTaskBackward      → isAdminOrCoordinator
  canAccessDangerZone      → isSuperAdmin ONLY (not admin, not coordinator)
  canSplitTask             → isAdminOrCoordinator (split pre-assignment)
  canHandoffTask           → isAdminOrCoordinator (transfer between designers)
```

### 9.2 Backend (Supabase RLS)
```
Helper functions:
  auth_role()              → SECURITY DEFINER, returns user_role for current user
  is_admin()               → auth_role() = 'admin'
  is_admin_or_coordinator() → auth_role() IN ('admin', 'design_coordinator')
  is_deo()                 → auth_role() = 'deo'

Per-table RLS summary:
  ┌──────────────────────────┬─────────┬─────────────┬──────────┬─────┐
  │ Table                    │ Admin   │ Coordinator │ Designer │ DEO │
  ├──────────────────────────┼─────────┼─────────────┼──────────┼─────┤
  │ profiles                 │ full    │ full        │ read+self│ read│
  │ clients                  │ CRUD    │ CRUD        │ read+ins │  —  │
  │ concept_categories       │ CRUD    │ read        │ read     │  —  │
  │ fabrics                  │ CRUD    │ read        │ read     │  —  │
  │ concepts                 │ full    │ read        │ own CRUD │  —  │
  │ tasks                    │ full    │ full        │ limited  │  —  │
  │ task_logs                │ read+ins│ read+ins    │ read     │  —  │
  │ files                    │ CRUD    │ CRUD        │ own CRUD │  —  │
  │ sampling_logs            │ full    │ full        │ read     │  —  │
  │ designer_codes           │ CRUD    │ read        │ read     │  —  │
  │ samples                  │ CRUD    │ read        │ own CRUD │  —  │
  │ salvedge_records         │ CRUD    │ read        │ own CRUD │  —  │
  │ notifications            │ ins+del │ ins+read    │ own r/w  │ own │
  │ full_kitting_details     │ full    │ update      │ read+ins │ upd*│
  │ task_comments            │ full    │ full        │ own CRUD │  —  │
  └──────────────────────────┴─────────┴─────────────┴──────────┴─────┘
  * DEO: can update payload/status/priority on records that already have an image

  task_logs has no UPDATE/DELETE policies → effectively append-only audit trail.
```

---

## 10. NOTIFICATION SYSTEM (3-layer)

```
Layer 1 — DB table + RPC (notifications + notify_user / notify_users_batch):
  Table cols: user_id, title, message, type (info/warning/urgent/success), link, is_read
  RLS:        SELECT own-only · INSERT any authenticated · UPDATE own-only · DELETE admin
  RPCs:       notify_user(p_user_id, p_title, p_message, p_type?, p_link?) → notification id
              notify_users_batch(p_user_ids[], p_title, p_message, p_type?, p_link?) → void
              Both are SECURITY DEFINER so any signed-in caller can dispatch a notification
              without the table policy being widened beyond "authenticated".
  Migrations: 0013 (table) · 0034 (broaden insert policy) · 0035 (RPC functions)

Layer 2 — Sending helpers (lib/notifications.ts):
  sendNotification(userId, title, msg, type?, link?)         → calls notify_user RPC
  sendNotificationToMany(userIds, title, msg, type?, link?)  → Promise.allSettled loop
                                                                of individual notify_user calls
  sendNotificationToRole(role, title, msg, type?, link?)     → fetches userIds first, then
                                                                calls sendNotificationToMany

  Helpers return { data, error } (never throw). On error they also toast and console.error.
  Never insert into notifications from the client directly — always go via these helpers.

Layer 3 — Realtime + sound (useNotifications hook):
  Subscribes to Supabase Realtime postgres_changes INSERT events
  filtered to user_id → auto-prepends new notifications without refetch
  ↓
  Web Audio chime: A5 (880Hz) + D6 (1174Hz) two-tone sine wave
  Tab title flash for 10 seconds
  ↓
  Pulse animation on NotificationBell badge

Layer 3.5 — Client-side concept reminders (useConceptReminders):
  Mounted once inside AppLayout (designers only). On three checkpoint days per
  month, checks if the designer has met escalating concept targets:
    Day 8  → need ≥ 1 concept submitted this month
    Day 17 → need ≥ 2 concepts
    Day 24 → need ≥ 3 concepts
  If below target, sends a "Concept Submission Reminder" warning notification
  via notify_user RPC. Deduped: skips if a reminder with the same title already
  exists for today. Runs once per session (useRef guard).

Where notifications fire from:
  ┌───────────────────────────────┬──────────────────────────┐
  │ Trigger                       │ Recipient                │
  ├───────────────────────────────┼──────────────────────────┤
  │ Task assigned                 │ Designer                 │
  │ Task self-claimed             │ Previous assignee        │
  │ Task marked done              │ Designer + admins + coords│
  │ Concept submitted             │ All admins               │
  │ Concept reviewed              │ Submitter                │
  │ Final approval                │ Submitter                │
  │ Revision feedback             │ Submitter                │
  │ Concept re-submitted          │ All admins               │
  │ Role changed                  │ Affected user            │
  │ Email / password changed (UI) │ Affected user            │
  │ Kitting form uploaded (A)     │ All DEOs                 │
  │ Kitting form digitized (B)    │ Admin + coordinator      │
  │ Concept reminder (Day 8/17/24)│ Designer (client-side)   │
  └───────────────────────────────┴──────────────────────────┘

UI surfaces:
  - NotificationBell in TopNav (dropdown with 15 recent, unread badge capped at 9+)
  - /notifications full page (type filters, date grouping, pagination)
```

---

## 11. DATABASE SCHEMA (tables + internal)

> Managed-dropdown lookup tables (all share `id, name, sort_order, is_active`; admin +
> coordinator RLS): **`assigned_by_options`** (0045; `context` col added 0047 —
> task/full_kitting/sampling), **`received_by_options`** (0049), **`sampling_dropdowns`**
> (0051; field-scoped: requirement/sampling_done_by/fusing_operator). See CLAUDE.md §16.
> Also `user_preferences` (0040, per-user `visible_columns`).


```
┌─────────────────┐     ┌──────────┐     ┌─────────────────┐
│    profiles      │←────│  tasks   │────→│    clients       │
│  (5 roles)       │     │ (pipeline│     │  (party_name,    │
│  id, full_name,  │     │ + qty    │     │   client_group)  │
│  role, avatar,   │     │ tracking │     └─────────────────┘
│  is_active       │     │ + kitting│     ┌─────────────────┐
└────────┬─────────┘     │ + compl. │     │concept_categories│
         │               │ + split  │     │ (lookup, 0011)  │
         │               │ + sampling│    └─────────────────┘
         │               └────┬─────┘
         │                    │            ┌─────────────────┐
         │               ┌────┴─────┐     │    fabrics       │
         │               │task_logs │     │ (lookup, 0011)  │
         │               │(audit    │     └─────────────────┘
         │               │ trail)   │
         │               └──────────┘     ┌─────────────────┐
         │                                │ task_assignments │
         │               ┌──────────┐     │ (split portions, │
    ┌────┴──────────┐    │  files   │     │  0060+)          │
    │  concepts      │    │(task     │     └─────────────────┘
    │ (MD review     │    │ uploads) │
    │  workflow,     │    └──────────┘     ┌─────────────────┐
    │  files JSONB,  │                    │ designer_codes   │
    │  completion    │    ┌──────────┐     │ (U/V/S/K/W/T    │
    │  _history)     │    │task_     │     │  letters)        │
    └───────────────┘    │comments │     └─────────────────┘
                          │(thread   │
    ┌───────────────┐    │ per task)│     ┌─────────────────┐
    │ notifications  │    └──────────┘     │    samples       │
    │ (DB + Realtime │                    │ (daily records   │
    │  + sound)      │    ┌──────────┐     │  + auto-created  │
    └───────────────┘    │sampling  │     │  pending, 0010+) │
                          │_logs     │     └─────────────────┘
    ┌───────────────┐    │(meters   │
    │full_kitting   │    │ printed) │     ┌─────────────────┐
    │_details       │    └──────────┘     │ salvedge_records │
    │(2-stage form, │                    │ (fabric distrib) │
    │ DEO workflow)  │    ┌──────────┐    └─────────────────┘
    └───────────────┘    │coord-   │
                          │inator_  │     ┌─────────────────┐
    ┌───────────────┐    │tasks    │     │ task_counters    │
    │user_preferences│    │(personal│     │ (internal,      │
    │(col visibility │    │ tracking│     │  per-year seq)  │
    │ + density)     │    │ + FK    │     └─────────────────┘
    └───────────────┘    │ to-dos) │
                          └──────────┘     ┌─────────────────┐
    MANAGED DROPDOWNS:                    │assigned_by_opts  │
    ┌───────────────┐    ┌──────────┐     │received_by_opts  │
    │sampling_      │    │(all share│     │(per-form rosters)│
    │dropdowns      │    │ id, name,│     └─────────────────┘
    │(field-scoped) │    │ sort_ord,│
    └───────────────┘    │ is_active│
                          └──────────┘
```

### Task split columns (migration 0060):
- **tasks**: `is_split` (BOOLEAN DEFAULT false), `qty_remaining` (INTEGER, null when not split),
  `pool_sequence` (INTEGER, auto-incremented), `pool_week_start` (DATE).
- **task_assignments**: `task_id` (FK tasks), `designer_id` (FK profiles), `assigned_by` (FK profiles),
  `qty_assigned` (CHECK > 0), `qty_completed` (default 0), `planned_deadline`, `started_at`,
  `completed_at`, `delay_days`, `status` (CHECK IN assigned/in_progress/done/completed),
  `design_type`, `completion_fabric`, `completion_filled_at`, `notes`.
  UNIQUE(task_id, designer_id). In supabase_realtime publication.

### Sampling automation columns (migrations 0069–0070):
- **tasks**: `sampling_required` (BOOLEAN), `sampling_flagged_at` (TIMESTAMPTZ),
  `sampling_flagged_by` (UUID FK profiles).
- **samples**: `sample_status` ('pending'|'in_progress'|'completed'), `source` ('manual'|'task_completion'),
  `design_type` (TEXT). Unique index: (task_id, COALESCE(quality,''), COALESCE(design_type,'')).

### FK coordinator columns (migrations 0071–0072):
- **coordinator_tasks**: `related_task_id` (UUID FK tasks, ON DELETE SET NULL) — links FK to-do to the
  design task; powers the **"Add FK ↗"** redirect (CoordinatorTasksView → `/dashboard?status=in_progress&focus=<id>`,
  KanbanView hard-filters the table to that task with a focus banner) and the auto-close.
- RPC `create_fk_coordinator_task(p_task_id, p_task_code, p_designer_name)` — called from the claim's
  `onClaimed` (real claim only, deduped per task). SECURITY DEFINER. (0072 replaced the 2-arg 0071 version.)
- RPC `complete_fk_coordinator_task(p_task_id, p_task_code)` — auto-closes every open FK to-do for the
  task when the coordinator adds Full Kitting.

### Pool System columns + table (migration 0040):
- **tasks**: `completion_fabric`, `completion_mtr`, `completion_filled_by` (FK profiles),
  `completion_filled_at`, `requirement_received_at` (FIFO anchor, indexed for pool ordering).
- **user_preferences**: `user_id` (UNIQUE FK profiles), `visible_columns` JSONB, `table_density`
  (TEXT DEFAULT 'comfortable') — backs the per-user All-Tasks column visibility + table density
  (`useUserPreferences`). RLS: own row + admin read.

### Auto-generated IDs:
- **tasks.task_code** → DB: `ORD-YYYY-NNNN` → App overwrites: `DF NN-D{MMYY}-CONC-QM`
- **concepts.concept_code** → `C-YYYYMMDD-XXXX` (4-char random, no I/O/0/1)

### Enums:
```
user_role               → super_admin | admin | design_coordinator | designer | deo
task_status             → pool | todo | in_progress | full_kitting | approved | sampling | done | completed
task_priority           → low | normal | high | urgent
md_status (ConceptStatus) → pending | approved | rejected | revision_requested
designer_status         → active | inactive
kitting_data_entry_status → pending_image | pending_deo | in_progress | completed
kitting_priority        → very_urgent | 2_days | 3_days | 4_days | 5_days
assignment_status       → assigned | in_progress | done | completed  (task_assignments.status CHECK)
```

### Key triggers:
```
handle_new_user()               → auto-provisions profile on auth signup (defaults to designer)
tasks_before_save_trg           → assigns task_code, stamps started_at/kitted_at
tasks_log_change_trg            → audit trail in task_logs
concepts_before_insert/update   → assigns code, stamps dates, grants +4 days on approval
touch_updated_at                → on profiles, clients, tasks, concepts, fabrics, categories, task_comments
samples/salvedge_auto_complete  → stamps completion_timestamp (UPDATE only)
set_kitting_completed_status_trg → auto-flips kitting status to 'completed' when form_payload written
recalc_task_from_assignments()  → AFTER INSERT/UPDATE/DELETE on task_assignments:
                                   rolls up qty_completed, qty_remaining, is_split, status to parent task
                                   (source of truth — NEVER replicate this logic in frontend)
enforce_assignment_constraints()→ AFTER INSERT/UPDATE on task_assignments:
                                   blocks over-assign (Σ qty_assigned ≤ task.qty),
                                   auto-advances in_progress on first design logged,
                                   allows qty_completed > qty_assigned (extra work OK)
```

### Views:
```
deo_kitting_queue → joins full_kitting_details × tasks × clients for the DEO queue UI
active_profiles   → convenience view filtering is_active=true
```

---

## 12. STORAGE (Supabase buckets)

```
design-files    → 50 MB, private. Concept images + task files. Path: {uid}/...
sample-files    → 100 MB, private. Full-kitting uploads + sample photos/videos + kitting
                  Stage A photos. Path: {uid}/...
proof-photos    → 10 MB, private. Admin-only upload.
task-files      → placeholder (back-compat)
sampling-proofs → placeholder (back-compat)
avatars         → User profile photos

All private buckets → access via signed URLs (1-hour TTL):
  supabase.storage.from('design-files').createSignedUrl(path, 3600)

Client-side image compression applied before all uploads:
  compressImage(file) → Canvas-based resize for JPEG/PNG/WebP >500KB
  Max 1920px edge, 0.85 quality. Skips PSD/PDF/video. Fails silently → original.
```

---

## 13. THEME SYSTEM

```
Three modes: light / dark / system

Light mode (default):
  Background: #F8FAFC (slate-50)    Primary: #2563EB (blue-600)
  Cards: white                       Sidebar: #1E293B (slate-800, always dark)

Dark mode:
  Background: #1A1B25               Primary: #4F6EF7
  Cards: #22232F                    Sidebar: #12131A

System mode:
  Follows OS prefers-color-scheme, re-evaluates on OS change

All colors via CSS custom properties (space-separated RGB channels):
  --primary: 37 99 235;  →  bg-primary/50 = rgb(37 99 235 / 0.5)

Legacy token remapping:
  bg-ink → foreground (white in dark)
  bg-cream → card (white in light, dark card in dark)
  bg-gold → primary (blue)

Persistence: localStorage["linkd-fms-theme"]
FOUC prevention: inline <script> in index.html reads localStorage before React
Theme toggle: cycles light → dark → system (Sun/Moon/Monitor icons)
```

---

## 14. DATA HOOKS (React Query)

All hooks live in `linkd-fms/src/hooks/`. Read hooks use `@tanstack/react-query` (`useQuery` with centralized `queryKeys` from `lib/queryKeys.ts`). Mutation patterns return `Promise<{ data, error }>` and never throw — error is always a string ready for `toast.error()`.

```
┌──────────────────────┬────────────────────────────────────────────────────┐
│ Hook                 │ Purpose                                            │
├──────────────────────┼────────────────────────────────────────────────────┤
│ useAuth              │ Session + profile + signIn/signOut (context)        │
│ useTheme             │ Light/dark/system toggle (context, localStorage)    │
│ useTasks             │ List tasks w/ joins + filters (status, mine, etc.) │
│                      │ + task_assignments join for split-task detection    │
│ useTaskMutations     │ createTask, updateTaskStatus, assignTask,           │
│                      │ selfAssignTask, getNextPoolTasks, claimPoolTask     │
│                      │ (+ designType param), markTaskDone (FK gate check), │
│                      │ completeTask({fabric, designType, samplingRequired})│
│                      │ + createPendingSample auto-call, returnToPool       │
│                      │ (3 modes: reset/split-pool/split-assign),           │
│                      │ handoffTask, updateTask, deleteTask                 │
│ useTaskAssignments   │ Split-task portion CRUD: splitTask, claimPortion,   │
│                      │ markPortionDone, completePortionWithFabric,          │
│                      │ updateAssignmentQty, removeAssignment. All mutations│
│                      │ return {error} (string|null), never throw.          │
│                      │ Cache: queryKeys.taskAssignments.detail(taskId)      │
│ useTaskDetail        │ One task + files + logs (+ filler profile) parallel │
│ useUserPreferences   │ Per-user table column visibility + table density     │
│                      │ (user_preferences). Per-stage column storage:        │
│                      │ pool / in_progress / completed each remember own set │
│ useConcepts          │ List concepts + submitConcept + reviewConcept +     │
│                      │ finalizeConcept (dual-schema fallback)              │
│ useClients           │ All clients, ordered by party_name. Pre-filtered    │
│                      │ ldClients / jobWorkClients + CLIENT_GROUP_LABEL     │
│ useProfiles          │ All profiles, filtered by role + soft-delete        │
│ useDesignerCodes     │ Designer codes + Map<profile_id, codes[]>           │
│ useFabrics           │ Fabric lookup (active-only by default)              │
│ useConceptCategories │ Concept category lookup (active-only by default)    │
│ useAssignedByOptions │ Managed "Assigned By" roster, per context           │
│                      │ ('task'/'full_kitting'/'sampling') + fallback list  │
│ useReceivedByOptions │ Managed "Received By" list (Full Knitting form)     │
│ useSamplingDropdowns │ Sampling requirement/done-by/fusing, grouped by     │
│                      │ field (one query) + fallback                        │
│ useNotifications     │ Notifications + Realtime subscription + sound       │
│ useConceptReminders  │ Client-side monthly concept target reminders        │
│ useFullKitting       │ Kitting form CRUD for full_kitting_details          │
│ useSamples           │ Sample CRUD w/ filters (dateRange, customer, status,│
│                      │ source, sampleStatus, excludePendingTaskSamples).   │
│                      │ SampleWithTask type: embeds linked task via FK join.│
│                      │ Also exports: getSamplesForTask(), getTaskFiles()    │
│ useSalvedge          │ Salvedge records CRUD + filters                     │
│ useAnalytics         │ Concept analytics (KPIs, volume, designer stats)    │
│ useTaskAnalytics     │ Task analytics (KPIs, pipeline, designer stats).    │
│                      │ isFinished(t) = done||completed; completionDate(t)  │
│                      │ anchors on completed_at for KPIs/leaderboards       │
│ useDesignerScorecard │ Per-designer scorecard (composite of above)         │
│ useTaskComments      │ Comment thread CRUD + Realtime subscription         │
│ useFiles             │ Recursive bucket listing + signed URLs + delete     │
│ useFormDraft         │ localStorage draft persistence (300ms debounce)     │
│ usePagination        │ Client-side pagination state                        │
│ useAnimatedNumber    │ RAF-based counter with cubic ease-out               │
│ useKeyboardShortcuts │ Global keydown registrar with auto-skip             │
│ useHeldConceptAlerts │ Alerts coordinator when a concept has been held     │
│                      │ (on_hold) for > 4 days — surfaces a warning         │
│ useCoordinatorTasks  │ CRUD for coordinator task tracking (/coordinator-   │
│                      │ tasks): personal task list for design coordinators.  │
│                      │ FK to-dos auto-created/closed via RPC functions      │
└──────────────────────┴────────────────────────────────────────────────────┘

Helper libraries (not hooks, but called by hooks/components):
┌──────────────────────────┬──────────────────────────────────────────────┐
│ lib/taskHelpers.ts       │ isFullKittingAdded(task), isFullKitting-     │
│                          │ Blocking(task), wasCreatedByAdminOrCoord()   │
│ lib/fkCoordinatorTask.ts │ flagFkPendingToCoordinator(taskId, code,     │
│                          │ designer) — fires on REAL claim (onClaimed), │
│                          │ calls create_fk_coordinator_task RPC.        │
│                          │ completeFkCoordinatorTask(taskId, taskCode)  │
│                          │ — calls complete_fk_coordinator_task RPC.    │
│ lib/createPendingSample  │ createPendingSample({taskId,fabric,design-   │
│ .ts                      │ Type,createdBy,summary}) — LD party via      │
│                          │ resolveDefaultLdParty(); toasts on failure   │
│                          │ (source='task_completion'). Deduped.         │
└──────────────────────────┴──────────────────────────────────────────────┘
```

---

## 15. MIGRATION HISTORY

```
0001  Full schema (7 tables, triggers, RLS, functions)
─── 0002 merged into 0001 ───
0003  Storage buckets (task-files, sampling-proofs, avatars)
0004  Design storage (design-files 50MB, proof-photos 10MB)
0005  Task additions (due_time, whatsapp_group, description, soft-delete)
0006  Role simplification (4 roles → 2: admin + designer)
0007  Designer codes table (U/V/S/K letters for task code generation)
0008  Design coordinator enum value (must commit before 0009)
0009  Coordinator policies (is_admin_or_coordinator(), rewritten RLS)
0010  Workflow additions (samples, salvedge_records, full-kitting fields, sample-files bucket)
0011  Lookup tables (concept_categories, fabrics — DB-backed dropdowns)
0012  Concept extensions (designer_id, client_id, priority, final_approval, remarks)
0013  Notifications + full_kitting_details tables (notifications: Realtime-enabled;
      kitting: task_id UNIQUE)
0014  Task completion fields (assigned_at, completed_at, delay_days)
─── 0015 does not exist ───
0016  Designer claim pool (RLS: designers can self-assign unassigned tasks)
0017  Task comments table (uuid PK, task_id FK CASCADE, body 1-2000 chars, author join)
0018  Concept files JSONB (multi-file support, backfills existing rows with [image_url])
0019  Samples task link (optional FK samples.task_id → tasks.id)
0020  Kitting multi files (files JSONB on full_kitting_details)
0021  Full kitting form fields (kitting_data_entry_status + kitting_priority enums,
      form_payload JSONB, auto-complete trigger)
0022  DEO role (adds 'deo' to user_role enum — must commit before 0023)
0023  DEO policies (is_deo() helper, deo_kitting_queue view, DEO-specific RLS)
0024  Team CRUD (is_active, deactivated_at, deactivated_by on profiles, rewritten RLS,
      active_profiles view)
0025  Concept work-status lifecycle — step 1: concept_work_status enum
      (not_started / in_progress / on_hold / done_partial / in_revision /
       changes_requested / completed)
0026  Concept work-status lifecycle — step 2: columns added (work_status, work_started_at,
      work_held_at, work_resumed_at, work_completed_at, hold_reason, hold_count,
      revision_count, md_feedback, total_hold_duration)
0027  Concept work-status lifecycle — step 3: RLS + triggers tying the new columns
      to designer/MD actions (T6–T13 state machine)
0028  Concepts.designs_count — the denominator MD sees at final approval
      ("X of Y approved")
0029  Auto-start on MD approval — collapses the "Start working" button; the moment MD
      approves, work_started_at is stamped and work_status flips to in_progress
0030  Collapse changes_requested — removes the manual "Start changes" step; an MD
      revision request flips status straight to in_revision
0031  Sample/kitting link — full_kitting_details can FK to a sample row (mutually
      exclusive with task_id), so the FK flow runs the same from /sampling as
      it does from All Tasks → Full Knitting
0032  Sample UID generator — auto-assigns SMP-YYYY-NNNN on insert; backfills
      existing rows so the Sampling → Full Knitting table has stable identifiers
0033  Schedule daily-notifications via pg_cron — activates the existing Edge
      Function (was deployed but never scheduled)
0034  Notifications insert policy broadened to "authenticated" — designer-triggered
      notifications (task complete, concept submit, etc.) were failing under the
      old admin-or-coordinator gate
0035  notify_user + notify_users_batch RPC functions (SECURITY DEFINER) so cross-user
      inserts work regardless of the caller's role; sendNotification* helpers in
      lib/notifications.ts route through these RPCs
0036  WhatsApp received date/time columns on tasks (whatsapp_received_date,
      whatsapp_received_time) — captures when the brief arrived on WhatsApp,
      independent of created_at. Both nullable.
0037  clients.client_group TEXT ('ld' / 'job_work') — splits clients into two
      business segments. Same party name may exist in both groups.
0038  tasks.brief_type TEXT ('ld' / 'job_work') + CHECK constraint ensuring
      job_work briefs have a client_id. tasks.client_id made nullable so LD
      briefs can save without a party row.
0039  task_status += 'completed' (enum value add — standalone, must commit before 0040
      uses it). The new terminal state; 'done' becomes an intermediate "awaiting
      completion details" state.
0040  Pool System columns + user_preferences table:
      - tasks.completion_fabric / completion_mtr / completion_filled_by / completion_filled_at
        (captured when done → completed), requirement_received_at (FIFO anchor + pool index).
      - user_preferences (user_id UNIQUE, visible_columns JSONB) for per-user column visibility.
0041  tasks added to the supabase_realtime publication + REPLICA IDENTITY FULL, so pool
      claims/assignments propagate live (~1s) across sessions.
0042  clients UNIQUE(party_name, client_group) — drops the global party_name unique so a
      name can exist in both LD and Job Work groups; dedups exact duplicates first.
0043  Attempt to lift the qty_completed <= qty bound — dropped the WRONG constraint name
      (tasks_qty_completed_check, which never existed), so the real bound stayed.
0044  Drops the REAL upper-bound constraint `tasks_check` (an inline multi-column CHECK
      Postgres auto-named) and re-asserts only qty_completed >= 0 — designers can now log
      extra designs (qty_completed may exceed qty).
0045  assigned_by_options table — managed "Assigned By" roster + admin RLS + seed.
0046  Lookup coordinator access — widens write RLS on concept_categories / fabrics /
      assigned_by_options from is_admin() → is_admin_or_coordinator().
0047  assigned_by_options.context ('task' / 'full_kitting' / 'sampling') + UNIQUE(name,
      context); seeds full_kitting + sampling → per-form Assigned By lists.
0048  salvedge_records + samples write RLS → is_admin_or_coordinator() (idempotent;
      renamed from a clashing 0046_salvedge_*).
0049  received_by_options table — Full Knitting form's "Received By" managed list.
0050  salvedge_records attachment column (challan attachment_url).
0051  sampling_dropdowns table (field-scoped: requirement / sampling_done_by /
      fusing_operator) + RLS; seeded from scripts/Sampling Dropdowns.csv.
0052  Sync sampling_dropdowns to the updated CSV (drops the removed Requirement /
      Fusing Operator options; idempotent re-insert).
0053  concepts delete RLS widened — admins/coordinators OR the owner (submitted_by /
      designer_id = auth.uid()) can delete. Designers can delete their own concepts.
0054  concepts added to the supabase_realtime publication + REPLICA IDENTITY FULL so
      designer-side concept lists stay live across sessions (mirrors what 0041 did
      for tasks).
0055  concepts update RLS widened — admins/coordinators OR the owner can update
      (pairs with 0053 so designers can edit their own concepts, not just delete).
0056  coordinator_tasks table + RLS for coordinator task tracking. Columns:
      id, requester_name, description, requested_at, is_completed, completed_at,
      notes, created_by (FK profiles). RLS: own-only read/write + admin full.
0057  (reserved/skipped)
0058  (reserved/skipped)
0059  Pool ordering — tasks.pool_sequence (integer, auto-incremented), pool_week_start
      (date) for visual queue ordering. Pool sorts by pool_sequence within weekly
      groupings (This Week vs Carry Over).
0060  task_assignments table — split-task system. One row per designer portion:
      task_id, designer_id, assigned_by, qty_assigned (CHECK > 0), qty_completed,
      planned_deadline, started_at, completed_at, delay_days, status (CHECK IN
      assigned/in_progress/done/completed), design_type, completion_fabric,
      completion_filled_at, notes. UNIQUE(task_id, designer_id). tasks gains
      is_split BOOLEAN + qty_remaining INTEGER. recalc_task_from_assignments()
      trigger rolls up portions → parent task. Added to supabase_realtime.
0061  (reserved/skipped)
0062  Assignment guards — enforce_assignment_constraints() trigger: blocks over-assign
      (Σ qty_assigned ≤ task.qty), auto-advances in_progress on first design logged.
0063  (reserved/skipped)
0064  Assignment RPC helpers — resize_assignment(), update_assignment_details() for
      safe concurrent portion edits.
0065  (reserved/skipped)
0066  (reserved/skipped)
0067  (reserved/skipped)
0068  task_assignment_allow_extra — relaxes 0062 guards: qty_completed MAY exceed
      qty_assigned (designers can log extra). Marks done/completed once AT LEAST
      assigned qty is reached (not exact match). Over-assign guard still enforced.
0069  sampling_required — tasks gains sampling_required (boolean), sampling_flagged_at,
      sampling_flagged_by. samples gains sample_status (pending/in_progress/completed),
      source (manual/task_completion). Unique index uq_samples_task_completion ensures
      at most one auto-created sample per task (simple dedup).
0070  sample_per_design — samples gains design_type column. Drops and recreates the
      0069 unique index as composite: (task_id, COALESCE(quality,''), COALESCE(
      design_type,'')). Allows different fabric/design combinations to create
      separate pending samples from split-task portions.
0071  fk_coordinator_task — RPC create_fk_coordinator_task(p_task_id, p_task_code,
      p_designer_name) SECURITY DEFINER. When a designer claims a FK-required task
      without FK details, a coordinator to-do is auto-created. Deduped: one open
      FK to-do per task.
0072  fk_coordinator_link — coordinator_tasks gains related_task_id (UUID FK to tasks).
      RPC complete_fk_coordinator_task(p_task_id, p_task_code) auto-closes the FK
      to-do when the coordinator adds Full Knitting details. Hard FK link for
      traceability.

Next migration: 0073
```

---

## 16. UX UTILITIES

All in `@/components/ui` — import via the barrel:

```
import {
  Button, Card, CardContent, Badge,
  Skeleton, SkeletonCard, SkeletonTable, SkeletonText,
  EmptyState, ConfirmDialog, LoadingButton,
  SearchInput, ConnectionDot, DeadlineCell, ThemeToggle,
  toast, useToast, Toaster,
  AppShellSkeleton,
  Dialog, DialogContent, Sheet, SheetContent,
  Sparkline, Pagination, ExportDialog,
  LazyImage, Combobox, TShirtLoader, LoaderProvider,
  ConceptImage, NotificationBell, MobileTabBar,
  KeyboardShortcutsDialog,
} from "@/components/ui";
```

Key utilities:
```
<Toaster />           → Custom system. Bottom-right desktop, top mobile.
                        toast.success/error/info/warning. 4s auto-dismiss (errors sticky).
<AppShellSkeleton>    → Full-page loading replica of the real shell.
<EmptyState>          → "Nothing here" with optional CTA.
<ConfirmDialog>       → Radix Dialog. variant: default / danger / warning.
<LoadingButton>       → Button + inline spinner + auto-disable.
<ConnectionDot>       → Supabase Realtime heartbeat (green/yellow/red).
<DeadlineCell>        → Severity dot + date + "N days left" label.
<NotificationBell>    → Bell + dropdown + unread badge + chime + tab flash.
<Sparkline>           → Pure SVG mini-chart (no recharts). Color adapts to trend.
<Pagination>          → Smart ellipsis page numbers + page size selector.
<ExportDialog>        → CSV export: date range + column selection + preview.
<LazyImage>           → IntersectionObserver + skeleton → fade-in.
<Combobox>            → Search-as-you-type dropdown, keyboard nav, match highlighting.
<TShirtLoader>        → Full-screen waving t-shirt. Controlled or imperative (useLoader).
<ConceptImage>        → Signed-URL loader for sample-files + design-files buckets.
<MobileTabBar>        → Fixed bottom tab bar for <md screens.
<KeyboardShortcutsDialog> → Shows shortcuts grouped by category with <kbd> badges.
```

**Dialog mobile-safe defaults** (`@/components/ui/dialog`): base `DialogContent`
ships `w-[calc(100%-2rem)] max-w-lg rounded-lg` — a 1rem mobile gutter and
rounded corners on every breakpoint. `cn` is `twMerge(clsx(...))`, so any
caller's `w-[95vw]` / `max-w-[680px]` / `sm:rounded-xl` wins. There is **no**
vertical overflow handling in the base; tall forms need their own. Two
established patterns: (A) `flex max-h-[Nvh] flex-col overflow-hidden` on the
DialogContent + an inner `flex-1 overflow-y-auto` scroll-body for combobox-heavy
forms (Sampling, Brief, EditTask, Claim, TaskDetailDrawer); (B) `max-h-[90dvh]
overflow-y-auto` directly on DialogContent for short admin forms (FullKittingModal,
KittingStageADialog, TeamView add/edit). Combobox dropdowns are NOT portaled —
prefer (A) when they'd open near the bottom of a tall body. See CLAUDE.md §18.

Global CSS animations (in `index.css`):
```
animate-slide-in-right / animate-slide-out-right → Toaster + drawers
animate-fade-in / animate-fade-out               → Route transitions, error messages
animate-card-enter                                → Scale 0.95→1 + fade (kanban)
animate-highlight-pulse                           → 2s primary-color box-shadow pulse
animate-urgent-pulse                              → 1.2s scale + destructive-color ring
tshirt-wave                                       → 1.5s infinite rotation (TShirtLoader)
```

---

## 17. WHAT'S DONE vs NOT BUILT

### Done (everything below is fully functional):

**Core infrastructure:**
- Full auth flow (login → forgot password → reset → onboarding → role-based redirect)
- Error boundary wrapping entire app
- React Query migration (all hooks use @tanstack/react-query, centralized cache keys)
- Dual theme (light/dark/system) with FOUC prevention
- 20+ table DB with RLS, triggers, auto-generated IDs (migrations 0001-0072)
- 5 storage buckets with signed URL access
- Client-side image compression (Canvas API, all 6 upload handlers)
- 5-role architecture (super_admin / admin / design_coordinator / designer / deo)
- Centralized permissions (lib/permissions.ts) — isSuperAdmin, isAdmin, isMdRole,
  isAdminOrCoordinator, canSplitTask, canHandoffTask
- Vercel serverless API routes (`linkd-fms/api/*.ts`) for privileged service-role
  operations — `admin-update-user` (fetch / list_emails / update modes) backs the
  Team Management edit dialog and email column. Client helper: `callAdminApi()`.
- Notifications go through `notify_user` / `notify_users_batch` SECURITY DEFINER
  RPCs (migrations 0034 + 0035) so cross-user inserts work without weakening
  table-level RLS.
- Managed form dropdowns (Settings → Dropdowns): assigned_by_options (per-context),
  received_by_options, sampling_dropdowns (per-field). Admin + coordinator CRUD.

**Pages:**
- Dashboard overview (`/dashboard` via `/home` redirect) — KPIs, alerts, activity, pipeline
- Task Dashboard (`/task-dashboard`) — landing page with KPIs, heroes, volume charts, workload, leaderboards
- Kanban board (`/dashboard`) — Pool / In Progress / Completed tabs (+ Full Knitting sub-view),
  per-user column visibility (per-stage), Reference Files column, sorting, search dimming, row
  actions, keyboard shortcuts (J/K/Enter/Esc/1-4), CSV export, table density toggle,
  split task ghost rows, pool skip + FK warning chain
- Brief creation (`/brief/new`) — full form with Combobox pickers, kitting upload, code gen
- Concepts (`/concepts`) — role-specific dashboards, designer work board, workflow table, submit/review/finalize with revision history
- Sampling Hub (`/sampling`) — stats cards, CRUD table, batch entry, charts, **Pending Samples
  tab** (auto-created from task completion), managed dropdown pickers
- Orders (`/orders`) — admin + coordinator only. Placeholder view reserving the
  sidebar slot above Sampling; the eventual home for `samples` rows where
  `order_or_sample = 'order'`.
- Team management (`/team`) — full CRUD: add user, edit (name/email/password/role/
  joining-date/active status via `/api/admin-update-user`), role change, soft-delete,
  designer codes, 3-dot row action menu
- File browser (`/files`) — grid/list, bucket filters, search, download, delete
- Profile (`/profile`) — avatar, name, password, theme cards
- System admin (`/system`) — 7-tab hub (info, categories, fabrics, clients, codes, storage, danger zone)
- Salvedge (`/salvedge`) — CRUD with filters, designer-specific view
- Notifications (`/notifications`) — type filters, date grouping, pagination, mark read
- Password reset (`/reset-password`) — split-screen, eye toggles, auto-redirect
- Scorecards grid (`/scorecards`) — admin-only designer overview cards
- Full-page scorecard (`/scorecards/:id`) — 8+ chart sections, date range filter, calendar heatmap, insights
- Kitting queue (`/kitting`) — DEO queue + completed archive
- Kitting form (`/kitting/:recordId`) — side-by-side image + 12-field form with draft persistence
- Coordinator tasks (`/coordinator-tasks`) — personal task list for design coordinators

**Systems:**
- Pool claim flow — designers accept the single next queued task (urgent-first, then FIFO —
  no cherry-picking), preview full details + reference files, commit a deadline + optional
  designType; busy-check + optimistic locking + realtime propagation
  (`getNextPoolTasks` / `claimPoolTask`)
- Pool skip + FK warning chain — `openClaimOrWarn()` → skip dialog → FK dialog → claim modal.
  Non-front-of-queue tasks trigger skip confirmation; FK-required tasks without FK details
  show a yellow warning banner (non-blocking). Works from pool table, drawer, and cards.
- **Task split system** — one task, multiple designers via `task_assignments` table. Admin
  pre-splits via SplitTaskDialog (dynamic rows, live Σ counter). Designers self-claim portions
  via ClaimTaskModal ("How many designs?" input when qty > 1). AssignmentsPanel in drawer
  shows per-portion progress + actions. DB trigger `recalc_task_from_assignments()` rolls up
  all portions to parent task (qty_completed, qty_remaining, is_split, status).
- **FK gate** — `isFullKittingBlocking(task)` blocks markTaskDone + completeTask when a task
  requires full kitting but the coordinator hasn't uploaded it yet. Checked in both mutations.
- **FK coordinator workflow** — fires **only on a successful claim** (the `onClaimed` callback,
  never on the "Continue Without Full Knitting" intent), so a designer who backs out sends nothing and
  the to-do names whoever actually claimed. `flagFkPendingToCoordinator()` creates a deduped coordinator
  to-do (`create_fk_coordinator_task` RPC) linked via `related_task_id`. The to-do row shows an
  **"Add FK ↗"** button → All Tasks **focused on that task** (`?focus=<id>`). When the coordinator adds
  FK via KittingStageADialog, `completeFkCoordinatorTask()` auto-closes it (Pending → Done) and notifies
  the designer.
- **Sampling automation** — PostDoneModal collects fabric + designType + samplingRequired toggle.
  When samplingRequired=true, `completeTask()` calls `createPendingSample()` to auto-insert a
  pending sample (source='task_completion'). Pending samples appear in the Pending Samples tab
  for coordinator processing. Deduped per (task_id, fabric, design_type).
- **Return to Pool (3 modes)** — reset (wipe all), split-pool (preserve work, return remainder
  to pool), split-assign (preserve work, assign remainder to specific designer)
- **Handoff** — transfer task between designers preserving progress (qty_completed carry-forward)
- done → completed two-step completion (PostDoneModal captures fabric + designType + sampling
  toggle; completion details shown in the task drawer)
- Per-user All-Tasks column visibility (per-stage: pool/in_progress/completed) + custom defaults
  (`useUserPreferences` + `ColumnVisibilityMenu`, DB-backed)
- Table density toggle (comfortable/compact, per-user DB-backed)
- Notification system (DB table + sending helpers + Realtime + Web Audio chime + tab flash)
- Full kitting workflow (2-stage: coordinator upload → DEO digitize → review)
- Task comments / discussion threads (CRUD + Realtime)
- Task detail drawer (10+ sections including inline edit, AssignmentsPanel, linked samples,
  FK gate indicator, discussion)
- Task code generation (DF format with designer letter lookup + pool regeneration)
- Concept revision flow (4-stage pipeline, completion_history JSONB)
- CSV export (generic column-based with date range filtering)
- Form draft persistence (useFormDraft, localStorage, 300ms debounce)
- Pagination (usePagination hook + Pagination component)
- Keyboard shortcuts (useKeyboardShortcuts + KeyboardShortcutsDialog)
- Mobile bottom tab bar (role-specific 4-tab layout)
- Lazy image loading (IntersectionObserver + skeleton → fade-in)
- Animated counters (useAnimatedNumber, RAF-based cubic ease-out)
- Sparkline charts (pure SVG, no recharts dependency)
- Global T-shirt loader (LoaderProvider + useLoader, reference-counted)
- Combobox search-as-you-type dropdown (with per-option icon support)
- Concept editing by designers (until MD approves — editConcept mutation)
- Unified MetricCard component across all dashboards (replaces KpiCard where applicable)
- Date range picker (DateRangePicker) on dashboards and scorecards
- Coordinator task tracking (`/coordinator-tasks`) — personal task list with FK to-do auto-create/close
- Held concept alerts (useHeldConceptAlerts — 4+ day on-hold notification)
- Mobile responsiveness sweep (layout and component fixes across all surfaces)
- Collapsible brief details in task detail drawer (collapsed by default, compact summary)
- 12-hour AM/PM time picker for time inputs (MessageTimeInput, TimeInput12h)
- Editable feedback notes in concept workflow (EditableFeedbackBlock)
- Switch toggle component (`@/components/ui/Switch`) for boolean inputs (sampling_required)
- Designer concept dashboard with TargetRing, mini stats, active concepts, lifetime overview

### Not built:
- Cross-page search (search is page-local only)
- Concept → Task promotion (tasks.concept_id FK exists, no UI)
- Drag-and-drop reordering in Kanban
- Edge Function for deadline alerts (removed useDeadlineAlerts; no server-side replacement)
- Code splitting by route (could be added with React.lazy if needed)
- Dashboard crediting for split tasks (designer leaderboard doesn't yet credit task_assignments)
- DB-level qty guard for split tasks (Σ qty_assigned ≤ task.qty enforced only in UI)
- Per-portion `in_progress` transition (assignment rows go assigned → done, skipping in_progress)
