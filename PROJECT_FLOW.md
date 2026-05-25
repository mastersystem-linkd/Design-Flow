# LinkD FMS — Complete Project Flow (Start to End)

This document traces the entire application from the moment a user opens the browser to every feature, every data flow, and every piece of logic that powers the system.

---

## 1. THE BIG PICTURE

LinkD FMS is a **textile design workflow management system** for LinkD Prints. It tracks three independent systems:

1. **Task Management (Design Flow)** — Coordinators write design briefs; tasks flow through a pipeline: `pool → in_progress → full_kitting → done`. Assigned tasks skip `todo` and go straight to `in_progress`. Designers claim or are assigned tasks. Full kitting form (file upload + structured data) available at the full_kitting stage.
2. **Concept Approval** — Designers submit concepts (min 50-char description + file). Admin (MD) reviews. Monthly target: 3 per designer. Concept analytics (tab inside Dashboards) shows approval rates, turnaround speed, designer leaderboard.
3. **Sampling** — Coordinators log daily sampling records (party, fabric, qty, files). Sampling Hub with stats, filters, charts, batch entry.

**Four roles** control everything:
- **Admin** — Full power. Can approve concepts, manage roles, manage lookup data, view scorecards.
- **Design Coordinator** — Admin-equivalent powers (briefs, sampling, task management, client CRUD, analytics, team CRUD, concept approval). `isAdmin()` returns true for both admin AND coordinator.
- **Designer** — Submits concepts, claims tasks from pool, works on assigned tasks.
- **DEO (Data Entry Operator)** — Restricted dashboard. Sees ONLY the Kitting Queue (`/kitting`). Picks up kitting forms the coordinator uploaded, digitizes the 12-field paper form into structured JSON. Cannot create tasks or alter upstream data.

---

## 2. TECH STACK

```
Frontend:     Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS 3
Routing:      React Router v6
Server state: @tanstack/react-query 5 (staleTime 2min, gcTime 10min, retry 1)
Backend:      Supabase (PostgreSQL + Auth + Storage + RLS + Realtime)
Icons:        lucide-react
Charts:       recharts 3.8.1
Dates:        date-fns 4.1.0
Toasts:       Custom system (Sonner fully removed)
Confetti:     canvas-confetti 1.9.4
Font:         Inter (Google Fonts)
Theme:        Light / Dark / System (CSS custom properties + class toggle)
UI:           Radix primitives (Dialog, Avatar, DropdownMenu, Label, Slot)
              + hand-written components (no shadcn CLI)
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
3. Inter font loads from Google Fonts (400/500/600/700)
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
│ Sampling                     │                              │
│ Salvedge                     │                              │
│ Files                        │                              │
│ Team                         │                              │
│ Scorecards  (admin only)     │                              │
│ Settings                     │                              │
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
  Sampling, Salvedge, Files, Team, Scorecards, Settings
  Notifications

design_coordinator:
  Dashboards, All Tasks, Concepts
  ─── Manage ───
  Sampling, Salvedge, Files, Team, Settings
  Notifications

designer:
  Dashboards, My Board, Concepts, Files
  Notifications

deo:
  Kitting Queue
  Notifications
```

### 5.3 Sidebar (`Sidebar.tsx`)
```
- 220px wide, fixed left, bg-sidebar (dark in both themes)
- Logo clicks → navigate to roleHomePath(role) = /task-dashboard (or /kitting for DEO)
- Nav groups with optional section labels (e.g. "Manage")
- Active link: bg-primary text-white shadow-sm
- ThemeToggle above user block (cycles: light → dark → system)
- User block: Radix DropdownMenu → Profile link + "Sign Out" → ConfirmDialog
- Mobile: hidden by default, slides in as overlay with backdrop
```

### 5.4 TopNav (`TopNav.tsx`)
```
- 56px height, fixed top, glassmorphism (bg-background/80 backdrop-blur-xl)
- Left: page title computed from pathname + role
- Right: ConnectionDot (Supabase Realtime heartbeat) + NotificationBell
         (bell + unread badge + dropdown) + user first name + avatar
- Mobile: hamburger menu button
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
4 personal KPIs + big score card (composite score + breakdown)
```

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

