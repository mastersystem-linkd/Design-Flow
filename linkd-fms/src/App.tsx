import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/Toaster";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { RootRedirect } from "@/components/layout/RootRedirect";
import { ROUTES } from "@/lib/routes";

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
const KanbanView = lazy(() => import("@/views/KanbanView").then((m) => ({ default: m.KanbanView })));
const BriefingView = lazy(() => import("@/views/BriefingView").then((m) => ({ default: m.BriefingView })));
const ConceptsView = lazy(() => import("@/views/ConceptsView").then((m) => ({ default: m.ConceptsView })));
const ProductionView = lazy(() => import("@/views/ProductionView").then((m) => ({ default: m.ProductionView })));
const OrdersView = lazy(() => import("@/views/OrdersView").then((m) => ({ default: m.OrdersView })));
const NotificationsView = lazy(() => import("@/views/NotificationsView").then((m) => ({ default: m.NotificationsView })));
const TaskDashboardView = lazy(() => import("@/views/TaskDashboardView").then((m) => ({ default: m.TaskDashboardView })));
const ScorecardsView = lazy(() => import("@/views/ScorecardsView").then((m) => ({ default: m.ScorecardsView })));
const ScorecardDetailView = lazy(() => import("@/views/ScorecardDetailView").then((m) => ({ default: m.ScorecardDetailView })));
const SystemView = lazy(() => import("@/views/SystemView").then((m) => ({ default: m.SystemView })));
const SalvedgeView = lazy(() => import("@/views/SalvedgeView").then((m) => ({ default: m.SalvedgeView })));
const ProfileView = lazy(() => import("@/views/ProfileView").then((m) => ({ default: m.ProfileView })));
const FilesView = lazy(() => import("@/views/FilesView").then((m) => ({ default: m.FilesView })));
const FullKittingFormView = lazy(() => import("@/views/FullKittingFormView"));
const KittingQueueView = lazy(() => import("@/views/KittingQueueView"));

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
