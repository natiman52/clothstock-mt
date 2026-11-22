import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../context';
import apiClient from '../api/client';

function getRoleMeta(u) {
  if (u.is_superuser) return { label: 'Root Admin', cls: 'bg-primary text-on-primary', role: 'owner' };
  if (u.is_staff)     return { label: 'Staff',      cls: 'bg-secondary text-on-secondary', role: 'owner' };
  return                     { label: 'Worker',     cls: 'bg-secondary-fixed text-on-secondary-fixed', role: 'worker' };
}

function getInitials(u) {
  const full = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '';
  return full.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function StaffPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('all');
  const [staffStatusFilter, setStaffStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [staffSortBy, setStaffSortBy] = useState('name_asc'); // 'name_asc' | 'name_desc' | 'joined_desc' | 'login_desc'
  const [isProvisionDrawerOpen, setIsProvisionDrawerOpen] = useState(false);
  const [provisionError, setProvisionError] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [newStaff, setNewStaff] = useState({
    username: '', first_name: '', last_name: '', email: '',
    password: '', role: 'worker',
  });

  // ── Fetch real users ────────────────────────────────────────────────
  const { data: usersData, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiClient.get('/api/users/'),
    retry: 1,
  });

  const rawList = usersData?.results || (Array.isArray(usersData) ? usersData : []);

  const staffList = rawList.map((u) => ({
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
    email: u.email || '—',
    username: u.username,
    staffId: `#USR-${String(u.id).padStart(4, '0')}`,
    role: u.is_superuser || u.is_staff ? 'owner' : 'worker',
    roleMeta: getRoleMeta(u),
    status: u.is_active ? 'Active' : 'Inactive',
    isActive: u.is_active,
    lastLogin: u.last_login ? new Date(u.last_login).toLocaleString() : 'Never',
    lastLoginRaw: u.last_login || null,
    dateJoined: u.date_joined || null,
    initials: getInitials(u),
    isSelf: String(u.id) === String(me?.id) || u.username === me?.username,
  }));

  // ── Client-side filtering & sorting ─────────────────────────────────
  const filteredStaff = useMemo(() => {
    let list = staffList.filter((s) => {
      const q = staffSearch.toLowerCase();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.staffId.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (staffRoleFilter !== 'all' && s.role !== staffRoleFilter) return false;
      if (staffStatusFilter === 'active' && !s.isActive) return false;
      if (staffStatusFilter === 'inactive' && s.isActive) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      if (staffSortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (staffSortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (staffSortBy === 'joined_desc') {
        return new Date(b.dateJoined || 0) - new Date(a.dateJoined || 0);
      }
      if (staffSortBy === 'login_desc') {
        return new Date(b.lastLoginRaw || 0) - new Date(a.lastLoginRaw || 0);
      }
      return 0;
    });
  }, [staffList, staffSearch, staffRoleFilter, staffStatusFilter, staffSortBy]);

  const activeFiltersCount =
    (staffSearch.trim() ? 1 : 0) +
    (staffRoleFilter !== 'all' ? 1 : 0) +
    (staffStatusFilter !== 'all' ? 1 : 0) +
    (staffSortBy !== 'name_asc' ? 1 : 0);

  const resetFilters = () => {
    setStaffSearch('');
    setStaffRoleFilter('all');
    setStaffStatusFilter('all');
    setStaffSortBy('name_asc');
  };

  // ── Provision handler (POST /api/users/) ────────────────────────────
  const handleProvisionStaff = async (e) => {
    e.preventDefault();
    setProvisionError('');
    if (!newStaff.username || !newStaff.password) return;
    setIsProvisioning(true);
    try {
      await apiClient.post('/api/users/', {
        username: newStaff.username,
        first_name: newStaff.first_name,
        last_name: newStaff.last_name,
        email: newStaff.email,
        password: newStaff.password,
        status: 'active',
      });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsProvisionDrawerOpen(false);
      setNewStaff({ username: '', first_name: '', last_name: '', email: '', password: '', role: 'worker' });
    } catch (err) {
      const data = err?.response?.data;
      const msg = data
        ? Object.values(data).flat().join(' ')
        : 'Failed to create user. Check all fields.';
      setProvisionError(msg);
    } finally {
      setIsProvisioning(false);
    }
  };

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header Bar */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Security &amp; Permissions</span>
          </div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface tracking-tight mt-0.5">Staff &amp; Access Management</h1>
          <p className="font-body-md text-body-sm sm:text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
            Manage retail staff, store cashiers, and provision system administrator credentials.
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-space-md flex-wrap shrink-0">
          <div className="hidden xl:flex items-center gap-space-lg px-space-md py-1 rounded bg-surface-container-low shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Enrolled Staff</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">
                {isLoading ? '…' : `${staffList.length} Users`}
              </span>
            </div>
            <div className="h-6 w-px bg-surface-container-highest" />
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Showing</span>
              <span className="font-headline-sm text-body-lg text-secondary font-mono font-bold">
                {isLoading ? '…' : filteredStaff.length}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setProvisionError(''); setIsProvisionDrawerOpen(true); }}
            className="h-10 px-space-md sm:px-space-lg bg-primary hover:bg-primary-container text-on-primary font-body-md text-body-md font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Provision Staff</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
            <input
              type="text"
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder="Search by name, username, email, or ID..."
              className="w-full h-10 pl-9 pr-8 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all"
            />
            {staffSearch && (
              <button type="button" onClick={() => setStaffSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface cursor-pointer text-sm">✕</button>
            )}
          </div>

          {/* Role */}
          <div className="relative">
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="owner">Admin / Staff</option>
              <option value="worker">Worker / Cashier</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          {/* Status */}
          <div className="relative">
            <select
              value={staffStatusFilter}
              onChange={(e) => setStaffStatusFilter(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={staffSortBy}
              onChange={(e) => setStaffSortBy(e.target.value)}
              className="h-10 pl-3 pr-8 bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface appearance-none focus:outline-none focus:ring-1 focus:ring-secondary cursor-pointer"
            >
              <option value="name_asc">Name (A–Z)</option>
              <option value="name_desc">Name (Z–A)</option>
              <option value="joined_desc">Recently Joined</option>
              <option value="login_desc">Last Login</option>
            </select>
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-10 px-3 text-error hover:bg-error-container/30 rounded-lg font-label-md text-label-md font-semibold transition-colors cursor-pointer shrink-0"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Active filter chips */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
            <span className="text-outline font-medium">Active filters:</span>
            {staffSearch && (
              <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                Search: &quot;{staffSearch}&quot;
                <button onClick={() => setStaffSearch('')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            {staffRoleFilter !== 'all' && (
              <span className="inline-flex items-center gap-1 bg-secondary-fixed/50 text-on-secondary-fixed px-2 py-0.5 rounded-full">
                Role: {staffRoleFilter === 'owner' ? 'Admin / Staff' : 'Worker'}
                <button onClick={() => setStaffRoleFilter('all')} className="hover:opacity-70 cursor-pointer">✕</button>
              </span>
            )}
            {staffStatusFilter !== 'all' && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${staffStatusFilter === 'active' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-error-container text-on-error-container'}`}>
                Status: {staffStatusFilter === 'active' ? 'Active' : 'Inactive'}
                <button onClick={() => setStaffStatusFilter('all')} className="hover:opacity-70 cursor-pointer">✕</button>
              </span>
            )}
            {staffSortBy !== 'name_asc' && (
              <span className="inline-flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-on-surface">
                Sort: {staffSortBy === 'name_desc' ? 'Name Z–A' : staffSortBy === 'joined_desc' ? 'Recently Joined' : 'Last Login'}
                <button onClick={() => setStaffSortBy('name_asc')} className="hover:text-error cursor-pointer">✕</button>
              </span>
            )}
            <span className="text-outline ml-auto font-mono">
              {filteredStaff.length} of {staffList.length} users
            </span>
          </div>
        )}
      </div>

      {/* Loading / Error states */}
      {isLoading && (
        <div className="bg-surface-container-lowest rounded-xl p-space-lg text-center text-on-surface-variant animate-pulse font-body-md">
          Loading staff…
        </div>
      )}
      {isError && (
        <div className="bg-error-container text-on-error-container rounded-xl p-space-md font-body-md flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
          Failed to load staff list. Ensure you have admin access.
        </div>
      )}

      {/* Desktop Table */}
      {!isLoading && !isError && (
        <div className="hidden md:block bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
          <table className="w-full text-left border-collapse">
            <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant/30">
              <tr>
                {['Staff Identity', 'Role', 'Last Login', 'Status', 'Actions'].map((h, i) => (
                  <th key={h} className={`py-3 px-space-md font-semibold ${i === 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
              {filteredStaff.map((staff) => (
                <tr key={staff.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-3.5 px-space-md">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary font-label-md font-bold shrink-0">
                        {staff.initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-body-md font-semibold text-on-surface truncate">
                          {staff.name}
                          {staff.isSelf && <span className="ml-1.5 font-label-sm text-[9px] bg-primary text-on-primary px-1 py-0.5 rounded font-mono align-middle">YOU</span>}
                        </span>
                        <span className="font-label-sm text-[10px] text-outline font-mono">@{staff.username} • {staff.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md">
                    <span className={`font-label-sm text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase w-fit ${staff.roleMeta.cls}`}>
                      {staff.roleMeta.label}
                    </span>
                  </td>
                  <td className="py-3.5 px-space-md font-label-sm text-[11px] text-on-surface-variant font-mono">
                    {staff.lastLogin}
                  </td>
                  <td className="py-3.5 px-space-md">
                    <div className="flex items-center gap-1 text-[11px] font-medium">
                      <span className={`w-1.5 h-1.5 rounded-full ${staff.status === 'Active' ? 'bg-[#10b981]' : 'bg-outline'}`} />
                      <span className={staff.status === 'Active' ? 'text-[#047857]' : 'text-on-surface-variant'}>{staff.status}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-space-md text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link to={`/staff/${staff.id}`} className="p-1 rounded text-on-surface-variant hover:text-primary transition-colors" title="View Profile">
                        <span className="material-symbols-outlined text-[18px]">person</span>
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredStaff.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-16 text-center text-on-surface-variant font-body-md">
                    <span className="material-symbols-outlined text-[48px] block mb-2 opacity-40">group</span>
                    {activeFiltersCount > 0 ? (
                      <div className="space-y-2">
                        <p>No staff match the selected filters.</p>
                        <button type="button" onClick={resetFilters} className="px-3 py-1 bg-surface-container hover:bg-surface-container-high rounded text-primary text-xs font-semibold cursor-pointer">Clear All Filters</button>
                      </div>
                    ) : (
                      <p>No staff members found.</p>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile Cards */}
      {!isLoading && !isError && (
        <div className="block md:hidden space-y-2">
          {filteredStaff.map((staff) => (
            <div key={staff.id} className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary font-label-sm font-bold shrink-0">
                    {staff.initials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-body-md font-semibold text-on-surface truncate">
                      {staff.name}
                      {staff.isSelf && <span className="ml-1.5 font-label-sm text-[9px] bg-primary text-on-primary px-1 py-0.5 rounded font-mono align-middle">YOU</span>}
                    </span>
                    <span className="font-label-sm text-[10px] text-outline font-mono">@{staff.username}</span>
                  </div>
                </div>
                <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${staff.roleMeta.cls}`}>
                  {staff.roleMeta.label}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 font-label-sm text-[10px] text-on-surface-variant">
                <span>{staff.email}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${staff.status === 'Active' ? 'bg-[#10b981]' : 'bg-outline'}`} />
                    <span>{staff.status}</span>
                  </div>
                  <Link to={`/staff/${staff.id}`} className="text-primary flex items-center gap-0.5 hover:underline">
                    <span className="material-symbols-outlined text-[13px]">person</span>View
                  </Link>
                </div>
              </div>
            </div>
          ))}
          {filteredStaff.length === 0 && (
            <div className="py-12 text-center text-on-surface-variant font-body-md bg-surface-container-lowest rounded-xl border border-outline-variant/30">
              <span className="material-symbols-outlined text-[36px] block mb-2 opacity-40">group</span>
              No staff members found.
            </div>
          )}
        </div>
      )}

      {/* ── Provision Drawer ─────────────────────────────────────────────── */}
      {isProvisionDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-on-surface/40 backdrop-blur-xs" onClick={() => setIsProvisionDrawerOpen(false)}>
          <div className="w-full sm:max-w-md bg-surface-container-lowest h-full shadow-2xl flex flex-col justify-between overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div>
              <div className="p-space-lg border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-on-primary">
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                  </div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">Provision Staff Identity</h2>
                </div>
                <button type="button" onClick={() => setIsProvisionDrawerOpen(false)} className="p-1 rounded text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form id="provision-staff-form" onSubmit={handleProvisionStaff} className="p-space-lg space-y-space-md">
                {provisionError && (
                  <div className="bg-error-container text-on-error-container rounded-lg px-3 py-2 font-body-sm text-body-sm flex items-start gap-2">
                    <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">error</span>
                    {provisionError}
                  </div>
                )}

                {[
                  { label: 'Username',   key: 'username',   type: 'text',  placeholder: 'e.g. maya.chen',                     required: true },
                  { label: 'First Name', key: 'first_name', type: 'text',  placeholder: 'e.g. Maya',                           required: false },
                  { label: 'Last Name',  key: 'last_name',  type: 'text',  placeholder: 'e.g. Chen',                           required: false },
                  { label: 'Email',      key: 'email',      type: 'email', placeholder: 'e.g. maya.chen@clothstock.internal',   required: false },
                  { label: 'Password',   key: 'password',   type: 'password', placeholder: 'Min. 8 characters',               required: true },
                ].map(({ label, key, type, placeholder, required }) => (
                  <div key={key}>
                    <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">
                      {label} {required && <span className="text-error">*</span>}
                    </label>
                    <input
                      type={type}
                      required={required}
                      value={newStaff[key]}
                      onChange={(e) => setNewStaff({ ...newStaff, [key]: e.target.value })}
                      placeholder={placeholder}
                      className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary shadow-sm"
                    />
                  </div>
                ))}

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1.5">Role</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'worker', title: 'Worker',       sub: 'Standard access', activeCls: 'border-secondary bg-secondary/5 ring-1 ring-secondary' },
                      { key: 'owner',  title: 'Admin / Staff', sub: 'Elevated access', activeCls: 'border-primary bg-primary/5 ring-1 ring-primary' },
                    ].map(({ key, title, sub, activeCls }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewStaff({ ...newStaff, role: key })}
                        className={`p-3 rounded-lg border text-left transition-all ${newStaff.role === key ? activeCls : 'border-outline-variant/40 bg-surface-container-low hover:bg-surface-container'}`}
                      >
                        <span className="font-body-md text-[13px] font-semibold text-on-surface block">{title}</span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant font-mono mt-0.5 block">{sub}</span>
                      </button>
                    ))}
                  </div>
                  <p className="font-label-sm text-[10px] text-on-surface-variant mt-1.5">
                    Note: role elevation (is_staff / is_superuser) must be set via Django Admin.
                  </p>
                </div>
              </form>
            </div>

            <div className="p-space-lg border-t border-outline-variant/30 bg-surface-container-low flex items-center gap-2">
              <button type="button" onClick={() => setIsProvisionDrawerOpen(false)} className="flex-1 h-11 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md font-semibold rounded-lg transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                form="provision-staff-form"
                disabled={isProvisioning}
                className="flex-1 h-11 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-colors disabled:opacity-60"
              >
                {isProvisioning ? 'Creating…' : 'Create Staff Identity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
