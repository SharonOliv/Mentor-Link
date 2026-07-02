import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "./features/auth/LoginPage";
import { ChangePasswordPage } from "./features/auth/ChangePasswordPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { RoleRoute } from "./routes/RoleRoute";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { MentorDashboard } from "./features/mentor/MentorDashboard";
import { StudentDashboard } from "./features/student/StudentDashboard";
import { AdminDashboard } from "./features/admin/AdminDashboard";
import { AnalyticsPage } from "./features/admin/AnalyticsPage";
import { NotificationsPage } from "./features/notifications/NotificationsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuth } from "./context/AuthContext";

const mentorNavItems = [{ to: "/mentor/dashboard", label: "Office hours" }];
const studentNavItems = [{ to: "/student/dashboard", label: "Book an appointment" }];
const adminNavItems = [
  { to: "/admin/dashboard", label: "Accounts" },
  { to: "/admin/analytics", label: "Analytics" },
];

const HomeRedirect = () => {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (user.role === "mentor") return <Navigate to="/mentor/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
};

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<RoleRoute allow={["mentor"]} />}>
          <Route element={<DashboardLayout navItems={mentorNavItems} />}>
            <Route path="/mentor/dashboard" element={<MentorDashboard />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allow={["student"]} />}>
          <Route element={<DashboardLayout navItems={studentNavItems} />}>
            <Route path="/student/dashboard" element={<StudentDashboard />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>

        <Route element={<RoleRoute allow={["admin"]} />}>
          <Route element={<DashboardLayout navItems={adminNavItems} />}>
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/analytics" element={<AnalyticsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
