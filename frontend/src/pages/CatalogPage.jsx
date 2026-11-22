import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/client';

const SAMPLE_PRODUCTS = [
  { id: 's1', name: 'Overland Tech Trench Coat', style_code: 'OTT-2026-X', category: 'OUTERWEAR', skuCount: 4, price: '$189.00', skus: 'OTT-BLK-M • OTT-BLK-L', stockStatus: 'In Stock', stockClass: 'text-[#047857]' },
  { id: 's2', name: 'Aeroknit Performance Runner', style_code: 'APR-8800',   category: 'FOOTWEAR',   skuCount: 6, price: '$124.00', skus: 'Sizes: 8, 9, 10, 11, 12', stockStatus: 'Fast Mover', stockClass: 'text-secondary font-semibold' },
  { id: 's3', name: 'Summer Linen Camp Shirt',   style_code: 'SLS-410',     category: 'TOPS',       skuCount: 8, price: '$58.00',  skus: 'Natural, Indigo, Olive', stockStatus: 'In Stock', stockClass: 'text-[#047857]' },
];

export default function CatalogPage() {
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.get('/api/products/').catch(() => null),
  });

  const productsCount = productsData?.count || (Array.isArray(productsData) ? productsData.length : 1420);
  const apiProducts   = productsData?.results || (Array.isArray(productsData) ? productsData : []);

  // Merge live API products + sample placeholders
  const displayProducts = apiProducts.length > 0
    ? apiProducts.map((p) => ({
        id: p.id,
        name: p.name,
        style_code: p.style_code,
        category: (p.category || 'UNCATEGORIZED').toUpperCase(),
        skuCount: p.variants?.length ?? 0,
        price: p.variants?.[0]?.price ? `$${p.variants[0].price}` : '—',
        skus: p.variants?.map((v) => v.sku).slice(0, 2).join(' • ') || '—',
        stockStatus: 'In Stock',
        stockClass: 'text-[#047857]',
      }))
    : SAMPLE_PRODUCTS;

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header */}
      <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm">
        <div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">Styles &amp; SKU Catalog</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Central UUID catalog shared across cloud and offline store terminals.
          </p>
        </div>
        <span className="font-label-sm text-label-sm bg-surface-container px-2.5 py-1 rounded-full font-mono font-semibold">
          {productsCount} Active Styles
        </span>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-sm">
        {displayProducts.map((product) => (
          <div
            key={product.id}
            className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <span className="font-headline-sm text-body-lg text-on-surface font-semibold leading-snug">
                  {product.name}
                </span>
                <span className="font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                  {product.category}
                </span>
              </div>
              <span className="font-label-sm text-[10px] text-outline font-mono mt-0.5 block">
                Style Code: {product.style_code}
              </span>
              <div className="mt-space-sm space-y-1 font-body-sm text-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <span>{product.skuCount} Active SKUs</span>
                  <span className="font-mono text-on-surface font-semibold">{product.price}</span>
                </div>
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="truncate max-w-[60%]">{product.skus}</span>
                  <span className={product.stockClass}>{product.stockStatus}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {displayProducts.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant font-body-md">
          <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">inventory_2</span>
          No products found. Add styles via the Admin or import a bundle.
        </div>
      )}
    </main>
  );
}
