/**
 * ProductDetailPage – /catalog/:productId
 *
 * Tabs:
 *   Overview   – product metadata, category, style code, active/inactive
 *   Variants   – all SKUs / barcodes with price, cost, size, color, stock
 *   Ledger     – ledger entries filtered to this product's variants
 */
import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

const TABS = ['Overview', 'Variants', 'Ledger'];

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
            {entry.variant_sku || entry.variant || '—'}
          </span>
          <span className="font-label-sm text-[10px] text-outline font-mono truncate">
            {entry.store_name || 'Central Storage'} • {entry.sync_source || '—'} •{' '}
            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right shrink-0">
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
          <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
            Bal: {entry.resulting_balance}
          </span>
        </div>
        <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-bold font-mono shrink-0 ${meta.badgeClass}`}>
          {meta.badge}
        </span>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Overview');

  // Variants tab filters
  const [variantSearch, setVariantSearch] = useState('');
  const [variantStatusFilter, setVariantStatusFilter] = useState('all');

  // Ledger tab filters
  const [ledgerReasonFilter, setLedgerReasonFilter] = useState('all');
  const [ledgerDirectionFilter, setLedgerDirectionFilter] = useState('all');

  const { data: product, isLoading: loadingProduct, isError } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => apiClient.get(`/api/products/${productId}/`),
    enabled: !!productId,
  });

  const { data: variantsData, isLoading: loadingVariants } = useQuery({
    queryKey: ['product-variants', productId],
    queryFn: () => apiClient.get(`/api/variants/?product=${productId}&limit=100`),
    enabled: !!productId && activeTab === 'Variants',
  });

  // For ledger: fetch entries for all variants of this product
  const variantIds = product?.variants?.map((v) => v.id) ?? [];
  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['product-ledger', productId, variantIds.join(',')],
    queryFn: () =>
      apiClient.get(`/api/ledger/?ordering=-timestamp&limit=100&product=${productId}`).catch(() =>
        variantIds.length > 0
          ? apiClient.get(`/api/ledger/?ordering=-timestamp&limit=100`)
          : { results: [] }
      ),
    enabled: !!productId && activeTab === 'Ledger',
  });

  const variantsRaw = variantsData?.results || variantsData || product?.variants || [];
  const ledgerRaw = ledgerData?.results || (Array.isArray(ledgerData) ? ledgerData : []);

  // ── Filtered variants ──────────────────────────────────────────────
  const filteredVariants = useMemo(() => {
    return variantsRaw.filter((v) => {
      const q = variantSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        v.sku?.toLowerCase().includes(q) ||
        v.barcode?.toLowerCase().includes(q) ||
        v.size?.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q);
      if (!matchesSearch) return false;
      if (variantStatusFilter === 'active' && !v.is_active) return false;
      if (variantStatusFilter === 'inactive' && v.is_active) return false;
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantsData, variantSearch, variantStatusFilter]);

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

  const variants = variantsRaw;
  const ledgerEntries = ledgerRaw;

  const categoryName =
    typeof product?.category === 'object'
      ? product.category?.name
      : product?.category_name || product?.category || '—';

  if (isError) {
    return (
      <main className="flex-1 p-space-lg flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-[48px] text-error block">error</span>
          <p className="font-body-md text-on-surface-variant">Product not found.</p>
          <button onClick={() => navigate('/catalog')} className="text-primary underline font-label-sm">← Back to Catalog</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-5xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
        <Link to="/catalog" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">inventory_2</span>Catalog
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-semibold truncate max-w-[200px]">
          {loadingProduct ? '…' : product?.name}
        </span>
      </nav>

      {/* Header Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col sm:flex-row items-start justify-between gap-space-md">
        {loadingProduct ? (
          <div className="animate-pulse space-y-2 w-full">
            <div className="h-5 bg-surface-container rounded w-1/3" />
            <div className="h-8 bg-surface-container rounded w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-2 py-0.5 rounded font-mono font-bold uppercase">
                  {categoryName}
                </span>
                <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${product?.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                  {product?.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">{product?.name}</h1>
              <p className="font-label-sm text-[11px] text-outline font-mono">Style Code: {product?.style_code}</p>
              {product?.description && (
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 max-w-xl">{product.description}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="font-label-sm text-[11px] font-mono bg-surface-container px-2 py-1 rounded">
                {product?.variants?.length ?? 0} Variants
              </span>
              <span className="font-label-sm text-[9px] text-on-surface-variant font-mono">ID: {product?.id}</span>
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
          {loadingProduct ? (
            <div className="p-space-lg animate-pulse space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-4 bg-surface-container rounded w-3/4" />)}
            </div>
          ) : (
            [
              { label: 'Product Name',   value: product?.name },
              { label: 'Style Code',     value: <span className="font-mono">{product?.style_code}</span> },
              { label: 'Category',       value: categoryName },
              { label: 'Status',         value: product?.is_active ? '✓ Active' : '✗ Inactive' },
              { label: 'Description',    value: product?.description || '—' },
              { label: 'Created',        value: product?.created_at ? new Date(product.created_at).toLocaleString() : '—' },
              { label: 'Last Updated',   value: product?.updated_at ? new Date(product.updated_at).toLocaleString() : '—' },
              { label: 'Variant Count',  value: `${product?.variants?.length ?? 0} SKUs` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between px-space-md py-3 gap-4">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold w-36 shrink-0">{label}</span>
                <span className="font-body-md text-body-md text-on-surface text-right">{value}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Variants Tab ─────────────────────────────────────────── */}
      {activeTab === 'Variants' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
          {/* Header + inline filters */}
          <div className="p-space-md border-b border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">SKUs &amp; Variants</span>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <span className="material-symbols-outlined text-outline text-[14px] absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
                <input
                  type="text"
                  value={variantSearch}
                  onChange={(e) => setVariantSearch(e.target.value)}
                  placeholder="SKU, barcode, size, color..."
                  className="h-8 pl-7 pr-6 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none w-40"
                />
                {variantSearch && (
                  <button onClick={() => setVariantSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer text-xs">✕</button>
                )}
              </div>
              <select
                value={variantStatusFilter}
                onChange={(e) => setVariantStatusFilter(e.target.value)}
                className="h-8 px-2 bg-surface-container-low rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <span className="font-label-sm text-[10px] font-mono text-on-surface-variant">
                {loadingVariants ? 'Loading…' : `${filteredVariants.length} / ${variants.length}`}
              </span>
              <Link
                to={`/variants/new?product=${productId}`}
                className="h-8 px-2.5 bg-primary hover:bg-primary-container text-on-primary font-label-sm text-[11px] font-semibold rounded-lg shadow-sm flex items-center gap-1 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">add</span>
                <span>Add SKU</span>
              </Link>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant/20">
                <tr>
                  {['SKU / Barcode', 'Size', 'Color', 'Price', 'Cost', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="py-3 px-space-md font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                {filteredVariants.map((v) => (
                  <tr key={v.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-space-md">
                      <div className="flex flex-col">
                        <span className="font-mono font-semibold text-[13px]">{v.sku}</span>
                        <span className="font-mono text-[10px] text-outline">{v.barcode || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-space-md font-mono">{v.size || '—'}</td>
                    <td className="py-3 px-space-md">{v.color || '—'}</td>
                    <td className="py-3 px-space-md font-mono font-semibold text-[#047857]">
                      {v.price != null ? `$${Number(v.price).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-space-md font-mono text-on-surface-variant">
                      {v.cost != null ? `$${Number(v.cost).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-space-md">
                      <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${v.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                        {v.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-space-md">
                      <Link to={`/variants/${v.id}`} className="text-primary hover:underline font-label-sm text-label-sm flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">open_in_new</span>View
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loadingVariants && filteredVariants.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-on-surface-variant font-body-md">
                      <span className="material-symbols-outlined text-[36px] block mb-2 opacity-40">inventory</span>
                      {variantSearch || variantStatusFilter !== 'all' ? (
                        <div className="space-y-1">
                          <p>No variants match the filters.</p>
                          <button onClick={() => { setVariantSearch(''); setVariantStatusFilter('all'); }} className="text-primary text-xs underline cursor-pointer">Clear filters</button>
                        </div>
                      ) : 'No variants defined for this product.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-outline-variant/10">
            {filteredVariants.map((v) => (
              <div key={v.id} className="p-space-md flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="font-mono font-semibold text-on-surface text-[13px]">{v.sku}</span>
                  <span className="font-mono text-[10px] text-outline">{v.barcode || '—'}</span>
                  <span className="text-[11px] text-on-surface-variant mt-0.5">{v.size} · {v.color}</span>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="font-mono font-bold text-[#047857]">${Number(v.price ?? 0).toFixed(2)}</span>
                  <Link to={`/variants/${v.id}`} className="text-primary font-label-sm flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>View
                  </Link>
                </div>
              </div>
            ))}
            {!loadingVariants && filteredVariants.length === 0 && (
              <div className="py-12 text-center text-on-surface-variant font-body-md">No variants match the filters.</div>
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
              Stock Change Ledger
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
          <div className="divide-y divide-outline-variant/10">
            {filteredLedger.map((entry) => (
              <LedgerEntryRow key={entry.id} entry={entry} />
            ))}
            {!loadingLedger && filteredLedger.length === 0 && (
              <div className="py-16 text-center text-on-surface-variant font-body-md">
                <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">receipt_long</span>
                {ledgerReasonFilter !== 'all' || ledgerDirectionFilter !== 'all'
                  ? 'No entries match the selected filters.'
                  : 'No ledger entries found for this product.'}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
