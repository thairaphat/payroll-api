import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/store/auth";
import { canAccessRole } from "@/lib/authz";
import type { Role } from "@/types/domain";

type ProtectedRouteProps = {
  allowedRoles?: Role[];
};

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessRole(user.role, allowedRoles)) {
    return <Navigate to="/access-denied" replace />;
  }

  return <Outlet />;
}
