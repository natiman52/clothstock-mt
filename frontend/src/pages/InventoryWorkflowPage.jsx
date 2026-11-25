import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import {
  getInventory,
  getInventoryCategories,
  getInventoryProducts,
  getInventoryStores,
  getInventoryVariants,
} from '../api/inventory';
import { useStore } from '../context';

const EMPTY_LIST = [];

function relationId(value) {
  if (value && typeof value === 'object') return String(value.id ?? '');
  return value == null ? '' : String(value);
}

function errorText(error) {
  const data = error?.data;
  if (!data || typeof data !== 'object') return error?.message || 'The request could not be completed.';
  return Object.entries(data).map(([field, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return `${field}: ${value.detail || JSON.stringify(value)}`;
    }
    return `${field}: ${Array.isArray(value) ? value.join(', ') : value}`;
  }).join(' · ');
}

function StepHeading({ number, title, active }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${active ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
        {number}
      </span>
      <h2 className="font-headline-md text-on-surface">{title}</h2>
    </div>
  );
}

export default function InventoryWorkflowPage() {
  const queryClient = useQueryClient();
  const { activeStore } = useStore();
  const [step, setStep] = useState(1);
  const [productMode, setProductMode] = useState('select');
  const [productId, setProductId] = useState('');
  const [productForm, setProductForm] = useState({ name: '', style_code: '', category: '', description: '' });
  const [variantMode, setVariantMode] = useState('select');
  const [variantId, setVariantId] = useState('');
  const [variantForm, setVariantForm] = useState({ size: 'M', color: '', price: '', cost: '0' });
  const [storeId, setStoreId] = useState(() => (
    activeStore && activeStore !== 'all' ? activeStore : 'storage'
  ));
  const [inventoryAction, setInventoryAction] = useState('create');
  const [inventoryId, setInventoryId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const productsQuery = useQuery({ queryKey: ['inventory-products'], queryFn: getInventoryProducts });
  const variantsQuery = useQuery({ queryKey: ['inventory-variants'], queryFn: getInventoryVariants });
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: getInventoryCategories });
  const storesQuery = useQuery({ queryKey: ['inventory-stores'], queryFn: getInventoryStores });
  const stockQuery = useQuery({
    queryKey: ['inventory-records', 'workflow', storeId],
    queryFn: () => getInventory(storeId),
    enabled: step === 3 && Boolean(storeId),
  });

  const products = productsQuery.data || EMPTY_LIST;
  const variants = variantsQuery.data || EMPTY_LIST;
  const categories = categoriesQuery.data || EMPTY_LIST;
  const stores = storesQuery.data || EMPTY_LIST;
  const referenceError = [
    productsQuery.error,
    variantsQuery.error,
    categoriesQuery.error,
    storesQuery.error,
  ].find(Boolean);
  const productVariants = useMemo(
    () => variants.filter((variant) => relationId(variant.product) === productId),
    [variants, productId],
  );
  const inventoryForVariant = useMemo(
    () => (stockQuery.data || EMPTY_LIST).filter((record) => (
      relationId(record.variant) === variantId
      && (storeId === 'storage' ? !record.store : relationId(record.store) === storeId)
    )),
    [stockQuery.data, storeId, variantId],
  );

  const createProductMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/products/', payload),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      setProductId(String(product.id));
      setStep(2);
      setError('');
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });
  const createVariantMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/variants/', payload),
    onSuccess: async (variant) => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-variants'] });
      setVariantId(String(variant.id));
      setStep(3);
      setError('');
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });
  const saveStockMutation = useMutation({
    mutationFn: (payload) => apiClient.post('/api/inventory/workflow/', payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-records'] });
      setNotice(inventoryAction === 'create' ? 'Stock record created.' : 'Stock record updated.');
      setError('');
    },
    onError: (mutationError) => setError(errorText(mutationError)),
  });

  function continueProduct(event) {
    event.preventDefault();
    setError('');
    if (productMode === 'select') {
      if (!productId) {
        setError('Select a product before continuing.');
        return;
      }
      setStep(2);
      return;
    }
    if (!productForm.name.trim()) {
      setError('Product name is required.');
      return;
    }
    const payload = {
      name: productForm.name.trim(),
      description: productForm.description.trim(),
    };
    if (productForm.style_code.trim()) payload.style_code = productForm.style_code.trim();
    if (productForm.category) payload.category = productForm.category;
    createProductMutation.mutate(payload);
  }

  function continueVariant(event) {
    event.preventDefault();
    setError('');
    if (!productId) {
      setError('Choose a product first.');
      setStep(1);
      return;
    }
    if (variantMode === 'select') {
      if (!productVariants.some((variant) => String(variant.id) === variantId)) {
        setError('Select a variant belonging to the chosen product.');
        return;
      }
      setStep(3);
      return;
    }
    if (!variantForm.size.trim() || !variantForm.color.trim() || variantForm.price === '') {
      setError('Variant size, color, and price are required.');
      return;
    }
    createVariantMutation.mutate({
      product: productId,
      size: variantForm.size.trim(),
      color: variantForm.color.trim(),
      price: Number(variantForm.price),
      cost: Number(variantForm.cost || 0),
    });
  }

  function saveStock(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!productId || !variantId || quantity.trim() === '' || !Number.isInteger(Number(quantity))) {
      setError('Choose a product and variant, then enter a whole-number stock quantity.');
      return;
    }
    if (inventoryAction === 'update' && !inventoryId) {
      setError('Select the existing stock record to update.');
      return;
    }
    saveStockMutation.mutate({
      product_id: productId,
      variant_id: variantId,
      store_id: storeId === 'storage' ? null : storeId,
      action: inventoryAction,
      ...(inventoryAction === 'update' ? { inventory_id: inventoryId } : {}),
      quantity_on_hand: Number(quantity),
      notes: notes.trim(),
    });
  }

  const selectedProduct = products.find((product) => String(product.id) === productId);
  const selectedVariant = productVariants.find((variant) => String(variant.id) === variantId);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 pb-12">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-label-sm font-semibold uppercase tracking-wider text-secondary">Guided setup</p>
          <h1 className="mt-1 font-headline-lg text-on-surface">Product to stock</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Select or create each related record in one guided flow.
          </p>
        </div>
        <Link to="/inventory" className="text-sm font-semibold text-primary hover:underline">Back to inventory</Link>
      </header>

      {error && <div role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</div>}
      {referenceError && (
        <div role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">
          Could not load product, variant, category, or location options: {referenceError.message}
        </div>
      )}
      {notice && <div role="status" className="rounded-lg bg-[#ecfdf5] p-3 text-sm text-[#047857]">{notice}</div>}

      <section className="space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md sm:p-space-lg">
        <StepHeading number="1" title="Product" active={step === 1} />
        <form onSubmit={continueProduct} className="space-y-4">
          <ModeSelector mode={productMode} onChange={(value) => { setProductMode(value); setError(''); }} />
          {productMode === 'select' ? (
            <label className="block space-y-1 text-sm font-semibold">
              Existing product
              <select value={productId} onChange={(event) => {
                setProductId(event.target.value);
                setVariantId('');
                setInventoryAction('create');
                setInventoryId('');
              }} className={inputClass} required>
                <option value="">Choose a product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.style_code}</option>)}
              </select>
            </label>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Product name" value={productForm.name} onChange={(name) => setProductForm({ ...productForm, name })} required />
              <TextField label="Style code (optional)" value={productForm.style_code} onChange={(style_code) => setProductForm({ ...productForm, style_code })} />
              <label className="block space-y-1 text-sm font-semibold">
                Category
                <select value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} className={inputClass}>
                  <option value="">Uncategorized</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </label>
              <TextField label="Description" value={productForm.description} onChange={(description) => setProductForm({ ...productForm, description })} />
            </div>
          )}
          <button type="submit" disabled={createProductMutation.isPending || productsQuery.isLoading} className={primaryButton}>
            {productMode === 'create' && createProductMutation.isPending ? 'Creating…' : 'Continue to variant'}
          </button>
        </form>
      </section>

      <section className={`space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md sm:p-space-lg ${step < 2 ? 'opacity-60' : ''}`}>
        <StepHeading number="2" title="Variant" active={step === 2} />
        {step >= 2 && (
          <form onSubmit={continueVariant} className="space-y-4">
            <p className="text-sm text-on-surface-variant">Product: <strong>{selectedProduct?.name || 'Newly selected product'}</strong></p>
            <ModeSelector mode={variantMode} onChange={(value) => { setVariantMode(value); setVariantId(''); setError(''); }} />
            {variantMode === 'select' ? (
              <label className="block space-y-1 text-sm font-semibold">
                Existing variant
                <select value={variantId} onChange={(event) => {
                  setVariantId(event.target.value);
                  setInventoryAction('create');
                  setInventoryId('');
                }} className={inputClass} required>
                  <option value="">Choose a variant</option>
                  {productVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.sku} · {variant.size} / {variant.color}</option>)}
                </select>
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Size" value={variantForm.size} onChange={(size) => setVariantForm({ ...variantForm, size })} required />
                <TextField label="Color" value={variantForm.color} onChange={(color) => setVariantForm({ ...variantForm, color })} required />
                <TextField label="Price" type="number" min="0" step="0.01" value={variantForm.price} onChange={(price) => setVariantForm({ ...variantForm, price })} required />
                <TextField label="Cost" type="number" min="0" step="0.01" value={variantForm.cost} onChange={(cost) => setVariantForm({ ...variantForm, cost })} />
              </div>
            )}
            <button type="submit" disabled={!productId || createVariantMutation.isPending || variantsQuery.isLoading} className={primaryButton}>
              {variantMode === 'create' && createVariantMutation.isPending ? 'Creating…' : 'Continue to stock'}
            </button>
          </form>
        )}
      </section>

      <section className={`space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-md sm:p-space-lg ${step < 3 ? 'opacity-60' : ''}`}>
        <StepHeading number="3" title="Inventory stock" active={step === 3} />
        {step >= 3 && (
          <form onSubmit={saveStock} className="space-y-4">
            <p className="text-sm text-on-surface-variant">
              Variant: <strong>{selectedVariant?.sku || 'Selected variant'}</strong>
            </p>
            <label className="block space-y-1 text-sm font-semibold">
              Location
              <select value={storeId} onChange={(event) => {
                setStoreId(event.target.value);
                setInventoryId('');
                setInventoryAction('create');
              }} className={inputClass}>
                <option value="storage">Central storage</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.code}</option>)}
              </select>
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="inventory-action" checked={inventoryAction === 'create'} disabled={inventoryForVariant.length > 0} onChange={() => { setInventoryAction('create'); setInventoryId(''); }} />
                Create stock record
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="inventory-action" checked={inventoryAction === 'update'} disabled={!inventoryForVariant.length} onChange={() => setInventoryAction('update')} />
                Select existing stock record to edit
              </label>
            </div>
            {stockQuery.isLoading && <p role="status" className="text-sm text-on-surface-variant">Loading stock records…</p>}
            {inventoryForVariant.length > 0 && (
              <label className="block space-y-1 text-sm font-semibold">
                Existing stock record
                <select
                  disabled={inventoryAction !== 'update'}
                  value={inventoryId}
                  onChange={(event) => {
                    setInventoryId(event.target.value);
                    const record = inventoryForVariant.find((item) => String(item.id) === event.target.value);
                    if (record) setQuantity(String(record.quantity_on_hand));
                  }}
                  className={inputClass}
                >
                  <option value="">Choose a stock record</option>
                  {inventoryForVariant.map((record) => <option key={record.id} value={record.id}>Record #{record.id} · {record.quantity_on_hand} units</option>)}
                </select>
              </label>
            )}
            {!stockQuery.isLoading && inventoryForVariant.length > 0 && inventoryAction === 'create' && (
              <p className="text-sm text-on-surface-variant">A record already exists for this variant and location. Select it to edit; duplicate stock records are not allowed.</p>
            )}
            {stockQuery.error && <p role="alert" className="text-sm text-error">{stockQuery.error.message}</p>}
            <TextField label="Quantity on hand" type="number" step="1" value={quantity} onChange={setQuantity} required />
            <TextField label="Adjustment note (optional)" value={notes} onChange={setNotes} />
            <button type="submit" disabled={saveStockMutation.isPending || stockQuery.isLoading || !variantId} className={primaryButton}>
              {saveStockMutation.isPending ? 'Saving…' : inventoryAction === 'create' ? 'Create stock record' : 'Update stock record'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

const inputClass = 'h-10 w-full rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-3 font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary';
const primaryButton = 'h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-50';

function ModeSelector({ mode, onChange }) {
  return (
    <div className="flex gap-4 text-sm">
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'select'} onChange={() => onChange('select')} />Choose existing</label>
      <label className="flex items-center gap-2"><input type="radio" checked={mode === 'create'} onChange={() => onChange('create')} />Create new</label>
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', ...props }) {
  return (
    <label className="block space-y-1 text-sm font-semibold">
      {label}
      <input {...props} type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}
