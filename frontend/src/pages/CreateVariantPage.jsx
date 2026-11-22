import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function CreateVariantPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const defaultProductId = searchParams.get('product') || '';

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    product: defaultProductId,
    size: 'M',
    color: 'Black',
    price: '89.00',
    cost: '32.00',
    sku: '',
    barcode: '',
    is_active: true,
  });

  // Fetch products for dropdown
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.get('/api/products/?limit=100'),
  });

  const products = productsData?.results || (Array.isArray(productsData) ? productsData : []);

  const selectedProduct = products.find((p) => String(p.id) === String(formData.product));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.product) {
      setErrorMsg('Please select a parent Product style.');
      return;
    }
    if (!formData.size.trim() || !formData.color.trim()) {
      setErrorMsg('Size and Color are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        product: formData.product,
        size: formData.size.trim(),
        color: formData.color.trim(),
        price: parseFloat(formData.price) || 0,
        cost: parseFloat(formData.cost) || 0,
        is_active: formData.is_active,
      };

      if (formData.sku.trim()) {
        payload.sku = formData.sku.trim().toUpperCase();
      }
      if (formData.barcode.trim()) {
        payload.barcode = formData.barcode.trim();
      }

      const createdVariant = await apiClient.post('/api/variants/', payload);
      await queryClient.invalidateQueries({ queryKey: ['variants'] });
      await queryClient.invalidateQueries({ queryKey: ['product', formData.product] });

      navigate(`/variants/${createdVariant.id}`);
    } catch (err) {
      const respData = err?.response?.data;
      if (respData) {
        const msgs = Object.entries(respData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        setErrorMsg(msgs);
      } else {
        setErrorMsg('Failed to create variant. Check unique SKU/barcode.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-3xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant flex-wrap">
        <Link to="/catalog" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">inventory_2</span>Catalog
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        {formData.product && selectedProduct && (
          <>
            <Link to={`/catalog/${formData.product}`} className="hover:text-primary transition-colors truncate max-w-[150px]">
              {selectedProduct.name}
            </Link>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </>
        )}
        <span className="text-on-surface font-semibold">New SKU Variation</span>
      </nav>

      {/* Header */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-secondary flex items-center justify-center text-on-secondary">
            <span className="material-symbols-outlined text-[18px]">style</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">
              Create SKU Variation
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Add a size, color, and price variation under an existing product style. SKU and GS1 barcode are generated automatically if omitted.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-space-md">
        {errorMsg && (
          <div className="bg-error-container text-on-error-container rounded-lg p-3 font-body-sm text-body-sm flex items-start gap-2">
            <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg space-y-space-md">
          {/* Product selector */}
          <div>
            <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
              Parent Product Style <span className="text-error">*</span>
            </label>
            <select
              required
              value={formData.product}
              onChange={(e) => setFormData({ ...formData, product: e.target.value })}
              className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm cursor-pointer"
            >
              <option value="">-- Choose Product Style --</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} [{p.style_code}]
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Size <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.size}
                onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                placeholder="e.g. XS, S, M, L, XL, 32, 10.5"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Color <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="e.g. Black, Heather Grey, Olive Green"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Retail Price ($) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="89.00"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono font-semibold text-[#047857] focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Unit Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                placeholder="32.00"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                SKU (Optional)
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                placeholder="Auto-generated e.g. OTT-BLK-M"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono uppercase focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
              <span className="font-label-sm text-[10px] text-outline font-mono mt-1 block">
                Leave empty for standard style-color-size format.
              </span>
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Barcode (Optional)
              </label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="Auto-generated 13-digit EAN-13"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
              <span className="font-label-sm text-[10px] text-outline font-mono mt-1 block">
                Standard retail EAN-13 generated if empty.
              </span>
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
              <div>
                <span className="font-body-md font-semibold text-on-surface block text-[13px]">
                  Active Variation
                </span>
                <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                  Available for store inventory allocation and point of sale lookups
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="h-11 px-6 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 px-8 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>{isSubmitting ? 'Creating SKU…' : 'Create Variation'}</span>
          </button>
        </div>
      </form>
    </main>
  );
}