**Dashboard statuses shown:** Pool, To-Do, In Progress, Full Kitting, Done
(excluded: `approved` → concepts-only; `sampling` → own page at /sampling)

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

3. Table (22+ columns, min-width 2800px, horizontal scroll):
   │
   ├─ Date/Time, Designer, Concept, Description, Party Name, Fabric, Mtr
   ├─ WhatsApp Group, Date, Time, Assigned By, QTY
   ├─ Completion Timestamp, Qty Completed, Pending, Done?
   ├─ Started Late, Concept Start Date, Full Kitting, FK Image, FK Form
   └─ Action (sticky right column, 180px)

4. Per-section sorting: each status tab has its own sort state
   - Sortable by: deadline (default), code, qty, priority
   - Click toggles direction (asc ↔ desc)

5. Row actions (context-aware by status):
   ┌──────────────┬────────────────────────────────────────────┐
   │ Pool         │ "Accept" → assigns to self, in_progress   │
   │ To-Do        │ "Start" → in_progress                     │
   │ In Progress  │ "Submit" → full_kitting*                   │
   │ Full Kitting │ "Completed" → done  OR                     │
   │              │ "Revise" → in_progress (admin/coordinator) │
   │ Done         │ —                                          │
   └──────────────┴────────────────────────────────────────────┘
   *Submit checks for files: if 0 files → opens TaskDetailDrawer for upload

6. Row ⋮ menu: View / Edit (EditTaskDialog) / Full Kitting (KittingStageADialog) /
   Delete (admin only, soft-delete) — role-gated, portal-rendered

7. Row click → opens TaskDetailDrawer (slide-in right panel)

8. Animation: tasks that just moved get highlight-pulse for 1.8s
   URGENT badge uses urgent-pulse animation on each mount
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

**Data fetched:** `useTaskMutations()` + `useClients()` + `useProfiles()` + `useConceptCategories()` + `useFabrics()`

**Form sections:**
```
1. CLIENT           → Combobox (search-as-you-type) from useClients() + inline "Add new" mode
2. WHATSAPP GROUP   → Dropdown: "New Creation", "Job Work Concept", "Linkd Design",
                      "LD-Garments Sublimation Prints" (+ others added later)
3. THE WORK
   ├─ Concept       → Combobox from useConceptCategories() (DB-backed, migration 0011)
   ├─ Description   → Textarea (optional)
   ├─ Fabric        → Combobox from useFabrics() (DB-backed, migration 0011)
   ├─ Quantity      → Number input (required, meters)
   └─ Mtr           → Number input (optional, total fabric needed)
4. TIMING
   ├─ Planned deadline → Date input (required)
   ├─ Due time         → Time input (optional)
   └─ Concept start    → Date input (optional, defaults to today)
5. PRIORITY         → Toggle: Normal / Urgent
6. ASSIGN TO        → Avatar buttons: "Open Pool" (default) or specific designer
7. ASSIGNED BY      → Text input (defaults to current user's name)
8. FULL KITTING REQUIREMENTS (collapsible toggle)
   ├─ Toggle switch
   ├─ Drag-drop upload zone (100 MB, .jpg/.jpeg/.png/.psd/.gif/.mp4/.mov)
   ├─ Progress bar
   ├─ Preview (image thumbnail or file icon)
   └─ Remarks textarea (1000 char limit)
```

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

**Data fetched:** `useTaskDetail(taskId)` → task + files + activity log in parallel

