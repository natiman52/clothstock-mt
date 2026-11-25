import { useState } from 'react';
import { isTauri } from '../api/pos';

function downloadJson(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function SettingsView({
  settings,
  syncStatus,
  onSave,
  onSync,
  onExportSyncStatus,
  onImportServerEvents,
  onLoginServer,
  onLogoutServer,
  busy,
}) {
  const [fileBusy, setFileBusy] = useState(false);
  const [credentials, setCredentials] = useState({
    username: settings?.username || '',
    password: '',
  });
  const [form, setForm] = useState({
    apiUrl: settings?.apiUrl || 'http://localhost:8001',
    storeId: settings?.storeId || '',
    storeCode: settings?.storeCode || '',
    storeName: settings?.storeName || '',
    cashierName: settings?.cashierName || '',
    username: settings?.username || '',
  });

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function exportStoreStatus() {
    setFileBusy(true);
    try {
      const document = await onExportSyncStatus();
      downloadJson(document, `clothstock-store-export-${document.store_id}.json`);
    } catch {
      // The shared POS state hook displays command failures in the app banner.
    } finally {
      setFileBusy(false);
    }
  }

  async function importServerEvents(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setFileBusy(true);
    try {
      await onImportServerEvents(await file.text());
    } catch {
      // The shared POS state hook displays command failures in the app banner.
    } finally {
      setFileBusy(false);
    }
  }

  async function login() {
    setFileBusy(true);
    try {
      await onLoginServer(credentials);
      setCredentials((current) => ({ ...current, password: '' }));
    } catch {
      // The shared POS state hook displays command failures in the app banner.
    } finally {
      setFileBusy(false);
    }
  }

  async function logout() {
    try {
      await onLogoutServer();
    } catch {
      // The shared POS state hook displays command failures in the app banner.
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md">
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-space-lg space-y-3">
        <h2 className="font-headline-sm">Terminal profile</h2>
        <p className="font-body-sm text-on-surface-variant">
          Enrolled at first launch. The local POS password is stored only as an Argon2 hash. Cloud sign-in is managed below.
        </p>
        {[
          ['apiUrl', 'ClothStock API URL'],
          ['storeId', 'Store ID (numeric FK)'],
          ['storeCode', 'Store code'],
          ['storeName', 'Store name'],
          ['cashierName', 'Cashier name'],
          ['username', 'Staff username'],
        ].map(([key, label]) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="font-label-sm text-outline uppercase">{label}</span>
            <input
              value={form[key]}
              onChange={(e) => setField(key, e.target.value)}
              className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={() => onSave(form)}
          className="h-10 px-4 rounded-lg bg-primary text-on-primary font-headline-sm"
        >
          Save settings
        </button>
      </section>
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-space-lg space-y-3">
        <h2 className="font-headline-sm">Background synchronization</h2>
        <p className="font-body-sm text-on-surface-variant">
          Local checkout changes remain queued in SQLite while offline. ClothPos pushes signed events, pulls
          store-scoped server events, and records the applied cursor automatically.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={onSync}
          className="h-10 px-4 rounded-lg bg-primary text-on-primary font-headline-sm disabled:opacity-50"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <div className="font-label-md text-on-surface-variant space-y-1 pt-2 border-t border-outline-variant/20">
          <p>Initialized: {settings?.initialized ? 'yes' : 'no'}</p>
          <p>Auth token on disk: {settings?.hasToken ? 'yes' : 'no'}</p>
          <p>Pending business events: {syncStatus?.pendingEvents ?? 0}</p>
          {syncStatus?.lastSyncedAt && <p>Last sync: {syncStatus.lastSyncedAt}</p>}
          {syncStatus?.syncing && <p>Sync in progress</p>}
          {syncStatus?.lastError && <p className="text-error">{syncStatus.lastError}</p>}
        </div>
        <div className="space-y-2 border-t border-outline-variant/20 pt-3">
          <h3 className="font-headline-sm">Cloud account</h3>
          {settings?.hasToken ? (
            <button
              type="button"
              onClick={logout}
              disabled={fileBusy || busy}
              className="min-h-10 rounded-lg border border-outline-variant px-3 font-label-md hover:bg-surface-container-low disabled:opacity-50"
            >
              Sign out of ClothStock
            </button>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-outline uppercase">Username</span>
                <input
                  value={credentials.username}
                  onChange={(event) => setCredentials((current) => ({
                    ...current,
                    username: event.target.value,
                  }))}
                  className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-label-sm text-outline uppercase">Password</span>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(event) => setCredentials((current) => ({
                    ...current,
                    password: event.target.value,
                  }))}
                  className="h-10 px-3 rounded-lg bg-surface-container-low focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={login}
                disabled={fileBusy || !credentials.username || !credentials.password}
                className="min-h-10 rounded-lg bg-primary px-3 font-label-md text-on-primary disabled:opacity-50"
              >
                Sign in to ClothStock
              </button>
            </>
          )}
        </div>
        <div className="space-y-2 border-t border-outline-variant/20 pt-3">
          <h3 className="font-headline-sm">Manual offline transfer</h3>
          <p className="font-body-sm text-on-surface-variant">
            Export local business events for processing on the server. Server event files can be imported directly without a confirmation round-trip.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportStoreStatus}
              disabled={!isTauri() || fileBusy}
              className="min-h-10 rounded-lg border border-outline-variant px-3 font-label-md hover:bg-surface-container-low disabled:opacity-50"
            >
              Export store JSON
            </button>
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-outline-variant px-3 font-label-md hover:bg-surface-container-low has-[:disabled]:opacity-50">
              Import server events JSON
              <input
                type="file"
                accept="application/json,.json"
                disabled={!isTauri() || fileBusy}
                onChange={importServerEvents}
                className="sr-only"
              />
            </label>
          </div>
          {!isTauri() && (
            <p className="font-body-sm text-on-surface-variant">
              File-based sync controls are available in the installed ClothPos app.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
