import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context';

/**
 * Wraps any route that requires authentication.
 * Unauthenticated users are redirected to /login,
 * and the original destination is preserved in location state
 * so LoginPage can redirect back after a successful login.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null; // App-level spinner handles this

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
