function stockState(quantity) {
  if (quantity < 0) return { label: 'Negative balance', style: 'bg-error-container text-on-error-container' };
  if (quantity === 0) return { label: 'Out of stock', style: 'bg-error-container text-on-error-container' };
  if (quantity <= 5) return { label: 'Low stock', style: 'bg-amber-100 text-amber-900' };
  return { label: 'In stock', style: 'bg-[#ecfdf5] text-[#047857]' };
}

export default function InventoryOverview({
  rows,
  stores,
  categories,
  storeId,
  categoryId,
  search,
  sortBy,
  statusFilter,
  pagination,
  isLoading,
  error,
  onStoreChange,
  onCategoryChange,
  onSearchChange,
  onSortChange,
  onStatusChange,
  onPageChange,
  onRefresh,
  onAdjust,
  selectedRowId,
}) {
  const totalUnits = rows.reduce((total, row) => total + row.quantity, 0);
  const lowStock = rows.filter((row) => row.quantity > 0 && row.quantity <= 5).length;
  const outOfStock = rows.filter((row) => row.quantity <= 0).length;

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-outline-variant/20 p-space-md sm:flex-row sm:items-center sm:p-space-lg">
        <div>
          <h2 className="font-headline-md text-on-surface">Inventory overview</h2>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            Stock on hand by location and item.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-outline-variant/50 px-3 font-body-sm font-semibold text-on-surface hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">refresh</span>
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-outline-variant/20 bg-surface-container-low/40 p-space-md sm:grid-cols-3">
        <Summary label="SKUs on this page" value={rows.length} />
        <Summary label="Units on this page" value={totalUnits} />
        <Summary label="Needs attention" value={`${lowStock} low · ${outOfStock} out`} />
      </div>

      <div className="grid grid-cols-1 gap-3 border-b border-outline-variant/20 p-space-md md:grid-cols-4">
        <label className="flex flex-col gap-1 font-label-sm font-semibold text-on-surface">
          Search inventory
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="SKU, product, barcode..."
            className="h-10 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 font-body-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          />
        </label>
        <label className="flex flex-col gap-1 font-label-sm font-semibold text-on-surface">
          Store
          <select
            value={storeId}
            onChange={(event) => onStoreChange(event.target.value)}
            className="h-10 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 font-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          >
            <option value="all">All locations</option>
            <option value="storage">Central storage</option>
            {stores.map((store) => (
              <option key={store.id} value={String(store.id)}>
                {store.name}{store.is_warehouse ? ' (Warehouse)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-sm font-semibold text-on-surface">
          Category
          <select
            value={categoryId}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="h-10 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 font-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          >
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={String(category.id)}>{category.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-label-sm font-semibold text-on-surface">
          Sort by
          <select
            value={sortBy}
            onChange={(event) => onSortChange(event.target.value)}
            className="h-10 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 font-body-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
          >
            <option value="name">Name (A–Z)</option>
            <option value="quantity-desc">Quantity (high to low)</option>
            <option value="quantity-asc">Quantity (low to high)</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-outline-variant/20 px-space-md pb-space-md">
        <label htmlFor="inventory-status" className="font-label-sm font-semibold text-on-surface">Stock status</label>
        <select
          id="inventory-status"
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value)}
          className="h-9 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <option value="all">All stock</option>
          <option value="in-stock">In stock</option>
          <option value="low-stock">Low stock (1–5)</option>
          <option value="out-of-stock">Out of stock</option>
        </select>
      </div>

      {error && (
        <div role="alert" className="m-space-md rounded-lg bg-error-container p-3 font-body-sm text-on-error-container">
          Inventory could not be loaded: {error}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-surface-container-low font-label-sm uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Item</th>
              <th scope="col" className="px-4 py-3 font-semibold">Category</th>
              <th scope="col" className="px-4 py-3 font-semibold">Location</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">On hand</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-on-surface-variant" role="status">Loading inventory…</td></tr>
            )}
            {!isLoading && !error && rows.map((row) => {
              const status = stockState(row.quantity);
              return (
                <tr key={row.id} className={`hover:bg-surface-container-low/50 ${row.variantId === selectedRowId ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-sm font-bold text-on-surface">{row.sku}</div>
                    <div className="text-sm text-on-surface-variant">
                      {row.name} · {row.size || '—'} / {row.color || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{row.categoryName || 'Uncategorized'}</td>
                  <td className="px-4 py-3 text-sm text-on-surface-variant">{row.storeName}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-on-surface">{row.quantity}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${status.style}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onAdjust(row)}
                      className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm font-semibold text-on-surface hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                      aria-label={`Adjust stock for ${row.sku}`}
                    >
                      Adjust
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && !error && !rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-14 text-center">
                  <span className="material-symbols-outlined mb-2 block text-4xl text-outline" aria-hidden="true">inventory_2</span>
                  <p className="font-semibold text-on-surface">No matching inventory</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Try a different store, category, or search.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 border-t border-outline-variant/20 px-space-md py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-on-surface-variant" aria-live="polite">
          Page {pagination?.current_page || 1} of {pagination?.total_pages || 0}
          {' · '}{pagination?.count || 0} stock records
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isLoading || !pagination?.previous}
            onClick={() => onPageChange(Math.max(1, (pagination?.current_page || 1) - 1))}
            className="h-9 rounded-lg border border-outline-variant/50 px-3 text-sm font-semibold text-on-surface disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={isLoading || !pagination?.next}
            onClick={() => onPageChange((pagination?.current_page || 1) + 1)}
            className="h-9 rounded-lg border border-outline-variant/50 px-3 text-sm font-semibold text-on-surface disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }) {
  return (
    <div className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-3">
      <p className="font-label-sm text-on-surface-variant">{label}</p>
      <p className="mt-1 font-headline-md text-on-surface">{value}</p>
    </div>
  );
}
