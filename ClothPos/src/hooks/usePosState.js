import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { pos } from '../api/pos';
import { useSyncStatus } from './useSyncStatus';

export default function usePosState({ setError, setNotice }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState(null);
  const [sales, setSales] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const scanRef = useRef(null);

  const run = useCallback(async (command, args) => {
    try {
      return await pos(command, args);
    } catch (error) {
      setError(error?.message || String(error));
      throw error;
    }
  }, [setError]);

  const refresh = useCallback(async () => {
    const [nextSettings, nextCart, nextCatalog, nextSales] = await Promise.all([
      pos('get_settings'),
      pos('get_cart'),
      pos('search_catalog', { query: '' }),
      pos('list_sales'),
    ]);
    setSettings(nextSettings);
    setCart(nextCart);
    setCatalog(nextCatalog);
    setSales(nextSales);
  }, []);

  const handleServerEvents = useCallback(() => refresh(), [refresh]);
  const { syncStatus, refreshSyncStatus } = useSyncStatus(handleServerEvents);

  const syncNow = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await run('sync_now');
      await Promise.all([refresh(), refreshSyncStatus()]);
      if (result.errors?.length) setError(result.errors.join(' '));
      else setNotice(`Synced — pulled ${result.pulled}, pushed ${result.pushed}.`);
      return result;
    } finally {
      setBusy(false);
    }
  }, [refresh, refreshSyncStatus, run, setError, setNotice]);

  const saveSettings = useCallback(async (payload) => {
    setError('');
    const next = await run('save_settings', payload);
    setSettings(next);
    setNotice('Terminal settings saved.');
  }, [run, setError, setNotice]);

  const exportSyncStatus = useCallback(async () => {
    setError('');
    const document = await run('export_sync_status');
    setNotice('Signed store export is ready to save or transfer.');
    return document;
  }, [run, setError, setNotice]);

  const importServerEvents = useCallback(async (serverEventsJson) => {
    setError('');
    const result = await run('import_server_events', { serverEventsJson });
    await Promise.all([refresh(), refreshSyncStatus()]);
    setNotice(result);
    return result;
  }, [refresh, refreshSyncStatus, run, setError, setNotice]);

  const loginServer = useCallback(async ({ username, password }) => {
    setError('');
    const next = await run('login_server', { username, password });
    setSettings(next);
    setNotice(`Signed in to ClothStock as ${username}.`);
    return next;
  }, [run, setError, setNotice]);

  const logoutServer = useCallback(async () => {
    setError('');
    const next = await run('logout_server');
    setSettings(next);
    setNotice('Signed out. Checkout and local sync data remain available offline.');
    return next;
  }, [run, setError, setNotice]);

  const confirmCheckout = useCallback(async (payload) => {
    setBusy(true);
    setError('');
    try {
      const sale = await run('checkout', payload);
      setCompletedSale(sale);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, run, setError]);

  const startCheckout = useCallback(() => {
    setError('');
    setCompletedSale(null);
    setCheckoutOpen(true);
  }, [setError]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await pos('is_initialized');
        if (!status.initialized) {
          navigate('/onboarding', { replace: true });
          return;
        }
        await pos('seed_demo_catalog');
        await refresh();
      } catch (error) {
        if (active) setError(error?.message || 'Failed to start the POS database.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [navigate, refresh, setError]);

  useEffect(() => {
    if (location.pathname.endsWith('/checkout')) scanRef.current?.focus();
  }, [location.pathname]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((variant) =>
      [variant.sku, variant.barcode, variant.productName, variant.styleCode, variant.size, variant.color]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [catalog, query]);

  async function handleScan(event) {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    setError('');
    const match = await run('lookup_variant', { query: value }).catch(() => null);
    if (match) {
      const next = await run('cart_add', { variantId: match.id, quantity: 1 });
      setCart(next);
      setQuery('');
      setNotice(`Added ${match.sku}`);
      return;
    }
    const results = await run('search_catalog', { query: value });
    setCatalog(results);
    if (!results.length) setError(`No SKU or barcode matched “${value}”.`);
  }

  async function addVariant(variant) {
    setError('');
    setNotice('');
    const next = await run('cart_add', { variantId: variant.id, quantity: variant.quantity || 1 });
    setCart(next);
    setNotice(`Added ${variant.sku}`);
  }

  async function updateQty(variantId, quantity) {
    setError('');
    const next = await run('cart_update_qty', { variantId, quantity });
    setCart(next);
  }

  async function removeLine(variantId) {
    setCart(await run('cart_remove', { variantId }));
  }

  async function clearCart() {
    setCart(await run('cart_clear'));
  }

  async function handleSearchChange(value) {
    setQuery(value);
    if (value.trim().length === 0) {
      setCatalog(await pos('search_catalog', { query: '' }));
    }
  }

  const products = useMemo(() => {
    const byId = new Map();
    for (const variant of filtered) {
      if (!variant.productId) continue;
      if (!byId.has(variant.productId)) {
        byId.set(variant.productId, {
          id: variant.productId,
          name: variant.productName,
          styleCode: variant.styleCode,
          categoryName: variant.categoryName,
          variants: [],
        });
      }
      byId.get(variant.productId).variants.push(variant);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  return {
    settings,
    cart,
    sales,
    query,
    loading,
    busy,
    checkoutOpen,
    completedSale,
    scanRef,
    filtered,
    products,
    selectedProduct,
    selectedProductId,
    setSelectedProductId,
    syncStatus,
    setCheckoutOpen,
    setCompletedSale,
    onQuery: handleSearchChange,
    onScan: handleScan,
    onAdd: addVariant,
    onQty: updateQty,
    onRemove: removeLine,
    onClear: clearCart,
    onSaveSettings: saveSettings,
    onSync: syncNow,
    onExportSyncStatus: exportSyncStatus,
    onImportServerEvents: importServerEvents,
    onLoginServer: loginServer,
    onLogoutServer: logoutServer,
    onStartCheckout: startCheckout,
    onConfirmCheckout: confirmCheckout,
  };
}
