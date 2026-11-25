import { useState } from 'react';
import { useStore } from '../context';
import { fetchServerEventExport, importStoreSyncExport } from '../api/sync';

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

async function readJsonFile(file, expectedType) {
  if (!file) return null;
  let document;
  try {
    document = JSON.parse(await file.text());
  } catch {
    throw new Error('The selected file is not valid JSON.');
  }
  if (document?.file_type !== expectedType) {
    throw new Error(`Expected a ${expectedType} JSON file.`);
  }
  return document;
}

export default function SyncExportPage() {
  const { storesList } = useStore();
  const [storeId, setStoreId] = useState('all');
  const [events, setEvents] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState([]);
  const [busy, setBusy] = useState(false);

  function clearFeedback() {
    setMessage('');
    setError('');
    setWarnings([]);
  }

  async function exportEvents() {
    setBusy(true);
    clearFeedback();
    try {
      const document = await fetchServerEventExport(storeId);
      setEvents(document);
      setMessage(`Loaded ${document.count} server event${document.count === 1 ? '' : 's'}.`);
    } catch (requestError) {
      setError(requestError.message || 'Could not load server events.');
    } finally {
      setBusy(false);
    }
  }

  async function importStoreExport(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    clearFeedback();
    try {
      const document = await readJsonFile(file, 'clothstock.store-export');
      const response = await importStoreSyncExport(document);
      setSyncResult({
        schema_version: '1.0',
        file_type: 'clothstock.server-event-export',
        generated_at: new Date().toISOString(),
        store_id: response.store_id,
        after_seq: response.last_applied_seq,
        latest_seq: response.latest_seq,
        next_after_seq: null,
        has_more: false,
        count: response.server_events_count,
        events: response.server_events || [],
      });
      setWarnings(response.errors || []);
      setMessage(
        `${response.processed_count} local event(s) processed. Download the server events for direct import on the POS.`,
      );
    } catch (requestError) {
      setError(requestError.message || 'Could not import the store export.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-space-md">
      <header className="space-y-1">
        <p className="font-label-sm text-outline uppercase tracking-wider">Owner tools</p>
        <h1 className="font-headline-lg text-on-surface">Store synchronization</h1>
        <p className="font-body-md text-on-surface-variant">
          Export server changes or process signed store files for online and offline synchronization.
        </p>
      </header>

      {message && (
        <div role="status" className="rounded-lg bg-[#ecfdf5] p-space-sm text-[#047857]">
          {message}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-error-container p-space-sm text-on-error-container">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-lg space-y-space-md">
        <div>
          <h2 className="font-headline-md">Server event export</h2>
          <p className="mt-1 font-body-sm text-on-surface-variant">
            Download events in sequence order. Choose one store for POS import; “All stores” is an administrative export and cannot be imported by a POS.
          </p>
        </div>
        <div className="flex flex-col gap-space-sm sm:flex-row sm:items-end">
          <label className="flex min-w-56 flex-col gap-1">
            <span className="font-label-sm text-outline uppercase">Store</span>
            <select
              value={storeId}
              onChange={(event) => {
                setStoreId(event.target.value);
                setEvents(null);
              }}
              className="h-10 rounded-lg border border-outline-variant bg-surface px-3 text-on-surface"
            >
              <option value="all">All stores</option>
              {storesList.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name} ({store.code})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportEvents}
            disabled={busy}
            className="h-10 rounded-lg bg-primary px-4 font-headline-sm text-on-primary disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Load server events'}
          </button>
          {events && (
            <button
              type="button"
              onClick={() => downloadJson(events, 'clothstock-server-event-export.json')}
              className="h-10 rounded-lg border border-outline-variant px-4 font-headline-sm text-on-surface hover:bg-surface-container-low"
            >
              Download JSON ({events.count})
            </button>
          )}
        </div>
        {events && (
          <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Preview of exported server events</caption>
              <thead className="bg-surface-container-low text-on-surface-variant">
                <tr>
                  <th scope="col" className="p-3">Sequence</th>
                  <th scope="col" className="p-3">Store</th>
                  <th scope="col" className="p-3">Event</th>
                  <th scope="col" className="p-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {events.events.slice(0, 10).map((item) => (
                  <tr key={item.seq_id} className="border-t border-outline-variant/20">
                    <td className="p-3 font-mono">{item.seq_id}</td>
                    <td className="p-3">{item.store_id ?? 'Global'}</td>
                    <td className="p-3">{item.event_type}</td>
                    <td className="p-3">{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {events.events.length === 0 && (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-on-surface-variant">
                      No server events found for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {events.count > 10 && (
              <p className="border-t border-outline-variant/20 p-3 text-sm text-on-surface-variant">
                Showing the first 10 of {events.count} events.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-space-lg space-y-3">
        <h2 className="font-headline-md">Process store export</h2>
        <p className="font-body-sm text-on-surface-variant">
          Import a signed POS export. Event IDs make retries idempotent. Download the resulting store-scoped server events and import them directly on the POS; the POS marks accepted local events synced on its next online sync.
        </p>
        <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg bg-primary px-4 font-headline-sm text-on-primary hover:opacity-90">
          {busy ? 'Working…' : 'Select store export JSON'}
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={importStoreExport}
            className="sr-only"
          />
        </label>
        {warnings.length > 0 && (
          <div role="status" className="rounded-lg bg-error-container p-3 text-on-error-container">
            <p className="font-headline-sm">Some local events were not accepted:</p>
            <ul className="mt-1 list-disc pl-5">
              {warnings.map((item, index) => (
                <li key={`${item.event_id || 'event'}-${index}`}>
                  {item.event_id ? `${item.event_id}: ` : ''}{item.error || 'Unknown event error'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {syncResult && (
          <div className="space-y-2 rounded-lg bg-surface-container-low p-3">
            <p className="font-body-sm">
              Cursor: {syncResult.after_seq} → {syncResult.latest_seq} · {syncResult.count} event(s)
            </p>
            <button
              type="button"
              onClick={() => downloadJson(syncResult, `clothstock-server-events-${syncResult.store_id}.json`)}
              className="min-h-10 rounded-lg border border-outline-variant px-4 font-headline-sm hover:bg-surface-container"
            >
              Download server events JSON
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
