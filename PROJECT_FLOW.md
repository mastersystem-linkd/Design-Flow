# LinkD FMS — Complete Project Flow (Start to End)

This document traces the entire application from the moment a user opens the browser to every feature, every data flow, and every piece of logic that powers the system.

---

## 1. THE BIG PICTURE

LinkD FMS is a **textile design workflow management system** for LinkD Prints. It tracks two parallel systems:

1. **Task Management** — Design briefs flow through a 7-stage pipeline: `pool → todo → in_progress → full_kitting → approved → sampling → done`
2. **Concept Approval** — Designers submit concepts; admin (MD) reviews within +1 day; on approval, designer has +4 days to finalize

**Three roles** control everything:
- **Admin** — Full power. Can approve concepts, manage roles, manage lookup data
- **Design Coordinator** — Almost admin-level (briefs, sampling, task lifecycle) but CANNOT approve concepts or change roles
- **Designer** — Submits concepts, claims tasks from pool, works on assigned tasks

---

## 2. TECH STACK

```
Frontend:  Vite 5 + React 18 + TypeScript (strict) + Tailwind CSS
Routing:   React Router v6
Backend:   Supabase (PostgreSQL + Auth + Storage + RLS)
Icons:     lucide-react
Dates:     date-fns
Toasts:    Custom system (+ legacy sonner)
Font:      Inter (Google Fonts)
Theme:     Light / Dark / System (CSS custom properties + class toggle)
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
  <ThemeProvider defaultTheme="light">     ← Theme context (light/dark/system)
    <AuthProvider>                          ← Auth context (user/session/profile)
      <App />                              ← Router + all routes
    </AuthProvider>
  </ThemeProvider>
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

### 3.4 AuthProvider initializes (`useAuth.tsx`)
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

### 3.5 Router resolves (`App.tsx`)
```
<BrowserRouter>
  <Toaster />              ← Custom toast system (mounted once, bottom-right)
  <SonnerToaster />        ← Legacy toaster (kept for back-compat)
  <Routes>
    /login         → LoginView          (public)
    /onboarding    → OnboardingView     (public-ish)
    /home          → DashboardView      (all roles)         ← NEW: Overview page
    /dashboard     → KanbanView         (all roles)         ← Task board
    /dashboard/tasks → KanbanView       (alias)
    /brief/new     → BriefingView       (admin + coordinator)
    /concepts      → ConceptsView       (admin + designer, NOT coordinator)
    /sampling      → ProductionView     (admin + coordinator)
    /analytics     → AnalyticsView      (admin + coordinator)
    /team          → TeamView           (admin + coordinator)
    /notifications → NotificationsView  (all roles)
    /kanban        → redirect /dashboard
    /briefing      → redirect /brief/new
    /production    → redirect /sampling
    /              → RootRedirect
    *              → NotFoundView (inside app shell)
  </Routes>
</BrowserRouter>
```

---

## 4. AUTHENTICATION FLOW

### 4.1 Login (`LoginView.tsx`)
```
User lands on /login
  ↓
Already authenticated? → redirect to roleHomePath(role) = /home
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
       ├─ Profile exists → navigate to /home
       └─ No profile → navigate to /onboarding
```

### 4.2 Onboarding (`OnboardingView.tsx`)
```
User has auth account but NO profile row in the database
  ↓
Show "Your account is being set up" message
  ↓
Two actions:
  - "Check again" → refreshProfile() → if profile exists, redirect to /home
  - "Sign out" → signOut() → redirect to /login
  ↓
Auto-redirect effect: watches for profile to materialize
```

### 4.3 Route Protection (`ProtectedRoute.tsx`)
```
Every protected route goes through this 5-step guard:

Step 1: isLoading?          → <AppShellSkeleton />
Step 2: !isAuthenticated?   → <Navigate to="/login" />
Step 3: needsOnboarding?    → <Navigate to="/onboarding" />
Step 4: role not allowed?   → <AppLayout><AccessRestrictedView /></AppLayout>
                              ↑ URL stays put! Inline "you can't see this" panel
Step 5: OK                  → <AppLayout>{children}</AppLayout>
```

### 4.4 Root Redirect (`RootRedirect.tsx`)
```
User visits "/"
  ↓
