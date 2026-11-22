import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [productsFilter, setProductsFilter] = useState('all'); // 'all' | 'has_products' | 'empty'
  const [sortBy, setSortBy] = useState('name_asc'); // 'name_asc' | 'name_desc' | 'products_desc' | 'products_asc'
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    is_active: true,
  });

  const { data: categoriesData, isLoading, isError, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/api/categories/'),
  });

  const categories = categoriesData?.results || (Array.isArray(categoriesData) ? categoriesData : []);

  const filteredCategories = useMemo(() => {
    let list = categories.filter((c) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      const productCount = c.product_count ?? c.products_count ?? 0;
      if (productsFilter === 'has_products' && productCount === 0) return false;
      if (productsFilter === 'empty' && productCount > 0) return false;

      if (statusFilter === 'active' && !c.is_active) return false;
      if (statusFilter === 'inactive' && c.is_active) return false;

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      const pA = a.product_count ?? a.products_count ?? 0;
      const pB = b.product_count ?? b.products_count ?? 0;
      if (sortBy === 'products_desc') return pB - pA;
      if (sortBy === 'products_asc') return pA - pB;
      return 0;
    });
  }, [categories, search, statusFilter, productsFilter, sortBy]);

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (productsFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'name_asc' ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setProductsFilter('all');
    setSortBy('name_asc');
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!formData.name.trim()) {
      setErrorMsg('Category name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        is_active: formData.is_active,
      };
      if (formData.code.trim()) {
        payload.code = formData.code.trim().toUpperCase();
      }

      await apiClient.post('/api/categories/', payload);
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsDrawerOpen(false);
      setFormData({ name: '', code: '', description: '', is_active: true });
    } catch (err) {
      const respData = err?.response?.data;
      if (respData) {
        const msgs = Object.entries(respData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        setErrorMsg(msgs);
      } else {
        setErrorMsg('Failed to create category. Please verify your input.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header Bar */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">category</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
              Taxonomy &amp; Hierarchy
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface tracking-tight mt-0.5">
            Product Categories
          </h1>
          <p className="font-body-md text-body-sm sm:text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
            Organize styles into apparel departments and merchandise categories for catalog routing.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-space-md flex-wrap shrink-0">
          <div className="hidden xl:flex items-center gap-space-lg px-space-md py-1 rounded bg-surface-container-low shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Total Categories</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">
                {isLoading ? '…' : categories.length}
              </span>
            </div>
            <div className="h-6 w-px bg-surface-container-highest" />
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Showing</span>
              <span className="font-headline-sm text-body-lg text-secondary font-mono font-bold">
                {isLoading ? '…' : filteredCategories.length}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              setIsDrawerOpen(true);
            }}
            className="h-10 px-space-md sm:px-space-lg bg-primary hover:bg-primary-container text-on-primary font-body-md text-body-md font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Create Category</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, description..."
              className="w-full h-10 pl-9 pr-8 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer text-sm"
              >✕</button>
            )}
          </div>

          {/* Products filter */}
          <div className="relative">
            <select
              value={productsFilter}
              onChange={(e) => setProductsFilter(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="has_products">With Products</option>
              <option value="empty">Empty (No Products)</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="name_asc">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
              <option value="products_desc">Most Products</option>
              <option value="products_asc">Fewest Products</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="h-10 px-3 bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span className="font-label-md text-label-md font-semibold hidden sm:inline">Refresh</span>
          </button>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 px-3 text-error hover:bg-error-container/30 rounded-lg font-label-md text-label-md font-semibold transition-colors cursor-pointer shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="text-outline font-medium">Active filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                Search: "{search}"
                <button onClick={() => setSearch('')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            {productsFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed px-2 py-0.5 rounded-full">
                {productsFilter === 'has_products' ? 'Has Products' : 'Empty Categories'}
                <button onClick={() => setProductsFilter('all')} className="hover:opacity-70 cursor-pointer">✕</button>
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${statusFilter === 'active' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                Status: {statusFilter === 'active' ? 'Active' : 'Inactive'}
                <button onClick={() => setStatusFilter('all')} className="hover:opacity-70 cursor-pointer">✕</button>
              </span>
            )}
            {sortBy !== 'name_asc' && (
              <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                Sort: {sortBy === 'name_desc' ? 'Name Z–A' : sortBy === 'products_desc' ? 'Most Products' : 'Fewest Products'}
                <button onClick={() => setSortBy('name_asc')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            <span className="text-outline ml-auto font-mono">
              {filteredCategories.length} of {categories.length} categories
            </span>
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg text-center text-on-surface-variant animate-pulse font-body-md">
          Loading catalog categories…
        </div>
      )}
      {isError && (
        <div className="bg-error-container text-on-error-container rounded-xl p-space-md font-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          Failed to fetch categories. Please check backend connection.
        </div>
      )}

      {/* Categories Grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-sm">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-headline-sm text-body-lg text-on-surface font-semibold leading-snug">
                    {cat.name}
                  </span>
                  <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                    {cat.code || 'NO-CODE'}
                  </span>
                </div>
                {cat.description ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 line-clamp-2">
                    {cat.description}
                  </p>
                ) : (
                  <p className="font-body-sm text-body-sm text-outline italic mt-1.5">
                    No description provided
                  </p>
                )}
              </div>

              <div className="mt-space-md pt-space-xs border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[11px]">
                <div className="flex items-center gap-1.5 text-on-surface-variant font-mono">
                  <span className="material-symbols-outlined text-[16px] text-primary">apparel</span>
                  <span>{cat.product_count ?? 0} Products</span>
                </div>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                    cat.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {cat.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          ))}

          {filteredCategories.length === 0 && (
            <div className="col-span-full py-16 text-center text-on-surface-variant font-body-md bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">category</span>
              {activeFiltersCount > 0 ? (
                <div className="space-y-2">
                  <p>No categories match the selected filters.</p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="px-3 py-1 bg-surface-container hover:bg-surface-container-high rounded text-primary text-xs font-semibold cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                </div>
              ) : (
                <p>No categories found. Click &quot;Create Category&quot; to add one.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Drawer: Create Category */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-on-surface/40 backdrop-blur-xs"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="p-space-lg border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-on-primary">
                    <span className="material-symbols-outlined text-[18px]">add_box</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Create New Category</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form id="create-category-form" onSubmit={handleCreateCategory} className="p-space-lg space-y-space-md">
                {errorMsg && (
                  <div className="bg-error-container text-on-error-container rounded-lg px-3 py-2 font-body-sm text-body-sm flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Category Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Outerwear, Footwear, Knitwear"
                    className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Category Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. OUTERWEAR, TOPS (Auto-derived if blank)"
                    className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono uppercase focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                  />
                  <span className="font-label-sm text-[10px] text-outline font-mono mt-1 block">
                    Unique uppercase code used for system indexing.
                  </span>
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this apparel category..."
                    className="w-full p-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm resize-none"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
                  <div>
                    <span className="font-body-md font-semibold text-on-surface block text-[13px]">
                      Active in Catalog
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                      Allow styles to be tagged with this category
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                </div>
              </form>
            </div>

            <div className="p-space-lg border-t border-outline-variant/30 bg-surface-container-low flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="flex-1 h-11 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="create-category-form"
                disabled={isSubmitting}
                className="flex-1 h-11 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'Creating…' : 'Save Category'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
