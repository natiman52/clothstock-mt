import apiClient from './client';

function getResults(data, endpoint) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  throw new Error(`Unexpected inventory response from ${endpoint}.`);
}

async function fetchAllPages(endpoint, headers = {}) {
  const results = [];
  let next = endpoint;
  let pages = 0;

  while (next && pages < 100) {
    const data = await apiClient.get(next, { headers });
    results.push(...getResults(data, next));
    next = Array.isArray(data) ? null : data.next;
    pages += 1;
  }

  if (next) {
    throw new Error(`Inventory request exceeded the 100-page safety limit: ${endpoint}`);
  }
  return results;
}

export function getInventory(storeId = 'all') {
  const scope = String(storeId || 'all');
  const headers = { 'X-Store-ID': scope };
  if (scope === 'storage') {
    return fetchAllPages('/api/inventory/storage/?limit=500', headers);
  }
  if (scope === 'all') {
    return fetchAllPages('/api/inventory/?limit=500', headers);
  }
  return fetchAllPages(
    `/api/inventory/?store=${encodeURIComponent(scope)}&limit=500`,
    headers,
  );
}

export function getInventoryPage(
  storeId = 'all',
  page = 1,
  { categoryId = 'all', search = '', statusFilter = 'all', sortBy = 'name' } = {},
) {
  const params = new URLSearchParams({ page: String(page), page_size: '5' });
  if (storeId !== 'all' && storeId !== 'storage') params.set('store', String(storeId));
  if (categoryId !== 'all') params.set('category', String(categoryId));
  if (search.trim()) params.set('search', search.trim());
  if (statusFilter !== 'all') params.set('stock_status', statusFilter);
  if (sortBy === 'quantity-desc') params.set('ordering', '-quantity_on_hand');
  else if (sortBy === 'quantity-asc') params.set('ordering', 'quantity_on_hand');
  else if (sortBy === 'name') params.set('ordering', 'variant__product__name,variant__sku');

  const headers = { 'X-Store-ID': String(storeId || 'all') };
  const endpoint = storeId === 'storage'
    ? `/api/inventory/storage/?${params}`
    : `/api/inventory/?${params}`;
  return apiClient.get(endpoint, { headers });
}

export function getInventoryStores() {
  return fetchAllPages('/api/stores/?limit=500', { 'X-Store-ID': 'all' });
}

export function getInventoryVariants() {
  return fetchAllPages('/api/variants/?limit=500', { 'X-Store-ID': 'all' });
}

export function getInventoryProducts() {
  return fetchAllPages('/api/products/?limit=500', { 'X-Store-ID': 'all' });
}

export function getInventoryCategories() {
  return fetchAllPages('/api/categories/?limit=500', { 'X-Store-ID': 'all' });
}

export function transferInventoryItem({ variantId, fromStore, toStore, quantity, notes }) {
  return apiClient.post('/api/inventory/transfer/', {
    variant_id: variantId,
    from_store: fromStore === 'storage' ? null : fromStore,
    to_store: toStore === 'storage' ? null : toStore,
    quantity: Number(quantity),
    notes: notes.trim(),
  });
}

export function adjustInventory({
  variantId,
  store,
  type,
  quantity,
  reason,
  notes,
}) {
  return apiClient.post('/api/inventory/adjust/', {
    variant_id: variantId,
    store: store === 'storage' ? null : store,
    type,
    quantity: Number(quantity),
    reason,
    notes: notes.trim(),
  });
}
