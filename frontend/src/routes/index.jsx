/**
 * Central route table.
 *
 * Structure
 * ─────────
 * /login              → LoginPage  (public only)
 * /                   → Dashboard layout (protected)
 *   ├── (index)       → AnalyticsPage
 *   ├── analytics     → redirects to /
 *   ├── staff         → StaffPage
 *   ├── catalog       → CatalogPage
 *   └── ledger        → LedgerPage
 * *                   → 404 / redirect to /
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute    from './PublicRoute';

// Pages
import LoginPage     from '../pages/LoginPage';
import DashboardPage from '../pages/DashboardPage';
import AnalyticsPage from '../pages/AnalyticsPage';
import StaffPage     from '../pages/StaffPage';
import CatalogPage   from '../pages/CatalogPage';
import LedgerPage    from '../pages/LedgerPage';

export default function AppRoutes() {
  return (
    <Routes>
      {/* ── Public (unauthenticated only) ─────────────────────── */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>

      {/* ── Protected (authenticated only) ────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />}>
          <Route index element={<AnalyticsPage />} />
          <Route path="analytics" element={<Navigate to="/" replace />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="ledger" element={<LedgerPage />} />
        </Route>
      </Route>

      {/* ── Catch-all ─────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
