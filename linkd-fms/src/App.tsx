import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster as SonnerToaster } from "sonner";
import { Toaster } from "@/components/ui/Toaster";
import { useTheme } from "@/hooks/useTheme";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { LoginView } from "@/views/LoginView";
import { OnboardingView } from "@/views/OnboardingView";
import { NotFoundView } from "@/views/NotFoundView";
import { DashboardView } from "@/views/DashboardView";
import { KanbanView } from "@/views/KanbanView";
import { BriefingView } from "@/views/BriefingView";
import { ConceptsView } from "@/views/ConceptsView";
import { AnalyticsView } from "@/views/AnalyticsView";
import { ProductionView } from "@/views/ProductionView";
import { TeamView } from "@/views/TeamView";
import { NotificationsView } from "@/views/NotificationsView";
import { TaskDashboardView } from "@/views/TaskDashboardView";
import { SystemView } from "@/views/SystemView";
import { ProfileView } from "@/views/ProfileView";
import { RootRedirect } from "@/components/layout/RootRedirect";
import { ROUTES } from "@/lib/routes";

export default function App() {
  const { resolvedTheme } = useTheme();
  return (
    <BrowserRouter>
      {/* Brand toaster (used by anything importing from @/components/ui). */}
      <Toaster />
      {/* Sonner kept temporarily — existing views still import `toast` from "sonner". */}
      <SonnerToaster position="top-right" richColors theme={resolvedTheme} />

      <Routes>
        {/* Public + auth-flow pages — no app shell */}
        <Route path={ROUTES.login} element={<LoginView />} />
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

        {/* /brief/new — New task briefing form (admin + coordinator) */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />
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
          <Route path={ROUTES.analytics} element={<AnalyticsView />} />
        </Route>

        {/* /team — Team management (admin + coordinator) */}
        <Route
          element={
            <ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />
          }
        >
          <Route path={ROUTES.team} element={<TeamView />} />
        </Route>

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

        {/* /system — Data management (admin + coordinator) */}
        <Route
          element={<ProtectedRoute allowedRoles={["admin", "design_coordinator"]} />}
        >
          <Route path={ROUTES.system} element={<SystemView />} />
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
