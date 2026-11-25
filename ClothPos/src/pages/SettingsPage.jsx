import { useOutletContext } from 'react-router';
import SettingsView from '../components/SettingsView';

export default function SettingsPage() {
  const {
    settings,
    syncStatus,
    busy,
    onSaveSettings,
    onSync,
    onExportSyncStatus,
    onImportServerEvents,
    onLoginServer,
    onLogoutServer,
  } = useOutletContext();

  return (
    <SettingsView
      settings={settings}
      syncStatus={syncStatus}
      busy={busy}
      onSave={onSaveSettings}
      onSync={onSync}
      onExportSyncStatus={onExportSyncStatus}
      onImportServerEvents={onImportServerEvents}
      onLoginServer={onLoginServer}
      onLogoutServer={onLogoutServer}
    />
  );
}
