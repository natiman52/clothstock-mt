import { useState } from 'react';
import { useOutletContext } from 'react-router';
import formatMoney from '../utils/formatMoney.js';

export default function SalesPage() {
  const { sales } = useOutletContext();
  const [openId, setOpenId] = useState(null);
  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 overflow-hidden">
      <div className="px-space-md py-space-sm border-b border-outline-variant/30">
        <h2 className="font-headline-sm">Sales History</h2>
      </div>
      <div className="divide-y divide-outline-variant/20">
        {sales.map((sale) => (
          <div key={sale.id} className="p-space-md">
            <button type="button" className="w-full text-left" onClick={() => setOpenId(openId === sale.id ? null : sale.id)}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-headline-sm">{sale.receiptNumber}</div>
                  <div className="font-label-sm text-outline">
                    {new Date(sale.soldAt).toLocaleString()} · {sale.paymentMethod} · {sale.itemCount} items
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-semibold">{formatMoney(sale.totalAmount)}</div>
                  <span
                    className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      sale.syncStatus === 'SYNCED'
                        ? 'bg-[#ecfdf5] text-[#047857]'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {sale.syncStatus}
                  </span>
                </div>
              </div>
            </button>
            {openId === sale.id && (
              <div className="mt-3 space-y-1 font-body-sm text-on-surface-variant">
                {sale.items.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>
                      {item.productName} · {item.sku} ×{item.quantity}
                    </span>
                    <span className="font-mono text-on-surface">{formatMoney(item.lineTotal)}</span>
                  </div>
                ))}
                {sale.customerName && <p>Customer: {sale.customerName}</p>}
              </div>
            )}
          </div>
        ))}
        {!sales.length && (
          <p className="p-space-lg text-center text-on-surface-variant">No sales on this terminal yet.</p>
        )}
      </div>
    </section>
  );
}