**8 Sections:**
```
1. HEADER         → Task code + status badge + concept + client + urgent flag
                    Edit button toggles INLINE EDIT MODE
2. PIPELINE       → Visual progress indicator (status dots)
3. BRIEF DETAILS  → 2×3 grid: Fabric, Qty (with progress bar), Deadline (with days-left),
                     Due time, Priority, Assigned to
                     IN EDIT MODE: qty, mtr, deadline, priority, assignee, whatsapp,
                     description, notes — with Save/Cancel + change logging to task_logs
4. FULL KITTING   → (if requires_full_kitting) Image preview + notes + upload
5. QTY TRACKER    → (if in_progress) Progress bar + stepper (+/-) + "Update" button
                     Auto-advances: qty=total → full_kitting; qty>0 → in_progress
6. DESIGN FILES   → Drag-drop upload zone + grid of file tiles (thumbnail + download)
                     Upload to design-files bucket → {uid}/tasks/{task_id}/{filename}
                     Client-side image compression applied before upload
7. DISCUSSION     → Comment thread (useTaskComments). Author avatar/name/role per comment.
                     Edit/delete own comments. Admin/coordinator can moderate (delete any).
                     2000 char limit with counter. Supabase Realtime subscription for
                     live updates (INSERT events on task_comments).
8. ACTION FOOTER  → Context-aware buttons per status:
                     Pool → "Accept Task"
                     Todo → "Start Working"
                     In Progress → "Submit for Review" (checks files exist)
                     Full Kitting → "Approve/Completed" or "Revise" (admin/coordinator)
                     Done → Completion date display

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

**Concept review flow (admin + coordinator):**
```
Admin/coordinator clicks a concept row → ConceptDetailDrawer opens
  ↓
Shows: code, title, image, submitter, description, timeline, review notes
ConceptWorkflowStage shows 5-stage progress bar:
  Submitted → Review → Decision → Finalize → Complete
  ↓
Reviewer chooses one:
  ├─ APPROVE  → md_status='approved'
  │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now, designer_planned_date=today+4
  │   └─ Notification sent to submitter
  ├─ REJECT   → md_status='rejected'
  │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now
  │   └─ Notification sent to submitter
  └─ REVISION → md_status='revision_requested' (mandatory notes)
      └─ DB trigger: md_actual_date=now, md_reviewed_at=now
      └─ Notification sent to submitter
      └─ completion_history JSONB tracks revision cycles
```

**Designer finalization / re-submission:**
```
After approval, designer has +4 days
  ↓
Designer clicks "Mark Finalized" → designer_actual_date = today
  ↓
Re-submission after revision:
  resubmitConcept → appends to completion_history JSONB
  → Notification sent to all admins
```

---

### 6.7 Sampling Hub (`/sampling` — ProductionView.tsx)

**Purpose:** Full sampling management with stats, CRUD, charts. Admin + coordinator only.

**Data fetched:** `useSamples()` + `useTasks()` + `useProfiles()` + `useTaskMutations()`

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

L742: 3. SAMPLES TABLE (full CRUD via SamplingFormDialog)
L743:    ├─ Columns: Party Name, Fabric, Qty, Status, Date, Actions
L744:    ├─ Row ⋮ menu: Edit / Delete
L745:    ├─ Add new: SamplingFormDialog (Dialog-based)
L746:    │   └─ Full Form mode (all fields)
L747:    │   └─ Batch entry (party_name persists between entries)
L748:    │   └─ File uploads (5x100MB to sample-files bucket)
   └─ TaskPicker: search-as-you-type to link samples to tasks

4. TASKS IN SAMPLING STAGE
   ├─ Tasks WHERE status = 'sampling'
   ├─ "Mark Done" button → updateTaskStatus(id, 'done')
   └─ Designers see only their own; admins see all

5. BAR CHART
   └─ Samples per day (last 14 days, recharts BarChart)
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
4-stat banner: designers / avg composite / on track / needs support
  + top-performer call-out + search
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

**7 tabs:**
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

4. Clients (ClientManagementTab)
   - Client CRUD: add, edit name, merge duplicates, delete
   - Search + pagination

5. Designer Codes (DesignerCodesTab)
   - Assign/remove letter codes per designer
   - Shows avatar + name + current codes

6. Storage (StorageTab)
   - File counts per bucket
   - On-demand size scan

7. Danger Zone (DangerZoneTab)
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
  pool → in_progress → full_kitting → done

  Note: Assigned tasks skip 'todo' and go straight to 'in_progress'.
  The 'todo' enum value still exists in the DB but is no longer entered by the app.
  'approved' and 'sampling' statuses exist but are not shown on the kanban dashboard.

Forward transitions (always allowed):
  pool → in_progress → full_kitting → done

Backward transitions (admin/coordinator ONLY):
  Any status can move backward (e.g. full_kitting → in_progress for revisions)

Auto-transitions:
  - assignTask() while pool → auto-moves to in_progress (stamps assigned_at + started_at)
  - selfAssignTask() from pool → in_progress
  - updateQtyCompleted() where qty = total → auto-moves to full_kitting
  - updateQtyCompleted() where qty > 0 from pool/todo → auto-moves to in_progress

Completion tracking:
  - markTaskDone() stamps completed_at + calculates delay_days

DB trigger side-effects:
  - status → in_progress: stamps started_at
  - status → full_kitting: stamps kitted_at
  - Any status change: appends to task_logs (audit trail)
```

