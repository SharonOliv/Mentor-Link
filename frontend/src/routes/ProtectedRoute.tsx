import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { FullPageSpinner } from "../components/FullPageSpinner";

/**
 * Replaces the original app's complete absence of route protection — every
 * dashboard URL in the original was reachable by typing it directly, with
 * no check at all. This component (and RoleRoute below it) is the fix:
 * nothing under a protected route renders until isLoading resolves and a
 * user is confirmed present.
 */
export const ProtectedRoute = () => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
};
