/**
 * VariantDetailPage – /variants/:variantId
 *
 * Tabs:
 *   Overview      – SKU, barcode, size, color, price, cost, timestamps
 *   Inventory     – per-store stock levels for this variant
 *   Ledger        – ledger entries scoped to this variant
 */
import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

const TABS = ['Overview', 'Inventory', 'Ledger'];

const REASON_META = {
  SALE:                     { icon: 'shopping_cart',    color: 'text-error',        badge: 'SALE',      badgeClass: 'bg-error-container text-on-error-container' },
  RETURN:                   { icon: 'assignment_return',color: 'text-amber-700',    badge: 'RETURN',    badgeClass: 'bg-amber-100 text-amber-800' },
  WAREHOUSE_TRANSFER:       { icon: 'local_shipping',   color: 'text-[#047857]',    badge: 'TRANSFER',  badgeClass: 'bg-[#ecfdf5] text-[#047857]' },
  STOCK_ADJUSTMENT:         { icon: 'tune',             color: 'text-amber-700',    badge: 'ADJUST',    badgeClass: 'bg-amber-100 text-amber-800' },
  STOCKTAKE_RECONCILIATION: { icon: 'fact_check',       color: 'text-primary',      badge: 'STOCKTAKE', badgeClass: 'bg-primary-fixed text-on-primary-fixed' },
};

function LedgerEntryRow({ entry }) {
  const meta = REASON_META[entry.reason] || REASON_META.STOCK_ADJUSTMENT;
  const isPos = Number(entry.delta) > 0;
  return (
    <div className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-surface-container-low/40 transition-colors border-b border-outline-variant/10 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined ${meta.color} text-[20px] shrink-0`}>{meta.icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-body-md font-semibold text-on-surface truncate">
            {entry.store_name || 'Central Storage'}
          </span>
          <span className="font-label-sm text-[10px] text-outline font-mono">
            {entry.sync_source || '—'} • {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {(entry.unit_price != null) && (
          <div className="flex flex-col text-right">
            <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">@ ${Number(entry.unit_price).toFixed(2)}</span>
            <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">Cost ${Number(entry.unit_cost ?? 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex flex-col text-right">
          <span className={`font-body-md font-bold font-mono ${isPos ? 'text-[#047857]' : 'text-error'}`}>
            {isPos ? '+' : ''}{entry.delta} pcs
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">Bal: {entry.resulting_balance}</span>
        </div>
        <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-bold font-mono ${meta.badgeClass}`}>
          {meta.badge}
        </span>
      </div>
    </div>
  );
}

