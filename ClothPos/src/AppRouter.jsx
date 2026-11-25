import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router';
import { pos } from './api/pos';
import App from './App';
import CheckoutPage from './pages/CheckoutPage';
import CatalogBrowsePage from './pages/CatalogBrowsePage';
import OnboardingPage from './pages/OnboardingPage';
import SalesPage from './pages/SalesPage';
import SettingsPage from './pages/SettingsPage';

function OnboardingRoute() {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState({ type: 'checking' });

  useEffect(() => {
    let active = true;
    setStatus({ type: 'checking' });

    pos('is_initialized')
      .then(({ initialized }) => {
        if (!active) return;
        if (initialized) {
          navigate('/', { replace: true });
          return;
        }
        setStatus({ type: 'ready' });
      })
      .catch((err) => {
        if (active) {
          setStatus({
            type: 'error',
            message: err?.message || 'Failed to check terminal setup.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [attempt, navigate]);

  if (status.type === 'checking') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <span className="font-label-sm text-on-surface-variant tracking-wider uppercase font-semibold">
          Checking terminal setup...
        </span>
      </div>
    );
  }

  if (status.type === 'error') {
    return (
      <main className="min-h-screen bg-surface flex flex-col items-center justify-center gap-space-md p-space-lg">
        <p className="font-body-md text-error">{status.message}</p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="rounded-lg bg-primary px-space-lg py-space-sm text-on-primary"
        >
          Retry
        </button>
      </main>
    );
  }

  return <OnboardingPage />;
}

export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Navigate to="checkout" replace />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="products" element={<CatalogBrowsePage kind="products" />} />
          <Route path="variants" element={<CatalogBrowsePage kind="variants" />} />
          <Route path="categories" element={<CatalogBrowsePage kind="categories" />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="*" element={<Navigate to="/checkout" replace />} />
      </Routes>
    </HashRouter>
  );
}
