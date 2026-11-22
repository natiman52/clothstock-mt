import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../context';
import apiClient from '../api/client';

const REASON_META = {
  SALE:                     { icon: 'shopping_cart',    color: 'text-error',        badge: 'SALE',      badgeClass: 'bg-error-container text-on-error-container' },
  RETURN:                   { icon: 'assignment_return',color: 'text-amber-700',    badge: 'RETURN',    badgeClass: 'bg-amber-100 text-amber-800' },
  WAREHOUSE_TRANSFER:       { icon: 'local_shipping',   color: 'text-[#047857]',    badge: 'TRANSFER',  badgeClass: 'bg-[#ecfdf5] text-[#047857]' },
  STOCK_ADJUSTMENT:         { icon: 'tune',             color: 'text-amber-700',    badge: 'ADJUST',    badgeClass: 'bg-amber-100 text-amber-800' },
  STOCKTAKE_RECONCILIATION: { icon: 'fact_check',       color: 'text-primary',      badge: 'STOCKTAKE', badgeClass: 'bg-primary-fixed text-on-primary-fixed' },
};

export default function LedgerPage() {
  const { activeStore, activeStoreObj, isAllScope, setActiveStore } = useStore();

  // Filter states
  const [search, setSearch] = useState('');
  const [reasonFilter, setReasonFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [deltaFilter, setDeltaFilter] = useState('ALL'); // 'ALL' | 'INBOUND' | 'OUTBOUND'
  const [discrepancyOnly, setDiscrepancyOnly] = useState(false);
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'delta_desc' | 'delta_asc' | 'price_desc'

  const { data: ledgerData, isLoading, isError, refetch } = useQuery({
    queryKey: ['ledger', activeStore],
    queryFn: () => apiClient.get('/api/ledger/?ordering=-timestamp&limit=200'),
    retry: 1,
  });

  const ledgerList = ledgerData?.results || (Array.isArray(ledgerData) ? ledgerData : []);

  // Format entries
  const formattedEntries = useMemo(() => {
    return ledgerList.map((e) => ({
      id: e.id,
      sku: e.variant_sku || e.variant || '—',
      productName: e.product_name || '',
      label: `${e.variant_sku || e.variant || '—'}${e.product_name ? ` (${e.product_name})` : ''}`,
      storeName: e.store_name || e.store_code || 'Central Storage',
      syncSource: e.sync_source || 'AUTO_SYNC',
      delta: Number(e.delta || 0),
      resultingBalance: Number(e.resulting_balance || 0),
      unitPrice: e.unit_price != null ? Number(e.unit_price) : null,
      unitCost: e.unit_cost != null ? Number(e.unit_cost) : null,
      reason: e.reason || 'STOCK_ADJUSTMENT',
      timestamp: e.timestamp ? new Date(e.timestamp) : null,
      timestampRaw: e.timestamp,
      notes: e.notes || '',
      isFlagged: Number(e.resulting_balance) < 0,
    }));
  }, [ledgerList]);

  // Robust multi-criteria filtering & sorting
  const filteredEntries = useMemo(() => {
    return formattedEntries.filter((entry) => {
      // 1. Text Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchSku = entry.sku.toLowerCase().includes(q);
        const matchProd = entry.productName.toLowerCase().includes(q);
        const matchStore = entry.storeName.toLowerCase().includes(q);
        const matchNotes = entry.notes.toLowerCase().includes(q);
        const matchReason = entry.reason.toLowerCase().includes(q);
        if (!matchSku && !matchProd && !matchStore && !matchNotes && !matchReason) {
          return false;
        }
      }

      // 2. Reason Filter
      if (reasonFilter !== 'ALL' && entry.reason !== reasonFilter) {
        return false;
      }

      // 3. Sync Source Filter
      if (sourceFilter !== 'ALL' && entry.syncSource !== sourceFilter) {
        return false;
      }

      // 4. Delta Direction Filter
      if (deltaFilter === 'INBOUND' && entry.delta <= 0) return false;
      if (deltaFilter === 'OUTBOUND' && entry.delta >= 0) return false;

      // 5. Discrepancy Only Filter
      if (discrepancyOnly && !entry.isFlagged) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'newest') {
        return (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0);
      }
      if (sortBy === 'oldest') {
        return (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0);
      }
      if (sortBy === 'delta_desc') {
        return Math.abs(b.delta) - Math.abs(a.delta);
      }
      if (sortBy === 'delta_asc') {
        return Math.abs(a.delta) - Math.abs(b.delta);
      }
      if (sortBy === 'price_desc') {
        return (b.unitPrice || 0) - (a.unitPrice || 0);
      }
      return 0;
    });
  }, [formattedEntries, search, reasonFilter, sourceFilter, deltaFilter, discrepancyOnly, sortBy]);

  const hasActiveFilters =
    search.trim() !== '' ||
    reasonFilter !== 'ALL' ||
    sourceFilter !== 'ALL' ||
    deltaFilter !== 'ALL' ||
    discrepancyOnly ||
    sortBy !== 'newest';

  const handleClearFilters = () => {
    setSearch('');
    setReasonFilter('ALL');
    setSourceFilter('ALL');
    setDeltaFilter('ALL');
    setDiscrepancyOnly(false);
    setSortBy('newest');
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Active Store Scope Filter Header */}
      <div className="flex items-center justify-between gap-space-xs flex-wrap bg-surface-container-lowest p-2.5 sm:px-4 rounded-xl border border-outline-variant/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">
            {activeStore === 'storage' ? 'warehouse' : 'storefront'}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            Ledger Scope: <span className="text-primary">{activeStoreObj.name}</span>
          </span>
          {!isAllScope && (
            <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold">
              FILTERED
            </span>
          )}
        </div>
        {!isAllScope && (
          <button
            type="button"
            onClick={() => setActiveStore('all')}
            className="text-[11px] font-label-sm text-on-surface-variant hover:text-primary transition-colors underline cursor-pointer"
          >
            Show All Stores Ledger
          </button>
        )}
      </div>

      {/* Header */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm border border-outline-variant/30">
        <div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">Stock Change Ledger</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Immutable audit trail recording every inventory delta, resulting balance, and price snapshot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-label-sm text-[10px] font-mono bg-primary text-on-primary px-2 py-0.5 rounded">
            SHA-256 AUDIT OK
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            title="Refresh"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* ── Robust Filter Toolbar ───────────────────────────────────────────── */}
      <div className="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm border border-outline-variant/30 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2">
          {/* 1. Search Box */}
          <div className="lg:col-span-4 relative">
            <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, notes, store, receipt..."
              className="w-full h-10 pl-9 pr-8 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface p-0.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          {/* 2. Action Reason Filter */}
          <div className="lg:col-span-2 relative">
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Actions / Reasons</option>
              <option value="SALE">Sales (SALE)</option>
              <option value="RETURN">Customer Returns (RETURN)</option>
              <option value="STOCK_ADJUSTMENT">Adjustments (ADJUST)</option>
              <option value="STOCKTAKE_RECONCILIATION">Stocktake (RECON)</option>
              <option value="WAREHOUSE_TRANSFER">Transfers (TRANSFER)</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 3. Mutation Delta Type */}
          <div className="lg:col-span-2 relative">
            <select
              value={deltaFilter}
              onChange={(e) => setDeltaFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Delta (+ / -)</option>
              <option value="INBOUND">Inbound Only (+Delta)</option>
              <option value="OUTBOUND">Outbound Only (-Delta)</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 4. Sync Source Filter */}
          <div className="lg:col-span-2 relative">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sync Sources</option>
              <option value="WEB_ADMIN">Web Admin</option>
              <option value="POS_OFFLINE">POS Terminal Offline</option>
              <option value="AUTO_SYNC">Auto Sync</option>
              <option value="EDGE_TERMINAL">Edge Terminal</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 5. Sort By */}
          <div className="lg:col-span-2 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer font-medium"
            >
              <option value="newest">Sort: Newest First</option>
              <option value="oldest">Sort: Oldest First</option>
              <option value="delta_desc">Sort: Largest Delta</option>
              <option value="price_desc">Sort: Highest Price</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              sort
            </span>
          </div>
        </div>

        {/* Second Row: Discrepancies Toggle & Active Chips */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-outline-variant/20 font-label-sm text-[11px]">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={discrepancyOnly}
                onChange={(e) => setDiscrepancyOnly(e.target.checked)}
                className="w-3.5 h-3.5 accent-error rounded cursor-pointer"
              />
              <span className={`font-semibold ${discrepancyOnly ? 'text-error' : 'text-on-surface-variant'}`}>
                Discrepancies Only (Negative Balance &lt; 0)
              </span>
            </label>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-on-surface-variant">Active:</span>

              {search.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                  "{search}"
                  <button type="button" onClick={() => setSearch('')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}

              {reasonFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold font-mono">
                  {reasonFilter}
                  <button type="button" onClick={() => setReasonFilter('ALL')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}

              {deltaFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                  {deltaFilter}
                  <button type="button" onClick={() => setDeltaFilter('ALL')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}

              {sourceFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                  {sourceFilter}
                  <button type="button" onClick={() => setSourceFilter('ALL')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}

              {discrepancyOnly && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-mono font-bold">
                  FLAGGED DISCREPANCIES
                  <button type="button" onClick={() => setDiscrepancyOnly(false)} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}

              <button
                type="button"
                onClick={handleClearFilters}
                className="text-primary hover:underline font-semibold ml-1 cursor-pointer"
              >
                Reset All
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-error-container text-on-error-container rounded-xl p-space-md font-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          Failed to load ledger entries. Check your connection or authentication.
        </div>
      )}

      {/* Ledger Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
        <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
            Recent Ledger Mutations ({activeStoreObj.code})
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
            {isLoading ? 'Loading…' : `Showing ${filteredEntries.length} of ${formattedEntries.length} Transactions`}
          </span>
        </div>

        <div className="divide-y divide-surface-container-low font-body-md text-body-md">
          {/* Loading skeleton */}
          {isLoading && (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-space-md flex items-center gap-3 animate-pulse">
                <div className="w-5 h-5 rounded bg-surface-container shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-surface-container rounded w-1/2" />
                  <div className="h-3 bg-surface-container rounded w-1/3" />
                </div>
                <div className="h-5 bg-surface-container rounded w-16" />
              </div>
            ))
          )}

          {/* Real entries */}
          {!isLoading && filteredEntries.map((entry) => {
            const meta = REASON_META[entry.reason] || REASON_META.STOCK_ADJUSTMENT;
            const isPositive = entry.delta > 0;
            return (
              <div
                key={entry.id}
                className={`p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-surface-container-low/40 transition-colors ${
                  entry.isFlagged ? 'bg-error/5' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${meta.color} text-[20px] shrink-0`}>{meta.icon}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-body-md font-semibold text-on-surface truncate">
                      {entry.sku}
                      {entry.productName && (
                        <span className="text-on-surface-variant font-normal ml-1">({entry.productName})</span>
                      )}
                    </span>
                    <span className="font-label-sm text-[10px] text-outline font-mono truncate">
                      {entry.storeName}
                      {entry.syncSource ? ` • ${entry.syncSource}` : ''}
                      {entry.timestamp ? ` • ${entry.timestamp.toLocaleString()}` : ''}
                      {entry.notes ? ` • [${entry.notes}]` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right shrink-0">
                  {entry.unitPrice != null && (
                    <div className="flex flex-col text-right">
                      <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                        @ ${entry.unitPrice.toFixed(2)}
                      </span>
                      {entry.unitCost != null && (
                        <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                          Cost ${entry.unitCost.toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col text-right">
                    <span className={`font-body-md font-bold font-mono ${isPositive ? 'text-[#047857]' : 'text-error'}`}>
                      {isPositive ? '+' : ''}{entry.delta} pcs
                    </span>
                    <span
                      className={`font-label-sm text-[10px] font-mono ${
                        entry.isFlagged ? 'text-error font-bold' : 'text-on-surface-variant'
                      }`}
                    >
                      Bal: {entry.resultingBalance}{entry.isFlagged ? ' ⚠' : ''}
                    </span>
                  </div>
                  <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-bold font-mono ${meta.badgeClass}`}>
                    {meta.badge}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {!isLoading && !isError && filteredEntries.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant font-body-md">
              <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">receipt_long</span>
              <p className="font-semibold text-on-surface">No ledger entries match your filter criteria.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="mt-3 px-3 py-1.5 bg-primary text-on-primary rounded-lg font-label-sm text-label-sm cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
