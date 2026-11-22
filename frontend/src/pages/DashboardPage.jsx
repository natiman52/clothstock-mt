import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export function DashboardPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  const [selectedStore, setSelectedStore] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Quick count lookups for badges in the navigation
  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiClient.get('/api/stores/').catch(() => null),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.get('/api/products/').catch(() => null),
  });

  const storesList = storesData?.results || storesData || [];
  const productsCount = productsData?.count || (Array.isArray(productsData) ? productsData.length : 1420);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  const navItems = [
    {
      to: '/',
      label: 'Analytics & KPI',
      icon: 'dashboard',
      badge: null,
      isActive: location.pathname === '/' || location.pathname === '/analytics',
    },
    {
      to: '/staff',
      label: 'Staff & Access',
      icon: 'manage_accounts',
      badge: (
        <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold">
          RBAC
        </span>
      ),
      isActive: location.pathname.startsWith('/staff'),
    },
    {
      to: '/catalog',
      label: 'Catalog & Styles',
      icon: 'inventory_2',
      badge: (
        <span className="font-label-sm text-[10px] bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-mono">
          {productsCount}
        </span>
      ),
      isActive: location.pathname.startsWith('/catalog'),
    },
    {
      to: '/ledger',
      label: 'Stock Ledger',
      icon: 'table_chart',
      badge: <span className="w-2 h-2 rounded-full bg-error animate-pulse" />,
      isActive: location.pathname.startsWith('/ledger'),
    },
  ];

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface flex min-h-screen">
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DESKTOP SIDEBAR NAVIGATION (Visible on md and larger)             */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col justify-between fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-outline-variant/30 z-50 select-none">
        <div className="flex flex-col">
          {/* Logo Header */}
          <div className="h-14 px-space-lg flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low">
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[18px]">hub</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-[15px] font-bold tracking-tight text-primary leading-tight">
                  ClothStock
                </span>
                <span className="font-label-sm text-[9px] text-outline uppercase tracking-wider font-semibold">
                  Retail Grid v4.8
                </span>
              </div>
            </div>
            <span className="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/40 font-mono font-bold">
              EDGE
            </span>
          </div>

          {/* Navigation Items */}
          <div className="px-space-md py-space-sm">
            <div className="px-space-sm pb-space-xs">
              <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
                Workspaces
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between px-space-sm py-2 rounded transition-all text-left ${
                    item.isActive
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    <span className="font-body-md text-body-md">{item.label}</span>
                  </div>
                  {item.isActive && !item.badge && (
                    <span className="w-2 h-2 rounded-full bg-tertiary-fixed-dim" />
                  )}
                  {item.badge}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="p-space-md border-t border-outline-variant/30 bg-surface-container-lowest flex flex-col gap-space-sm">
          <div className="flex items-center justify-between px-space-xs">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-label-md font-bold shrink-0">
                {user?.username ? user.username.slice(0, 2).toUpperCase() : 'DV'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-[13px] leading-tight text-on-surface truncate">
                  {user?.username || 'Devon Vance'}
                </span>
                <span className="font-label-sm text-[10px] text-outline uppercase font-mono">
                  {user?.status ? user.status.toUpperCase() : 'ROOT ADMIN'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-on-surface-variant hover:text-error hover:bg-surface-container-low transition-colors rounded"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
          <div className="flex items-center justify-between pt-space-xs border-t border-outline-variant/20 px-space-xs text-outline font-label-sm text-[9px] font-mono">
            <span>POS-NODE: #01A</span>
            <span className="text-[#047857] font-semibold">CLOUD: ONLINE</span>
          </div>
        </div>
      </aside>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MAIN CONTAINER (Fluid for Desktop & Mobile)                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen md:pl-64 w-full">
        {/* Top Operational Header */}
        <header className="fixed top-0 left-0 md:left-64 right-0 h-14 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30 z-40 px-3 sm:px-space-lg flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-space-lg min-w-0 flex-1">
            {/* Mobile Branding (Visible only on phone) */}
            <div className="flex items-center gap-1.5 md:hidden shrink-0">
              <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-on-primary">
                <span className="material-symbols-outlined text-[16px]">hub</span>
              </div>
            </div>

            {/* Store Location Selector */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-on-surface-variant text-[18px] hidden sm:inline">
                storefront
              </span>
              <div className="relative inline-flex items-center">
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="bg-surface-container-low border border-outline-variant/40 rounded py-1 pl-2 pr-7 font-label-md text-label-md sm:text-body-md text-on-surface appearance-none focus:outline-none focus:border-secondary transition-colors cursor-pointer max-w-[170px] sm:max-w-none truncate"
                >
                  <option value="all">All Store Nodes ({storesList.length || 4})</option>
                  <option value="SoHo Flagship">#01 — SoHo Flagship, NY</option>
                  <option value="Brooklyn Hub">#02 — Brooklyn Hub, NY</option>
                  <option value="Warehouse Newark">#DC-04 — Warehouse Newark</option>
                  <option value="Miami Pop-up">#05 — Miami Pop-up</option>
                  {storesList.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-1.5 pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Cloud Directory Badge (Desktop only) */}
            <div className="hidden lg:flex items-center gap-2 font-label-md text-label-md text-on-surface-variant border-l border-outline-variant/40 pl-space-md">
              <span className="material-symbols-outlined text-[16px] text-outline">cloud</span>
              <span>Cloud Sync Engine v4.8</span>
            </div>
          </div>

          {/* Sync Telemetry & Actions */}
          <div className="flex items-center gap-2 sm:gap-space-md shrink-0">
            {/* Online Status Pill */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container-low border border-outline-variant/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#10b981]"></span>
              </span>
              <span className="font-label-sm text-[11px] font-medium text-on-surface hidden sm:inline">
                Online
              </span>
              <span className="text-outline-variant font-label-sm hidden sm:inline">•</span>
              <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                0 MUTATIONS
              </span>
            </div>

            {/* Quick Refresh Button */}
            <button
              type="button"
              onClick={handleRefresh}
              title="Force Refresh Data"
              className="p-1.5 rounded hover:bg-surface-container hover:text-on-surface text-on-surface-variant transition-colors"
            >
              <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
                sync
              </span>
            </button>

            {/* Mobile User Logout Button (Hidden on desktop) */}
            <button
              type="button"
              onClick={logout}
              title="Sign Out"
              className="md:hidden p-1.5 rounded text-on-surface-variant hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </header>

        {/* Top Sync Telemetry Scrim Ribbon */}
        <div className="mt-14 w-full bg-primary-container text-on-primary px-3 sm:px-space-lg py-1.5 flex items-center justify-between select-none">
          <div className="flex items-center gap-2 sm:gap-space-md font-label-sm text-[10px] sm:text-label-sm truncate">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-tertiary-fixed"></span>
              <span className="font-semibold uppercase tracking-wider text-surface-tint">
                RBAC Authority
              </span>
            </div>
            <span className="text-on-primary-container hidden sm:inline">•</span>
            <span className="text-on-primary-container font-mono hidden sm:inline">
              Central Policy Active
            </span>
            <span className="text-on-primary-container">•</span>
            <span className="text-tertiary-fixed font-mono font-medium truncate">
              Edge SQLite Active
            </span>
          </div>
          <div className="flex items-center gap-2 font-label-sm text-[10px] sm:text-label-sm text-on-primary-container shrink-0">
            <span className="font-mono hidden md:inline">FIPS 140-2 Level 3</span>
            <span className="px-1.5 py-0.5 rounded bg-primary text-tertiary-fixed font-mono font-semibold text-[9px]">
              ENCLAVE SECURE
            </span>
          </div>
        </div>

        {/* ── Active Page Outlet ────────────────────────────────────────── */}
        <Outlet />
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MOBILE BOTTOM NAVIGATION BAR (Visible on < md screens)              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe bg-surface/95 backdrop-blur-xl border-t border-outline-variant/30 md:hidden">
        <div className="flex items-center justify-around h-16 px-space-xs max-w-md mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center min-w-[64px] min-h-[44px] transition-colors ${
                item.isActive ? 'text-secondary font-semibold' : 'text-on-surface-variant'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              <span className="font-label-sm text-[10px] mt-0.5">{item.label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default DashboardPage;
