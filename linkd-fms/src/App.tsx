import { lazy, type ComponentType } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/Toaster";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RootRedirect } from "@/components/layout/RootRedirect";
import { ROUTES } from "@/lib/routes";

// A dynamic import can fail to fetch its chunk when the URL goes stale:
//   • prod — a new deploy replaced the hashed filenames while an old tab is open
//   • dev  — Vite restarted / HMR bumped the module's `?t=` timestamp
// Both leave the browser asking for a file that no longer exists, surfacing as
// "Failed to fetch dynamically imported module". The cure is to load the fresh
// index.html (which has the current chunk map), so on the FIRST such failure we
// force one hard reload. A sessionStorage guard (cleared on any success) makes
// sure we never loop if the chunk is genuinely, permanently missing — in that
// case the error propagates to the root ErrorBoundary as before.
const RELOAD_GUARD = "df-chunk-reload";
function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_GUARD);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_GUARD)) {
        sessionStorage.setItem(RELOAD_GUARD, "1");
        window.location.reload();
        // Suspend until the reload navigates away; never resolve/throw here so
        // the user never flashes an error before the page reloads.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

// ── Eager: auth-flow + tiny pages on the critical path. Kept in the main
//    bundle so the login / onboarding paint instantly with no extra fetch. ──
import { LoginView } from "@/views/LoginView";
import { OnboardingView } from "@/views/OnboardingView";
import { ResetPasswordView } from "@/views/ResetPasswordView";
import { NotFoundView } from "@/views/NotFoundView";

// ── Lazy: every heavy authed app view becomes its own chunk. This pulls
//    recharts + the big tables OUT of the main bundle that EVERY page load
//    (including login) used to download + parse. The Suspense boundary that
//    catches these lives inside ProtectedRoute, so the app shell stays put
//    while a route chunk loads. ──
const KanbanView = lazyWithReload(() => import("@/views/KanbanView").then((m) => ({ default: m.KanbanView })));
const BriefingView = lazyWithReload(() => import("@/views/BriefingView").then((m) => ({ default: m.BriefingView })));
const ConceptsView = lazyWithReload(() => import("@/views/ConceptsView").then((m) => ({ default: m.ConceptsView })));
const ProductionView = lazyWithReload(() => import("@/views/ProductionView").then((m) => ({ default: m.ProductionView })));
const OrdersView = lazyWithReload(() => import("@/views/OrdersView").then((m) => ({ default: m.OrdersView })));
const NotificationsView = lazyWithReload(() => import("@/views/NotificationsView").then((m) => ({ default: m.NotificationsView })));
const TaskDashboardView = lazyWithReload(() => import("@/views/TaskDashboardView").then((m) => ({ default: m.TaskDashboardView })));
const ScorecardsView = lazyWithReload(() => import("@/views/ScorecardsView").then((m) => ({ default: m.ScorecardsView })));
const ScorecardDetailView = lazyWithReload(() => import("@/views/ScorecardDetailView").then((m) => ({ default: m.ScorecardDetailView })));
const SystemView = lazyWithReload(() => import("@/views/SystemView").then((m) => ({ default: m.SystemView })));
const SalvedgeView = lazyWithReload(() => import("@/views/SalvedgeView").then((m) => ({ default: m.SalvedgeView })));
const ProfileView = lazyWithReload(() => import("@/views/ProfileView").then((m) => ({ default: m.ProfileView })));
const FilesView = lazyWithReload(() => import("@/views/FilesView").then((m) => ({ default: m.FilesView })));
const FullKittingFormView = lazyWithReload(() => import("@/views/FullKittingFormView"));
const KittingQueueView = lazyWithReload(() => import("@/views/KittingQueueView"));

export default function App() {
  return (
    <BrowserRouter>
      <Toaster />

      <Routes>
        {/* Public + auth-flow pages — no app shell */}
        <Route path={ROUTES.login} element={<LoginView />} />
        <Route path="/reset-password" element={<ResetPasswordView />} />
        <Route path={ROUTES.onboarding} element={<OnboardingView />} />

        {/* /home → redirect to /dashboard (legacy) */}
        <Route path={ROUTES.home} element={<Navigate to={ROUTES.dashboard} replace />} />

        {/* /dashboard — Task board (all roles) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.dashboard} element={<KanbanView />} />
          <Route path="/dashboard/tasks" element={<KanbanView />} />
        </Route>

        {/* /brief/new — New task briefing form (all roles can log briefs) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["super_admin", "admin", "design_coordinator", "designer"]}
            />
          }
        >
          <Route path={ROUTES.briefNew} element={<BriefingView />} />
        </Route>

        {/* /concepts — Concept approval board (all roles) */}
        <Route
          element={<ProtectedRoute allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.concepts} element={<ConceptsView />} />
        </Route>

        {/* /orders — Orders module (admin + coordinator). Placeholder for
            now; data model + workflow TBD. Same access scope as Sampling. */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator"]} />
          }
        >
          <Route path={ROUTES.orders} element={<OrdersView />} />
        </Route>

        {/* /sampling — Production queue (admin + coordinator) */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator"]} />
          }
        >
          <Route path={ROUTES.sampling} element={<ProductionView />} />
        </Route>

        {/* /analytics — KPI dashboard (admin + coordinator) */}
        {/* /analytics — Insights dashboard (ALL roles: admin sees team view, designer sees personal) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]}
            />
          }
        >
          {/* /analytics is preserved as a redirect — the Concept Dashboard
              now lives as a tab inside /task-dashboard. Old bookmarks and
              outbound links continue to work; new sidebar entry is gone. */}
          <Route
            path={ROUTES.analytics}
            element={<Navigate to={`${ROUTES.taskDashboard}?tab=concepts`} replace />}
          />
        </Route>

        {/* /team → redirect to Settings (Team Management tab lives there now) */}
        <Route path={ROUTES.team} element={<Navigate to={ROUTES.system} replace />} />

        {/* /notifications — accessible by ALL roles */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.notifications} element={<NotificationsView />} />
        </Route>

        {/* /profile — User profile (ALL roles) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.profile} element={<ProfileView />} />
        </Route>

        {/* /task-dashboard — Task performance insights (ALL roles) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "super_admin", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.taskDashboard} element={<TaskDashboardView />} />
        </Route>

        {/* /scorecards — Designer performance scorecards (admin + coordinator) */}
        <Route element={<ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator"]} />}>
          <Route path={ROUTES.scorecards} element={<ScorecardsView />} />
        </Route>

        {/* /scorecards/:designerId — Full-page scorecard. Admin sees anyone;
            designer sees only their own (gated inside the view). */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["super_admin", "admin", "designer", "design_coordinator"]}
            />
          }
        >
          <Route
            path={`${ROUTES.scorecards}/:designerId`}
            element={<ScorecardDetailView />}
          />
        </Route>

        {/* /system — Data management (admin + coordinator) */}
        <Route
          element={<ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.system} element={<SystemView />} />
        </Route>

        {/* /salvedge — all roles. Designers see only records assigned to them. */}
        <Route
          element={<ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator", "designer"]} />}
        >
          <Route path={ROUTES.salvedge} element={<SalvedgeView />} />
        </Route>

        {/* /files — File browser (all roles) */}
        <Route
          element={<ProtectedRoute allowedRoles={["super_admin", "admin", "design_coordinator", "designer"]} />}
        >
          <Route path={ROUTES.files} element={<FilesView />} />
        </Route>

        {/* /kitting — DEO queue (and admin/coordinator monitoring view).
            /kitting/:recordId — edit a specific record's digital form. */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["super_admin", "admin", "design_coordinator", "deo"]}
            />
          }
        >
          <Route path={ROUTES.kitting} element={<KittingQueueView />} />
          <Route
            path={`${ROUTES.kitting}/:recordId`}
            element={<FullKittingFormView />}
          />
        </Route>

        {/* Legacy aliases — old links still resolve */}
        <Route
          path="/kanban"
          element={<Navigate to={ROUTES.dashboard} replace />}
        />
        <Route
          path="/briefing"
          element={<Navigate to={ROUTES.briefNew} replace />}
        />
        <Route
          path="/production"
          element={<Navigate to={ROUTES.sampling} replace />}
        />

        {/* Root — routes to the user's role-appropriate landing page. */}
        <Route path="/" element={<RootRedirect />} />

        {/* 404 — show inside the app shell so the user keeps their nav. */}
        <Route element={<ProtectedRoute />}>
          <Route path="*" element={<NotFoundView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
