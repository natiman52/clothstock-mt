import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StoreContext } from './storeContextDef';
import apiClient from '../api/client';

const ACTIVE_STORE_STORAGE_KEY = 'clothstock_active_store';

export function StoreProvider({ children }) {
  // Store state initialized from localStorage, defaulting to 'all'
  const [activeStore, setActiveStoreState] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_STORE_STORAGE_KEY) || 'all';
    } catch {
      return 'all';
    }
  });

  const setActiveStore = (newStoreId) => {
    const val = String(newStoreId || 'all');
    setActiveStoreState(val);
    try {
      localStorage.setItem(ACTIVE_STORE_STORAGE_KEY, val);
    } catch {
      // storage quota or disabled
    }
  };

  // Fetch available store locations
  const { data: storesData, refetch: refetchStores, isLoading: isLoadingStores } = useQuery({
    queryKey: ['stores'],
    queryFn: () => apiClient.get('/api/stores/').catch(() => null),
    staleTime: 60 * 1000,
  });

  const storesList = useMemo(() => {
    if (!storesData) return [];
    return storesData.results || (Array.isArray(storesData) ? storesData : []);
  }, [storesData]);

  // Compute active store metadata
  const activeStoreObj = useMemo(() => {
    if (activeStore === 'all') {
      return {
        id: 'all',
        name: 'All Store Nodes',
        code: 'ALL',
        is_warehouse: false,
      };
    }
    const found = storesList.find(
      (s) => String(s.id) === String(activeStore) || s.code?.toLowerCase() === activeStore.toLowerCase()
    );
    if (found) return found;
    return {
      id: activeStore,
      name: `Store #${activeStore}`,
      code: `STORE-${activeStore}`,
      is_warehouse: false,
    };
  }, [activeStore, storesList]);

  const isStorageScope = activeStore === 'storage' || activeStore === 'warehouse';
  const isAllScope = activeStore === 'all';

  const value = {
    activeStore,
    setActiveStore,
    activeStoreObj,
    storesList,
    isLoadingStores,
    refetchStores,
    isStorageScope,
    isAllScope,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export default StoreProvider;
