import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context';

/**
 * Wraps public-only routes (e.g. /login).
 * Authenticated users are bounced straight to the dashboard
 * so they never land on the login screen again.
 */
export default function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return null;

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
