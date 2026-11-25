import { useState } from 'react';
import { useNavigate } from 'react-router';
import { pos } from '../api/pos';

const MIN_PASSWORD_LEN = 8;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [storeCode, setStoreCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  function validate() {
    if (!storeCode.trim()) return 'Store code is required.';
    if (!username.trim()) return 'Username is required.';
    if (password.length < MIN_PASSWORD_LEN) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters.`;
    }
    if (password !== passwordConfirm) return 'Password confirmation does not match.';
    return '';
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const localError = validate();
    if (localError) {
      setErrorMessage(localError);
      return;
    }
    setErrorMessage('');
    setIsLoading(true);
    try {
      await pos('complete_onboarding', {
        storeCode: storeCode.trim(),
        username: username.trim(),
        password,
        passwordConfirm,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setErrorMessage(err.message || 'Onboarding failed. Check the network connection to ClothStock.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen flex items-center justify-center p-space-lg">
      <main className="w-full max-w-md">
        <div className="w-full bg-surface-container-lowest rounded-xl shadow-xl p-space-lg sm:p-space-xl flex flex-col relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full bg-secondary-container/10 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-44 h-44 rounded-full bg-tertiary-fixed-dim/15 blur-2xl pointer-events-none" />

          <div className="flex items-start justify-between gap-space-md mb-space-lg relative z-10">
            <div className="flex items-center gap-space-sm">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm">
                <span className="material-symbols-outlined text-[22px]">point_of_sale</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-sm text-on-surface font-bold tracking-tight">ClothPos</span>
                  <span className="font-label-sm uppercase bg-surface-container px-1.5 py-0.5 rounded text-secondary font-bold">
                    First launch
                  </span>
                </div>
                <span className="font-label-md text-on-surface-variant tracking-wider">
                  TERMINAL ENROLLMENT
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-surface-container-low px-2 py-1 rounded text-on-surface-variant font-label-sm">
              <span className="material-symbols-outlined text-[13px] text-secondary">verified_user</span>
              <span>TLS</span>
            </div>
          </div>

          <p className="font-body-sm text-on-surface-variant mb-space-md relative z-10">
            This screen appears once. After enrollment this terminal opens straight into checkout — no daily login.
          </p>

          {errorMessage && (
            <div className="mb-space-md bg-error-container text-on-error-container p-space-sm rounded-lg flex items-center gap-space-xs relative z-10">
              <span className="material-symbols-outlined text-[18px] text-error">error</span>
              <span className="font-body-sm flex-1">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-space-md relative z-10">
            <label className="flex flex-col gap-1">
              <span className="font-label-sm text-outline uppercase tracking-wider">Store code</span>
              <input
                value={storeCode}
                onChange={(e) => setStoreCode(e.target.value)}
                required
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                className="h-10 px-3 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
                placeholder="SOHO01"
              />
            </label>
            <p className="-mt-2 font-label-sm text-on-surface-variant">
              Enter the code of an existing store assigned to your ClothStock account.
            </p>
            <label className="flex flex-col gap-1">
              <span className="font-label-sm text-outline uppercase tracking-wider">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="h-10 px-3 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label-sm text-outline uppercase tracking-wider">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LEN}
                  autoComplete="new-password"
                  className="w-full h-10 pl-3 pr-10 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-label-sm text-outline uppercase tracking-wider">Confirm password</span>
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                minLength={MIN_PASSWORD_LEN}
                autoComplete="new-password"
                className="h-10 px-3 rounded-lg bg-surface-container-low text-on-surface focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </label>
            <button
              type="submit"
              disabled={isLoading}
              className="h-11 mt-1 rounded-lg bg-primary text-on-primary font-headline-sm disabled:opacity-50"
            >
              {isLoading ? 'Enrolling terminal…' : 'Enroll this terminal'}
            </button>
            <p className="font-label-sm text-outline text-center">
              Requires ClothStock at the configured API URL. Password is hashed with Argon2 locally; plaintext is never saved.
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
