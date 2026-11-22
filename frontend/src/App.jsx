import { useAuth } from './context';
import AppRoutes from './routes';

function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-on-primary shadow-sm animate-pulse">
            <span className="material-symbols-outlined text-[22px]">hub</span>
          </div>
          <span className="font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase font-semibold">
            Connecting to Local Node...
          </span>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
}

export default App;

