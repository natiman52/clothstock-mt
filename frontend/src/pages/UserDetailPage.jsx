/**
 * UserDetailPage – /staff/:userId
 *
 * Tabs:
 *   Profile   – identity, role, email, status, timestamps
 *   Activity  – last login, auth tokens, session info
 *   Ledger    – stock ledger entries attributed to this user (via sales / server events)
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context';
import apiClient from '../api/client';

const TABS = ['Profile', 'Activity', 'Ledger'];

const REASON_META = {
  SALE:                     { icon: 'shopping_cart',    color: 'text-error',        badge: 'SALE',      badgeClass: 'bg-error-container text-on-error-container' },
  RETURN:                   { icon: 'assignment_return',color: 'text-amber-700',    badge: 'RETURN',    badgeClass: 'bg-amber-100 text-amber-800' },
  WAREHOUSE_TRANSFER:       { icon: 'local_shipping',   color: 'text-[#047857]',    badge: 'TRANSFER',  badgeClass: 'bg-[#ecfdf5] text-[#047857]' },
  STOCK_ADJUSTMENT:         { icon: 'tune',             color: 'text-amber-700',    badge: 'ADJUST',    badgeClass: 'bg-amber-100 text-amber-800' },
  STOCKTAKE_RECONCILIATION: { icon: 'fact_check',       color: 'text-primary',      badge: 'STOCKTAKE', badgeClass: 'bg-primary-fixed text-on-primary-fixed' },
};

function LedgerEntryRow({ entry }) {
  const meta = REASON_META[entry.reason] || REASON_META.STOCK_ADJUSTMENT;
  const isPos = Number(entry.delta) > 0;
  return (
    <div className="p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-surface-container-low/40 transition-colors border-b border-outline-variant/10 last:border-0">
      <div className="flex items-center gap-3">
        <span className={`material-symbols-outlined ${meta.color} text-[20px] shrink-0`}>{meta.icon}</span>
        <div className="flex flex-col min-w-0">
          <span className="font-body-md font-semibold text-on-surface truncate">
            {entry.variant_sku || '—'}
          </span>
          <span className="font-label-sm text-[10px] text-outline font-mono">
            {entry.store_name || 'Central Storage'} • {entry.sync_source || '—'} •{' '}
            {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {(entry.unit_price != null) && (
          <div className="flex flex-col text-right">
            <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">@ ${Number(entry.unit_price).toFixed(2)}</span>
          </div>
        )}
        <div className="flex flex-col text-right">
          <span className={`font-body-md font-bold font-mono ${isPos ? 'text-[#047857]' : 'text-error'}`}>
            {isPos ? '+' : ''}{entry.delta} pcs
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant font-mono">Bal: {entry.resulting_balance}</span>
        </div>
        <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-bold font-mono ${meta.badgeClass}`}>
          {meta.badge}
        </span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between px-space-md py-3 gap-4 border-b border-outline-variant/20 last:border-0">
      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold w-36 shrink-0">{label}</span>
      <span className="font-body-md text-body-md text-on-surface text-right">{value ?? '—'}</span>
    </div>
  );
}

export default function UserDetailPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [activeTab, setActiveTab] = useState('Profile');

  const { data: userData, isLoading: loadingUser, isError } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => apiClient.get(`/api/users/${userId}/`),
    enabled: !!userId,
  });

  // Ledger: entries associated with server events triggered by this user
  const { data: ledgerData, isLoading: loadingLedger } = useQuery({
    queryKey: ['user-ledger', userId],
    queryFn: () =>
      apiClient.get(`/api/ledger/?ordering=-timestamp&limit=100&user=${userId}`).catch(() =>
        apiClient.get(`/api/ledger/?ordering=-timestamp&limit=50`)
      ),
    enabled: !!userId && activeTab === 'Ledger',
  });

  const ledgerEntries = ledgerData?.results || (Array.isArray(ledgerData) ? ledgerData : []);

  const user = userData;
  const isSelf = String(me?.id) === String(userId) || me?.username === user?.username;

  const initials = user
    ? ((user.first_name?.[0] || '') + (user.last_name?.[0] || '') || user.username?.[0] || '?').toUpperCase()
    : '?';

  const roleBadge = user?.is_superuser
    ? { label: 'Root Admin', cls: 'bg-primary text-on-primary' }
    : user?.is_staff
    ? { label: 'Staff', cls: 'bg-secondary text-on-secondary' }
    : { label: 'Worker', cls: 'bg-secondary-fixed text-on-secondary-fixed' };

  if (isError) {
    return (
      <main className="flex-1 p-space-lg flex items-center justify-center">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-[48px] text-error block">person_off</span>
          <p className="font-body-md text-on-surface-variant">User not found or access denied.</p>
          <button onClick={() => navigate('/staff')} className="text-primary underline font-label-sm">← Back to Staff</button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-5xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
        <Link to="/staff" className="hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">group</span>Staff
        </Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-on-surface font-semibold truncate max-w-[200px]">
          {loadingUser ? '…' : (user?.username || `User #${userId}`)}
        </span>
        {isSelf && (
          <span className="font-label-sm text-[9px] bg-primary text-on-primary px-1.5 py-0.5 rounded font-mono font-bold">YOU</span>
        )}
      </nav>

      {/* Header Card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md sm:p-space-lg flex flex-col sm:flex-row items-start sm:items-center gap-space-md">
        {loadingUser ? (
          <div className="flex items-center gap-4 w-full animate-pulse">
            <div className="w-16 h-16 rounded-full bg-surface-container shrink-0" />
            <div className="space-y-2 flex-1">
              <div className="h-5 bg-surface-container rounded w-1/3" />
              <div className="h-4 bg-surface-container rounded w-1/2" />
            </div>
          </div>
        ) : (
          <>
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-on-primary font-headline-md text-headline-md font-bold shrink-0 select-none">
              {initials}
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-label-sm text-[9px] px-2 py-0.5 rounded font-mono font-bold ${roleBadge.cls}`}>
                  {roleBadge.label}
                </span>
                <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${user?.is_active ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                  {user?.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
                {user?.status && (
                  <span className="font-label-sm text-[9px] bg-surface-container text-on-surface-variant px-1.5 py-0.5 rounded font-mono">
                    {user.status}
                  </span>
                )}
              </div>
              <h1 className="font-headline-md text-headline-sm sm:text-headline-md text-on-surface">
                {user?.first_name || user?.last_name
                  ? `${user.first_name} ${user.last_name}`.trim()
                  : user?.username}
              </h1>
              <span className="font-label-sm text-[11px] text-outline font-mono">
                @{user?.username} • {user?.email || 'no email'}
              </span>
            </div>
            <div className="flex flex-col items-end shrink-0 gap-1">
              <span className="font-label-sm text-[9px] text-on-surface-variant font-mono">ID: {user?.id}</span>
              <span className="font-label-sm text-[10px] text-on-surface-variant">
                Joined {user?.date_joined ? new Date(user.date_joined).toLocaleDateString() : '—'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-container-low p-1 rounded-xl w-full sm:w-fit">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg font-label-md text-label-md font-semibold transition-all ${
              activeTab === tab
                ? 'bg-surface-container-lowest text-primary shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ──────────────────────────────────────────── */}
      {activeTab === 'Profile' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30">
          {loadingUser ? (
            <div className="p-space-lg animate-pulse space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-4 bg-surface-container rounded w-3/4" />)}
            </div>
          ) : (
            <>
              <InfoRow label="Username"     value={<span className="font-mono">@{user?.username}</span>} />
              <InfoRow label="Full Name"    value={[user?.first_name, user?.last_name].filter(Boolean).join(' ') || '—'} />
              <InfoRow label="Email"        value={user?.email || '—'} />
              <InfoRow label="Role"         value={roleBadge.label} />
              <InfoRow label="Status"       value={user?.status || (user?.is_active ? 'Active' : 'Inactive')} />
              <InfoRow label="Superuser"    value={user?.is_superuser ? '✓ Yes' : '✗ No'} />
              <InfoRow label="Staff Access" value={user?.is_staff ? '✓ Yes' : '✗ No'} />
              <InfoRow label="Date Joined"  value={user?.date_joined ? new Date(user.date_joined).toLocaleString() : '—'} />
              <InfoRow label="Last Login"   value={user?.last_login ? new Date(user.last_login).toLocaleString() : 'Never'} />
            </>
          )}
        </div>
      )}

      {/* ── Activity Tab ─────────────────────────────────────────── */}
      {activeTab === 'Activity' && (
        <div className="space-y-space-sm">
          {/* Session info card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-[18px] text-primary">lock</span>
              <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold">Auth & Session</span>
            </div>
            <InfoRow label="Username"     value={<span className="font-mono">@{user?.username}</span>} />
            <InfoRow label="Last Login"   value={user?.last_login ? new Date(user.last_login).toLocaleString() : 'Never'} />
            <InfoRow label="Is Active"    value={user?.is_active ? '✓ Active' : '✗ Disabled'} />
          </div>

          {/* Permissions summary */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 p-space-md space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20">
              <span className="material-symbols-outlined text-[18px] text-secondary">verified_user</span>
              <span className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold">Permissions</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Superuser',   val: user?.is_superuser, icon: 'admin_panel_settings' },
                { label: 'Staff',       val: user?.is_staff,      icon: 'badge' },
                { label: 'Active',      val: user?.is_active,     icon: 'check_circle' },
              ].map(({ label, val, icon }) => (
                <div key={label} className={`flex items-center gap-2 p-3 rounded-lg border ${val ? 'border-[#047857]/30 bg-[#ecfdf5]' : 'border-outline-variant/20 bg-surface-container-low'}`}>
                  <span className={`material-symbols-outlined text-[18px] ${val ? 'text-[#047857]' : 'text-on-surface-variant'}`}>{icon}</span>
                  <span className={`font-label-sm text-label-sm font-semibold ${val ? 'text-[#047857]' : 'text-on-surface-variant'}`}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Ledger Tab ───────────────────────────────────────────── */}
      {activeTab === 'Ledger' && (
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/30 overflow-hidden">
          <div className="p-space-md border-b border-outline-variant/20 flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-outline uppercase tracking-wider font-semibold">
              Activity Ledger — @{user?.username}
            </span>
            <span className="font-label-sm text-[10px] font-mono text-on-surface-variant">
              {loadingLedger ? 'Loading…' : `${ledgerEntries.length} Entries`}
            </span>
          </div>
          <div>
            {ledgerEntries.map((entry) => (
              <LedgerEntryRow key={entry.id} entry={entry} />
            ))}
            {!loadingLedger && ledgerEntries.length === 0 && (
              <div className="py-16 text-center text-on-surface-variant font-body-md">
                <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">receipt_long</span>
                No ledger entries attributed to this user.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
