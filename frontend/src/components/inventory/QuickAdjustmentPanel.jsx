import { useState } from 'react';

const REASONS = [
  ['STOCK_ADJUSTMENT', 'Stock adjustment / restock'],
  ['RETURN', 'Customer return'],
  ['STOCKTAKE_RECONCILIATION', 'Stocktake reconciliation'],
  ['WAREHOUSE_TRANSFER', 'Warehouse transfer'],
];

export default function QuickAdjustmentPanel({ stores, selectedItem, busy, onSubmit }) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('STOCK_ADJUSTMENT');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState('add');

  const result = selectedItem
    ? selectedItem.quantity + (mode === 'add' ? Number(quantity || 0) : -Number(quantity || 0))
    : 0;
  const invalidQuantity = !Number.isInteger(Number(quantity)) || Number(quantity) < 1;
  const wouldGoNegative = mode === 'subtract' && selectedItem && result < 0;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!selectedItem) {
      setError('Choose an inventory row and select Adjust first.');
      return;
    }
    if (invalidQuantity) {
      setError('Enter a whole number greater than zero.');
      return;
    }
    if (wouldGoNegative) {
      setError(`Only ${selectedItem.quantity} units are available at this location.`);
      return;
    }
    try {
      const response = await onSubmit({
        variantId: selectedItem.variantId,
        store: selectedItem.storeId,
        type: mode,
        quantity: Number(quantity),
        reason,
        notes,
      });
      setSuccess(response?.message || 'Stock adjustment saved.');
      setNotes('');
    } catch (submitError) {
      setError(submitError.message || 'Stock adjustment could not be saved.');
    }
  }

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md shadow-sm sm:p-space-lg">
      <h2 className="font-headline-md text-on-surface">Quick stock adjustment</h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        Add or subtract units from one location. A reason is required for the audit ledger.
      </p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</p>}
      {success && <p role="status" className="mt-3 rounded-lg bg-[#ecfdf5] p-3 text-sm text-[#047857]">{success}</p>}

      {!selectedItem ? (
        <p className="mt-4 rounded-lg bg-surface-container-low p-3 text-sm text-on-surface-variant">
          Select an item from the inventory table using its Adjust button.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="rounded-lg bg-surface-container-low p-3">
            <p className="font-mono text-sm font-bold text-on-surface">{selectedItem.sku} · {selectedItem.name}</p>
            <p className="mt-1 text-sm text-on-surface-variant">{selectedItem.storeName} · Current stock: <strong>{selectedItem.quantity}</strong></p>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-on-surface">Adjustment</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['add', 'Add stock', 'add'],
                ['subtract', 'Subtract stock', 'remove'],
              ].map(([value, label, icon]) => (
                <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)} className={`flex h-10 items-center justify-center gap-2 rounded-lg border font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${mode === value ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant/50 text-on-surface hover:bg-surface-container'}`}>
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>{label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Units
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Decrease adjustment quantity" onClick={() => setQuantity((current) => Math.max(1, Number(current || 1) - 1))} className="h-10 w-10 rounded-lg border border-outline-variant/50 font-bold hover:bg-surface-container">−</button>
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value === '' ? '' : Number(event.target.value))} className="h-10 min-w-0 flex-1 rounded-lg border border-outline-variant/50 px-3 text-center font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary" />
              <button type="button" aria-label="Increase adjustment quantity" onClick={() => setQuantity((current) => Number(current || 0) + 1)} className="h-10 w-10 rounded-lg border border-outline-variant/50 font-bold hover:bg-surface-container">+</button>
            </div>
          </label>

          <p className={`text-sm font-semibold ${wouldGoNegative ? 'text-error' : 'text-on-surface-variant'}`}>
            New balance: {Number.isFinite(result) ? result : selectedItem.quantity}
          </p>

          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Reason <span className="text-error" aria-hidden="true">*</span>
            <select required value={reason} onChange={(event) => setReason(event.target.value)} className="h-10 rounded-lg border border-outline-variant/50 bg-white px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
              {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-on-surface">
            Notes <span className="font-normal text-on-surface-variant">(optional)</span>
            <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Invoice, stocktake, or ticket reference" className="h-10 rounded-lg border border-outline-variant/50 px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary" />
          </label>

          <button type="submit" disabled={busy || invalidQuantity || Boolean(wouldGoNegative)} className="h-10 w-full rounded-lg bg-primary px-4 font-semibold text-on-primary hover:bg-primary-container disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary">
            {busy ? 'Saving…' : `${mode === 'add' ? 'Add' : 'Subtract'} ${quantity || 0} units`}
          </button>
        </form>
      )}
      {!stores.length && <p className="mt-2 text-xs text-on-surface-variant">No stores were returned by the API.</p>}
    </section>
  );
}