---

## 9. PERMISSION MODEL

### 9.1 Frontend (`lib/permissions.ts`)
```
isAdmin(role)              → role === "admin" || role === "design_coordinator"
                              ↑ Admin + coordinator are NOW EQUIVALENT
isAdminOrCoordinator(role) → role === "admin" || role === "design_coordinator"
isCoordinator(role)        → role === "design_coordinator"
isDesigner(role)           → role === "designer"

Capability aliases:
  canReviewConcepts        → isAdmin (admin + coordinator)
  canViewConcepts          → admin + coordinator + designer (all 3 main roles)
  canSubmitConcept         → admin + coordinator + designer
  canChangeUserRoles       → isAdmin (admin + coordinator)
  canManageTaskLifecycle   → isAdminOrCoordinator (soft-delete, revert)
  canCreateBriefs          → admin + coordinator + designer (all 3 main roles)
  canLogSampling           → isAdminOrCoordinator
  canMoveTaskBackward      → isAdminOrCoordinator
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
Layer 1 — DB table (notifications):
  user_id, title, message, type (info/warning/urgent/success), link, is_read
  RLS: own-only SELECT, admin/coordinator INSERT

Layer 2 — Sending helpers (lib/notifications.ts):
  sendNotification(userId, title, msg, type?, link?)
  sendNotificationToMany(userIds, title, msg, type?, link?)
  sendNotificationToRole(role, title, msg, type?, link?)

Layer 3 — Realtime + sound (useNotifications hook):
  Subscribes to Supabase Realtime postgres_changes INSERT events
  filtered to user_id → auto-prepends new notifications without refetch
  ↓
  Web Audio chime: A5 (880Hz) + D6 (1174Hz) two-tone sine wave
  Tab title flash for 10 seconds
  ↓
  Pulse animation on NotificationBell badge

Where notifications fire from:
  ┌───────────────────────────────┬──────────────────────────┐
  │ Trigger                       │ Recipient                │
  ├───────────────────────────────┼──────────────────────────┤
  │ Task assigned                 │ Designer                 │
  │ Task self-claimed             │ Previous assignee        │
  │ Task marked done              │ All coordinators         │
  │ Concept submitted             │ All admins               │
  │ Concept reviewed              │ Submitter                │
  │ Final approval                │ Submitter                │
  │ Revision feedback             │ Submitter                │
  │ Concept re-submitted          │ All admins               │
  │ Role changed                  │ Affected user            │
  │ Kitting form uploaded (A)     │ All DEOs                 │
  │ Kitting form digitized (B)    │ Admin + coordinator      │
  └───────────────────────────────┴──────────────────────────┘

UI surfaces:
  - NotificationBell in TopNav (dropdown with 15 recent, unread badge capped at 9+)
  - /notifications full page (type filters, date grouping, pagination)
```

---

## 11. DATABASE SCHEMA (15 tables + internal)

