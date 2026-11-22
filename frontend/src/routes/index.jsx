/**
 * Central route table.
 *
 * Structure
 * ─────────
 * /login                  → LoginPage  (public only)
 * /                       → Dashboard layout (protected)
 *   ├── (index)           → AnalyticsPage
 *   ├── analytics         → redirects to /
 *   ├── staff             → StaffPage
 *   │   └── :userId       → UserDetailPage
 *   ├── catalog           → CatalogPage
 *   │   ├── new           → CreateProductPage
 *   │   └── :productId    → ProductDetailPage
 *   ├── variants
 *   │   ├── new           → CreateVariantPage
 *   │   └── :variantId    → VariantDetailPage
 *   ├── categories        → CategoriesPage
 *   ├── stores            → StoresPage
 *   ├── inventory         → InventoryAdjustPage
 *   └── ledger            → LedgerPage
 * *                       → 404 / redirect to /
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import PublicRoute    from './PublicRoute';

// Pages
import LoginPage           from '../pages/LoginPage';
import DashboardPage       from '../pages/DashboardPage';
import AnalyticsPage       from '../pages/AnalyticsPage';
import StaffPage           from '../pages/StaffPage';
import CatalogPage         from '../pages/CatalogPage';
import LedgerPage          from '../pages/LedgerPage';
import ProductDetailPage   from '../pages/ProductDetailPage';
import VariantDetailPage   from '../pages/VariantDetailPage';
import UserDetailPage      from '../pages/UserDetailPage';
import CategoriesPage      from '../pages/CategoriesPage';
import StoresPage          from '../pages/StoresPage';
import CreateProductPage   from '../pages/CreateProductPage';
import CreateVariantPage   from '../pages/CreateVariantPage';
import InventoryAdjustPage from '../pages/InventoryAdjustPage';

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
          <Route path="staff/:userId" element={<UserDetailPage />} />
          <Route path="catalog" element={<CatalogPage />} />
          <Route path="catalog/new" element={<CreateProductPage />} />
          <Route path="catalog/:productId" element={<ProductDetailPage />} />
          <Route path="variants/new" element={<CreateVariantPage />} />
          <Route path="variants/:variantId" element={<VariantDetailPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="stores" element={<StoresPage />} />
          <Route path="inventory" element={<InventoryAdjustPage />} />
          <Route path="ledger" element={<LedgerPage />} />
        </Route>
      </Route>

      {/* ── Catch-all ─────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