export default function VariantDetailPage() {
  const { variantId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');

  // Inventory tab filters
  const [invSearch, setInvSearch] = useState('');
  const [invStatusFilter, setInvStatusFilter] = useState('all'); // 'all' | 'ok' | 'low' | 'negative'

  // Ledger tab filters
  const [ledgerReasonFilter, setLedgerReasonFilter] = useState('all');
  const [ledgerDirectionFilter, setLedgerDirectionFilter] = useState('all');

  const { data: variant, isLoading: loadingVariant, isError } = useQuery({
    queryKey: ['variant', variantId],
    queryFn: () => apiClient.get(`/api/variants/${variantId}/`),
    enabled: !!variantId,
  });

  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: ['variant-inventory', variantId],
    queryFn: () => apiClient.get(`/api/inventory/?variant=${variantId}&limit=100`),
    enabled: !!variantId && activeTab === 'Inventory',
  });

  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['variant-ledger', variantId],
    queryFn: () => apiClient.get(`/api/ledger/?variant=${variantId}&ordering=-timestamp&limit=100`),
    enabled: !!variantId && activeTab === 'Ledger',
  });

  const inventoryRaw = inventoryData?.results || (Array.isArray(inventoryData) ? inventoryData : []);
  const ledgerRaw = ledgerData?.results || (Array.isArray(ledgerData) ? ledgerData : []);

  // ── Filtered inventory ─────────────────────────────────────────────
  const filteredInventory = useMemo(() => {
    return inventoryRaw.filter((inv) => {
      const q = invSearch.toLowerCase().trim();
      const storeName = (inv.store_name || inv.store_code || 'Central Warehouse').toLowerCase();
      if (q && !storeName.includes(q)) return false;
      const qty = inv.quantity_on_hand ?? inv.qty ?? 0;
      if (invStatusFilter === 'ok' && qty <= 5) return false;
      if (invStatusFilter === 'low' && (qty <= 0 || qty > 5)) return false;
      if (invStatusFilter === 'negative' && qty >= 0) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryData, invSearch, invStatusFilter]);

  // ── Filtered ledger entries ────────────────────────────────────────
  const filteredLedger = useMemo(() => {
    return ledgerRaw.filter((e) => {
      if (ledgerReasonFilter !== 'all' && e.reason !== ledgerReasonFilter) return false;
      const delta = Number(e.delta);
      if (ledgerDirectionFilter === 'inbound' && delta <= 0) return false;
      if (ledgerDirectionFilter === 'outbound' && delta >= 0) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerData, ledgerReasonFilter, ledgerDirectionFilter]);

  const inventoryList = inventoryRaw;
  const ledgerEntries = ledgerRaw;

  const productId = variant?.product?.id ?? variant?.product;

  if (isError) {
    return (
      <main className="flex-1 p-space-lg flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-[48px] text-error block">error</span>
          <p className="font-body-md text-on-surface-variant">Variant not found.</p>
          <button onClick={() => navigate(-1)} className="text-primary underline font-label-sm">← Go Back</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-5xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant flex-wrap">
        <Link to="/catalog" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">inventory_2</span>Catalog
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        {productId && (
          <>
            <Link to={`/catalog/${productId}`} className="hover:text-primary transition-colors truncate max-w-[140px]">
              {variant?.product?.name || `Product #${productId}`}
            </Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </>
        )}
        <span className="text-on-surface font-semibold font-mono truncate max-w-[120px]">
          {loadingVariant ? '…' : variant?.sku}
        </span>
      </nav>

      {/* Header Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col sm:flex-row items-start justify-between gap-space-md">
        {loadingVariant ? (
          <div className="animate-pulse space-y-2 w-full">
            <div className="h-4 bg-surface-container rounded w-1/4" />
            <div className="h-7 bg-surface-container rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${variant?.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                  {variant?.is_active ? 'ACTIVE SKU' : 'INACTIVE SKU'}
                </span>
                {variant?.size && (
                  <span className="font-label-sm text-[10px] bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-mono">
                    SIZE {variant.size}
                  </span>
                )}
                {variant?.color && (
                  <span className="font-label-sm text-[10px] bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-mono">
                    {variant.color.toUpperCase()}
                  </span>
                )}
              </div>
              <h1 className="font-headline-md text-headline-sm sm:text-headline-md text-on-surface font-mono">{variant?.sku}</h1>
              <span className="font-label-sm text-[10px] text-outline font-mono">Barcode: {variant?.barcode || '—'}</span>
              {productId && (
                <Link to={`/catalog/${productId}`} className="font-label-sm text-label-sm text-primary hover:underline flex items-center gap-1 mt-1">
                  <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                  View Parent Product: {variant?.product?.name || `#${productId}`}
                </Link>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex gap-3">
                <div className="flex flex-col items-end">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Price</span>
                  <span className="font-mono font-bold text-[#047857] text-[18px]">
                    {variant?.price != null ? `$${Number(variant.price).toFixed(2)}` : '—'}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Cost</span>
                  <span className="font-mono font-semibold text-on-surface text-[18px]">
                    {variant?.cost != null ? `$${Number(variant.cost).toFixed(2)}` : '—'}
                  </span>
                </div>
              </div>
              <span className="font-label-sm text-[9px] text-on-surface-variant font-mono">ID: {variant?.id}</span>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-full sm:w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-label-md text-label-md font-semibold transition-all ${
              activeTab === tab
                ? 'bg-surface-container-lowest text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────── */}
      {activeTab === 'Overview' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 divide-y divide-outline-variant/20">
          {loadingVariant ? (
            <div className="p-space-lg animate-pulse space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-4 bg-surface-container rounded w-3/4" />)}
            </div>
          ) : (
            [
              { label: 'SKU',           value: <span className="font-mono">{variant?.sku}</span> },
              { label: 'Barcode',       value: <span className="font-mono">{variant?.barcode || '—'}</span> },
              { label: 'Size',          value: variant?.size || '—' },
              { label: 'Color',         value: variant?.color || '—' },
              { label: 'Sale Price',    value: variant?.price != null ? `$${Number(variant.price).toFixed(2)}` : '—' },
              { label: 'Unit Cost',     value: variant?.cost != null ? `$${Number(variant.cost).toFixed(2)}` : '—' },
              { label: 'Margin',        value: variant?.price != null && variant?.cost != null
                ? `${(((variant.price - variant.cost) / variant.price) * 100).toFixed(1)}%`
                : '—' },
              { label: 'Status',        value: variant?.is_active ? '✓ Active' : '✗ Inactive' },
              { label: 'Parent Product',value: productId
                ? <Link to={`/catalog/${productId}`} className="text-primary hover:underline">{variant?.product?.name || `Product #${productId}`}</Link>
                : '—' },
              { label: 'Created',       value: variant?.created_at ? new Date(variant.created_at).toLocaleString() : '—' },
              { label: 'Last Updated',  value: variant?.updated_at ? new Date(variant.updated_at).toLocaleString() : '—' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between px-space-md py-3 gap-4">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold w-36 shrink-0">{label}</span>
                <span className="font-body-md text-body-md text-on-surface text-right">{value}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Inventory Tab ────────────────────────────────────────── */}
      {activeTab === 'Inventory' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
          {/* Header + filters */}
          <div className="p-space-md border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Per-Store Stock Levels</span>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Store search */}
              <div className="relative">
                <span className="material-symbols-outlined text-outline text-[14px] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
                <input
                  type="text"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  placeholder="Filter by store..."
                  className="h-8 pl-7 pr-6 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none w-36"
                />
                {invSearch && (
                  <button onClick={() => setInvSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer text-xs">✕</button>
                )}
              </div>
              {/* Stock status filter */}
              <select
                value={invStatusFilter}
                onChange={(e) => setInvStatusFilter(e.target.value)}
                className="h-8 px-2 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="all">All Quantities</option>
                <option value="ok">In Stock (&gt; 5)</option>
                <option value="low">Low Stock (1–5)</option>
                <option value="negative">Negative</option>
              </select>
              <span className="font-label-sm text-[10px] font-mono text-on-surface-variant">
                {loadingInventory ? 'Loading…' : `${filteredInventory.length} / ${inventoryList.length} Locations`}
              </span>
              <Link
                to={`/inventory?variant=${variantId}`}
                className="h-8 px-2.5 bg-primary hover:bg-primary-container text-on-primary font-label-sm text-[11px] font-semibold rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">tune</span>
                <span>Adjust Stock</span>
              </Link>
            </div>
          </div>
          <div className="divide-y divide-outline-variant/10">
            {filteredInventory.map((inv) => {
              const qty = inv.quantity_on_hand ?? inv.qty ?? 0;
              const isLow = qty >= 0 && qty <= 5;
              const isNeg = qty < 0;
              return (
                <div key={inv.id} className="p-space-md flex items-center justify-between gap-3 hover:bg-surface-container-low/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      {inv.store ? 'storefront' : 'warehouse'}
                    </span>
                    <div className="flex flex-col">
                      <span className="font-body-md font-semibold text-on-surface">
                        {inv.store_name || inv.store_code || 'Central Warehouse'}
                      </span>
                      <span className="font-label-sm text-[10px] text-outline font-mono">
                        {inv.store ? `Store #${inv.store}` : 'storage / unassigned'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`font-mono font-bold text-[18px] ${isNeg ? 'text-error' : isLow ? 'text-amber-600' : 'text-[#047857]'}`}>
                      {qty}
                    </span>
                    <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${isNeg ? 'bg-error-container text-on-error-container' : isLow ? 'bg-amber-100 text-amber-800' : 'bg-[#ecfdf5] text-[#047857]'}`}>
                      {isNeg ? 'NEGATIVE' : isLow ? 'LOW' : 'OK'}
                    </span>
                  </div>
                </div>
              );
            })}
            {!loadingInventory && filteredInventory.length === 0 && (
              <div className="py-16 text-center text-on-surface-variant font-body-md">
                <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">inventory</span>
                {invSearch || invStatusFilter !== 'all' ? (
                  <div className="space-y-1">
                    <p>No stock records match the filters.</p>
                    <button onClick={() => { setInvSearch(''); setInvStatusFilter('all'); }} className="text-primary text-xs underline cursor-pointer">Clear filters</button>
                  </div>
                ) : 'No stock records found for this variant.'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ledger Tab ───────────────────────────────────────────── */}
      {activeTab === 'Ledger' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
          {/* Header + filters */}
          <div className="p-space-md border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
              Stock Change Ledger — {variant?.sku}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={ledgerReasonFilter}
                onChange={(e) => setLedgerReasonFilter(e.target.value)}
                className="h-8 px-2 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="all">All Actions</option>
                <option value="SALE">Sales</option>
                <option value="RETURN">Returns</option>
                <option value="STOCK_ADJUSTMENT">Adjustments</option>
                <option value="STOCKTAKE_RECONCILIATION">Stocktakes</option>
                <option value="WAREHOUSE_TRANSFER">Transfers</option>
              </select>
              <select
                value={ledgerDirectionFilter}
                onChange={(e) => setLedgerDirectionFilter(e.target.value)}
                className="h-8 px-2 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="all">All Directions</option>
                <option value="inbound">Inbound (+)</option>
                <option value="outbound">Outbound (−)</option>
              </select>
              {(ledgerReasonFilter !== 'all' || ledgerDirectionFilter !== 'all') && (
                <button
                  onClick={() => { setLedgerReasonFilter('all'); setLedgerDirectionFilter('all'); }}
                  className="h-8 px-2 text-error hover:bg-error-container/30 rounded font-label-sm text-[11px] font-semibold cursor-pointer"
                >
                  Reset
                </button>
              )}
              <span className="font-label-sm text-[10px] font-mono text-on-surface-variant">
                {loadingLedger ? 'Loading…' : `${filteredLedger.length} / ${ledgerEntries.length} Entries`}
              </span>
            </div>
          </div>
          <div>
            {filteredLedger.map((entry) => (
              <LedgerEntryRow key={entry.id} entry={entry} />
            ))}
            {!loadingLedger && filteredLedger.length === 0 && (
              <div className="py-16 text-center text-on-surface-variant font-body-md">
                <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">receipt_long</span>
                {ledgerReasonFilter !== 'all' || ledgerDirectionFilter !== 'all'
                  ? 'No entries match the selected filters.'
                  : 'No ledger entries found for this variant.'}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
