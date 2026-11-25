import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { isTauri } from './api/pos';
import SyncStatusBadge from './components/SyncStatusBadge';
import usePosState from './hooks/usePosState';

function ErrorBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="bg-error-container text-on-error-container p-space-sm rounded-lg flex items-center gap-space-xs">
      <span className="material-symbols-outlined text-[18px] text-error">error</span>
      <span className="font-body-sm text-body-sm flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="p-1 rounded hover:bg-error/10">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const posState = usePosState({ setError, setNotice });
  const { settings, syncStatus, busy, loading, onSync } = posState;

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-[22px]">hub</span>
          </div>
          <span className="font-label-sm text-on-surface-variant tracking-wider uppercase font-semibold">
            Starting POS node...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface flex min-h-screen">
      <aside className="hidden md:flex flex-col justify-between fixed left-0 top-0 h-full w-64 bg-surface-container-lowest border-r border-outline-variant/30 z-50">
        <div>
          <div className="h-14 px-space-lg flex items-center justify-between border-b border-outline-variant/30 bg-surface-container-low">
            <div className="flex items-center gap-space-sm">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[18px]">point_of_sale</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-headline-sm text-[15px] font-bold tracking-tight text-primary leading-tight">
                  ClothPos
                </span>
                <span className="font-label-sm text-[9px] text-outline uppercase tracking-wider font-semibold">
                  Checkout Terminal
                </span>
              </div>
            </div>
            <span className="font-label-sm text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant border border-outline-variant/40 font-mono font-bold">
              EDGE
            </span>
          </div>
          <nav className="px-space-md py-space-sm flex flex-col gap-1">
            {[
              { id: 'checkout', label: 'Checkout', icon: 'shopping_cart' },
              { id: 'products', label: 'Products', icon: 'inventory_2' },
              { id: 'variants', label: 'Variants', icon: 'style' },
              { id: 'categories', label: 'Categories', icon: 'category' },
              { id: 'sales', label: 'Sales History', icon: 'receipt_long' },
              { id: 'settings', label: 'Sync & Settings', icon: 'sync' },
            ].map((item) => (
              <NavLink
                key={item.id}
                to={`/${item.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-space-sm py-2 rounded text-left ${
                    isActive
                      ? 'bg-primary text-on-primary font-semibold shadow-sm'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`
                }
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span className="font-body-md">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="p-space-md border-t border-outline-variant/30 font-label-sm text-[9px] font-mono text-outline">
          <div className="flex items-center justify-between px-space-xs">
            <span>POS-NODE: {settings?.storeCode || 'UNASSIGNED'}</span>
            <span className={settings?.hasToken ? 'text-[#047857] font-semibold' : 'text-error'}>
              {settings?.hasToken ? 'CLOUD: READY' : 'CLOUD: OFFLINE'}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen md:pl-64 w-full">
        <header className="fixed top-0 left-0 md:left-64 right-0 h-14 bg-surface-container-lowest/95 backdrop-blur-xl border-b border-outline-variant/30 z-40 px-3 sm:px-space-lg flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-on-surface-variant text-[18px]">storefront</span>
            <span className="font-headline-sm text-[15px] truncate">
              {settings?.storeName || 'Local Terminal'}
            </span>
            <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold">
              {settings?.storeCode || 'NO STORE'}
            </span>
            {!isTauri() && (
              <span className="font-label-sm text-[10px] bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-mono">
                BROWSER PREVIEW
              </span>
            )}
          </div>
          <SyncStatusBadge status={syncStatus} busy={busy} onSync={onSync} />
        </header>

        <main className="mt-10 flex-1 pt-14 p-3 sm:p-space-lg max-w-[1600px] w-full mx-auto space-y-space-md">
          <ErrorBanner message={error} onDismiss={() => setError('')} />
          {notice && (
            <div className="bg-[#ecfdf5] text-[#047857] p-space-sm rounded-lg font-body-sm">{notice}</div>
          )}
          <Outlet context={posState} />
        </main>
      </div>
    </div>
  );
}
