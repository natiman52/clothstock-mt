import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('7d');
  const [chartView, setChartView] = useState('style');

  const { data: storesData }    = useQuery({ queryKey: ['stores'],    queryFn: () => apiClient.get('/api/stores/').catch(() => null) });
  const { data: productsData }  = useQuery({ queryKey: ['products'],  queryFn: () => apiClient.get('/api/products/').catch(() => null) });
  const { data: inventoryData } = useQuery({ queryKey: ['inventory'], queryFn: () => apiClient.get('/api/inventory/').catch(() => null) });

  const productsCount  = productsData?.count  || (Array.isArray(productsData)  ? productsData.length  : 1420);
  const inventoryCount = inventoryData?.count || (Array.isArray(inventoryData) ? inventoryData.length : 28450);
  const storesList     = storesData?.results  || storesData || [];

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Filter & Date Ribbon */}
      <div className="flex items-center justify-between gap-space-xs overflow-x-auto no-scrollbar">
        <div className="relative inline-flex items-center">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="appearance-none bg-surface-container-low text-on-surface font-label-md text-label-md py-1.5 pl-2.5 pr-7 rounded-lg shadow-sm focus:outline-none cursor-pointer border border-outline-variant/30"
          >
            <option value="7d">Last 7 Days</option>
            <option value="q3">Q3 Bulk Intake</option>
            <option value="mtd">Month to Date</option>
            <option value="yesterday">Yesterday</option>
          </select>
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute right-1.5 pointer-events-none">
            calendar_today
          </span>
        </div>
        <span className="font-label-sm text-[11px] text-on-surface-variant font-mono">
          Showing Batch Performance
        </span>
      </div>

      {/* Operational Alert */}
      <div className="bg-error-container text-on-error-container rounded-xl p-space-md shadow-sm flex items-start gap-space-sm">
        <span className="material-symbols-outlined text-[20px] text-error mt-0.5 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
          warning
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold text-error">
              Discrepancy Audit Required
            </span>
            <span className="px-1.5 py-0.5 rounded-full bg-error text-on-error font-label-sm text-[9px] font-bold">
              14 SKUs
            </span>
          </div>
          <p className="font-body-sm text-body-sm mt-0.5 text-on-error-container line-clamp-1">
            Mismatched terminal scans in Chelsea Boots &amp; Runner V2 across edge nodes.
          </p>
          <div className="mt-space-xs flex items-center gap-space-xs">
            <button
              type="button"
              onClick={() => navigate('/ledger')}
              className="bg-error text-on-error hover:opacity-90 active:scale-95 font-label-sm text-label-sm px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all"
            >
              <span>Review Discrepancies</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
            <span className="font-label-sm text-label-sm text-on-error-container/80">Logged 18m ago</span>
          </div>
        </div>
      </div>

      {/* KPI Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-space-sm">
        {[
          { label: 'Total Revenue', value: '$142,850.00', sub: 'vs prev 7-day run', badge: '+14.2%', badgeClass: 'bg-tertiary-fixed text-tertiary-container', icon: 'trending_up', iconClass: 'text-tertiary-container' },
          { label: 'Units Sold',    value: '3,420 pcs',   sub: 'Avg price: $41.76', badge: 'Velocity', badgeClass: 'bg-secondary-fixed text-secondary' },
          { label: 'Valuation',     value: '$894,200.00', sub: `${inventoryCount} variant units (${productsCount} styles)` },
          { label: 'Integrity',     value: '14 SKUs',     sub: 'Negative counts', isError: true },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">{kpi.label}</span>
              {kpi.badge && (
                <span className={`font-label-sm text-[10px] px-1 rounded font-semibold ${kpi.badgeClass}`}>{kpi.badge}</span>
              )}
              {kpi.isError && <span className="w-2 h-2 rounded-full bg-error animate-ping" />}
            </div>
            <div className="mt-space-sm">
              <div className={`font-label-lg text-headline-sm sm:text-headline-md font-bold tracking-tight ${kpi.isError ? 'text-error' : 'text-on-surface'}`}>
                {kpi.value}
              </div>
              <div className={`font-label-sm text-[10px] mt-0.5 flex items-center gap-0.5 ${kpi.isError ? 'text-error font-medium' : 'text-on-surface-variant'}`}>
                {kpi.icon && <span className={`material-symbols-outlined text-[12px] ${kpi.iconClass}`}>{kpi.icon}</span>}
                <span>{kpi.sub}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Store Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md">
        {/* Chart */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col space-y-space-sm">
          <div className="flex items-center justify-between flex-wrap gap-space-xs">
            <div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Batch Intake Velocity</span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Revenue Intake Trend</h3>
            </div>
            <div className="bg-surface-container-low p-0.5 rounded-lg flex items-center">
              {['style', 'sku'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChartView(v)}
                  className={`px-2.5 py-1 rounded font-label-sm text-[10px] transition-all ${
                    chartView === v ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold' : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {v === 'style' ? 'By Style' : 'By SKU'}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full h-48 pt-2">
            <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 320 140">
              <defs>
                <linearGradient id="linenGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#4b41e1" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#4b41e1" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="runnerGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#24a375" stopOpacity="0.30" />
                  <stop offset="100%" stopColor="#24a375" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <line stroke="#d3e4fe" strokeDasharray="2 3" strokeWidth="0.75" x1="0" x2="320" y1="20" y2="20" />
              <line stroke="#d3e4fe" strokeDasharray="2 3" strokeWidth="0.75" x1="0" x2="320" y1="60" y2="60" />
              <line stroke="#d3e4fe" strokeDasharray="2 3" strokeWidth="0.75" x1="0" x2="320" y1="100" y2="100" />
              <line stroke="#cbd5e1" strokeWidth="1" x1="0" x2="320" y1="135" y2="135" />
              <path d="M 0,110 Q 50,95 100,75 T 200,45 T 320,18 L 320,135 L 0,135 Z" fill="url(#runnerGrad)" />
              <path d="M 0,110 Q 50,95 100,75 T 200,45 T 320,18" fill="none" stroke="#24a375" strokeWidth="2" strokeLinecap="round" />
              <path d="M 0,85 Q 60,60 120,80 T 230,35 T 320,50 L 320,135 L 0,135 Z" fill="url(#linenGrad)" />
              <path d="M 0,85 Q 60,60 120,80 T 230,35 T 320,50" fill="none" stroke="#4b41e1" strokeWidth="2.2" strokeLinecap="round" />
              <circle cx="230" cy="35" fill="#4b41e1" r="3.5" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
            <div className="flex justify-between items-center text-[10px] font-label-sm text-on-surface-variant pt-1 px-1 font-mono">
              {['MON', 'WED', 'FRI', 'SUN (PEAK)'].map((d) => <span key={d}>{d}</span>)}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-space-xs">
            {[
              { label: 'Linen Shirts', val: '$68.4k', color: 'bg-secondary' },
              { label: 'Sneakers V2', val: '$49.2k', color: 'bg-[#24a375]' },
              { label: 'Chelsea Boot', val: '$25.2k', color: 'bg-primary' },
            ].map((item) => (
              <div key={item.label} className="bg-surface-container-low p-2 rounded-lg flex flex-col">
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${item.color} shrink-0`} />
                  <span className="font-label-sm text-[10px] truncate text-on-surface">{item.label}</span>
                </div>
                <span className="font-label-md text-label-md font-bold text-on-surface mt-1">{item.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Store Breakdown */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Multi-Store Intake</span>
                <h3 className="font-headline-sm text-headline-sm text-on-surface">Store Breakdown</h3>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">Sell-Through %</span>
            </div>
            <div className="space-y-space-sm mt-space-md">
              {[
                { name: 'SoHo Flagship',      val: '$68,240', pct: 84, pctLabel: '84% ST', pctClass: 'text-tertiary-container bg-tertiary-fixed' },
                { name: 'Brooklyn Hub',       val: '$42,110', pct: 68, pctLabel: '68% ST', pctClass: 'text-tertiary-container bg-tertiary-fixed' },
                { name: 'Miami Pop-up',       val: '$19,450', pct: 52, pctLabel: '52% ST', pctClass: 'text-amber-800 bg-amber-100' },
                { name: 'Warehouse Newark',   val: '$13,050', pct: 31, pctLabel: '31% ST', pctClass: 'text-on-surface-variant bg-surface-container-high' },
              ].map((store) => (
                <div key={store.name} className="space-y-1">
                  <div className="flex items-center justify-between font-label-sm text-label-sm">
                    <span className="font-semibold text-on-surface">{store.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-label-md text-on-surface font-semibold">{store.val}</span>
                      <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${store.pctClass}`}>{store.pctLabel}</span>
                    </div>
                  </div>
                  <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
                    <div className="bg-secondary h-full rounded-full" style={{ width: `${store.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-space-sm border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
            <span>{storesList.length || 4} Active Regional Nodes</span>
            <span className="font-semibold text-secondary">Total: $142.8k</span>
          </div>
        </div>
      </div>

      {/* Edge Node Sync Telemetry */}
      <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm space-y-space-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">sync_saved_locally</span>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">Edge Node Sync Telemetry</h3>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant">4 Locations Registered</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
          {[
            { name: 'SoHo Flagship (#01)',     status: 'ONLINE',  statusClass: 'bg-[#ecfdf5] text-[#047857]', dotClass: 'bg-[#10b981]', sub: 'Synced 42s ago', subSub: '0 pending mutations', subSubClass: 'text-tertiary-container', icon: 'done_all', iconClass: 'text-[#047857]' },
            { name: 'Brooklyn Hub (#02)',       status: 'SYNCING', statusClass: 'bg-amber-100 text-amber-700',  dotClass: 'bg-amber-500 animate-pulse', sub: 'Synced 4m ago', subSub: '12 pending events', subSubClass: 'text-amber-700 font-semibold', icon: 'refresh', iconClass: 'text-amber-600 animate-spin' },
            { name: 'Miami Pop-up (#05)',       status: 'OFFLINE', statusClass: 'bg-error-container text-on-error-container', dotClass: 'bg-error', sub: 'Local mode active', subSub: '88 pending sales', subSubClass: 'text-error font-semibold', action: true },
            { name: 'Warehouse Newark (#DC-04)', status: 'ONLINE', statusClass: 'bg-[#ecfdf5] text-[#047857]', dotClass: 'bg-[#10b981]', sub: 'Synced 1m ago', subSub: 'Inbound manifest verified', subSubClass: '', icon: 'check_circle', iconClass: 'text-[#047857]' },
          ].map((node) => (
            <div key={node.name} className="bg-surface-container-low p-space-sm rounded-lg flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">{node.name}</span>
                  <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-bold flex items-center gap-1 ${node.statusClass}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${node.dotClass}`} />
                    {node.status}
                  </span>
                </div>
                <div className="font-label-sm text-[10px] text-on-surface-variant mt-0.5">
                  {node.sub} • <span className={node.subSubClass}>{node.subSub}</span>
                </div>
              </div>
              {node.action ? (
                <button
                  type="button"
                  onClick={() => alert('Initiating manual sync push for Miami Pop-up...')}
                  className="shrink-0 bg-primary text-on-primary hover:bg-primary-container px-2 py-1 rounded font-label-sm text-[10px] font-semibold active:scale-95 transition-transform flex items-center gap-0.5"
                >
                  <span className="material-symbols-outlined text-[12px]">upload</span>
                  <span>Push</span>
                </button>
              ) : (
                <span className={`material-symbols-outlined text-[18px] ${node.iconClass}`}>{node.icon}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
