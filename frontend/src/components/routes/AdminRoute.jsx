import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function AdminRoute({ children }) {
  const { isAuthenticated, isAdmin, isAuthLoading, user } = useAuth();
  const location = useLocation();
  const from = `${location.pathname}${location.search}`;

  if (isAuthLoading) {
    return (
      <main className="p-8">
        <p className="text-slate-600">Checking authentication...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from }}
      />
    );
  }

  if (!user?.isEmailVerified) {
    return <Navigate to="/verify-required" replace state={{ from }} />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
