import { useMemo, useState } from 'react';

const STORAGE = { id: 'storage', name: 'Central storage' };

export default function CreateStockPanel({
  stores,
  variants,
  inventory,
  storeId,
  onStoreChange,
  isLoading,
  error,
  busy,
  busyVariantId,
  onSubmit,
}) {
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState({});
  const [feedback, setFeedback] = useState(null);
  const storeOptions = [
    STORAGE,
    ...stores.map((store) => ({ ...store, id: String(store.id) })),
  ];
  const quantityByVariant = useMemo(() => new Map(
    inventory.map((record) => [
      String(record.variant?.id ?? record.variant),
      Number(record.quantity_on_hand || 0),
    ]),
  ), [inventory]);
  const visibleVariants = useMemo(() => {
    const query = search.trim().toLowerCase();
    return variants
      .filter((variant) => variant.is_active !== false)
      .filter((variant) => {
        const searchable = [
          variant.sku,
          variant.barcode,
          variant.product_name,
          variant.product?.name,
          variant.size,
          variant.color,
        ].filter(Boolean).join(' ').toLowerCase();
        return !query || searchable.includes(query);
      })
      .sort((a, b) => (
        (a.product_name || a.product?.name || '').localeCompare(
          b.product_name || b.product?.name || '',
        ) || String(a.sku || '').localeCompare(String(b.sku || ''))
      ));
  }, [variants, search]);

  async function addStock(event, variant) {
    event.preventDefault();
    const quantity = Number(quantities[variant.id] ?? '');
    if (!Number.isInteger(quantity) || quantity < 1) {
      setFeedback({ type: 'error', text: 'Enter a whole number greater than zero.' });
      return;
    }

    setFeedback(null);
    try {
      const response = await onSubmit({
        variantId: variant.id,
        store: storeId,
        type: 'add',
        quantity,
        reason: 'STOCK_ADJUSTMENT',
        notes: '',
      });
      setQuantities((current) => ({ ...current, [variant.id]: '' }));
      setFeedback({
        type: 'success',
        text: response?.message || `Added ${quantity} units of ${variant.sku || 'this variant'}.`,
      });
    } catch (submitError) {
      setFeedback({
        type: 'error',
        text: submitError.message || `Could not add stock for ${variant.sku || 'this variant'}.`,
      });
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-sm">
      <div className="border-b border-outline-variant/20 p-space-md sm:p-space-lg">
        <h2 className="font-headline-md text-on-surface">Create Stock</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Add units for a product variant at a store or in central warehouse storage.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Add stock to
            <select
              value={storeId}
              onChange={(event) => {
                onStoreChange(event.target.value);
                setFeedback(null);
              }}
              className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
            >
              {storeOptions.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}{store.is_warehouse ? ' (Warehouse)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Find a variant
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search SKU, product, barcode..."
              className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
            />
          </label>
        </div>
      </div>

      {feedback && (
        <p
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mx-space-md mt-space-md rounded-lg p-3 text-sm ${
            feedback.type === 'error'
              ? 'bg-error-container text-on-error-container'
              : 'bg-[#ecfdf5] text-[#047857]'
          }`}
        >
          {feedback.text}
        </p>
      )}
      {error && (
        <p role="alert" className="mx-space-md mt-space-md rounded-lg bg-error-container p-3 text-sm text-on-error-container">
          Could not load available variants or current stock: {error}
        </p>
      )}

      {isLoading ? (
        <p className="p-space-lg text-sm text-on-surface-variant" role="status">Loading variants…</p>
      ) : error ? null : visibleVariants.length === 0 ? (
        <p className="p-space-lg text-sm text-on-surface-variant">
          {variants.length ? 'No variants match your search.' : 'No product variants are available.'}
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant/20">
          {visibleVariants.map((variant) => {
            const pendingForVariant = busy && String(busyVariantId) === String(variant.id);
            const quantity = quantities[variant.id] ?? '';
            const productName = variant.product_name || variant.product?.name || 'Product';
            const currentStock = quantityByVariant.get(String(variant.id)) ?? 0;
            return (
              <li key={variant.id} className="flex flex-col gap-3 p-space-md sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-on-surface">{productName}</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    <span className="font-mono">{variant.sku || 'No SKU'}</span>
                    {variant.size ? ` · ${variant.size}` : ''}
                    {variant.color ? ` · ${variant.color}` : ''}
                    {' · '}Current stock: <strong>{currentStock}</strong>
                  </p>
                </div>
                <form onSubmit={(event) => addStock(event, variant)} className="flex shrink-0 items-end gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-on-surface">
                    Units to add
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={quantity}
                      onChange={(event) => setQuantities((current) => ({
                        ...current,
                        [variant.id]: event.target.value,
                      }))}
                      aria-label={`Units to add for ${variant.sku || productName}`}
                      className="h-10 w-28 rounded-lg border border-outline-variant/50 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={busy || !quantity || !Number.isInteger(Number(quantity)) || Number(quantity) < 1}
                    className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                  >
                    {pendingForVariant ? 'Adding…' : 'Add stock'}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