Loading? → <AppShellSkeleton />
Not authed? → /login
No profile? → /onboarding
Has profile? → roleHomePath(profile.role) → /home
```

---

## 5. APP SHELL (What the user sees on every page)

### 5.1 Layout structure
```
┌──────────────────────────────────────────────┐
│ Sidebar (220px, always dark)  │  TopNav (56px, glassmorphism)            │
│                               │──────────────────────────────────────────│
│ ┌─────────────────────┐      │                                          │
│ │ Logo + Brand        │      │  <main key={pathname} animate-fade-in>   │
│ │ Design Flow System  │      │    {current view}                        │
│ └─────────────────────┘      │  </main>                                 │
│                               │                                          │
│ Dashboard          ← NEW     │                                          │
│ All Tasks / My Board         │                                          │
│ New Brief (admin/coord)      │                                          │
│ Concepts (admin/designer)    │                                          │
│ ─── Manage ───               │                                          │
│ Analytics                    │                                          │
│ Sampling                     │                                          │
│ Team                         │                                          │
│ ─── ─── ─── ───             │                                          │
│ Notifications                │                                          │
│                               │                                          │
│ [Theme Toggle]               │                                          │
│ [User Avatar + Role]         │                                          │
└──────────────────────────────────────────────┘
```

### 5.2 Sidebar (`Sidebar.tsx`)
```
- 220px wide, fixed left, bg-sidebar (dark in both themes)
- Logo clicks → navigate to /home
- Nav groups with optional section labels (e.g. "Manage")
- Active link: bg-primary text-white shadow-sm
- ThemeToggle above user block (cycles: light → dark → system)
- User block: Radix DropdownMenu → "Sign Out" → ConfirmDialog
- Mobile: hidden by default, slides in as overlay with backdrop
```

### 5.3 TopNav (`TopNav.tsx`)
```
- 56px height, fixed top, glassmorphism (bg-background/80 backdrop-blur-xl)
- Left: page title computed from pathname + role
- Right: ConnectionDot (Supabase heartbeat) + NotificationBell + user name + avatar
- Mobile: hamburger menu button
```

### 5.4 Route transitions
```
<main key={pathname}> → React remounts on every navigation
  → animate-fade-in (0.25s ease-out, subtle Y-translate)
  → smooth transition between pages
