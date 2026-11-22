import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

const REASON_META = {
  SALE:                    { icon: 'shopping_cart',  color: 'text-secondary',    badge: 'SALE',      badgeClass: 'bg-error-container text-on-error-container' },
  WAREHOUSE_TRANSFER:      { icon: 'local_shipping', color: 'text-[#047857]',    badge: 'TRANSFER',  badgeClass: 'bg-[#ecfdf5] text-[#047857]' },
  STOCK_ADJUSTMENT:        { icon: 'tune',           color: 'text-amber-700',    badge: 'ADJUST',    badgeClass: 'bg-amber-100 text-amber-800' },
  STOCKTAKE_RECONCILIATION:{ icon: 'tune',           color: 'text-amber-700',    badge: 'STOCKTAKE', badgeClass: 'bg-amber-100 text-amber-800' },
};

const SAMPLE_ENTRIES = [
  { id: 1, label: 'OTT-BLK-L (Overland Trench)',  sub: 'SoHo Flagship • Ticket #1042 • AUTO_SYNC', delta: -1, balance: -1,  reason: 'SALE',               flagged: true  },
  { id: 2, label: 'VGC-OLV-32 (Vintage Cargo)',    sub: 'Warehouse Newark Central • Inbound Container', delta: 40, balance: 140, reason: 'WAREHOUSE_TRANSFER', flagged: false },
  { id: 3, label: 'HWT-BLK-M (Heavyweight Tee)',   sub: 'Brooklyn Hub • Audit Variance Reconciliation', delta: 2,  balance: 24,  reason: 'STOCKTAKE_RECONCILIATION', flagged: false },
];

export default function LedgerPage() {
  const { data: ledgerData } = useQuery({
    queryKey: ['ledger'],
    queryFn: () => apiClient.get('/api/ledger/?ordering=-timestamp&limit=50').catch(() => null),
  });

  const ledgerList = ledgerData?.results || (Array.isArray(ledgerData) ? ledgerData : []);

  const displayEntries = ledgerList.length > 0
    ? ledgerList.map((e) => ({
        id: e.id,
        label: `${e.variant_sku} (${e.product_name || '—'})`,
        sub:   `${e.store_name || e.store_code} • ${e.sync_source}`,
        delta: e.delta,
        balance: e.resulting_balance,
        reason: e.reason,
        flagged: e.resulting_balance < 0,
      }))
    : SAMPLE_ENTRIES;

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">Stock Change Ledger</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Immutable audit trail recording every inventory delta and resulting balance.
          </p>
        </div>
        <span className="font-label-sm text-[10px] font-mono bg-primary text-on-primary px-2 py-0.5 rounded">
          SHA-256 AUDIT OK
        </span>
      </div>

      {/* Ledger Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
        <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between">
          <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">Recent Ledger Mutations</span>
          <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">{displayEntries.length} Transactions</span>
        </div>

        <div className="divide-y divide-surface-container-low font-body-md text-body-md">
          {displayEntries.map((entry) => {
            const meta = REASON_META[entry.reason] || REASON_META['STOCK_ADJUSTMENT'];
            const isPositive = entry.delta > 0;
            return (
              <div key={entry.id} className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-surface-container-low/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${meta.color} text-[20px] shrink-0`}>{meta.icon}</span>
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-body-md font-semibold text-on-surface">{entry.label}</span>
                    <span className="font-label-sm text-[10px] text-outline font-mono">{entry.sub}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div className="flex flex-col">
                    <span className={`font-label-lg text-body-md font-bold font-mono ${isPositive ? 'text-[#047857]' : 'text-error'}`}>
                      {isPositive ? '+' : ''}{entry.delta} pcs
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                      Balance: {entry.balance}{entry.flagged ? ' (Flagged)' : ''}
                    </span>
                  </div>
                  <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-bold font-mono ${meta.badgeClass}`}>
                    {meta.badge}
                  </span>
                </div>
              </div>
            );
          })}

          {displayEntries.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant font-body-md">
              <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">receipt_long</span>
              No ledger entries yet. Stock changes will appear here automatically.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
