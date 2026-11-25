import { useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { isTauri, pos } from '../api/pos';

export function useSyncStatus(onServerEvents) {
  const [syncStatus, setSyncStatus] = useState(null);

  const refreshSyncStatus = useCallback(async () => {
    const status = await pos('get_sync_status');
    setSyncStatus(status);
    return status;
  }, []);

  useEffect(() => {
    let active = true;
    const unlisteners = [];

    refreshSyncStatus().catch((error) => {
      console.error('Could not load sync status:', error);
    });

    if (!isTauri()) {
      return () => {
        active = false;
      };
    }

    Promise.all([
      listen('sync://status-changed', (event) => {
        if (active) {
          setSyncStatus((current) => ({ ...current, ...event.payload }));
          refreshSyncStatus().catch((error) => {
            console.error('Could not refresh sync status:', error);
          });
        }
      }),
      listen('sync://server-events', async (event) => {
        if (!active) return;
        try {
          await refreshSyncStatus();
          await onServerEvents?.(event.payload);
        } catch (error) {
          console.error('Could not refresh POS data after server events:', error);
        }
      }),
    ])
      .then((listeners) => {
        if (active) unlisteners.push(...listeners);
        else listeners.forEach((unlisten) => unlisten());
      })
      .catch((error) => {
        console.error('Could not subscribe to sync events:', error);
      });

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [onServerEvents, refreshSyncStatus]);

  return { syncStatus, refreshSyncStatus };
}
