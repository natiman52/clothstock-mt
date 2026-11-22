import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function TopProductsChart({ topProducts = [] }) {
  const labels = useMemo(() => {
    return topProducts.map((p) => (p.sku ? `${p.sku}` : p.product_name));
  }, [topProducts]);

  const revenues = useMemo(() => {
    return topProducts.map((p) => p.revenue || 0);
  }, [topProducts]);

  const chartData = useMemo(() => {
    return {
      labels,
      datasets: [
        {
          label: 'Revenue ($)',
          data: revenues,
          backgroundColor: 'rgba(79, 70, 229, 0.85)', // primary indigo
          hoverBackgroundColor: 'rgba(79, 70, 229, 1)',
          borderRadius: 6,
          borderSkipped: false,
          barPercentage: 0.65,
        },
      ],
    };
  }, [labels, revenues]);

  const options = useMemo(() => {
    return {
      indexAxis: 'y', // Horizontal bar chart
      responsive: true,
      maintainAspectRatio: false,
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
            title: (items) => {
              const idx = items[0]?.dataIndex;
              const prod = topProducts[idx];
              return prod ? `${prod.product_name} (${prod.sku})` : '';
            },
            label: (context) => {
              const idx = context.dataIndex;
              const prod = topProducts[idx];
              const rev = context.parsed.x;
              const u = prod ? prod.units_sold : 0;
              return `Revenue: $${rev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Sold: ${u} pcs`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(148, 163, 184, 0.15)',
            borderDash: [3, 3],
          },
          ticks: {
            font: { family: 'monospace', size: 10 },
            color: '#64748b',
            callback: (val) => `$${val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}`,
          },
        },
        y: {
          grid: {
            display: false,
          },
          ticks: {
            font: { family: 'monospace', size: 11, weight: '600' },
            color: '#1e293b',
          },
        },
      },
    };
  }, [topProducts]);

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">bar_chart</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              Chart.js Horizontal Velocity
            </span>
          </div>
          <h3 className="font-headline-sm text-headline-sm text-on-surface mt-0.5">
            Top Performing Styles
          </h3>
        </div>
        <span className="font-label-sm text-[10px] font-mono bg-surface-container px-2 py-0.5 rounded text-outline font-bold">
          HORIZONTAL BAR
        </span>
      </div>

      {/* Chart Canvas Area */}
      <div className="my-space-md h-52 w-full relative">
        {topProducts.length > 0 ? (
          <Bar data={chartData} options={options} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-on-surface-variant font-body-sm">
            <span className="material-symbols-outlined text-[36px] opacity-40 mb-1">leaderboard</span>
            <span>No sales records available for bar chart.</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-space-sm border-t border-outline-variant/20 flex items-center justify-between text-on-surface-variant font-label-sm text-[11px]">
        <span>Aggregated from immutable ledger sales</span>
        <Link to="/catalog" className="text-primary hover:underline font-semibold flex items-center gap-1">
          <span>Catalog</span>
          <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
