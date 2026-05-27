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
