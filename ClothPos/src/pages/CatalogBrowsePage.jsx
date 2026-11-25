import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isTauri, pos } from '../api/pos';

const PAGE_SIZE = 50;

const PAGE_CONFIG = {
  products: { title: 'Products', command: 'browse_products', icon: 'inventory_2' },
  variants: { title: 'Variants', command: 'browse_variants', icon: 'style' },
  categories: { title: 'Categories', command: 'browse_categories', icon: 'category' },
};

export default function CatalogBrowsePage({ kind }) {
  const config = PAGE_CONFIG[kind];
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (kind !== 'categories' || !isTauri()) return undefined;
    let active = true;
    let unlisten;
    listen('sync://server-events', () => {
      if (active) setRefreshVersion((version) => version + 1);
    })
      .then((stopListening) => {
        if (active) unlisten = stopListening;
        else stopListening();
      })
      .catch((listenerError) => {
        console.error('Could not subscribe to category refresh events:', listenerError);
      });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [kind]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    pos(config.command, {
      query,
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setRows(result);
        setHasNext(result.length === PAGE_SIZE);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError?.message || `Could not load cached ${config.title.toLowerCase()}.`);
        setRows([]);
        setHasNext(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [config.command, config.title, page, query, refreshVersion]);

  function changeQuery(value) {
    setQuery(value);
    setPage(1);
  }

  return (
    <section className="space-y-space-md">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-label-sm text-[10px] uppercase tracking-wider text-secondary">Offline catalog</p>
          <h1 className="mt-1 flex items-center gap-2 font-headline-lg">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">{config.icon}</span>
            {config.title}
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Browsing records cached on this terminal. Sync updates this catalog when online.
          </p>
        </div>
        <label className="flex w-full flex-col gap-1 text-xs font-semibold sm:max-w-xs">
          Search {config.title.toLowerCase()}
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={`Search ${config.title.toLowerCase()}...`}
            className="h-10 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 text-sm font-normal"
          />
        </label>
      </header>

      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container-lowest">
        {error && <p role="alert" className="m-4 rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-surface-container-low text-xs uppercase text-on-surface-variant">
              <tr>
                {kind === 'products' && <><th className="px-4 py-3">Product</th><th className="px-4 py-3">Style code</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Variants</th><th className="px-4 py-3 text-right">Stock</th></>}
                {kind === 'variants' && <><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Variant</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">On hand</th></>}
                {kind === 'categories' && <><th className="px-4 py-3">Category</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Products</th></>}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {loading && <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">Loading cached catalog…</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-container-low/60">
                  {kind === 'products' && <>
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3 font-mono">{row.styleCode || '—'}</td>
                    <td className="px-4 py-3">{row.categoryName || 'Uncategorized'}</td>
                    <td className="px-4 py-3 text-right">{row.variantCount}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.totalStock}</td>
                  </>}
                  {kind === 'variants' && <>
                    <td className="px-4 py-3 font-mono font-semibold">{row.sku}</td>
                    <td className="px-4 py-3">{row.productName}</td>
                    <td className="px-4 py-3">{row.size || '—'} / {row.color || '—'}</td>
                    <td className="px-4 py-3 text-right">{row.price}</td>
                    <td className="px-4 py-3 text-right font-mono">{row.quantityOnHand}</td>
                  </>}
                  {kind === 'categories' && <>
                    <td className="px-4 py-3 font-semibold">{row.name}</td>
                    <td className="px-4 py-3 font-mono">{row.code || '—'}</td>
                    <td className="px-4 py-3">{row.description || '—'}</td>
                    <td className="px-4 py-3 text-right">{row.productCount}</td>
                  </>}
                </tr>
              ))}
              {!loading && !error && rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-on-surface-variant">No cached {config.title.toLowerCase()} found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between border-t border-outline-variant/20 px-4 py-3">
          <span className="text-xs text-on-surface-variant">Page {page} · up to {PAGE_SIZE} records</span>
          <div className="flex gap-2">
            <button type="button" disabled={loading || page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm disabled:opacity-40">Previous</button>
            <button type="button" disabled={loading || !hasNext} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-outline-variant/50 px-3 py-1.5 text-sm disabled:opacity-40">Next</button>
          </div>
        </footer>
      </div>
    </section>
  );
}
