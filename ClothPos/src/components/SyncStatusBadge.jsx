export default function SyncStatusBadge({ status, busy, onSync }) {
  const syncing = busy || status?.syncing;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-container-low border border-outline-variant/30">
        <span className="relative flex h-2 w-2">
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              status?.lastError ? 'bg-error' : 'bg-[#10b981]'
            }`}
          />
        </span>
        <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">
          {status?.pendingEvents || 0} MUTATIONS
        </span>
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="p-1.5 rounded hover:bg-surface-container text-on-surface-variant disabled:opacity-50"
        title="Sync with ClothStock"
      >
        <span className={`material-symbols-outlined text-[18px] ${syncing ? 'animate-spin' : ''}`}>
          sync
        </span>
      </button>
    </div>
  );
}
