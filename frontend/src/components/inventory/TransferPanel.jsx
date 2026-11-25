import { useMemo, useState } from 'react';

const STORAGE = { id: 'storage', name: 'Central storage' };

export default function TransferPanel({
  stores,
  sourceInventory,
  variants,
  sourceStore,
  onSourceStoreChange,
  isLoading,
  sourceError,
  busy,
  onSubmit,
}) {
  const [toStore, setToStore] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const storeOptions = [STORAGE, ...stores.map((store) => ({ ...store, id: String(store.id) }))];
  const sourceLabel = storeOptions.find((store) => store.id === sourceStore)?.name || 'Source';
  const targetLabel = storeOptions.find((store) => store.id === toStore)?.name || 'Destination';
  const availableItems = useMemo(() => sourceInventory.map((record) => {
      const variantId = String(record.variant?.id || record.variantId);
      const variant = variants.find((item) => String(item.id) === variantId);
      return {
        id: variantId,
        sku: record.sku || variant?.sku || variantId,
        name: record.name || variant?.product_name || 'Product',
        size: record.size || variant?.size || '',
        color: record.color || variant?.color || '',
        available: Number(record.quantity),
      };
    }).sort((a, b) => a.sku.localeCompare(b.sku)),[sourceInventory, sourceStore, variants]);

  function changeSource(value) {
    onSourceStoreChange(value);
    setLines([]);
    setConfirming(false);
    setError('');
  }

  function addItem() {
    const item = availableItems.find((candidate) => candidate.id === selectedVariant);
    if (!item) return;
    setLines((current) => {
      const existing = current.find((line) => line.variantId === item.id);
      if (existing) {
        return current.map((line) => line.variantId === item.id
          ? { ...line, quantity: Math.min(item.available, line.quantity + 1) }
          : line);
      }
      return [...current, { ...item, variantId: item.id, quantity: 1 }];
    });
    setSelectedVariant('');
    setError('');
  }

  function updateQuantity(variantId, quantity) {
    setLines((current) => current.map((line) => (
      line.variantId === variantId ? { ...line, quantity } : line
    )));
    setError('');
  }

  function validate() {
    if (!sourceStore || !toStore) return 'Choose both a source and destination.';
    if (sourceStore === toStore) return 'Source and destination must be different.';
    if (!lines.length) return 'Add at least one item to the transfer.';
    const invalid = lines.find((line) =>
      !Number.isInteger(Number(line.quantity)) ||
      Number(line.quantity) < 1 ||
      Number(line.quantity) > line.available);
    if (invalid) {
      return `${invalid.sku}: quantity must be between 1 and ${invalid.available}.`;
    }
    return '';
  }

  async function submitTransfer() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setConfirming(false);
      return;
    }
    setError('');
    try {
      await onSubmit({ fromStore: sourceStore, toStore, lines, notes });
      setLines([]);
      setNotes('');
      setConfirming(false);
    } catch (submitError) {
      if (submitError.completedVariantIds?.length) {
        const completedIds = new Set(submitError.completedVariantIds);
        setLines((current) => current.filter((line) => !completedIds.has(line.variantId)));
      }
      setError(submitError.message || 'Transfer could not be completed.');
      setConfirming(false);
    }
  }
  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm sm:p-space-lg">
      <div className="mb-4">
        <h2 className="font-headline-md text-on-surface">Store-to-store transfer</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Choose locations, add items, review available stock, then confirm the transfer.
        </p>
      </div>
      {error && <p role="alert" className="mb-3 rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</p>}
      {sourceError && (
        <p role="alert" className="mb-3 rounded-lg bg-error-container p-3 text-sm text-on-error-container">
          Could not load source stock: {sourceError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
          From
          <select value={sourceStore} onChange={(event) => changeSource(event.target.value)} className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
            {storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
          To
          <select value={toStore} onChange={(event) => setToStore(event.target.value)} className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
            <option value="">Select destination</option>
            {storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="transfer-item">Item to add</label>
        <select
          id="transfer-item"
          value={selectedVariant}
          onChange={(event) => setSelectedVariant(event.target.value)}
          disabled={isLoading || !availableItems.length}
          className="h-10 min-w-0 flex-1 rounded-lg border border-outline-variant/50 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <option value="">{isLoading ? 'Loading source stock…' : 'Select an item with available stock'}</option>
          {availableItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sku} · {item.name} · {item.available} available
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addItem}
          disabled={!selectedVariant}
          className="h-10 rounded-lg bg-primary px-4 font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
        >
          Add item
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-outline-variant/30">
        <table className="w-full min-w-[500px] text-left text-sm">
          <thead className="bg-surface-container-low text-on-surface-variant">
            <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Available</th><th className="px-3 py-2">Transfer qty</th><th className="px-3 py-2"><span className="sr-only">Remove</span></th></tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20">
            {lines.map((line) => (
              <tr key={line.variantId}>
                <td className="px-3 py-2"><span className="font-mono font-bold">{line.sku}</span><span className="block text-xs text-on-surface-variant">{line.name} · {line.size || '—'} / {line.color || '—'}</span></td>
                <td className="px-3 py-2 text-right font-mono">{line.available}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="1"
                    max={line.available}
                    step="1"
                    required
                    value={line.quantity}
                    onChange={(event) => updateQuantity(line.variantId, event.target.value === '' ? '' : Number(event.target.value))}
                    aria-label={`Quantity to transfer for ${line.sku}`}
                    className="h-9 w-24 rounded-md border border-outline-variant/50 px-2 font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => setLines((current) => current.filter((entry) => entry.variantId !== line.variantId))} className="rounded px-2 py-1 text-error hover:bg-error-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary" aria-label={`Remove ${line.sku} from transfer`}>Remove</button>
                </td>
              </tr>
            ))}
            {!lines.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-on-surface-variant">No items added yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm font-semibold text-on-surface">
        Transfer notes <span className="font-normal text-on-surface-variant">(optional)</span>
        <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Reference or hand-off details" className="h-10 rounded-lg border border-outline-variant/50 px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary" />
      </label>

      <button
        type="button"
        disabled={busy || !lines.length}
        onClick={() => {
          const validationError = validate();
          if (validationError) setError(validationError);
          else {
            setError('');
            setConfirming(true);
          }
        }}
        className="mt-4 h-10 rounded-lg bg-primary px-4 font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
      >
        Review transfer
      </button>

      {confirming && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="transfer-confirm-title" className="w-full max-w-lg rounded-xl bg-surface-container-lowest p-space-lg shadow-xl">
            <h3 id="transfer-confirm-title" className="font-headline-md">Confirm stock transfer</h3>
            <p className="mt-2 text-sm text-on-surface-variant">{sourceLabel} → {targetLabel}</p>
            <ul className="mt-3 max-h-48 space-y-2 overflow-auto text-sm">
              {lines.map((line) => <li key={line.variantId} className="flex justify-between gap-3"><span>{line.sku} · {line.name}</span><span className="font-mono font-bold">{line.quantity} / {line.available}</span></li>)}
            </ul>
            <p className="mt-3 text-xs text-on-surface-variant">Each item is submitted separately using the existing transfer endpoint. If one request fails, completed items will be reported.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-10 rounded-lg border border-outline-variant/50 px-4 font-semibold text-on-surface disabled:opacity-50">Back</button>
              <button type="button" onClick={submitTransfer} disabled={busy} className="h-10 rounded-lg bg-primary px-4 font-semibold text-on-primary disabled:opacity-50">{busy ? 'Transferring…' : 'Confirm transfer'}</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
