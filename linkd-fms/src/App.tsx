import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/Toaster";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginView } from "@/views/LoginView";
import { OnboardingView } from "@/views/OnboardingView";
import { NotFoundView } from "@/views/NotFoundView";
import { DashboardView } from "@/views/DashboardView";
import { KanbanView } from "@/views/KanbanView";
import { BriefingView } from "@/views/BriefingView";
import { ConceptsView } from "@/views/ConceptsView";
import { ProductionView } from "@/views/ProductionView";
import { NotificationsView } from "@/views/NotificationsView";
import { TaskDashboardView } from "@/views/TaskDashboardView";
import { ScorecardsView } from "@/views/ScorecardsView";
import { ScorecardDetailView } from "@/views/ScorecardDetailView";
import { SystemView } from "@/views/SystemView";
import { SalvedgeView } from "@/views/SalvedgeView";
import { ProfileView } from "@/views/ProfileView";
import { FilesView } from "@/views/FilesView";
import { ResetPasswordView } from "@/views/ResetPasswordView";
import FullKittingFormView from "@/views/FullKittingFormView";
import KittingQueueView from "@/views/KittingQueueView";
import { RootRedirect } from "@/components/layout/RootRedirect";
import { ROUTES } from "@/lib/routes";

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
              allowedRoles={["designer", "admin", "design_coordinator"]}
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
              allowedRoles={["admin", "design_coordinator", "designer"]}
            />
          }
        >
          <Route path={ROUTES.briefNew} element={<BriefingView />} />
        </Route>

        {/* /concepts — Concept approval board (all roles) */}
        <Route
          element={<ProtectedRoute allowedRoles={["designer", "admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.concepts} element={<ConceptsView />} />
        </Route>

        {/* /sampling — Production queue (admin + coordinator) */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />
          }
        >
          <Route path={ROUTES.sampling} element={<ProductionView />} />
        </Route>

        {/* /analytics — KPI dashboard (admin + coordinator) */}
        {/* /analytics — Insights dashboard (ALL roles: admin sees team view, designer sees personal) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "admin", "design_coordinator"]}
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
              allowedRoles={["designer", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.notifications} element={<NotificationsView />} />
        </Route>

        {/* /profile — User profile (ALL roles) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.profile} element={<ProfileView />} />
        </Route>

        {/* /task-dashboard — Task performance insights (ALL roles) */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["designer", "admin", "design_coordinator"]}
            />
          }
        >
          <Route path={ROUTES.taskDashboard} element={<TaskDashboardView />} />
        </Route>

        {/* /scorecards — Designer performance scorecards (admin only) */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route path={ROUTES.scorecards} element={<ScorecardsView />} />
        </Route>

        {/* /scorecards/:designerId — Full-page scorecard. Admin sees anyone;
            designer sees only their own (gated inside the view). */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["admin", "designer", "design_coordinator"]}
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
          element={<ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.system} element={<SystemView />} />
        </Route>

        {/* /salvedge — admin + design_coordinator only. Designers no longer
            see Salvedge in the sidebar; a direct URL visit lands on the
            inline access-restricted panel. */}
        <Route
          element={<ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.salvedge} element={<SalvedgeView />} />
        </Route>

        {/* /files — File browser (all roles) */}
        <Route
          element={<ProtectedRoute allowedRoles={["admin", "design_coordinator", "designer"]} />}
        >
          <Route path={ROUTES.files} element={<FilesView />} />
        </Route>

        {/* /kitting — DEO queue (and admin/coordinator monitoring view).
            /kitting/:recordId — edit a specific record's digital form. */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={["admin", "design_coordinator", "deo"]}
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
