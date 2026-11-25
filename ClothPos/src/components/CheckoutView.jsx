import { useState } from 'react';
import formatMoney from '../utils/formatMoney.js';

function VariantPicker({ product, onAdd }) {
  const [quantities, setQuantities] = useState({});
  if (!product) return null;
  return (
    <div className="mt-space-md bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-space-md">
      <div className="mb-3">
        <h3 className="font-headline-sm">{product.name} variants</h3>
        <p className="font-label-sm text-outline">Choose size and color</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {product.variants.map((variant) => {
          const out = variant.quantityOnHand <= 0;
          const quantity = Math.max(1, Number(quantities[variant.id] || 1));
          return (
            <div
              key={variant.id}
              className="text-left border border-outline-variant/30 rounded-lg p-3 disabled:opacity-50"
            >
              <div className="flex justify-between gap-2">
                <span className="font-label-md">{variant.size} / {variant.color}</span>
                <span className="font-mono text-on-surface">{formatMoney(variant.price)}</span>
              </div>
              <div className="mt-1 font-label-sm font-mono text-outline">
                {variant.sku} · {out ? 'Out of stock' : `${variant.quantityOnHand} available`}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="number"
                  min="1"
                  max={variant.quantityOnHand}
                  value={quantity}
                  disabled={out}
                  onChange={(event) => setQuantities((current) => ({
                    ...current,
                    [variant.id]: Math.min(variant.quantityOnHand, Math.max(1, Number(event.target.value || 1))),
                  }))}
                  className="w-20 h-9 px-2 rounded border border-outline-variant/40"
                />
                <button
                  type="button"
                  onClick={() => onAdd({ ...variant, quantity })}
                  disabled={out}
                  className="flex-1 h-9 rounded-lg bg-primary text-on-primary disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckoutView({
  query,
  scanRef,
  products,
  selectedProductId,
  setSelectedProductId,
  cart,
  onQuery,
  onScan,
  onAdd,
  onQty,
  onRemove,
  onClear,
  onPay,
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-space-md">
      <section className="xl:col-span-3 space-y-space-md">
        <form
          onSubmit={onScan}
          className="bg-surface-container-lowest p-space-md rounded-xl border border-outline-variant/30 shadow-sm"
        >
          <label className="font-label-sm text-outline uppercase tracking-wider">Scan barcode or SKU</label>
          <div className="mt-2 relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              barcode_scanner
            </span>
            <input
              ref={scanRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Scan or type SKU / barcode / style"
              className="w-full h-12 pl-11 pr-3 bg-surface-container-low rounded-lg font-body-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
            />
          </div>
      </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
          {(products || []).map((product) => {
            const inStock = product.variants.reduce((sum, variant) => sum + Math.max(0, variant.quantityOnHand), 0);
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
                className={`text-left bg-surface-container-lowest p-space-md rounded-xl shadow-sm border flex flex-col justify-between hover:shadow-md transition-shadow ${selectedProductId === product.id ? 'border-primary ring-2 ring-primary/20' : 'border-outline-variant/30'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-headline-sm text-body-lg text-on-surface font-semibold leading-snug">{product.name}</span>
                  <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                    {(product.categoryName || 'SKU').toUpperCase()}
                  </span>
                </div>
                <div className="mt-space-sm flex justify-between font-body-sm text-on-surface-variant">
                  <span className={inStock <= 0 ? 'text-error font-bold' : 'text-[#047857]'}>
                    {inStock <= 0 ? 'Out of stock' : `${inStock} units across ${product.variants.length} variants`}
                  </span>
                  <span className="font-mono text-on-surface">{product.styleCode}</span>
                </div>
              </button>
            );
          })}
        </div>
        {selectedProductId && (
          <VariantPicker
            product={(products || []).find((item) => item.id === selectedProductId)}
            onAdd={onAdd}
          />
        )}
        {(products || []).length === 0 && (
          <div className="text-center py-16 text-on-surface-variant font-body-md bg-surface-container-lowest rounded-xl border border-outline-variant/30">
            <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">inventory_2</span>
            <p className="font-semibold text-on-surface">No matching products found</p>
            <p className="text-body-sm mt-1">Try a barcode, SKU, or style code. Sync catalog from Settings if this terminal is empty.</p>
          </div>
        )}
      </section>

      <aside className="xl:col-span-2 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-col min-h-[520px]">
        <div className="px-space-md py-space-sm border-b border-outline-variant/30 flex items-center justify-between">
          <div>
            <h2 className="font-headline-sm text-on-surface">Cart</h2>
            <p className="font-label-sm text-outline">{cart?.itemCount || 0} ITEMS</p>
          </div>
          <button type="button" onClick={onClear} className="font-label-sm text-on-surface-variant hover:text-error">
            Clear
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-space-md space-y-2">
          {(cart?.items || []).map((line) => (
            <div key={line.variantId} className="border border-outline-variant/30 rounded-lg p-space-sm">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-headline-sm text-[14px]">{line.productName}</div>
                  <div className="font-label-sm text-[10px] text-outline font-mono">
                    {line.sku} · {line.size}/{line.color}
                  </div>
                </div>
                <button type="button" onClick={() => onRemove(line.variantId)} className="text-outline hover:text-error">
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="w-7 h-7 rounded bg-surface-container-low"
                    onClick={() => onQty(line.variantId, line.quantity - 1)}
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-mono">{line.quantity}</span>
                  <button
                    type="button"
                    className="w-7 h-7 rounded bg-surface-container-low"
                    onClick={() => onQty(line.variantId, line.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <span className="font-mono font-semibold">{formatMoney(line.lineTotal)}</span>
              </div>
            </div>
          ))}
          {!cart?.items?.length && (
            <p className="text-on-surface-variant text-center py-12">Scan a barcode to start a sale.</p>
          )}
        </div>
        <div className="p-space-md border-t border-outline-variant/30 space-y-2">
          <div className="flex justify-between font-body-md">
            <span>Subtotal</span>
            <span className="font-mono">{formatMoney(cart?.subtotal)}</span>
          </div>
          <div className="flex justify-between font-headline-sm">
            <span>Total</span>
            <span className="font-mono">{formatMoney(cart?.totalAmount)}</span>
          </div>
          <button
            type="button"
            disabled={!cart?.items?.length}
            onClick={onPay}
            className="w-full h-11 rounded-lg bg-primary text-on-primary font-headline-sm disabled:opacity-40"
          >
            Pay {formatMoney(cart?.totalAmount)}
          </button>
        </div>
      </aside>
    </div>
  );
}
