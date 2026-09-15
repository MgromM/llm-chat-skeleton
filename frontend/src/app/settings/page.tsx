'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { useAuth } from '@/lib/AuthContext';

const CONFIRM_PHRASE = 'USUŃ KONTO';

function SettingsView() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText !== CONFIRM_PHRASE) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount();
      logout();
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się usunąć konta.');
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <BrandHeader />
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="mb-1 text-xl font-bold text-brand-dark">Ustawienia konta</h1>
        <p className="mb-8 text-sm text-brand-dark/60">Zalogowano jako {user?.email}</p>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="mb-2 flex items-center gap-2 font-semibold text-red-700">
            <AlertTriangle size={18} />
            Usuń konto i wszystkie dane
          </div>
          <p className="mb-4 text-sm text-red-700/90">
            Ta operacja trwale usunie Twoje konto, wszystkie rozmowy, wiadomości i załączniki. Tej operacji nie
            można cofnąć.
          </p>
          <label className="mb-1 block text-sm text-red-700/90">
            Wpisz <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span>, aby potwierdzić:
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mb-3 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-brand-dark outline-none focus:border-red-500"
          />
          {error && <p className="mb-3 text-sm text-red-700">{error}</p>}
          <button
            onClick={handleDelete}
            disabled={confirmText !== CONFIRM_PHRASE || deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? 'Usuwanie…' : 'Usuń konto trwale'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsView />
    </RequireAuth>
  );
}