```
┌─────────────────┐     ┌──────────┐     ┌─────────────────┐
│    profiles      │←────│  tasks   │────→│    clients       │
│  (4 roles)       │     │ (pipeline│     │  (party_name)    │
│  id, full_name,  │     │ + qty    │     └─────────────────┘
│  role, avatar,   │     │ tracking │
│  is_active       │     │ + kitting│     ┌─────────────────┐
└────────┬─────────┘     │ + compl.)│     │concept_categories│
         │               └────┬─────┘     │ (lookup, 0011)  │
         │                    │            └─────────────────┘
         │               ┌────┴─────┐
         │               │task_logs │     ┌─────────────────┐
         │               │(audit    │     │    fabrics       │
         │               │ trail)   │     │ (lookup, 0011)  │
         │               └──────────┘     └─────────────────┘
         │
    ┌────┴──────────┐    ┌──────────┐     ┌─────────────────┐
    │  concepts      │    │  files   │     │ designer_codes   │
    │ (MD review     │    │(task     │     │ (U/V/S/K/W/T    │
    │  workflow,     │    │ uploads) │     │  letters)        │
    │  files JSONB,  │    └──────────┘     └─────────────────┘
    │  completion    │
    │  _history)     │    ┌──────────┐     ┌─────────────────┐
    └───────────────┘    │task_     │     │    samples       │
                          │comments │     │ (daily records,  │
    ┌───────────────┐    │(thread   │     │  0010+)          │
    │ notifications  │    │ per task)│     └─────────────────┘
    │ (DB + Realtime │    └──────────┘
    │  + sound)      │                    ┌─────────────────┐
    └───────────────┘                    │ salvedge_records │
                          ┌──────────┐    │ (fabric distrib) │
    ┌───────────────┐    │sampling  │    └─────────────────┘
    │full_kitting   │    │_logs     │
    │_details       │    │(meters   │    ┌─────────────────┐
    │(2-stage form, │    │ printed) │    │ task_counters    │
    │ DEO workflow)  │    └──────────┘    │ (internal,      │
    └───────────────┘                    │  per-year seq)  │
                                          └─────────────────┘
```

### Auto-generated IDs:
- **tasks.task_code** → DB: `ORD-YYYY-NNNN` → App overwrites: `DF NN-D{MMYY}-CONC-QM`
- **concepts.concept_code** → `C-YYYYMMDD-XXXX` (4-char random, no I/O/0/1)

### Enums:
```
user_role               → admin | design_coordinator | designer | deo
task_status             → pool | todo | in_progress | full_kitting | approved | sampling | done
task_priority           → low | normal | high | urgent
md_status (ConceptStatus) → pending | approved | rejected | revision_requested
designer_status         → active | inactive
kitting_data_entry_status → pending_image | pending_deo | in_progress | completed
kitting_priority        → very_urgent | 2_days | 3_days | 4_days | 5_days
```

