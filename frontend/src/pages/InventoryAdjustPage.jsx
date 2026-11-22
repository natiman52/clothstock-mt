import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '../context';
import apiClient from '../api/client';

const REASON_OPTIONS = [
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment (General / Restock)' },
  { value: 'RETURN', label: 'Customer Return' },
  { value: 'STOCKTAKE_RECONCILIATION', label: 'Stocktake Audit Reconciliation' },
  { value: 'WAREHOUSE_TRANSFER', label: 'Internal Location Transfer' },
];

export default function InventoryAdjustPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { activeStore } = useStore();

  const preselectedVariant = searchParams.get('variant') || '';

  // Form states
  const [selectedStore, setSelectedStore] = useState(() => {
    if (activeStore && activeStore !== 'all') return activeStore;
    return 'storage';
  });

  const [selectedVariantId, setSelectedVariantId] = useState(preselectedVariant);
  const [mode, setMode] = useState('add'); // 'add' | 'subtract' | 'set'
  const [quantity, setQuantity] = useState(10);
  const [reason, setReason] = useState('STOCK_ADJUSTMENT');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Table filters & sorting
  const [tableSearch, setTableSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'negative'
  const [sortBy, setSortBy] = useState('stock_desc'); // 'stock_desc' | 'stock_asc' | 'sku_asc' | 'name_asc'

  // 1. Fetch available stores
  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiClient.get('/api/stores/'),
  });

  const stores = storesData?.results || (Array.isArray(storesData) ? storesData : []);

  // 2. Fetch variants for selector
  const { data: variantsData } = useQuery({
    queryKey: ['variants-list'],
    queryFn: () => apiClient.get('/api/variants/?limit=150'),
  });

  const variants = variantsData?.results || (Array.isArray(variantsData) ? variantsData : []);

  // 3. Fetch current inventory records
  const { data: inventoryData, isLoading: loadingInventory, refetch: refetchInventory } = useQuery({
    queryKey: ['inventory-records', selectedStore],
    queryFn: () => {
      const url =
        selectedStore === 'storage'
          ? '/api/inventory/storage/?limit=100'
          : selectedStore && selectedStore !== 'all'
          ? `/api/inventory/?store=${selectedStore}&limit=100`
          : '/api/inventory/?limit=100';
      return apiClient.get(url);
    },
  });

  const inventoryList = useMemo(() => {
    return inventoryData?.results || (Array.isArray(inventoryData) ? inventoryData : []);
  }, [inventoryData]);

  // Find current stock on hand for selected store and variant
  const currentInvItem = useMemo(() => {
    if (!selectedVariantId) return null;
    return inventoryList.find((item) => {
      const vId = item.variant?.id || item.variant;
      return String(vId) === String(selectedVariantId);
    });
  }, [inventoryList, selectedVariantId]);

  const currentBalance = currentInvItem ? (currentInvItem.quantity_on_hand ?? 0) : 0;

  // Calculate simulated resulting balance
  const simulated = useMemo(() => {
    const qty = parseInt(quantity, 10) || 0;
    if (mode === 'add') {
      return {
        delta: qty,
        resulting: currentBalance + qty,
      };
    }
    if (mode === 'subtract') {
      return {
        delta: -qty,
        resulting: currentBalance - qty,
      };
    }
    if (mode === 'set') {
      return {
        delta: qty - currentBalance,
        resulting: qty,
      };
    }
    return { delta: 0, resulting: currentBalance };
  }, [currentBalance, mode, quantity]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!selectedVariantId) {
      setErrorMsg('Please select a SKU variation to adjust.');
      return;
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      setErrorMsg('Quantity must be a positive integer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        variant_id: selectedVariantId,
        store: selectedStore === 'storage' ? null : selectedStore,
        type: mode,
        quantity: qty,
        reason: reason,
        notes: notes.trim(),
      };

      const res = await apiClient.post('/api/inventory/adjust/', payload);
      setSuccessMsg(res.message || 'Inventory updated successfully.');

      // Invalidate relevant queries
      await queryClient.invalidateQueries({ queryKey: ['inventory-records'] });
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
      await queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });

      // Reset quantity and notes
      setNotes('');
    } catch (err) {
      const respData = err?.response?.data;
      if (respData) {
        const msgs = Object.entries(respData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        setErrorMsg(msgs);
      } else {
        setErrorMsg('Failed to adjust inventory. Please verify input.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter & sort table inventory
  const filteredInventory = useMemo(() => {
    let list = inventoryList.filter((item) => {
      const q = tableSearch.toLowerCase().trim();
      const sku = (item.variant_sku || '').toLowerCase();
      const barcode = (item.variant_barcode || '').toLowerCase();
      const product = (item.product_name || '').toLowerCase();
      const storeName = (item.store_name || '').toLowerCase();
      const size = (item.variant_size || '').toLowerCase();
      const color = (item.variant_color || '').toLowerCase();

      const matchesSearch =
        !q ||
        sku.includes(q) ||
        barcode.includes(q) ||
        product.includes(q) ||
        storeName.includes(q) ||
        size.includes(q) ||
        color.includes(q);

      if (!matchesSearch) return false;

      const qty = item.quantity_on_hand ?? 0;
      if (statusFilter === 'in_stock' && qty <= 5) return false;
      if (statusFilter === 'low_stock' && (qty <= 0 || qty > 5)) return false;
      if (statusFilter === 'out_of_stock' && qty !== 0) return false;
      if (statusFilter === 'negative' && qty >= 0) return false;

      return true;
    });

    // Sorting
    return [...list].sort((a, b) => {
      const qtyA = a.quantity_on_hand ?? 0;
      const qtyB = b.quantity_on_hand ?? 0;
      if (sortBy === 'stock_desc') return qtyB - qtyA;
      if (sortBy === 'stock_asc') return qtyA - qtyB;
      if (sortBy === 'sku_asc') return (a.variant_sku || '').localeCompare(b.variant_sku || '');
      if (sortBy === 'name_asc') return (a.product_name || '').localeCompare(b.product_name || '');
      return 0;
    });
  }, [inventoryList, tableSearch, statusFilter, sortBy]);

  const activeFiltersCount =
    (tableSearch.trim() ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'stock_desc' ? 1 : 0);

  const resetFilters = () => {
    setTableSearch('');
    setStatusFilter('all');
    setSortBy('stock_desc');
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header Bar */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">warehouse</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
              Stock Control &amp; Balancing
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface tracking-tight mt-0.5">
            Store Inventory &amp; Stock Adjustment
          </h1>
          <p className="font-body-md text-body-sm sm:text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
            Audit, restock, deduct shrinkage, or reconcile balances per location with automatic cryptographic ledger auditing.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Link
            to="/ledger"
            className="h-10 px-4 bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface font-body-md text-body-md font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            <span>View Ledger Trail</span>
          </Link>
        </div>
      </div>

      {/* Main Grid: Adjustment Form (Left) & Live Inventory (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        {/* Adjustment Action Form */}
        <div className="lg:col-span-5 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col justify-between">
          <form onSubmit={handleAdjustSubmit} className="space-y-space-md">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <h2 className="font-headline-sm text-body-lg text-on-surface font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
                <span>Adjust Stock Level</span>
              </h2>
              <span className="font-label-sm text-[10px] font-mono bg-primary text-on-primary px-2 py-0.5 rounded font-bold">
                LEDGER ATOMIC
              </span>
            </div>

            {errorMsg && (
              <div className="bg-error-container text-on-error-container rounded-lg p-3 font-body-sm text-body-sm flex items-start gap-2">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-[#ecfdf5] text-[#047857] rounded-lg p-3 font-body-sm text-body-sm flex items-start gap-2 border border-[#10b981]/20">
                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">check_circle</span>
                <span>{successMsg}</span>
              </div>
            )}

            {/* Target Store Location */}
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Target Store Location <span className="text-error">*</span>
              </label>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm cursor-pointer"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    🏪 {s.name} ({s.code}) {s.is_warehouse ? '[Warehouse]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* SKU Variant Selector */}
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Select SKU / Variant <span className="text-error">*</span>
              </label>
              <select
                required
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm cursor-pointer"
              >
                <option value="">-- Choose SKU Variant ({variants.length} Available) --</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.sku} - {v.product_name} ({v.size} / {v.color})
                  </option>
                ))}
              </select>
            </div>

            {/* Operation Mode Selector */}
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1.5">
                Adjustment Action Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('add')}
                  className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    mode === 'add'
                      ? 'border-[#047857] bg-[#ecfdf5] text-[#047857] font-bold shadow-sm'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto">add_circle</span>
                  <span className="font-label-sm text-[11px] block mt-0.5">Add (+)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('subtract')}
                  className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    mode === 'subtract'
                      ? 'border-error bg-error-container text-on-error-container font-bold shadow-sm'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto">remove_circle</span>
                  <span className="font-label-sm text-[11px] block mt-0.5">Subtract (-)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMode('set')}
                  className={`py-2 px-1 rounded-lg border text-center transition-all cursor-pointer ${
                    mode === 'set'
                      ? 'border-primary bg-primary/10 text-primary font-bold shadow-sm'
                      : 'border-outline-variant/30 bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px] block mx-auto">equal</span>
                  <span className="font-label-sm text-[11px] block mt-0.5">Set Count (=)</span>
                </button>
              </div>
            </div>

            {/* Quantity Input with Quick Chips */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold">
                  {mode === 'set' ? 'New Target Stock Count' : 'Units Count'}
                </label>
                <div className="flex items-center gap-1">
                  {[1, 5, 10, 50].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setQuantity((prev) => (mode === 'set' ? step : (parseInt(prev, 10) || 0) + step))}
                      className="px-1.5 py-0.5 bg-surface-container hover:bg-surface-container-high rounded text-[10px] font-mono text-on-surface cursor-pointer"
                    >
                      +{step}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="number"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-headline-sm text-headline-sm text-on-surface font-mono font-bold focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            {/* Reason */}
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Transaction Reason
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm cursor-pointer"
              >
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Audit Notes / Ticket Reference
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Inbound shipment PO-9912, Damaged during transit"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            {/* Live Simulation Card */}
            <div className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 space-y-2">
              <span className="font-label-sm text-[10px] text-outline font-mono uppercase tracking-wider block">
                Real-Time Simulation
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col">
                  <span className="font-label-sm text-[10px] text-on-surface-variant">Current Stock</span>
                  <span className="font-mono font-bold text-on-surface text-[16px]">{currentBalance} pcs</span>
                </div>
                <div className="flex flex-col border-x border-outline-variant/30">
                  <span className="font-label-sm text-[10px] text-on-surface-variant">Delta</span>
                  <span
                    className={`font-mono font-bold text-[16px] ${
                      simulated.delta > 0 ? 'text-[#047857]' : simulated.delta < 0 ? 'text-error' : 'text-on-surface'
                    }`}
                  >
                    {simulated.delta > 0 ? `+${simulated.delta}` : simulated.delta}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-[10px] text-on-surface-variant">Projected</span>
                  <span
                    className={`font-mono font-bold text-[16px] ${
                      simulated.resulting < 0 ? 'text-error animate-pulse' : 'text-primary'
                    }`}
                  >
                    {simulated.resulting} pcs
                  </span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              <span className="material-symbols-outlined text-[18px]">publish</span>
              <span>{isSubmitting ? 'Recording Mutation…' : 'Apply Stock Adjustment'}</span>
            </button>
          </form>
        </div>

        {/* Live Inventory Overview Table */}
        <div className="lg:col-span-7 bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-space-md border-b border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-sm text-body-lg text-on-surface font-semibold">
                  Current Inventory Balance
                </h2>
                <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-medium">
                  {filteredInventory.length} of {inventoryList.length} SKUs
                </span>
              </div>
              <span className="font-label-sm text-[11px] text-on-surface-variant">
                Location:{' '}
                <span className="font-mono font-bold text-primary">
                  {selectedStore === 'storage'
                    ? 'Central Storage'
                    : stores.find((s) => String(s.id) === String(selectedStore))?.name || 'Selected Store'}
                </span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refetchInventory()}
                className="h-9 px-2.5 bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer text-body-sm font-medium"
                title="Refresh inventory"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="p-space-sm bg-surface-container-low/50 border-b border-outline-variant/20 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <span className="material-symbols-outlined text-outline text-[16px] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder="Search SKU, product, size, color..."
                className="w-full h-8 pl-8 pr-7 bg-surface-container-lowest rounded-lg font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Stock status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2.5 bg-surface-container-lowest rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer shrink-0"
            >
              <option value="all">All Quantities</option>
              <option value="in_stock">In Stock (&gt; 5)</option>
              <option value="low_stock">Low Stock (1–5)</option>
              <option value="out_of_stock">Out of Stock (0)</option>
              <option value="negative">Negative Discrepancies (&lt; 0)</option>
            </select>

            {/* Sort order */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-8 px-2.5 bg-surface-container-lowest rounded-lg font-body-sm text-[12px] text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer shrink-0"
            >
              <option value="stock_desc">Stock: High to Low</option>
              <option value="stock_asc">Stock: Low to High</option>
              <option value="sku_asc">SKU (A–Z)</option>
              <option value="name_asc">Product Name (A–Z)</option>
            </select>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-8 px-2 text-error hover:bg-error-container/30 rounded font-label-sm text-[11px] font-semibold cursor-pointer transition-colors shrink-0"
              >
                Reset
              </button>
            )}
          </div>

          {/* Active Filter Chips Ribbon */}
          {activeFiltersCount > 0 && (
            <div className="px-space-sm py-1.5 bg-surface-container-low/30 border-b border-outline-variant/15 flex flex-wrap items-center gap-1.5 text-label-sm text-[11px]">
              <span className="text-outline font-medium">Active filters:</span>
              {tableSearch && (
                <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                  Query: "{tableSearch}"
                  <button onClick={() => setTableSearch('')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed px-2 py-0.5 rounded-full">
                  Status: {statusFilter.replace('_', ' ')}
                  <button onClick={() => setStatusFilter('all')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}
              {sortBy !== 'stock_desc' && (
                <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                  Sorted
                  <button onClick={() => setSortBy('stock_desc')} className="hover:text-error cursor-pointer">✕</button>
                </span>
              )}
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant/20">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">SKU / Product</th>
                  <th className="py-2.5 px-3 font-semibold">Size / Color</th>
                  <th className="py-2.5 px-3 font-semibold text-right">On Hand</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
                {filteredInventory.map((item) => {
                  const qty = item.quantity_on_hand ?? 0;
                  const isNeg = qty < 0;
                  const isLow = qty >= 0 && qty <= 5;
                  const vId = item.variant?.id || item.variant;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-surface-container-low/50 transition-colors ${
                        String(vId) === String(selectedVariantId) ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex flex-col min-w-0">
                          <span className="font-mono font-semibold text-[13px]">{item.variant_sku}</span>
                          <span className="font-body-sm text-[11px] text-on-surface-variant truncate">
                            {item.product_name || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[12px]">
                        {item.variant_size || '—'} / {item.variant_color || '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`font-mono font-bold text-[15px] ${
                            isNeg ? 'text-error' : isLow ? 'text-amber-600' : 'text-[#047857]'
                          }`}
                        >
                          {qty}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (vId) setSelectedVariantId(vId);
                          }}
                          className="px-2 py-1 bg-surface-container hover:bg-primary hover:text-on-primary rounded font-label-sm text-[11px] font-mono transition-colors cursor-pointer"
                        >
                          Pick
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loadingInventory && filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-16 text-center text-on-surface-variant font-body-md">
                      <span className="material-symbols-outlined text-[40px] block mb-2 opacity-40">inventory_2</span>
                      {activeFiltersCount > 0 ? (
                        <div className="space-y-2">
                          <p>No inventory records match the selected filters.</p>
                          <button
                            type="button"
                            onClick={resetFilters}
                            className="px-3 py-1 bg-surface-container hover:bg-surface-container-high rounded text-primary text-xs font-semibold cursor-pointer"
                          >
                            Clear All Filters
                          </button>
                        </div>
                      ) : (
                        <p>No inventory records found for this location.</p>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
