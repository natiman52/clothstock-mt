import { useState } from 'react';
import formatMoney from '../utils/formatMoney.js';

const PAYMENT_METHODS = [
  { id: 'CASH', label: 'Cash', icon: 'payments' },
  { id: 'CARD', label: 'Card', icon: 'credit_card' },
  { id: 'MOBILE', label: 'Mobile Money', icon: 'smartphone' },
  { id: 'MIXED', label: 'Mixed', icon: 'account_balance_wallet' },
];

export default function CheckoutModal({ cart, onClose, onConfirm, completedSale, busy }) {
  const [method, setMethod] = useState('CASH');
  const [tendered, setTendered] = useState(cart?.totalAmount || '');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const total = Number(cart?.totalAmount || 0);
  const change = Math.max(0, Number(tendered || 0) - total);

  if (completedSale) {
    return (
      <div className="fixed inset-0 bg-primary/40 z-[80] flex items-center justify-center p-4">
        <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-md p-space-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[#047857]">check_circle</span>
            <h3 className="font-headline-md">Sale complete</h3>
          </div>
          <p className="font-label-lg text-on-surface-variant">{completedSale.receiptNumber}</p>
          <p className="font-headline-lg mt-2">{formatMoney(completedSale.totalAmount)}</p>
          <p className="font-body-sm text-on-surface-variant mt-1">
            {completedSale.paymentMethod} · Change {formatMoney(completedSale.changeDue)}
          </p>
          <p className="font-label-sm text-outline mt-2">Queued for ClothStock sync</p>
          <button type="button" onClick={onClose} className="mt-4 w-full h-10 rounded-lg bg-primary text-on-primary">
            New sale
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-primary/40 z-[80] flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-xl shadow-xl w-full max-w-lg p-space-lg">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-headline-md">Checkout</h3>
            <p className="font-label-sm text-outline">TOTAL {formatMoney(total)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-on-surface-variant">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {PAYMENT_METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMethod(item.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                method === item.id
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-outline-variant/40 text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        {(method === 'CASH' || method === 'MIXED') && (
          <label className="flex flex-col gap-1 mb-3">
            <span className="font-label-sm text-outline uppercase">Amount tendered</span>
            <input
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
            />
            <span className="font-label-md text-on-surface-variant">Change due {formatMoney(change)}</span>
          </label>
        )}
        <label className="flex flex-col gap-1 mb-3">
          <span className="font-label-sm text-outline uppercase">Customer name</span>
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 mb-4">
          <span className="font-label-sm text-outline uppercase">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onConfirm({
              paymentMethod: method,
              amountTendered: tendered,
              customerName,
              notes,
            })
          }
          className="w-full h-11 rounded-lg bg-primary text-on-primary font-headline-sm disabled:opacity-50"
        >
          {busy ? 'Processing…' : `Confirm ${method} payment`}
        </button>
      </div>
    </div>
  );
}
