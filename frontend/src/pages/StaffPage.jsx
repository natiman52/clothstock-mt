import { useState } from 'react';
import { useAuth } from '../context';

export default function StaffPage() {
  const { user, isOwner } = useAuth();
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState('all');
  const [isProvisionDrawerOpen, setIsProvisionDrawerOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '', email: '', staffId: 'EMP-5092', role: 'worker', pin: ['7', '4', '2', '9'], store: 'soho-01',
  });

  const [staffList, setStaffList] = useState([
    { id: 'usr-1', name: user?.username ? `${user.username} (You)` : 'Devon Vance', email: user?.email || 'devon.vance@clothstock.internal', staffId: '#ADM-8801', role: isOwner ? 'owner' : 'worker', store: 'Global Corporate HQ', status: 'Active', terminalAuth: 'PIN & Enclave', lastActive: 'Active Now', initials: 'DV' },
    { id: 'usr-2', name: 'Sarah Lin',       email: 'sarah.lin@clothstock.internal',  staffId: '#POS-4412', role: 'worker', store: 'SoHo Flagship (#01)', status: 'Active', terminalAuth: 'Active PIN • Card NFC', lastActive: '3m ago (POS-01A)', initials: 'SL' },
    { id: 'usr-3', name: 'Marcus Brody',    email: 'm.brody@clothstock.internal',     staffId: '#POS-9120', role: 'worker', store: 'Brooklyn Hub (#02)',   status: 'Active', terminalAuth: 'Active PIN',           lastActive: '18m ago (POS-02B)', initials: 'MB' },
    { id: 'usr-4', name: 'Elena Rostova',   email: 'e.rostova@clothstock.internal',   staffId: '#ADM-3320', role: 'owner', store: 'Warehouse Newark Central', status: 'Active', terminalAuth: 'Root Enclave',      lastActive: '1h ago (Console)', initials: 'ER' },
    { id: 'usr-5', name: 'Kenji Takahashi', email: 'kenji.t@clothstock.internal',     staffId: '#POS-1002', role: 'worker', store: 'Miami Pop-up',         status: 'Offline', terminalAuth: 'Active PIN (Cached)', lastActive: 'Yesterday (Offline POS)', initials: 'KT' },
  ]);

  const handleGeneratePin = () =>
    setNewStaff((prev) => ({ ...prev, pin: Array.from({ length: 4 }, () => Math.floor(Math.random() * 10).toString()) }));

  const handleProvisionStaff = (e) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.email) return;
    const initials = newStaff.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || 'ST';
    setStaffList((prev) => [
      { id: `usr-${Date.now()}`, name: newStaff.name, email: newStaff.email, staffId: `#${newStaff.staffId}`, role: newStaff.role, store: newStaff.store === 'soho-01' ? 'SoHo Flagship (#01)' : 'Retail Store Branch', status: 'Active', terminalAuth: `PIN: ${newStaff.pin.join('')}`, lastActive: 'Just Enrolled', initials },
      ...prev,
    ]);
    setIsProvisionDrawerOpen(false);
    setNewStaff({ name: '', email: '', staffId: `EMP-${Math.floor(1000 + Math.random() * 9000)}`, role: 'worker', pin: ['1', '2', '3', '4'], store: 'soho-01' });
  };

  const filteredStaff = staffList.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(staffSearch.toLowerCase()) || s.email.toLowerCase().includes(staffSearch.toLowerCase()) || s.staffId.toLowerCase().includes(staffSearch.toLowerCase());
    return matchesSearch && (staffRoleFilter === 'all' || s.role === staffRoleFilter);
  });

  return (
    <main className="flex-1 p-3 sm:p-space-lg max-w-7xl w-full mx-auto pb-24 md:pb-12 space-y-space-md">
      {/* Header Bar */}
      <div className="bg-surface-container-lowest p-space-md sm:p-space-lg rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-secondary font-semibold">Security &amp; Permissions</span>
            <span className="font-label-sm text-label-sm px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-mono">STORE #01 HUB</span>
          </div>
          <h1 className="font-headline-lg text-headline-sm sm:text-headline-lg text-on-surface tracking-tight mt-0.5">Staff &amp; Access Management</h1>
          <p className="font-body-md text-body-sm sm:text-body-md text-on-surface-variant mt-0.5 max-w-2xl">
            Manage retail staff, store cashiers, and provision system administrator credentials with role-based access control (RBAC).
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-space-md flex-wrap shrink-0">
          <div className="hidden xl:flex items-center gap-space-lg px-space-md py-1 rounded bg-surface-container-low shadow-sm">
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Active Terminals</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">14 / 16</span>
            </div>
            <div className="h-6 w-px bg-surface-container-highest" />
            <div className="flex flex-col">
              <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">Enrolled Staff</span>
              <span className="font-headline-sm text-body-lg text-primary font-mono font-bold">{staffList.length} Users</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsProvisionDrawerOpen(true)}
            className="h-10 px-space-md sm:px-space-lg bg-primary hover:bg-primary-container text-on-primary font-body-md text-body-md font-semibold rounded-lg shadow-sm flex items-center gap-2 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            <span>Provision Staff</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-lowest p-space-sm sm:p-space-md rounded-xl shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-space-sm">
        <div className="relative flex-1">
          <span className="material-symbols-outlined text-outline text-[18px] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">search</span>
          <input
            type="text"
            value={staffSearch}
            onChange={(e) => setStaffSearch(e.target.value)}
            placeholder="Search by name, email, or staff ID..."
            className="w-full h-10 pl-9 pr-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:outline-none focus:bg-surface-container-lowest focus:ring-1 focus:ring-secondary transition-all"
          />
        </div>
        <div className="relative flex-1 sm:w-44">
          <select
            value={staffRoleFilter}
            onChange={(e) => setStaffRoleFilter(e.target.value)}
            className="w-full h-10 pl-3 pr-7 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface appearance-none focus:outline-none cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="owner">Admin (Owner)</option>
            <option value="worker">Cashier (Worker)</option>
          </select>
          <span className="material-symbols-outlined text-on-surface-variant text-[16px] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden border border-outline-variant/30">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider border-b border-outline-variant/30">
            <tr>
              {['Staff Identity', 'Assigned Role & Scope', 'Terminal Credentials', 'Status & Activity', 'Actions'].map((h, i) => (
                <th key={h} className={`py-3 px-space-md font-semibold ${i === 4 ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container-low font-body-md text-body-md text-on-surface">
            {filteredStaff.map((staff) => (
              <tr key={staff.id} className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-3.5 px-space-md">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-on-primary font-label-md font-bold shrink-0">{staff.initials}</div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-headline-sm text-body-md font-semibold text-on-surface truncate">{staff.name}</span>
                      <span className="font-label-sm text-[10px] text-outline font-mono">{staff.email} • {staff.staffId}</span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-space-md">
                  <div className="flex flex-col gap-1">
                    <span className={`font-label-sm text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase w-fit ${staff.role === 'owner' ? 'bg-primary text-on-primary' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>
                      {staff.role === 'owner' ? 'Root Admin' : 'Store Associate'}
                    </span>
                    <span className="font-label-sm text-[10px] text-on-surface-variant truncate">{staff.store}</span>
                  </div>
                </td>
                <td className="py-3.5 px-space-md font-label-sm text-[11px] font-mono text-on-surface">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-secondary">key</span>
                    {staff.terminalAuth}
                  </div>
                </td>
                <td className="py-3.5 px-space-md">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-[11px] font-medium text-[#047857]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />{staff.status}
                    </div>
                    <span className="font-label-sm text-[10px] text-on-surface-variant">{staff.lastActive}</span>
                  </div>
                </td>
                <td className="py-3.5 px-space-md text-right">
                  <button type="button" onClick={() => alert(`Editing permissions for ${staff.name}`)} className="p-1 rounded text-on-surface-variant hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="block md:hidden space-y-2">
        {filteredStaff.map((staff) => (
          <div key={staff.id} className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-label-sm font-bold">{staff.initials}</div>
                <div className="flex flex-col">
                  <span className="font-headline-sm text-body-md font-semibold text-on-surface">{staff.name}</span>
                  <span className="font-label-sm text-[10px] text-outline font-mono">{staff.staffId}</span>
                </div>
              </div>
              <span className={`font-label-sm text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase ${staff.role === 'owner' ? 'bg-primary text-on-primary' : 'bg-secondary-fixed text-on-secondary-fixed'}`}>
                {staff.role === 'owner' ? 'Admin' : 'Cashier'}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20 font-label-sm text-[10px] text-on-surface-variant">
              <span>{staff.store}</span>
              <span className="font-mono text-secondary">{staff.terminalAuth}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Provision Drawer */}
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
                {[
                  { label: 'Full Legal Name', key: 'name', type: 'text', placeholder: 'e.g. Maya Chen', required: true },
                  { label: 'Corporate Email Address', key: 'email', type: 'email', placeholder: 'e.g. maya.chen@clothstock.internal', required: true },
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
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1">Staff Identifier</label>
                  <input readOnly value={newStaff.staffId} className="w-full h-10 px-3 bg-surface-container rounded-lg font-label-md text-label-md text-outline font-mono" />
                </div>

                <div>
                  <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold block mb-1.5">Assigned Role &amp; Access Tier</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'worker', title: 'Cashier / Associate', sub: 'TIER 1 (POS & Lookups)', activeCls: 'border-secondary bg-secondary/5 ring-1 ring-secondary' },
                      { key: 'owner',  title: 'Administrator',       sub: 'ROOT TIER 3 (Full Access)', activeCls: 'border-primary bg-primary/5 ring-1 ring-primary' },
                    ].map(({ key, title, sub, activeCls }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setNewStaff({ ...newStaff, role: key })}
                        className={`p-3 rounded-lg border text-left transition-all ${newStaff.role === key ? activeCls : 'border-outline-variant/40 bg-surface-container-low hover:bg-surface-container'}`}
                      >
                        <span className="font-headline-sm text-[13px] font-semibold text-on-surface block">{title}</span>
                        <span className="font-label-sm text-[10px] text-on-surface-variant font-mono mt-0.5 block">{sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-label-sm text-label-sm text-on-surface uppercase tracking-wider font-semibold flex items-center gap-1">
                      <span className="material-symbols-outlined text-[16px] text-secondary">pin</span>
                      Fast Cashier Terminal PIN
                    </label>
                    <span className="font-label-sm text-[10px] text-on-tertiary-container font-mono font-medium">4-DIGIT PIN</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {newStaff.pin.map((digit, idx) => (
                      <div key={idx} className="w-10 h-10 bg-surface-container-low rounded font-headline-sm text-headline-sm text-primary flex items-center justify-center font-mono border border-outline-variant/40 font-bold">
                        {digit}
                      </div>
                    ))}
                    <button type="button" onClick={handleGeneratePin} className="ml-auto h-10 px-space-sm bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface font-label-sm text-label-sm font-mono flex items-center gap-1 transition-colors">
                      <span className="material-symbols-outlined text-[14px]">shuffle</span>
                      <span>GEN PIN</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-space-lg border-t border-outline-variant/30 bg-surface-container-low flex items-center gap-2">
              <button type="button" onClick={() => setIsProvisionDrawerOpen(false)} className="flex-1 h-11 bg-surface-container hover:bg-surface-container-high text-on-surface font-body-md font-semibold rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" form="provision-staff-form" className="flex-1 h-11 bg-primary hover:bg-primary-container text-on-primary font-body-md font-semibold rounded-lg shadow-md transition-colors">
                Create Staff Identity
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