### Key triggers:
```
handle_new_user()           → auto-provisions profile on auth signup (defaults to designer)
tasks_before_save_trg       → assigns task_code, stamps started_at/kitted_at
tasks_log_change_trg        → audit trail in task_logs
concepts_before_insert/update → assigns code, stamps dates, grants +4 days on approval
touch_updated_at            → on profiles, clients, tasks, concepts, fabrics, categories, task_comments
samples/salvedge_auto_complete → stamps completion_timestamp (UPDATE only)
set_kitting_completed_status_trg → auto-flips kitting status to 'completed' when form_payload written
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
│ useTasks             │ List tasks w/ joins + filters (status, mine, etc.)  │
│ useTaskMutations     │ createTask, updateTaskStatus, assignTask,           │
│                      │ selfAssignTask, markTaskDone, updateTask, deleteTask│
│ useTaskDetail        │ One task + files + logs in parallel                 │
│ useConcepts          │ List concepts + submitConcept + reviewConcept +     │
│                      │ finalizeConcept (dual-schema fallback)              │
│ useClients           │ All clients, ordered by party_name                  │
│ useProfiles          │ All profiles, filtered by role + soft-delete        │
│ useDesignerCodes     │ Designer codes + Map<profile_id, codes[]>           │
│ useFabrics           │ Fabric lookup (active-only by default)              │
│ useConceptCategories │ Concept category lookup (active-only by default)    │
│ useNotifications     │ Notifications + Realtime subscription + sound       │
│ useFullKitting       │ Kitting form CRUD for full_kitting_details          │
│ useSamples           │ Sample CRUD w/ filters (dateRange, customer, status)│
│ useSalvedge          │ Salvedge records CRUD + filters                     │
│ useAnalytics         │ Concept analytics (KPIs, volume, designer stats)    │
│ useTaskAnalytics     │ Task analytics (KPIs, pipeline, designer stats)     │
│ useDesignerScorecard │ Per-designer scorecard (composite of above)         │
│ useTaskComments      │ Comment thread CRUD + Realtime subscription         │
│ useFiles             │ Recursive bucket listing + signed URLs + delete     │
│ useFormDraft         │ localStorage draft persistence (300ms debounce)     │
│ usePagination        │ Client-side pagination state                        │
│ useAnimatedNumber    │ RAF-based counter with cubic ease-out               │
│ useKeyboardShortcuts │ Global keydown registrar with auto-skip             │
└──────────────────────┴────────────────────────────────────────────────────┘
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

Next migration: 0025
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
- 15-table DB with RLS, triggers, auto-generated IDs (migrations 0001-0024)
- 5 storage buckets with signed URL access
- Client-side image compression (Canvas API, all 6 upload handlers)
- 4-role architecture (admin / design_coordinator / designer / deo)
- Centralized permissions (lib/permissions.ts)

**Pages:**
- Dashboard overview (`/dashboard` via `/home` redirect) — KPIs, alerts, activity, pipeline
- Task Dashboard (`/task-dashboard`) — landing page with KPIs, heroes, volume charts, workload, leaderboards
- Kanban board (`/dashboard`) — 5 status tabs, 22+ column tables, sorting, search dimming, row actions, keyboard shortcuts (J/K/Enter/Esc/1-4), CSV export
- Brief creation (`/brief/new`) — full form with Combobox pickers, kitting upload, code gen
- Concepts (`/concepts`) — role-specific dashboards, designer work board, workflow table, submit/review/finalize with revision history
- Sampling Hub (`/sampling`) — stats cards, CRUD table, batch entry, charts
- Team management (`/team`) — full CRUD: add user, edit, role change, soft-delete, designer codes
- File browser (`/files`) — grid/list, bucket filters, search, download, delete
- Profile (`/profile`) — avatar, name, password, theme cards
- System admin (`/system`) — 7-tab hub (info, categories, fabrics, clients, codes, storage, danger zone)
- Salvedge (`/salvedge`) — CRUD with filters
- Notifications (`/notifications`) — type filters, date grouping, pagination, mark read
- Password reset (`/reset-password`) — split-screen, eye toggles, auto-redirect
- Scorecards grid (`/scorecards`) — admin-only designer overview cards
- Full-page scorecard (`/scorecards/:id`) — 8+ chart sections, date range filter, calendar heatmap, insights
- Kitting queue (`/kitting`) — DEO queue + completed archive
- Kitting form (`/kitting/:recordId`) — side-by-side image + 12-field form with draft persistence

**Systems:**
- Notification system (DB table + sending helpers + Realtime + Web Audio chime + tab flash)
- Full kitting workflow (2-stage: coordinator upload → DEO digitize → review)
- Task comments / discussion threads (CRUD + Realtime)
- Task detail drawer (8 sections including inline edit mode + discussion)
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
- Combobox search-as-you-type dropdown

### Not built:
- Cross-page search (search is page-local only)
- Edit own pending concept (DB permits it; UI doesn't expose it)
- Concept → Task promotion (tasks.concept_id FK exists, no UI)
- Drag-and-drop reordering in Kanban
- Edge Function for deadline alerts (removed useDeadlineAlerts; no server-side replacement)
- Code splitting by route (could be added with React.lazy if needed)
