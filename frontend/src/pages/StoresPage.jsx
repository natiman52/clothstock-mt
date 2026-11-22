import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function StoresPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'retail' | 'warehouse'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [sortBy, setSortBy] = useState('name_asc'); // 'name_asc' | 'name_desc' | 'code_asc'

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    is_warehouse: false,
    is_active: true,
  });

  const { data: storesData, isLoading, isError, refetch } = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiClient.get('/api/stores/'),
  });

  const stores = storesData?.results || (Array.isArray(storesData) ? storesData : []);

  const filteredStores = useMemo(() => {
    let list = stores.filter((s) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (typeFilter === 'retail' && s.is_warehouse) return false;
      if (typeFilter === 'warehouse' && !s.is_warehouse) return false;

      if (statusFilter === 'active' && !s.is_active) return false;
      if (statusFilter === 'inactive' && s.is_active) return false;

      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
      if (sortBy === 'code_asc') return (a.code || '').localeCompare(b.code || '');
      return 0;
    });
  }, [stores, search, typeFilter, statusFilter, sortBy]);

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sortBy !== 'name_asc' ? 1 : 0);

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setSortBy('name_asc');
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!formData.name.trim() || !formData.code.trim()) {
      setErrorMsg('Store name and unique store code are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        address: formData.address.trim(),
        phone: formData.phone.trim(),
        is_warehouse: formData.is_warehouse,
        is_active: formData.is_active,
      };

      await apiClient.post('/api/stores/', payload);
      await queryClient.invalidateQueries({ queryKey: ['stores'] });
      setIsDrawerOpen(false);
      setFormData({
        name: '',
        code: '',
        address: '',
        phone: '',
        is_warehouse: false,
        is_active: true,
      });
    } catch (err) {
      const respData = err?.response?.data;
      if (respData) {
        const msgs = Object.entries(respData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        setErrorMsg(msgs);
      } else {
        setErrorMsg('Failed to create store. Verify unique store code.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const warehouseCount = stores.filter((s) => s.is_warehouse).length;
  const retailCount = stores.filter((s) => !s.is_warehouse).length;

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header Bar */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">storefront</span>
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">
              Location Network
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface tracking-tight mt-0.5">
            Stores &amp; Warehouses
          </h1>
          <p className="font-body-md text-body-sm sm:text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
            Configure retail branch stores, pop-ups, and central storage warehouse hubs across the inventory network.
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-space-md flex-wrap shrink-0">
          <div className="hidden xl:flex items-center gap-space-lg px-space-md py-1 rounded bg-surface-container-low shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Retail Stores</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">
                {isLoading ? '…' : retailCount}
              </span>
            </div>
            <div className="h-6 w-px bg-surface-container-highest" />
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Warehouses</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">
                {isLoading ? '…' : warehouseCount}
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
            <span className="material-symbols-outlined text-[18px]">add_business</span>
            <span>Create Store Location</span>
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, code, address, phone..."
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

          {/* Type filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="retail">Retail Stores</option>
              <option value="warehouse">Warehouses</option>
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
              <option value="code_asc">Code (A–Z)</option>
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
            <span className="text-outline font-medium">Filters:</span>
            {search && (
              <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                Search: "{search}"
                <button onClick={() => setSearch('')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            {typeFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed px-2 py-0.5 rounded-full">
                Type: {typeFilter === 'retail' ? 'Retail' : 'Warehouse'}
                <button onClick={() => setTypeFilter('all')} className="hover:text-error cursor-pointer">✕</button>
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
                Sorted: {sortBy === 'name_desc' ? 'Name Z–A' : 'Code A–Z'}
                <button onClick={() => setSortBy('name_asc')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            <span className="text-outline ml-auto font-mono">
              {filteredStores.length} of {stores.length} locations
            </span>
          </div>
        )}
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg text-center text-on-surface-variant animate-pulse font-body-md">
          Loading store locations…
        </div>
      )}
      {isError && (
        <div className="bg-error-container text-on-error-container rounded-xl p-space-md font-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          Failed to fetch store locations.
        </div>
      )}

      {/* Stores Grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-sm">
          {filteredStores.map((store) => (
            <div
              key={store.id}
              className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-headline-sm text-body-lg text-on-surface font-semibold leading-snug">
                    {store.name}
                  </span>
                  <span
                    className={`font-label-sm text-[10px] px-1.5 py-0.5 rounded font-mono font-bold shrink-0 ${
                      store.is_warehouse
                        ? 'bg-primary text-on-primary'
                        : 'bg-secondary-fixed text-on-secondary-fixed'
                    }`}
                  >
                    {store.code}
                  </span>
                </div>
                <div className="mt-2 space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                  {store.address && (
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="material-symbols-outlined text-[15px] text-outline">location_on</span>
                      <span className="truncate">{store.address}</span>
                    </div>
                  )}
                  {store.phone && (
                    <div className="flex items-center gap-1.5 text-[12px] font-mono">
                      <span className="material-symbols-outlined text-[15px] text-outline">call</span>
                      <span>{store.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-space-md pt-space-xs border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[11px]">
                <span className="font-mono text-outline">
                  {store.is_warehouse ? 'CENTRAL WAREHOUSE' : 'RETAIL BRANCH'}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                    store.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'
                  }`}
                >
                  {store.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Drawer: Create Store */}
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
                    <span className="material-symbols-outlined text-[18px]">add_business</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Create Store Location</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form id="create-store-form" onSubmit={handleCreateStore} className="p-space-lg space-y-space-md">
                {errorMsg && (
                  <div className="bg-error-container text-on-error-container rounded-lg px-3 py-2 font-body-sm text-body-sm flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                    <span>{errorMsg}</span>
                  </div>
                )}

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Store Location Name <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. SoHo Flagship, Brooklyn Hub, Miami Pop-up"
                    className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Unique Store Code <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. SOHO-01, BKLYN-02, WH-NEWARK"
                    className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono uppercase focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                  />
                  <span className="font-label-sm text-[10px] text-outline font-mono mt-1 block">
                    Monospace identifier attached to headers and offline sync events.
                  </span>
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Address / Physical Location
                  </label>
                  <textarea
                    rows={2}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="e.g. 524 Broadway, New York, NY 10012"
                    className="w-full p-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm resize-none"
                  />
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                    Phone / Contact Number
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. +1 (212) 555-0199"
                    className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
                  <div>
                    <span className="font-body-md font-semibold text-on-surface block text-[13px]">
                      Central Warehouse / Storage Hub
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                      Check if this is a non-retail warehouse storage location
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.is_warehouse}
                    onChange={(e) => setFormData({ ...formData, is_warehouse: e.target.checked })}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
                  <div>
                    <span className="font-body-md font-semibold text-on-surface block text-[13px]">
                      Active Location
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                      Available for terminals and stock transfers
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
                form="create-store-form"
                disabled={isSubmitting}
                className="flex-1 h-11 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isSubmitting ? 'Creating…' : 'Save Store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
