import { useState } from 'react';
import { useAuth } from '../context';

export function LoginPage({ onLoginSuccess }) {
  const { login } = useAuth();

  const [authMode, setAuthMode] = useState('standard'); // 'standard' or 'pin'
  // const [storeBranch, setStoreBranch] = useState('soho-01');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberTerminal, setRememberTerminal] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleStandardSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      await login({ username, password });
      if (onLoginSuccess) {
        onLoginSuccess();
      }
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };




  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex items-center justify-center p-space-lg">
      <main className="w-full max-w-md">
        <div className="flex flex-col w-full">
          {/* System Status Banner (Offline-First Diagnostic Bar) */}
         {/*
          <div className="w-full bg-primary-container text-on-primary-container px-space-md py-space-xs rounded-xl flex items-center justify-between mb-space-lg shadow-sm">
            <div className="flex items-center gap-space-xs min-w-0">
              <span className="inline-block w-2 h-2 rounded-full bg-tertiary-fixed-dim animate-pulse"></span>
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-surface-bright font-semibold">
                Local Node Engine Active
              </span>
              <span className="font-label-sm text-label-sm text-outline-variant hidden sm:inline">•</span>
              <span className="font-label-sm text-label-sm text-primary-fixed truncate hidden sm:inline">
                Edge SQLite: 24,190 SKUs Cached
              </span>
            </div>
            <div className="flex items-center gap-space-xs shrink-0">
              <span className="material-symbols-outlined text-[14px] text-tertiary-fixed-dim">wifi_tethering</span>
              <span className="font-label-sm text-label-sm font-medium text-surface-bright">SYNC OK</span>
            </div>
          </div>
          */}
          {/* Primary Authentication Container (Industrial Elevation Card) */}
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl p-space-lg sm:p-space-xl flex flex-col relative overflow-hidden">
            {/* Visual Gradient Depth Scrim */}
            <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-secondary-container/10 blur-2xl pointer-events-none"></div>
            <div className="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-tertiary-fixed-dim/15 blur-2xl pointer-events-none"></div>

            {/* Header & Brand Mark */}
            <div className="flex items-start justify-between gap-space-md mb-space-lg relative z-10">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
                  <span className="material-symbols-outlined text-[22px]">hub</span>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold tracking-tight">
                      ClothStock
                    </span>
                    <span className="font-label-sm text-label-sm uppercase bg-surface-container px-1.5 py-0.5 rounded text-secondary font-bold">
                      Sync v1
                    </span>
                  </div>
                  <span className="font-label-md text-label-md text-on-surface-variant tracking-wider">
                    SECURE POS &amp; INVENTORY GATEWAY
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[13px] text-secondary">verified_user</span>
                <span>TLS 1.3</span>
              </div>
            </div>

            {/* Error Notification Alert */}
            {errorMessage && (
              <div className="mb-space-md bg-error-container text-on-error-container p-space-sm rounded-lg flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[18px] text-error">error</span>
                <span className="font-body-sm text-body-sm flex-1">{errorMessage}</span>
              </div>
            )}

            {/* Mode Selector Tabs (Staff ID Credential vs Local POS PIN) */}
            <div className="w-full bg-surface-container-low p-space-xs rounded-lg flex mb-space-lg gap-space-xs">
              <button
                type="button"
                onClick={() => setAuthMode('standard')}
                className={`flex-1 py-space-xs px-space-sm rounded font-headline-sm text-[12px] leading-tight font-semibold transition-all flex items-center justify-center gap-1.5 ${
                  authMode === 'standard'
                    ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">badge</span>
                Standard Auth
              </button>
            </div>
            {/* Mode 1: Standard Credentials Form */}
              <form onSubmit={handleStandardSubmit} className="flex flex-col gap-space-md relative z-10">
                {/* Store Node Selection 
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="store-branch"
                    className="flex items-center justify-between font-label-md text-label-md text-on-surface font-medium uppercase tracking-wider"
                  >
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px] text-outline">storefront</span>
                      Store Node / Fulfillment Unit
                    </span>
                    <span className="text-secondary font-semibold font-label-sm text-label-sm">ONLINE</span>
                  </label>
                  <div className="relative">
                    <select
                      id="store-branch"
                      value={storeBranch}
                      onChange={(e) => setStoreBranch(e.target.value)}
                      className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md rounded-lg py-2.5 pl-3 pr-8 appearance-none focus:outline-none focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px] focus:shadow-secondary transition-all cursor-pointer"
                    >
                      <option value="soho-01">SoHo Flagship (#01) — 482 Broadway, NY</option>
                      <option value="brooklyn-02">Brooklyn Hub (#02) — DUMBO Fulfillment, NY</option>
                      <option value="newark-wh">Warehouse Newark Central (#DC-04)</option>
                      <option value="hq-corp">Corporate HQ Ops Terminal — Executive Sandbox</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-[18px]">
                      expand_more
                    </span>
                  </div>
                </div>
                */}
                {/* Staff Identifier / Email */}
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="staff-id"
                    className="font-label-md text-label-md text-on-surface font-medium uppercase tracking-wider flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px] text-outline">id_card</span>
                    Staff Identifier or Corporate Email
                  </label>
                  <div className="relative">
                    <input
                      id="staff-id"
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. admin or staff@clothstock.internal"
                      className="w-full bg-surface-container-low text-on-surface font-label-lg text-label-lg rounded-lg py-2.5 pl-3 pr-9 placeholder:text-outline-variant placeholder:font-body-md focus:outline-none focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px] focus:shadow-secondary transition-all"
                    />
                    <button
                      type="button"
                      title="Scan Physical Badge Barcode"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors p-1 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                    </button>
                  </div>
                </div>

                {/* Password Field with Visibility Toggle */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-label-md text-label-md">
                    <label
                      htmlFor="password-field"
                      className="text-on-surface font-medium uppercase tracking-wider flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px] text-outline">key</span>
                      Master Terminal Passcode
                    </label>
                    <button
                      type="button"
                      onClick={() => alert('Please contact system administrator to reset passcode.')}
                      className="text-secondary hover:underline font-label-sm text-label-sm font-semibold"
                    >
                      Reset PIN/Key
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="password-field"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-surface-container-low text-on-surface font-label-lg text-label-lg rounded-lg py-2.5 pl-3 pr-10 focus:outline-none focus:bg-surface-container-lowest focus:shadow-[0_0_0_2px] focus:shadow-secondary transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors p-1 flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Hardware Trust Checkbox */}
                <div className="flex items-center gap-space-sm pt-space-xs">
                  <input
                    id="remember-terminal"
                    type="checkbox"
                    checked={rememberTerminal}
                    onChange={(e) => setRememberTerminal(e.target.checked)}
                    className="w-4 h-4 rounded text-secondary focus:ring-0 focus:ring-offset-0 bg-surface-container-low accent-secondary cursor-pointer"
                  />
                  <label
                    htmlFor="remember-terminal"
                    className="font-body-sm text-body-sm text-on-surface select-none cursor-pointer"
                  >
                    Authorize &amp; bind POS terminal hardware token{' '}
                    <span className="text-on-surface-variant font-label-sm text-label-sm">(30 Days Session)</span>
                  </label>
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-11 bg-primary text-on-primary hover:bg-inverse-surface disabled:opacity-70 rounded-lg font-headline-sm text-[14px] font-semibold flex items-center justify-center gap-space-xs transition-colors shadow-md mt-space-xs"
                >
                  {isLoading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      <span>Authenticating Local Node...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">login</span>
                      <span>Sign In to Terminal</span>
                    </>
                  )}
                </button>
              </form>
            

           
            {/* Access Hierarchy & Role Privileges Preview */}
            <div className="mt-space-lg pt-space-md flex flex-col gap-space-xs bg-surface-container-low p-space-md rounded-lg">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-bold uppercase tracking-widest">
                  ACCESS TIER POLICY PROFILE
                </span>
                <span className="font-label-sm text-label-sm text-tertiary-container bg-tertiary-fixed px-1.5 py-0.5 rounded font-bold">
                  ACTIVE PROTOCOL
                </span>
              </div>

              {/* Role Badge 1: Store Associate / Cashier */}
              <div className="flex items-start gap-space-xs bg-surface-container-lowest p-space-xs rounded">
                <div className="mt-0.5 text-secondary">
                  <span className="material-symbols-outlined text-[16px]">point_of_sale</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline-sm text-body-sm text-on-surface font-semibold">
                      Store Associate / Cashier
                    </span>
                    <span className="font-label-sm text-[9px] bg-surface-container text-on-surface-variant px-1 rounded font-bold">
                      TIER 1 (Worker)
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    Fast-tender POS, local inventory lookup, receipt voiding &amp; scan counts
                  </span>
                </div>
              </div>

              {/* Role Badge 2: System Administrator */}
              <div className="flex items-start gap-space-xs bg-surface-container-lowest p-space-xs rounded">
                <div className="mt-0.5 text-primary">
                  <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline-sm text-body-sm text-on-surface font-semibold">
                      Store Owner / Admin
                    </span>
                    <span className="font-label-sm text-[9px] bg-primary text-on-primary px-1 rounded font-bold">
                      ROOT TIER 3 (Owner)
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    Global multi-store ledger, pricing catalog, sync conflict arbitration &amp; staff audit
                  </span>
                </div>
              </div>
            </div>

            {/* Security Micro-Metric & Terminal Security Disclaimer */}
            <div className="mt-space-md flex flex-col gap-1 text-center">
              <div className="flex items-center justify-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[14px] text-tertiary-container">encrypted</span>
                <span>FIPS 140-2 Level 3 Secure Enclave Attested</span>
              </div>
              <p className="font-body-sm text-[11px] leading-tight text-outline">
                Unauthorized access attempts are logged with terminal MAC ID and IP telemetry. Offline transactions auto-reconcile on network restoration.
              </p>
            </div>
          </div>

          {/* Operational Footer Controls */}
          <div className="w-full flex items-center justify-between mt-space-md px-space-xs text-on-surface-variant">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
              <span>
                Terminal ID: <strong className="text-on-surface font-mono">ClothStock V1</strong>
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
