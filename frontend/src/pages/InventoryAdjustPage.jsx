import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adjustInventory,
  getInventory,
  getInventoryPage,
  getInventoryCategories,
  getInventoryProducts,
  getInventoryStores,
  getInventoryVariants,
  transferInventoryItem,
} from '../api/inventory';
import InventoryOverview from '../components/inventory/InventoryOverview';
import QuickAdjustmentPanel from '../components/inventory/QuickAdjustmentPanel';
import TransferPanel from '../components/inventory/TransferPanel';
import CreateStockPanel from '../components/inventory/CreateStockPanel';
import { useStore } from '../context';

const EMPTY_LIST = [];

function relationId(value) {
  if (value && typeof value === 'object') return value.id == null ? '' : String(value.id);
  return value == null ? '' : String(value);
}

function normalizeInventory(records, variants, products, categories, stores) {
  const variantById = new Map(variants.map((variant) => [String(variant.id), variant]));
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const categoryById = new Map(categories.map((category) => [String(category.id), category.name]));
  const storeById = new Map(stores.map((store) => [String(store.id), store]));
  return records.map((record) => {
    const variantId = relationId(record.variant);
    const variant = variantById.get(variantId);
    const productId = relationId(variant?.product);
    const product = productById.get(productId);
    const categoryId = relationId(product?.category);
    const storeId = relationId(record.store) || 'storage';
    const store = storeById.get(storeId);
    return {
      id: String(record.id),
      variantId,
      sku: record.variant_sku || variant?.sku || variantId,
      barcode: record.variant_barcode || variant?.barcode || '',
      name: record.product_name || variant?.product_name || product?.name || 'Unknown product',
      size: record.variant_size || variant?.size || '',
      color: record.variant_color || variant?.color || '',
      categoryId,
      categoryName: product?.category_name || categoryById.get(categoryId) || '',
      quantity: Number(record.quantity_on_hand || 0),
      storeId,
      storeName: record.store_name || store?.name || 'Central storage',
    };
  });
}

