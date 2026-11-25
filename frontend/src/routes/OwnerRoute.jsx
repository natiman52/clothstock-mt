import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context';

export default function OwnerRoute() {
  const { isOwner, isLoading } = useAuth();

  if (isLoading) return null;
  return isOwner ? <Outlet /> : <Navigate to="/" replace />;
}
