import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useStore } from '../context';
import apiClient from '../api/client';

export default function CatalogPage() {
  const { activeStore, activeStoreObj, isStorageScope, isAllScope, setActiveStore } = useStore();

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'INACTIVE'
  const [sortBy, setSortBy] = useState('name_asc'); // 'name_asc' | 'name_desc' | 'skus_desc' | 'price_asc' | 'price_desc'

  // Fetch products (re-fetches automatically whenever activeStore changes)
  const { data: productsData, isLoading, refetch } = useQuery({
    queryKey: ['products', activeStore],
    queryFn: () => apiClient.get('/api/products/').catch(() => null),
  });

  // Fetch categories for filter dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/api/categories/'),
  });

  const categories = categoriesData?.results || (Array.isArray(categoriesData) ? categoriesData : []);
  const apiProducts = productsData?.results || (Array.isArray(productsData) ? productsData : []);

  // Format products
  const formattedProducts = useMemo(() => {
    return apiProducts.map((p) => {
      const catName = (
        p.category_name ||
        (typeof p.category === 'object' ? p.category?.name : p.category) ||
        'UNCATEGORIZED'
      ).toUpperCase();

      const variants = p.variants || [];
      const skuCount = variants.length;
      const firstPrice = variants[0]?.price ? parseFloat(variants[0].price) : null;
      const minPrice = variants.length > 0
        ? Math.min(...variants.map((v) => parseFloat(v.price) || 0))
        : 0;
      const maxPrice = variants.length > 0
        ? Math.max(...variants.map((v) => parseFloat(v.price) || 0))
        : 0;

      // Determine stock status from variants if available
      const totalStock = variants.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0);
      let stockStatus = 'In Stock';
      let stockClass = 'text-[#047857]';
      if (skuCount === 0) {
        stockStatus = 'No SKUs';
        stockClass = 'text-outline';
      } else if (totalStock < 0) {
        stockStatus = 'Negative Balance';
        stockClass = 'text-error font-bold';
      } else if (totalStock === 0 && isStorageScope) {
        stockStatus = 'Storage Allocated';
        stockClass = 'text-secondary font-semibold';
      }

      return {
        id: p.id,
        name: p.name,
        style_code: p.style_code,
        category: catName,
        categoryId: p.category?.id || p.category,
        skuCount,
        firstPrice,
        minPrice,
        maxPrice,
        priceDisplay: firstPrice ? `$${firstPrice.toFixed(2)}` : '—',
        skus: variants.map((v) => v.sku).slice(0, 2).join(' • ') || '—',
        stockStatus,
        stockClass,
        totalStock,
        is_active: p.is_active ?? true,
        created_at: p.created_at,
      };
    });
  }, [apiProducts, isStorageScope]);

  // Robust multi-criteria filtering
  const filteredProducts = useMemo(() => {
    return formattedProducts.filter((product) => {
      // 1. Search filter
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = product.name?.toLowerCase().includes(q);
        const matchesStyle = product.style_code?.toLowerCase().includes(q);
        const matchesCat = product.category?.toLowerCase().includes(q);
        const matchesSkus = product.skus?.toLowerCase().includes(q);
        if (!matchesName && !matchesStyle && !matchesCat && !matchesSkus) {
          return false;
        }
      }

      // 2. Category filter
      if (categoryFilter !== 'ALL') {
        const catMatch =
          String(product.categoryId) === String(categoryFilter) ||
          product.category === categoryFilter.toUpperCase();
        if (!catMatch) return false;
      }

      // 3. Stock availability filter
      if (stockFilter === 'IN_STOCK' && product.skuCount === 0) return false;
      if (stockFilter === 'OUT_OF_STOCK' && product.skuCount > 0) return false;
      if (stockFilter === 'LOW_STOCK' && (product.totalStock > 5 || product.totalStock <= 0)) return false;

      // 4. Status filter
      if (statusFilter === 'ACTIVE' && !product.is_active) return false;
      if (statusFilter === 'INACTIVE' && product.is_active) return false;

      return true;
    }).sort((a, b) => {
      // Sorting
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'skus_desc') return b.skuCount - a.skuCount;
      if (sortBy === 'price_asc') return (a.minPrice || 0) - (b.minPrice || 0);
      if (sortBy === 'price_desc') return (b.maxPrice || 0) - (a.maxPrice || 0);
      return 0;
    });
  }, [formattedProducts, search, categoryFilter, stockFilter, statusFilter, sortBy]);

  const hasActiveFilters =
    search.trim() !== '' ||
    categoryFilter !== 'ALL' ||
    stockFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    sortBy !== 'name_asc';

  const handleClearFilters = () => {
    setSearch('');
    setCategoryFilter('ALL');
    setStockFilter('ALL');
    setStatusFilter('ALL');
    setSortBy('name_asc');
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Active Store Scope Filter Header */}
      <div className="flex items-center justify-between gap-space-xs flex-wrap bg-surface-container-lowest p-2.5 sm:px-4 rounded-xl border border-outline-variant/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">
            {isStorageScope ? 'warehouse' : 'storefront'}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            Catalog Scope: <span className="text-primary">{activeStoreObj.name}</span>
          </span>
          {!isAllScope && (
            <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold">
              {isStorageScope ? 'CENTRAL STORAGE' : 'STORE STOCKED'}
            </span>
          )}
        </div>
        {!isAllScope && (
          <button
            type="button"
            onClick={() => setActiveStore('all')}
            className="text-[11px] font-label-sm text-on-surface-variant hover:text-primary transition-colors underline cursor-pointer"
          >
            Show All Global Styles
          </button>
        )}
      </div>

      {/* Header */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm border border-outline-variant/30">
        <div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">Styles &amp; SKU Catalog</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {isStorageScope
              ? 'Showing products currently held in Central Warehouse Storage.'
              : !isAllScope
              ? `Showing styles and SKUs with active inventory in ${activeStoreObj.name}.`
              : 'Central merchandise styles catalog shared across cloud and offline store terminals.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-label-sm text-label-sm bg-surface-container px-2.5 py-1 rounded-full font-mono font-semibold">
            {isLoading ? '...' : `${filteredProducts.length} of ${formattedProducts.length} Styles`}
          </span>
          <Link
            to="/catalog/new"
            className="h-9 px-3 bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            <span>Register Style</span>
          </Link>
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
              placeholder="Search style name, style code, SKU..."
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

          {/* 2. Category Filter */}
          <div className="lg:col-span-2 relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 3. Availability Filter */}
          <div className="lg:col-span-2 relative">
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Stock Status</option>
              <option value="IN_STOCK">With SKUs / Stock</option>
              <option value="LOW_STOCK">Low Stock (≤5 pcs)</option>
              <option value="OUT_OF_STOCK">No SKUs Defined</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 4. Active Status */}
          <div className="lg:col-span-2 relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              expand_more
            </span>
          </div>

          {/* 5. Sort Dropdown */}
          <div className="lg:col-span-2 relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer font-medium"
            >
              <option value="name_asc">Sort: Name (A-Z)</option>
              <option value="name_desc">Sort: Name (Z-A)</option>
              <option value="skus_desc">Sort: Most SKUs</option>
              <option value="price_asc">Sort: Price (Low → High)</option>
              <option value="price_desc">Sort: Price (High → Low)</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              sort
            </span>
          </div>
        </div>

        {/* Active Filter Chips & Clear Action */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-outline-variant/20 font-label-sm text-[11px]">
            <span className="text-on-surface-variant font-medium">Active Filters:</span>

            {search.trim() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                Query: "{search}"
                <button type="button" onClick={() => setSearch('')} className="hover:text-error cursor-pointer">
                  ✕
                </button>
              </span>
            )}

            {categoryFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-bold font-mono">
                Category: {categoryFilter}
                <button type="button" onClick={() => setCategoryFilter('ALL')} className="hover:text-error cursor-pointer">
                  ✕
                </button>
              </span>
            )}

            {stockFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                Stock: {stockFilter}
                <button type="button" onClick={() => setStockFilter('ALL')} className="hover:text-error cursor-pointer">
                  ✕
                </button>
              </span>
            )}

            {statusFilter !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                Status: {statusFilter}
                <button type="button" onClick={() => setStatusFilter('ALL')} className="hover:text-error cursor-pointer">
                  ✕
                </button>
              </span>
            )}

            {sortBy !== 'name_asc' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-on-surface font-mono">
                Sorted
                <button type="button" onClick={() => setSortBy('name_asc')} className="hover:text-error cursor-pointer">
                  ✕
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={handleClearFilters}
              className="ml-auto text-primary hover:underline font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* ── Product Grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-sm">
        {filteredProducts.map((product) => (
          <div
            key={product.id}
            className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-headline-sm text-body-lg text-on-surface font-semibold leading-snug">
                  {product.name}
                </span>
                <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                  {product.category}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-label-sm text-[10px] text-outline font-mono">
                  Style: {product.style_code}
                </span>
                <span
                  className={`font-label-sm text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                    product.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {product.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="mt-space-sm space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <span>{product.skuCount} Active SKUs</span>
                  <span className="font-mono text-on-surface font-semibold">{product.priceDisplay}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="truncate max-w-[60%]">{product.skus}</span>
                  <span className={product.stockClass}>{product.stockStatus}</span>
                </div>
              </div>
            </div>

            {/* View Details link */}
            <div className="mt-space-sm pt-space-sm border-t border-outline-variant/20 flex items-center justify-between">
              <Link
                to={`/variants/new?product=${product.id}`}
                className="flex items-center gap-0.5 text-on-surface-variant hover:text-primary font-label-sm text-[11px]"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                <span>Add SKU</span>
              </Link>
              <Link
                to={`/catalog/${product.id}`}
                className="flex items-center gap-1 text-primary font-label-sm text-label-sm hover:underline"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                <span>View Details</span>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && !isLoading && (
        <div className="text-center py-16 text-on-surface-variant font-body-md bg-surface-container-lowest rounded-xl border border-outline-variant/30">
          <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">inventory_2</span>
          <p className="font-semibold text-on-surface">No matching products found</p>
          <p className="text-body-sm text-on-surface-variant mt-1">
            {hasActiveFilters
              ? 'Try adjusting your search query or active filter settings.'
              : `No products currently available in ${activeStoreObj.name}.`}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="mt-3 px-3 py-1.5 bg-primary text-on-primary rounded-lg font-label-sm text-label-sm cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}
    </main>
  );
}