```

---

## 6. PAGE-BY-PAGE FLOW

### 6.1 Dashboard (`/home` — DashboardView.tsx)

**Purpose:** Overview landing page. First thing every user sees after login.

**Data fetched:** `useTasks()` + `useConcepts()` + `useProfiles()`

**What it shows:**
```
┌─────────────┬──────────────┬──────────────┬──────────────┐
│ Active Tasks │ In Progress  │ Completed    │ Open Pool    │  ← KPI Cards
│     12       │      4       │   8 (67%)    │     3        │
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
- Stats computed via `useMemo` from all tasks/concepts/profiles
- Admin sees "Open Pool" KPI; designer sees "Sampling" KPI
- Alert banners only show if count > 0; each links to the relevant page
- Recent tasks sorted by `updated_at` DESC, last 6
- Quick actions are role-aware (admin sees "Create Brief", designer doesn't)
- Pipeline bars proportional to `count / total`

---

### 6.2 All Tasks / My Board (`/dashboard` — KanbanView.tsx, ~1291 lines)

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
   ┌──────────────┬───────────────────────────────────┐
   │ Pool         │ "Accept" → assigns to self, todo  │
   │ To-Do        │ "Start" → in_progress             │
   │ In Progress  │ "Submit" → full_kitting*          │
   │ Full Kitting │ "Completed" → done  OR            │
   │              │ "Revise" → in_progress (concepts)  │
   │ Done         │ —                                 │
   └──────────────┴───────────────────────────────────┘
   *Submit checks for files: if 0 files → opens TaskDetailDrawer for upload

6. Row click → opens TaskDetailDrawer (slide-in right panel)

7. Animation: tasks that just moved get highlight-pulse for 1.8s
```

---

### 6.3 New Brief (`/brief/new` — BriefingView.tsx, ~1173 lines)

**Purpose:** Create a new task (design brief). Admin + coordinator only.

**Data fetched:** `useTaskMutations()` + `useClients()` + `useProfiles()` + `useConceptCategories()` + `useFabrics()`

**Form sections:**
```
1. CLIENT           → Dropdown from useClients() + inline "Add new" mode
2. WHATSAPP GROUP   → Dropdown: "New Creation", "Job Work Concept", "Linkd Design", "LD-Garments..."
3. THE WORK
   ├─ Concept       → Dropdown from useConceptCategories() (DB-backed, migration 0011)
   ├─ Description   → Textarea (optional)
   ├─ Fabric        → Dropdown from useFabrics() (DB-backed, migration 0011)
   ├─ Quantity      → Number input (required, meters)
   └─ Mtr           → Number input (optional, total fabric needed)
4. TIMING
   ├─ Planned deadline → Date input (required)
   ├─ Due time         → Time input (optional)
   └─ Concept start    → Date input (optional)
5. PRIORITY         → Toggle: Normal / Urgent
6. ASSIGN TO        → Avatar buttons: "Open Pool" (default) or specific designer
7. ASSIGNED BY      → Text input (defaults to current user's name)
8. FULL KITTING (collapsible toggle)
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
  │   ├─ status = "pool" (if no assignee) or "todo" (if assigned)
  │   ├─ created_by = current user
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
Show success screen:
  ├─ Green checkmark
  ├─ Task code in monospace (e.g. "DF 01-S0526-FLOR-200M")
  ├─ Badges: Full Kitting, Fabric, Mtr, WhatsApp
  └─ CTAs: "Create another" (resets form) or "View on dashboard"
```

---

### 6.4 Task Detail Drawer (`TaskDetailDrawer.tsx`)

**Purpose:** Side panel for viewing/editing a single task. Opens from kanban, sampling, or concepts.

**Data fetched:** `useTaskDetail(taskId)` → task + files + logs in parallel

**Sections:**
```
1. HEADER         → Task code + status badge + concept + client + urgent flag
2. PIPELINE       → Visual progress indicator (7 dots for regular tasks)
3. BRIEF DETAILS  → 2×3 grid: Fabric, Qty (with progress bar), Deadline (with days-left),
                     Due time, Priority, Assigned to
4. FULL KITTING   → (if requires_full_kitting) Image preview + notes + upload
5. QTY TRACKER    → (if in_progress) Progress bar + stepper (+/-) + "Update" button
                     Auto-advances: qty=total → full_kitting; qty>0 → in_progress
6. DESIGN FILES   → Drag-drop upload zone + grid of file tiles (thumbnail + download)
                     Upload to design-files bucket → {uid}/tasks/{task_id}/{filename}
7. ACTIVITY LOG   → Timeline of status changes with user avatars + timestamps
                     Expandable (shows 5, then "Show all N")
8. ACTION FOOTER  → Context-aware buttons per status:
                     Pool → "Accept Task"
                     Todo → "Start Working"
                     In Progress → "Submit for Review" (checks files exist)
                     Full Kitting → "Approve" + "Revise" (concept) or "Completed" (admin)
                     Sampling → Completion form (meters + proof photo)
                     Done → Completion date display
```

---

### 6.5 Concepts (`/concepts` — ConceptsView.tsx, ~690 lines)

**Purpose:** Concept submission and approval workflow. Admin + designer only (NOT coordinator).

**Data fetched:** `useConcepts()` + `useTasks()`

**Two sections:**

```
SECTION 1: Concept-track briefs
  Tasks where concept field = "Concepts"
  Simple table: Title | Client | Fabric | Designer | Deadline | Status

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

  Status derivation logic:
  - Approval: pending/approved/rejected/revision_requested from md_status
  - Completion: "Done" (actual date exists) / "Waiting" / "Late" (past planned) / "Planning"
  - Final: "Approved" (final_approved_at) / "Pending" / "Scheduled" / "Late"
  - Delay: computeDelay(planned, actual) → days difference, red if late
```

**Concept submission flow:**
```
User clicks "Submit concept" → SubmitConceptDialog opens
  ↓
Fill form: title, description, start_date, priority, designer, client, assigned_by, file upload
  ↓
Upload file to sample-files bucket → {uid}/concepts/{timestamp}-{random}.{ext}
  ↓
submitConcept() → INSERT into concepts table
  ├─ DB trigger auto-generates concept_code (C-YYYYMMDD-XXXX)
  ├─ DB trigger sets md_planned_date = created_at + 1 day
  └─ Tries extended payload first (0012 fields); falls back to base if columns missing
```

**Concept review flow (admin only):**
```
Admin clicks a concept row → ConceptDetailDrawer opens
  ↓
Admin sees: code, title, image, submitter, description, timeline, review notes
  ↓
Admin chooses one:
  ├─ APPROVE  → md_status='approved'
  │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now, designer_planned_date=today+4
  ├─ REJECT   → md_status='rejected'
  │   └─ DB trigger: md_actual_date=now, md_reviewed_at=now
  └─ REVISION → md_status='revision_requested'
      └─ DB trigger: md_actual_date=now, md_reviewed_at=now
```

**Designer finalization:**
```
After approval, designer has +4 days
  ↓
Designer clicks "Mark Finalized" → designer_actual_date = today
```

---

### 6.6 Sampling Queue (`/sampling` — ProductionView.tsx)

**Purpose:** Track tasks in the sampling stage. Admin + coordinator only.

**Data fetched:** `useTasks()` + `useProfiles()` + `useTaskMutations()`

```
Shows only tasks WHERE status = 'sampling'
  ↓
Table columns: Concept | Client | Fabric | Qty | Designer | Deadline | Priority | Action
  ↓
Sort by: deadline (default), code, qty, priority
Search: same dimming pattern as kanban
Designer filter (admin only)
  ↓
Action: "Mark Done" button → updateTaskStatus(id, 'done')
  ↓
Designers see only their own sampling tasks; admins see all
```

---

### 6.7 Team (`/team` — TeamView.tsx)

**Purpose:** Read-only team roster. Admin + coordinator only.

**Data fetched:** `useProfiles()` + `useDesignerCodes()`

```
Table: Name (avatar) | Role (badge) | Designer Codes (active=green, inactive=strikethrough) | Joined
  ↓
Summary: "12 members — 2 admins, 8 designers, 2 coordinators"
  ↓
Note: Role changes via Supabase Dashboard (in-app management on roadmap)
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
Forward transitions (always allowed):
  pool → todo → in_progress → full_kitting → approved → sampling → done

Backward transitions (admin/coordinator ONLY):
  Any status can move backward (e.g. full_kitting → in_progress for revisions)

Auto-transitions:
  - assignTask() while pool → auto-moves to todo
  - updateQtyCompleted() where qty = total → auto-moves to full_kitting
  - updateQtyCompleted() where qty > 0 from pool/todo → auto-moves to in_progress

DB trigger side-effects:
  - status → in_progress: stamps started_at
  - status → full_kitting: stamps kitted_at
  - Any status change: appends to task_logs (audit trail)
```

---

## 9. PERMISSION MODEL

### 9.1 Frontend (`lib/permissions.ts`)
```
isAdmin(role)              → role === "admin"
isAdminOrCoordinator(role) → role === "admin" || "design_coordinator"
isCoordinator(role)        → role === "design_coordinator"
isDesigner(role)           → role === "designer"

Capability aliases:
  canReviewConcepts        → isAdmin (concept approval is admin-exclusive)
  canViewConcepts          → admin OR designer (coordinators excluded)
  canSubmitConcept         → admin OR designer
  canChangeUserRoles       → isAdmin
  canManageTaskLifecycle   → isAdminOrCoordinator (soft-delete, revert)
  canCreateBriefs          → isAdminOrCoordinator
  canLogSampling           → isAdminOrCoordinator
  canMoveTaskBackward      → isAdminOrCoordinator
```

### 9.2 Backend (Supabase RLS)
```
Helper functions:
  auth_role()              → SECURITY DEFINER, returns user_role for current user
  is_admin()               → auth_role() = 'admin'
  is_admin_or_coordinator() → auth_role() IN ('admin', 'design_coordinator')

Key distinctions at DB layer:
  1. concepts UPDATE/DELETE        → is_admin() ONLY (coordinator blocked)
  2. profiles UPDATE/DELETE (admin) → is_admin() ONLY (coordinator can't change roles)
  3. concept_categories + fabrics  → is_admin() ONLY (taxonomy is owner-managed)
  4. samples + salvedge_records    → is_admin() ONLY for full CRUD
  5. Everything else "elevated"    → is_admin_or_coordinator()
```

---

## 10. DATABASE SCHEMA (12 tables)

```
┌─────────────────┐     ┌──────────┐     ┌─────────────────┐
│    profiles      │←────│  tasks   │────→│    clients       │
│  (3 roles)       │     │ (7 status│     │  (party_name)    │
│  id, full_name,  │     │  pipeline│     └─────────────────┘
│  role, avatar    │     │  + qty   │
└────────┬─────────┘     │  tracking│     ┌─────────────────┐
         │               │  + full  │     │  concept_categories│
         │               │  kitting)│     │  (lookup, 0011)  │
         │               └────┬─────┘     └─────────────────┘
         │                    │
         │               ┌────┴─────┐     ┌─────────────────┐
         │               │task_logs │     │    fabrics       │
         │               │(audit    │     │  (lookup, 0011)  │
         │               │ trail)   │     └─────────────────┘
         │               └──────────┘
         │
    ┌────┴──────────┐    ┌──────────┐     ┌─────────────────┐
    │  concepts      │    │  files   │     │ designer_codes   │
    │ (MD review     │    │(task     │     │ (U/V/S/K letters)│
    │  workflow,     │    │ uploads) │     └─────────────────┘
    │  0012 extended)│    └──────────┘
    └───────────────┘                     ┌─────────────────┐
                         ┌──────────┐     │    samples       │
                         │sampling  │     │ (daily records,  │
                         │_logs     │     │  0010, no UI yet)│
                         │(meters   │     └─────────────────┘
                         │ printed) │
                         └──────────┘     ┌─────────────────┐
                                          │ salvedge_records │
                         ┌──────────┐     │ (fabric distrib, │
                         │task_     │     │  0010, no UI yet)│
                         │counters  │     └─────────────────┘
                         │(per-year │
                         │ sequence)│
                         └──────────┘
```

### Auto-generated IDs:
- **tasks.task_code** → DB: `ORD-YYYY-NNNN` → App overwrites: `DF NN-D{MMYY}-CONC-QM`
- **concepts.concept_code** → `C-YYYYMMDD-XXXX` (4-char random, no I/O/0/1)

### Key triggers:
- `handle_new_user()` → auto-provisions profile on auth signup (defaults to designer)
- `tasks_before_save_trg` → assigns task_code, stamps started_at/kitted_at
- `tasks_log_change_trg` → audit trail in task_logs
- `concepts_before_insert/update` → assigns code, stamps dates, grants +4 days on approval
- `touch_updated_at` → on profiles, clients, tasks, concepts, fabrics, categories
- `samples/salvedge_auto_complete` → stamps completion_timestamp (UPDATE only, not INSERT)

---

## 11. STORAGE (Supabase buckets)

```
design-files    → 50 MB, private. Concept images + task files. Path: {uid}/...
sample-files    → 100 MB, private. Full-kitting uploads + sample photos/videos. Path: {uid}/...
proof-photos    → 10 MB, private. Admin-only upload.
task-files      → 25 MB, placeholder (back-compat)
sampling-proofs → 25 MB, placeholder (back-compat)
avatars         → placeholder (back-compat)
```

All private buckets → access via signed URLs (1-hour TTL):
```
supabase.storage.from('design-files').createSignedUrl(path, 3600)
```

---

## 12. THEME SYSTEM

```
Three modes: light / dark / system

Light mode (default):
  Background: #F8FAFC (slate-50)    Primary: #2563EB (blue-600)
  Cards: white                       Sidebar: #0F172A (slate-900, always dark)

Dark mode:
  Background: #11121B               Primary: #4F6EF7
  Cards: #1A1B27                    Sidebar: #0C0D16

System mode:
  Follows OS prefers-color-scheme, re-evaluates on OS change

All colors via CSS custom properties (space-separated RGB channels):
  --primary: 37 99 235;  →  bg-primary/50 = rgb(37 99 235 / 0.5)

Persistence: localStorage["linkd-fms-theme"]
FOUC prevention: inline <script> in index.html reads localStorage before React
```

---

## 13. MIGRATION HISTORY

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
```

---

## 14. WHAT'S DONE vs NOT BUILT

### Done:
- Full auth flow (login → onboarding → role-based redirect)
- Dashboard overview (/home) with KPIs, alerts, recent activity, pipeline
- Task board (/dashboard) with 5 status tabs, 22+ column tables, sorting, search, actions
- Brief creation (/brief/new) with full-kitting upload, DB-backed pickers, task code generation
- Concepts workflow (/concepts) with 22-column multi-stage table, submit/review/finalize
- Sampling queue (/sampling) with sort, search, mark-done
- Team roster (/team) with designer codes
- Task detail drawer (8 sections, file upload, qty tracking, activity log)
- Dual theme (light/dark/system) with FOUC prevention
- 12-table DB with RLS, triggers, auto-generated IDs
- 5 storage buckets with signed URL access
- Notification bell + route placeholder

### Placeholder:
- Analytics (/analytics) — "Coming soon" card

### Not built:
- Analytics charts (throughput, designer load, SLA)
- Edit-task UI (only status/qty/assignment changes supported)
- In-app role management (uses Supabase Dashboard)
- Realtime sync (no subscriptions, manual refetch only)
- Cross-page search (TopNav search removed; page-local only)
- Drag-and-drop in kanban
- Samples / Salvedge views (tables exist, no UI)
- Lookup taxonomy admin UI (manage via Dashboard or seed scripts)
