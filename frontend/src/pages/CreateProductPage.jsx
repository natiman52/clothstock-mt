import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';

export default function CreateProductPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form states
  const [productData, setProductData] = useState({
    name: '',
    style_code: '',
    category: '',
    description: '',
    is_active: true,
  });

  // Optional first variation
  const [addVariant, setAddVariant] = useState(true);
  const [variantData, setVariantData] = useState({
    size: 'M',
    color: 'Black',
    price: '95.00',
    cost: '35.00',
    sku: '',
    barcode: '',
  });

  // Fetch categories for dropdown
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.get('/api/categories/'),
  });

  const categories = categoriesData?.results || (Array.isArray(categoriesData) ? categoriesData : []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!productData.name.trim()) {
      setErrorMsg('Product name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create Product
      const payload = {
        name: productData.name.trim(),
        description: productData.description.trim(),
        is_active: productData.is_active,
      };

      if (productData.style_code.trim()) {
        payload.style_code = productData.style_code.trim().toUpperCase();
      }
      if (productData.category) {
        payload.category = productData.category;
      }

      const createdProduct = await apiClient.post('/api/products/', payload);
      const newProductId = createdProduct.id;

      // 2. Optionally create the initial SKU Variant
      if (addVariant && newProductId) {
        const vPayload = {
          product: newProductId,
          size: variantData.size.trim() || 'M',
          color: variantData.color.trim() || 'Black',
          price: parseFloat(variantData.price) || 0,
          cost: parseFloat(variantData.cost) || 0,
          is_active: true,
        };
        if (variantData.sku.trim()) {
          vPayload.sku = variantData.sku.trim().toUpperCase();
        }
        if (variantData.barcode.trim()) {
          vPayload.barcode = variantData.barcode.trim();
        }

        await apiClient.post('/api/variants/', vPayload);
      }

      await queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate(`/catalog/${newProductId}`);
    } catch (err) {
      const respData = err?.response?.data;
      if (respData) {
        const msgs = Object.entries(respData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ');
        setErrorMsg(msgs);
      } else {
        setErrorMsg('Failed to register product style. Please check input values.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-4xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
        <Link to="/catalog" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">inventory_2</span>Catalog
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-semibold">New Product Style</span>
      </nav>

      {/* Header */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-on-primary">
            <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
          </div>
          <div>
            <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface">
              Register Product Style
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Add a new style to the central merchandise catalog. Style code, SKU, and barcode are automatically generated if left blank.
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
          <h2 className="font-headline-sm text-body-lg text-on-surface font-semibold border-b border-outline-variant/20 pb-2">
            1. Style Specification
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
            <div className="sm:col-span-2">
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Product Style Name <span className="text-error">*</span>
              </label>
              <input
                type="text"
                required
                value={productData.name}
                onChange={(e) => setProductData({ ...productData, name: e.target.value })}
                placeholder="e.g. Overland Tech Trench Coat, Wool Blend Bomber"
                className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Style Code (Optional)
              </label>
              <input
                type="text"
                value={productData.style_code}
                onChange={(e) => setProductData({ ...productData, style_code: e.target.value.toUpperCase() })}
                placeholder="Auto-generated e.g. OTT-4892"
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono uppercase focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
              />
              <span className="font-label-sm text-[10px] text-outline font-mono mt-1 block">
                Leave empty for automatic 3-letter prefix + number assignment.
              </span>
            </div>

            <div>
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Category
              </label>
              <select
                value={productData.category}
                onChange={(e) => setProductData({ ...productData, category: e.target.value })}
                className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm cursor-pointer"
              >
                <option value="">-- Select Category (or Uncategorized) --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code || 'CODE'})
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={productData.description}
                onChange={(e) => setProductData({ ...productData, description: e.target.value })}
                placeholder="Fabric composition, fit characteristics, styling notes..."
                className="w-full p-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm resize-none"
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 bg-surface-container-low rounded-lg">
              <div>
                <span className="font-body-md font-semibold text-on-surface block text-[13px]">
                  Active in Catalog
                </span>
                <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
                  Make available across retail points of sale
                </span>
              </div>
              <input
                type="checkbox"
                checked={productData.is_active}
                onChange={(e) => setProductData({ ...productData, is_active: e.target.checked })}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Initial Variant Section */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg space-y-space-md">
          <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2">
            <div>
              <h2 className="font-headline-sm text-body-lg text-on-surface font-semibold">
                2. Initial Variant / SKU (Optional)
              </h2>
              <p className="font-label-sm text-[11px] text-on-surface-variant">
                Create the first color and size SKU alongside this style.
              </p>
            </div>
            <input
              type="checkbox"
              checked={addVariant}
              onChange={(e) => setAddVariant(e.target.checked)}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
          </div>

          {addVariant && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-space-md">
              <div>
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                  Size
                </label>
                <input
                  type="text"
                  value={variantData.size}
                  onChange={(e) => setVariantData({ ...variantData, size: e.target.value })}
                  placeholder="e.g. S, M, L, 32"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                  Color
                </label>
                <input
                  type="text"
                  value={variantData.color}
                  onChange={(e) => setVariantData({ ...variantData, color: e.target.value })}
                  placeholder="e.g. Black, Olive, Navy"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                />
              </div>

              <div>
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                  Retail Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={variantData.price}
                  onChange={(e) => setVariantData({ ...variantData, price: e.target.value })}
                  placeholder="95.00"
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
                  value={variantData.cost}
                  onChange={(e) => setVariantData({ ...variantData, cost: e.target.value })}
                  placeholder="35.00"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                  SKU Code (Optional)
                </label>
                <input
                  type="text"
                  value={variantData.sku}
                  onChange={(e) => setVariantData({ ...variantData, sku: e.target.value.toUpperCase() })}
                  placeholder="Auto-generated e.g. OTT-BLK-M"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono uppercase focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={variantData.barcode}
                  onChange={(e) => setVariantData({ ...variantData, barcode: e.target.value })}
                  placeholder="Auto-generated 13-digit EAN-13"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                />
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to="/catalog"
            className="h-11 px-6 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md font-semibold rounded-lg transition-colors flex items-center"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 px-8 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">check</span>
            <span>{isSubmitting ? 'Registering Style…' : 'Create Product'}</span>
          </button>
        </div>
      </form>
    </main>
  );
}
