import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../context';
import apiClient from '../api/client';
import RevenueTrendChart from '../components/charts/RevenueTrendChart';
import ActionDonutChart from '../components/charts/ActionDonutChart';
import TopProductsChart from '../components/charts/TopProductsChart';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const { activeStore, activeStoreObj, setActiveStore } = useStore();
  const [dateRange, setDateRange] = useState('7d');

  // Fetch store-scoped KPI analytics computed from immutable StockLedgerEntry
  const { data: analyticsData, isLoading, refetch } = useQuery({
    queryKey: ['analytics-summary', activeStore, dateRange],
    queryFn: () => apiClient.get(`/api/analytics/summary/?range=${dateRange}`).catch(() => null),
  });

  const kpis = analyticsData?.kpis || {
    total_revenue: 0.0,
    gross_revenue: 0.0,
    units_sold: 0,
    units_returned: 0,
    net_units_sold: 0,
    refunds_value: 0.0,
    avg_price: 0.0,
    cogs: 0.0,
    gross_profit: 0.0,
    profit_margin_pct: 0.0,
    total_ledger_actions: 0,
    units_restocked: 0,
    units_deducted: 0,
    stocktake_variances: 0,
    transfers_units: 0,
    valuation: 0.0,
    total_stock_units: 0,
    active_styles_count: 0,
    negative_skus_count: 0,
  };

  const actionsSummary = analyticsData?.actions_summary || [
    { reason: 'SALE', label: 'Customer Sales', count: 0, units_impact: 0, monetary_impact: 0, icon: 'shopping_cart', badge_class: 'bg-error-container text-on-error-container' },
    { reason: 'RETURN', label: 'Returns & Refunds', count: 0, units_impact: 0, monetary_impact: 0, icon: 'assignment_return', badge_class: 'bg-amber-100 text-amber-800' },
    { reason: 'RESTOCK', label: 'Stock Inbound & Additions', count: 0, units_impact: 0, monetary_impact: null, icon: 'add_circle', badge_class: 'bg-[#ecfdf5] text-[#047857]' },
    { reason: 'SHRINKAGE', label: 'Damage & Shrinkage Deductions', count: 0, units_impact: 0, monetary_impact: null, icon: 'remove_circle', badge_class: 'bg-error-container text-on-error-container' },
    { reason: 'STOCKTAKE', label: 'Stocktake Audit Reconciliations', count: 0, units_impact: 0, monetary_impact: null, icon: 'fact_check', badge_class: 'bg-secondary-fixed text-on-secondary-fixed' },
    { reason: 'TRANSFER', label: 'Location Transfers', count: 0, units_impact: 0, monetary_impact: null, icon: 'local_shipping', badge_class: 'bg-primary-fixed text-on-primary-fixed' },
  ];

  const topProducts = analyticsData?.top_products || [];
  const timeline = analyticsData?.timeline || [];
  const storeBreakdown = analyticsData?.store_breakdown || [];
  const edgeTelemetry = analyticsData?.edge_telemetry || [];

  const formatCurrency = (val) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(val || 0);

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Active Store Scope Ribbon */}
      <div className="flex items-center justify-between gap-space-xs flex-wrap bg-surface-container-lowest p-2.5 sm:px-4 rounded-xl border border-outline-variant/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-primary">
            {activeStore === 'storage' ? 'warehouse' : 'storefront'}
          </span>
          <span className="font-label-md text-label-md text-on-surface font-semibold">
            Scope: <span className="text-primary">{activeStoreObj.name}</span>
          </span>
          {activeStore !== 'all' && (
            <span className="px-1.5 py-0.5 rounded bg-primary text-on-primary font-mono text-[10px] font-bold">
              FILTERED
            </span>
          )}
          <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-mono text-[10px] font-bold">
            STOCK LEDGER AUDITED
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeStore !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveStore('all')}
              className="text-[11px] font-label-sm text-on-surface-variant hover:text-primary transition-colors underline cursor-pointer"
            >
              Reset to All Stores
            </button>
          )}
          <div className="relative inline-flex items-center">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="appearance-none bg-surface-container-low text-on-surface font-label-md text-label-md py-1 pl-2.5 pr-7 rounded-lg shadow-xs focus:outline-none cursor-pointer border border-outline-variant/30 text-[12px]"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="mtd">Month to Date</option>
              <option value="yesterday">Yesterday</option>
              <option value="all">All-Time History</option>
            </select>
            <span className="material-symbols-outlined text-[15px] text-on-surface-variant absolute right-1.5 pointer-events-none">
              calendar_today
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface cursor-pointer"
            title="Refresh statistics"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Operational Alert */}
      {kpis.negative_skus_count > 0 && (
        <div className="bg-error-container text-on-error-container rounded-xl p-space-md shadow-sm flex items-start gap-space-sm">
          <span className="material-symbols-outlined text-[20px] text-error mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            warning
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-space-xs">
              <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider">
                Ledger Variance Discrepancy Alert
              </span>
              <span className="font-label-sm text-[10px] font-mono font-bold bg-error text-on-error px-1.5 py-0.5 rounded">
                REQUIRES AUDIT
              </span>
            </div>
            <p className="font-body-md text-body-sm sm:text-body-md mt-0.5 text-on-error-container">
              {kpis.negative_skus_count} variant(s) have recorded negative physical balances in {activeStoreObj.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/inventory')}
            className="px-2.5 py-1 rounded bg-error text-on-error font-label-sm text-[11px] font-semibold shrink-0 cursor-pointer"
          >
            Adjust Stock
          </button>
        </div>
      )}

      {/* ── 1. Top Business KPIs Grid ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-sm">
        {/* Net Revenue */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Net Sales Revenue</span>
            <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
          </div>
          <div className="mt-2">
            <span className="font-headline-lg text-headline-sm sm:text-headline-lg font-bold font-mono text-on-surface tracking-tight">
              {isLoading ? '…' : formatCurrency(kpis.total_revenue)}
            </span>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-1 font-mono">
              <span>Gross: {formatCurrency(kpis.gross_revenue)}</span>
              {kpis.refunds_value > 0 && (
                <span className="text-amber-800 font-bold">-{formatCurrency(kpis.refunds_value)} ref</span>
              )}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[10px] font-mono text-outline">
            <span>Avg Sale: {formatCurrency(kpis.avg_price)}</span>
            <span>{kpis.net_units_sold} net units</span>
          </div>
        </div>

        {/* Gross Profit & Margin */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Gross Profit &amp; Margin</span>
            <span className="material-symbols-outlined text-[#047857] text-[20px]">trending_up</span>
          </div>
          <div className="mt-2">
            <span className="font-headline-lg text-headline-sm sm:text-headline-lg font-bold font-mono text-[#047857] tracking-tight">
              {isLoading ? '…' : formatCurrency(kpis.gross_profit)}
            </span>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-1 font-mono">
              <span>COGS: {formatCurrency(kpis.cogs)}</span>
              <span className="font-bold text-[#047857]">{kpis.profit_margin_pct}% Margin</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/20 font-label-sm text-[10px] font-mono text-outline">
            Snapshotted cost price calculation
          </div>
        </div>

        {/* Inventory Valuation */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Inventory Valuation</span>
            <span className="material-symbols-outlined text-secondary text-[20px]">inventory_2</span>
          </div>
          <div className="mt-2">
            <span className="font-headline-lg text-headline-sm sm:text-headline-lg font-bold font-mono text-on-surface tracking-tight">
              {isLoading ? '…' : formatCurrency(kpis.valuation)}
            </span>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-1 font-mono">
              <span>{kpis.total_stock_units} Units On Hand</span>
              <span>{kpis.active_styles_count} Styles</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[10px] font-mono text-outline">
            <span>Physical balance in scope</span>
            <span className={kpis.negative_skus_count > 0 ? 'text-error font-bold' : 'text-[#047857]'}>
              {kpis.negative_skus_count} Discrepancies
            </span>
          </div>
        </div>

        {/* Ledger Audited Actions Count */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between border border-outline-variant/30">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Audited Ledger Actions</span>
            <span className="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
          </div>
          <div className="mt-2">
            <span className="font-headline-lg text-headline-sm sm:text-headline-lg font-bold font-mono text-on-surface tracking-tight">
              {isLoading ? '…' : kpis.total_ledger_actions}
            </span>
            <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-1 font-mono">
              <span>+{kpis.units_restocked} Restocked</span>
              <span className="text-amber-800">+{kpis.units_returned} Returns</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[10px] font-mono text-outline">
            <span>{kpis.transfers_units} Transferred</span>
            <span>{kpis.stocktake_variances} Reconciled</span>
          </div>
        </div>
      </div>

      {/* ── 2. Primary Charts Section ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        {/* Revenue & Sales Trajectory Chart (7 Cols) */}
        <div className="lg:col-span-7">
          <RevenueTrendChart timeline={timeline} />
        </div>

        {/* Action Share Donut Chart (5 Cols) */}
        <div className="lg:col-span-5">
          <ActionDonutChart actions={actionsSummary} />
        </div>
      </div>

      {/* ── 3. Merchandise Velocity & Timeline Comparison ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        {/* Top Performing Styles Bar Chart (6 Cols) */}
        <div className="lg:col-span-6">
          <TopProductsChart topProducts={topProducts} />
        </div>

        {/* Activity Timeline Breakdown (6 Cols) */}
        <div className="lg:col-span-6 bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                  Timeline Composition
                </span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Daily Ledger Activity</h3>
              </div>
              <span className="font-label-sm text-[10px] font-mono text-outline">LAST 7 DAYS</span>
            </div>

            {/* Timeline bars */}
            <div className="mt-space-md space-y-space-sm">
              {timeline.map((day) => {
                const totalDayVolume = day.sales + day.returns + day.adjustments + day.transfers;
                return (
                  <div key={day.full_date} className="space-y-1">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="font-semibold text-on-surface">{day.date}</span>
                      <div className="flex items-center gap-3">
                        {day.sales > 0 && <span className="text-error font-bold">-{day.sales} sold</span>}
                        {day.returns > 0 && <span className="text-amber-800">+{day.returns} ret</span>}
                        {day.adjustments > 0 && <span className="text-[#047857]">+{day.adjustments} adj</span>}
                        {totalDayVolume === 0 && <span className="text-outline">No mutations</span>}
                      </div>
                    </div>
                    <div className="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden flex">
                      {day.sales > 0 && (
                        <div
                          className="bg-error h-full"
                          style={{ width: `${Math.min(100, (day.sales / (totalDayVolume || 1)) * 100)}%` }}
                          title={`Sales: ${day.sales}`}
                        />
                      )}
                      {day.returns > 0 && (
                        <div
                          className="bg-amber-500 h-full"
                          style={{ width: `${Math.min(100, (day.returns / (totalDayVolume || 1)) * 100)}%` }}
                          title={`Returns: ${day.returns}`}
                        />
                      )}
                      {day.adjustments > 0 && (
                        <div
                          className="bg-[#10b981] h-full"
                          style={{ width: `${Math.min(100, (day.adjustments / (totalDayVolume || 1)) * 100)}%` }}
                          title={`Adjustments: ${day.adjustments}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-space-md mt-space-md border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-error" />
                <span>Sales</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span>Returns</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#10b981]" />
                <span>Restocks</span>
              </div>
            </div>
            <span className="font-mono">{kpis.total_ledger_actions} Total Actions</span>
          </div>
        </div>
      </div>

      {/* ── 4. Stock Ledger Action Matrix ────────────────────────────────────── */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg space-y-space-md">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
          <div>
            <h2 className="font-headline-sm text-body-lg text-on-surface font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">analytics</span>
              <span>Stock Ledger Action Matrix</span>
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Comprehensive breakdown of all inventory mutations recorded across sales, returns, restocks, and audits.
            </p>
          </div>
          <Link
            to="/ledger"
            className="text-primary font-label-sm text-label-sm hover:underline flex items-center gap-0.5"
          >
            <span>Audit Trail</span>
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-space-sm">
          {actionsSummary.map((act) => (
            <div
              key={act.reason}
              className="bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/30 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">{act.icon}</span>
                  <span className="font-body-md font-semibold text-on-surface text-[13px]">{act.label}</span>
                </div>
                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded font-bold ${act.badge_class}`}>
                  {act.count} Evt
                </span>
              </div>

              <div className="mt-3 flex items-end justify-between font-mono">
                <div>
                  <span className="text-[10px] text-on-surface-variant block uppercase">Units Delta</span>
                  <span
                    className={`font-bold text-[16px] ${
                      act.units_impact > 0
                        ? 'text-[#047857]'
                        : act.units_impact < 0
                        ? 'text-error'
                        : 'text-on-surface'
                    }`}
                  >
                    {act.units_impact > 0 ? `+${act.units_impact}` : act.units_impact} pcs
                  </span>
                </div>
                {act.monetary_impact !== null && (
                  <div className="text-right">
                    <span className="text-[10px] text-on-surface-variant block uppercase">Value</span>
                    <span className="font-bold text-on-surface text-[15px]">
                      {formatCurrency(Math.abs(act.monetary_impact))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Multi-Store Matrix & Edge Telemetry ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
        {/* Store Comparison */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 space-y-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Multi-Store Performance
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Store Breakdown</h3>
            </div>
            <span className="font-label-sm text-[10px] font-mono text-outline">SELL-THROUGH %</span>
          </div>

          <div className="space-y-space-sm">
            {storeBreakdown.map((st) => (
              <div key={st.id || st.name} className="space-y-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="font-semibold text-on-surface truncate max-w-[150px]">
                    {st.name} {st.is_warehouse ? '📦' : ''}
                  </span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-semibold text-on-surface">{formatCurrency(st.revenue)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-secondary-fixed text-on-secondary-fixed">
                      {st.sell_through_pct}% ST
                    </span>
                  </div>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${st.sell_through_pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-on-surface-variant font-mono">
                  <span>{st.stock_units} stock units</span>
                  <span>{st.units_sold} sold</span>
                </div>
              </div>
            ))}

            {storeBreakdown.length === 0 && (
              <div className="py-8 text-center text-on-surface-variant font-body-sm">
                No active store branches configured.
              </div>
            )}
          </div>
        </div>

        {/* Edge Node Sync Telemetry */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md sm:p-space-lg shadow-sm border border-outline-variant/30 space-y-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Sync Topology
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Edge Node Sync Telemetry</h3>
            </div>
            <span className="font-label-sm text-[10px] font-mono text-outline">
              {edgeTelemetry.length} Nodes
            </span>
          </div>

          <div className="space-y-2">
            {edgeTelemetry.map((node) => (
              <div
                key={node.store_id || node.store_name}
                className="bg-surface-container-low p-2.5 rounded-lg flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
                      {node.store_name}
                    </span>
                    <span
                      className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-bold font-mono ${
                        node.status === 'ONLINE'
                          ? 'bg-[#ecfdf5] text-[#047857]'
                          : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      {node.status}
                    </span>
                  </div>
                  <div className="font-label-sm text-[10px] text-on-surface-variant mt-0.5 font-mono">
                    {node.pending_events} pending mutations •{' '}
                    {node.last_synced_at ? new Date(node.last_synced_at).toLocaleTimeString() : 'Up to date'}
                  </div>
                </div>
                <span
                  className={`material-symbols-outlined text-[18px] ${
                    node.status === 'ONLINE' ? 'text-[#047857]' : 'text-error'
                  }`}
                >
                  {node.status === 'ONLINE' ? 'done_all' : 'error'}
                </span>
              </div>
            ))}

            {edgeTelemetry.length === 0 && (
              <div className="py-8 text-center text-on-surface-variant font-body-sm">
                No active terminals registered.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
