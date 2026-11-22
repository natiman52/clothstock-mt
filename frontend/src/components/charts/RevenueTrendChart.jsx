import { useState, useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function RevenueTrendChart({ timeline = [] }) {
  const [metric, setMetric] = useState('revenue'); // 'revenue' | 'sales' | 'net'

  const labels = useMemo(() => {
    return timeline.map((d) => d.date);
  }, [timeline]);

  const { dataValues, metricLabel, borderColor, backgroundColor } = useMemo(() => {
    if (metric === 'revenue') {
      return {
        dataValues: timeline.map((d) => d.revenue ?? 0),
        metricLabel: 'Net Revenue ($)',
        borderColor: '#4f46e5', // indigo-600
        backgroundColor: 'rgba(79, 70, 229, 0.12)',
      };
    }
    if (metric === 'sales') {
      return {
        dataValues: timeline.map((d) => d.sales ?? 0),
        metricLabel: 'Units Sold (pcs)',
        borderColor: '#059669', // emerald-600
        backgroundColor: 'rgba(5, 150, 105, 0.12)',
      };
    }
    return {
      dataValues: timeline.map((d) => d.net_units ?? 0),
      metricLabel: 'Net Mutation Delta (pcs)',
      borderColor: '#0284c7', // sky-600
      backgroundColor: 'rgba(2, 132, 199, 0.12)',
    };
  }, [timeline, metric]);

  const chartData = useMemo(() => {
    return {
      labels,
      datasets: [
        {
          label: metricLabel,
          data: dataValues,
          fill: true,
          borderColor,
          backgroundColor,
          tension: 0.38,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: borderColor,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: borderColor,
          pointHoverBorderColor: '#ffffff',
          pointHoverBorderWidth: 2,
        },
      ],
    };
  }, [labels, dataValues, metricLabel, borderColor, backgroundColor]);

  const options = useMemo(() => {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: 'monospace', size: 12 },
          bodyFont: { family: 'monospace', size: 13, weight: 'bold' },
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            label: (context) => {
              const val = context.parsed.y;
              if (metric === 'revenue') {
                return `Revenue: $${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
              return `${context.dataset.label}: ${val} pcs`;
            },
            afterLabel: (context) => {
              const idx = context.dataIndex;
              const day = timeline[idx];
              if (!day) return '';
              const parts = [];
              if (day.sales > 0) parts.push(`Sold: -${day.sales}`);
              if (day.returns > 0) parts.push(`Returns: +${day.returns}`);
              if (day.adjustments > 0) parts.push(`Restocks: +${day.adjustments}`);
              return parts.length > 0 ? parts.join(' | ') : '';
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            font: { family: 'monospace', size: 10 },
            color: '#64748b',
          },
        },
        y: {
          grid: {
            color: 'rgba(148, 163, 184, 0.15)',
            borderDash: [3, 3],
          },
          ticks: {
            font: { family: 'monospace', size: 10 },
            color: '#64748b',
            callback: (val) => {
              if (metric === 'revenue') {
                return `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`;
              }
              return val;
            },
          },
        },
      },
    };
  }, [metric, timeline]);

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col justify-between">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/20 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">show_chart</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Chart.js Temporal Trajectory
            </span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">
            {metric === 'revenue' ? 'Sales Revenue Trend' : metric === 'sales' ? 'Units Sold Velocity' : 'Net Stock Mutation'}
          </h3>
        </div>

        {/* Metric Mode Switcher */}
        <div className="flex items-center bg-surface-container-low p-1 rounded-lg border border-outline-variant/20 self-start sm:self-auto">
          {[
            { key: 'revenue', label: 'Revenue ($)', icon: 'payments' },
            { key: 'sales', label: 'Units Sold', icon: 'shopping_bag' },
            { key: 'net', label: 'Net Delta', icon: 'swap_horiz' },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-label-sm font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                metric === m.key
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative mt-space-md h-60 w-full">
        {timeline.length > 0 ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="h-full flex items-center justify-center text-on-surface-variant font-body-sm">
            No temporal data available.
          </div>
        )}
      </div>

      {/* Footer Info Ribbon */}
      <div className="pt-space-sm mt-space-xs border-t border-outline-variant/20 flex items-center justify-between font-label-sm text-[11px] text-on-surface-variant flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: borderColor }} />
          <span className="font-semibold text-on-surface">{metricLabel}</span>
          <span className="text-outline">•</span>
          <span>{timeline.length} Daily Intervals</span>
        </div>
        <span className="font-mono text-primary font-bold">Chart.js Powered</span>
      </div>
    </div>
  );
}
