import { useMemo } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const COLOR_MAP = {
  SALE:        { hex: '#ef4444', label: 'Sales' },
  RETURN:      { hex: '#f59e0b', label: 'Returns' },
  RESTOCK:     { hex: '#10b981', label: 'Restocks' },
  SHRINKAGE:   { hex: '#f43f5e', label: 'Shrinkage' },
  STOCKTAKE:   { hex: '#06b6d4', label: 'Audits' },
  TRANSFER:    { hex: '#8b5cf6', label: 'Transfers' },
};

export default function ActionDonutChart({ actions = [] }) {
  const totalCount = useMemo(() => {
    return actions.reduce((sum, a) => sum + (a.count || 0), 0);
  }, [actions]);

  const { labels, dataValues, backgroundColors } = useMemo(() => {
    const activeActions = actions.filter((a) => (a.count || 0) > 0 || Math.abs(a.units_impact || 0) > 0);
    const valid = activeActions.length > 0 ? activeActions : actions;

    return {
      labels: valid.map((a) => a.label),
      dataValues: valid.map((a) => Math.max(a.count, Math.abs(a.units_impact || 0)) || 1),
      backgroundColors: valid.map((a) => COLOR_MAP[a.reason]?.hex || '#6366f1'),
    };
  }, [actions]);

  const chartData = useMemo(() => {
    return {
      labels,
      datasets: [
        {
          data: dataValues,
          backgroundColor: backgroundColors,
          borderWidth: 2,
          borderColor: '#ffffff',
          hoverOffset: 6,
        },
      ],
    };
  }, [labels, dataValues, backgroundColors]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'monospace', size: 12 },
          bodyFont: { family: 'monospace', size: 12 },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const idx = context.dataIndex;
              const act = actions[idx];
              if (!act) return `${context.label}: ${context.raw}`;
              return `${act.label}: ${act.count} events (${act.units_impact > 0 ? `+${act.units_impact}` : act.units_impact} pcs)`;
            },
          },
        },
      },
    };
  }, [actions]);

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">donut_large</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Chart.js Donut Share
            </span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">
            Action Distribution
          </h3>
        </div>
        <span className="font-label-sm text-[10px] font-mono bg-surface-container px-2 py-0.5 rounded text-outline font-bold">
          {totalCount} TOTAL EVENTS
        </span>
      </div>

      {/* Donut and Legend Layout */}
      <div className="my-space-md flex flex-col sm:flex-row items-center justify-center gap-6">
        <div className="relative w-48 h-48 flex items-center justify-center shrink-0">
          <Doughnut data={chartData} options={options} />
          {/* Centered Statistic */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-headline-sm text-[22px] font-bold font-mono text-on-surface">
              {totalCount}
            </span>
            <span className="font-label-sm text-[10px] text-outline uppercase font-semibold">
              Mutations
            </span>
          </div>
        </div>

        {/* Legend List */}
        <div className="flex-1 w-full space-y-1.5 min-w-0">
          {actions.map((act) => {
            const hex = COLOR_MAP[act.reason]?.hex || '#6366f1';
            return (
              <div
                key={act.reason}
                className="p-1 px-2 rounded-lg flex items-center justify-between hover:bg-surface-container-low transition-colors text-[12px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                  <span className="font-body-md font-semibold text-on-surface truncate">
                    {act.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] shrink-0">
                  <span className="text-on-surface-variant">{act.count} evts</span>
                  <span
                    className={`font-bold ${
                      act.units_impact > 0 ? 'text-[#047857]' : act.units_impact < 0 ? 'text-error' : 'text-on-surface'
                    }`}
                  >
                    {act.units_impact > 0 ? `+${act.units_impact}` : act.units_impact}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-space-sm border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
        <span>Categorized from stock ledger</span>
        <span className="font-mono text-primary font-semibold">Live Doughnut</span>
      </div>
    </div>
  );
}
