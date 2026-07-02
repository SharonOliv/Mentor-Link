import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { UserRole } from "../types";
import { FullPageSpinner } from "../components/FullPageSpinner";

const dashboardPathForRole = (role: UserRole): string => {
  switch (role) {
    case "admin":
      return "/admin/dashboard";
    case "mentor":
      return "/mentor/dashboard";
    case "student":
      return "/student/dashboard";
  }
};

/**
 * Gates a route to a specific role. A logged-in student who manually
 * navigates to /admin/dashboard is redirected to their own dashboard, not
 * shown an error page and not shown the admin UI — there's nothing for
 * them to see either way, so sending them somewhere useful is friendlier
 * than a dead-end "access denied" screen.
 */
export const RoleRoute = ({ allow }: { allow: UserRole[] }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={dashboardPathForRole(user.role)} replace />;
  }

  return <Outlet />;
};