export default function InventoryAdjustPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { activeStore } = useStore();
  const [storeId, setStoreId] = useState(() => activeStore || 'all');
  const [categoryId, setCategoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [workflow, setWorkflow] = useState(() => (
    searchParams.get('variant') ? 'adjust' : 'create'
  ));
  const [notice, setNotice] = useState('');
  const [createStockStore, setCreateStockStore] = useState('storage');

  const storesQuery = useQuery({
    queryKey: ['inventory-stores'],
    queryFn: getInventoryStores,
    staleTime: 60_000,
  });
  const variantsQuery = useQuery({
    queryKey: ['inventory-variants'],
    queryFn: getInventoryVariants,
    staleTime: 60_000,
  });
  const productsQuery = useQuery({
    queryKey: ['inventory-products'],
    queryFn: getInventoryProducts,
    staleTime: 60_000,
  });
  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: getInventoryCategories,
    staleTime: 60_000,
  });
  const inventoryQuery = useQuery({
    queryKey: ['inventory-records', 'page', storeId, inventoryPage, categoryId, search, statusFilter, sortBy],
    queryFn: () => getInventoryPage(storeId, inventoryPage, {
      categoryId,
      search,
      statusFilter,
      sortBy,
    }),
    retry: 1,
  });
  const createStockInventoryQuery = useQuery({
    queryKey: ['inventory-records', 'create-stock', createStockStore],
    queryFn: () => getInventory(createStockStore),
    enabled: workflow === 'create',
    retry: 1,
  });

  const stores = storesQuery.data || EMPTY_LIST;
  const variants = variantsQuery.data || EMPTY_LIST;
  const products = productsQuery.data || EMPTY_LIST;
  const categories = categoriesQuery.data || EMPTY_LIST;
  const rawInventory = inventoryQuery.data?.results || EMPTY_LIST;
  const pagination = inventoryQuery.data || {
    current_page: 1,
    total_pages: 0,
    count: 0,
  };
  const inventory = useMemo(
    () => normalizeInventory(rawInventory, variants, products, categories, stores),
    [rawInventory, variants, products, categories, stores],
  );

  const [transferSource, setTransferSource] = useState('storage');
  const transferInventoryQuery = useQuery({
    queryKey: ['inventory-records', 'transfer-source', transferSource],
    queryFn: () => getInventory(transferSource),
    enabled: workflow === 'transfer',
    retry: 1,
  });

  const sourceRows = useMemo(
    () => normalizeInventory(
      transferInventoryQuery.data || EMPTY_LIST,
      variants,
      products,
      categories,
      stores,
    ),
    [transferInventoryQuery.data, variants, products, categories, stores],
  );
  const adjustedRowId = searchParams.get('variant') || '';
  const preselectedItem = inventory.find((row) => row.variantId === adjustedRowId) || null;
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inventory
      .filter((row) => {
        const searchable = `${row.sku} ${row.barcode} ${row.name} ${row.size} ${row.color} ${row.storeName}`.toLowerCase();
        if (query && !searchable.includes(query)) return false;
        if (categoryId !== 'all' && row.categoryId !== categoryId) return false;
        if (statusFilter === 'in-stock' && row.quantity <= 5) return false;
        if (statusFilter === 'low-stock' && (row.quantity <= 0 || row.quantity > 5)) return false;
        if (statusFilter === 'out-of-stock' && row.quantity > 0) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'quantity-desc') return b.quantity - a.quantity;
        if (sortBy === 'quantity-asc') return a.quantity - b.quantity;
        if (sortBy === 'status') {
          const rank = (quantity) => quantity <= 0 ? 0 : quantity <= 5 ? 1 : 2;
          return rank(a.quantity) - rank(b.quantity) || a.name.localeCompare(b.name);
        }
        return a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku);
      });
  }, [inventory, search, categoryId, statusFilter, sortBy]);

  const invalidateInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inventory-records'] }),
      queryClient.invalidateQueries({ queryKey: ['ledger'] }),
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] }),
    ]);
  };
  const adjustmentMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.type === 'subtract') {
        const latestInventory = normalizeInventory(
          await getInventory(payload.store),
          variants,
          products,
          categories,
          stores,
        );
        const latestRow = latestInventory.find((row) =>
          row.variantId === String(payload.variantId) && row.storeId === payload.store);
        const available = latestRow?.quantity || 0;
        if (payload.quantity > available) {
          throw new Error(`Stock changed before this adjustment. Only ${available} units remain.`);
        }
      }
      return adjustInventory(payload);
    },
    onSuccess: async (response) => {
      if (response?.inventory && selectedItem) {
        setSelectedItem((current) => current && ({
          ...current,
          quantity: Number(response.inventory.resulting_balance),
        }));
      }
      await invalidateInventory();
    },
    onError: invalidateInventory,
  });
  const createStockMutation = useMutation({
    mutationFn: adjustInventory,
    onSuccess: invalidateInventory,
    onError: invalidateInventory,
  });
  const transferMutation = useMutation({
    mutationFn: async ({ fromStore, toStore, lines, notes }) => {
      let completed = 0;
      const completedVariantIds = [];
      try {
        for (const line of lines) {
          await transferInventoryItem({
            variantId: line.variantId,
            fromStore,
            toStore,
            quantity: line.quantity,
            notes,
          });
          completed += 1;
          completedVariantIds.push(line.variantId);
        }
      } catch (error) {
        if (completed) {
          const partialError = new Error(
            `Transfer partially completed: ${completed} of ${lines.length} items moved. ${error.message}`,
          );
          partialError.completedVariantIds = completedVariantIds;
          throw partialError;
        }
        throw error;
      }
      return completed;
    },
    onSuccess: async (count) => {
      setNotice(`Transfer complete. ${count} item${count === 1 ? '' : 's'} moved.`);
      await invalidateInventory();
    },
    onError: async (error) => {
      setNotice(error.message);
      await invalidateInventory();
    },
  });

  async function submitTransfer(payload) {
    const latestInventory = normalizeInventory(
      await getInventory(payload.fromStore),
      variants,
      products,
      categories,
      stores,
    );
    console.log(latestInventory,payload)
    for (const line of payload.lines) {
      const current = latestInventory.find((row) =>
        row.variantId === line.id && row.storeId === payload.fromStore);
      if (!current || line.quantity > current.quantity) {
        const available = current?.quantity || 0;
        throw new Error(`${line.sku}: stock changed; only ${available} units are now available.`);
      }
    }
    return transferMutation.mutateAsync(payload);
  }

  const relatedError = [
    storesQuery.error,
    variantsQuery.error,
    productsQuery.error,
    categoriesQuery.error,
  ].find(Boolean);
  const isReferenceDataLoading = storesQuery.isLoading
    || variantsQuery.isLoading
    || productsQuery.isLoading
    || categoriesQuery.isLoading;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 pb-12">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-label-sm font-semibold uppercase tracking-wider text-secondary">Stock control</p>
          <h1 className="mt-1 font-headline-lg text-on-surface">Store inventory</h1>
          <p className="mt-1 max-w-2xl text-sm text-on-surface-variant">
            Review stock by location, add stock, move items between stores, or make an audited adjustment.
          </p>
        </div>
        <Link to="/ledger" className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg border border-outline-variant/50 px-4 text-sm font-semibold text-on-surface hover:bg-surface-container focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary sm:self-auto">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">receipt_long</span>
          View stock ledger
        </Link>
      </header>

      {relatedError && (
        <div role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">
          Supporting store/catalog data could not be loaded: {relatedError.message}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg bg-surface-container p-3 text-sm font-medium text-on-surface">
          {notice}
        </div>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Inventory actions">
        <button type="button" aria-pressed={workflow === 'create'} onClick={() => { setWorkflow('create'); setNotice(''); }} className={`h-10 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${workflow === 'create' ? 'bg-primary text-on-primary' : 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}>
          Create Stock
        </button>
        <button type="button" aria-pressed={workflow === 'transfer'} onClick={() => { setWorkflow('transfer'); setNotice(''); }} className={`h-10 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${workflow === 'transfer' ? 'bg-primary text-on-primary' : 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}>
          Transfer stock
        </button>
        <button type="button" aria-pressed={workflow === 'adjust'} onClick={() => { setWorkflow('adjust'); setNotice(''); }} className={`h-10 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary ${workflow === 'adjust' ? 'bg-primary text-on-primary' : 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:bg-surface-container'}`}>
          Quick adjustment
        </button>
      </div>

      {workflow === 'create' ? (
        <CreateStockPanel
          stores={stores}
          variants={variants}
          inventory={createStockInventoryQuery.data || EMPTY_LIST}
          storeId={createStockStore}
          onStoreChange={setCreateStockStore}
          isLoading={isReferenceDataLoading || createStockInventoryQuery.isLoading}
          error={variantsQuery.error?.message || createStockInventoryQuery.error?.message}
          busy={createStockMutation.isPending}
          busyVariantId={createStockMutation.variables?.variantId}
          onSubmit={(payload) => createStockMutation.mutateAsync(payload)}
        />
      ) : workflow === 'transfer' ? (
        <TransferPanel
          stores={stores}
          sourceInventory={sourceRows}
          variants={variants}
          sourceStore={transferSource}
          onSourceStoreChange={setTransferSource}
          isLoading={isReferenceDataLoading || transferInventoryQuery.isLoading}
          sourceError={transferInventoryQuery.error?.message}
          busy={transferMutation.isPending}
          onSubmit={submitTransfer}
        />
      ) : (
        <QuickAdjustmentPanel
          key={selectedItem?.id || preselectedItem?.id || 'no-selection'}
          stores={stores}
          selectedItem={selectedItem || preselectedItem}
          busy={adjustmentMutation.isPending}
          onSubmit={(payload) => adjustmentMutation.mutateAsync(payload)}
        />
      )}

      <InventoryOverview
        rows={visibleRows}
        stores={stores}
        categories={categories}
        storeId={storeId}
        categoryId={categoryId}
        search={search}
        sortBy={sortBy}
        statusFilter={statusFilter}
        isLoading={inventoryQuery.isLoading || isReferenceDataLoading}
        error={inventoryQuery.error?.message}
        onStoreChange={(value) => {
          setStoreId(value);
          setInventoryPage(1);
          setSelectedItem(null);
        }}
        pagination={pagination}
        onPageChange={setInventoryPage}
        onCategoryChange={(value) => {
          setCategoryId(value);
          setInventoryPage(1);
        }}
        onSearchChange={(value) => {
          setSearch(value);
          setInventoryPage(1);
        }}
        onSortChange={(value) => {
          setSortBy(value);
          setInventoryPage(1);
        }}
        onStatusChange={(value) => {
          setStatusFilter(value);
          setInventoryPage(1);
        }}
        onRefresh={() => {
          inventoryQuery.refetch();
          if (workflow === 'transfer') transferInventoryQuery.refetch();
          if (workflow === 'create') createStockInventoryQuery.refetch();
        }}
        onAdjust={(row) => {
          setSelectedItem(row);
          setWorkflow('adjust');
        }}
        selectedRowId={adjustedRowId}
      />
    </div>
  );
}
