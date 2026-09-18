'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Brain, MessageSquareText, Trash2 } from 'lucide-react';
import { api, ApiError, type MemoryFile } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { useAuth } from '@/lib/AuthContext';

const CONFIRM_PHRASE = 'USUŃ KONTO';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Lets a specialist see and control what Claude's cross-conversation
 * `memory` tool has saved about them — without this, memory is an invisible
 * black box the user can't inspect or correct.
 */
function MemorySection() {
  const [files, setFiles] = useState<MemoryFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  async function load() {
    try {
      setFiles(await api.listMemoryFiles());
    } catch {
      setError('Nie udało się wczytać pamięci.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDeleteFile(id: number) {
    try {
      await api.deleteMemoryFile(id);
      await load();
    } catch {
      setError('Nie udało się usunąć wpisu.');
    }
  }

  async function handleClearAll() {
    if (!window.confirm('Usunąć wszystko, co asystent zapamiętał o Tobie? Tej operacji nie można cofnąć.')) return;
    setClearing(true);
    try {
      await api.clearMemory();
      await load();
    } catch {
      setError('Nie udało się wyczyścić pamięci.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-brand-border bg-brand-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-brand-dark">
          <Brain size={18} className="text-brand-orange" />
          Co asystent o Tobie pamięta
        </div>
        {files && files.length > 0 && (
          <button
            onClick={handleClearAll}
            disabled={clearing}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {clearing ? 'Czyszczenie…' : 'Wyczyść wszystko'}
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-brand-dark/60">
        Asystent może zapisywać sobie trwałe notatki (preferencje, ustalenia), które pamięta w kolejnych rozmowach.
        Widoczne są tylko dla Ciebie — możesz je w każdej chwili przejrzeć lub usunąć.
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {files === null ? (
        <p className="text-sm text-brand-dark/50">Ładowanie…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-brand-dark/50">Asystent nic jeszcze o Tobie nie zapamiętał.</p>
      ) : (
        <ul className="divide-y divide-brand-border/60">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-brand-dark">{f.path}</div>
                <div className="text-xs text-brand-dark/40">
                  {formatSize(f.size_bytes)} · zaktualizowano {new Date(f.updated_at).toLocaleDateString('pl-PL')}
                </div>
              </div>
              <button
                onClick={() => handleDeleteFile(f.id)}
                aria-label={`Usuń wpis ${f.path}`}
                className="shrink-0 text-brand-dark/40 hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Lets a specialist set a personal default system prompt (role/context, how
 * they want the assistant to respond) that's automatically applied to every
 * one of their conversations, on top of whatever they add per-chat.
 */
function DefaultSystemPromptSection() {
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((me) => setValue(me.defaultSystemPrompt ?? ''))
      .catch(() => setError('Nie udało się wczytać ustawienia.'))
      .finally(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await api.updateDefaultSystemPrompt(value.trim() || null);
      setSavedAt(Date.now());
    } catch {
      setError('Nie udało się zapisać.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-8 rounded-xl border border-brand-border bg-brand-white p-5">
      <div className="mb-2 flex items-center gap-2 font-semibold text-brand-dark">
        <MessageSquareText size={18} className="text-brand-orange" />
        Domyślny kontekst dla asystenta
      </div>
      <p className="mb-4 text-sm text-brand-dark/60">
        Opisz kim jesteś i jak asystent ma Ci odpowiadać (np. rola, branża, styl odpowiedzi). Ten kontekst będzie
        automatycznie dołączany do każdej Twojej rozmowy — a w danej rozmowie możesz go dodatkowo uzupełnić przez
        &quot;Dodaj prompt systemowy&quot;.
      </p>
      {!loaded ? (
        <p className="text-sm text-brand-dark/50">Ładowanie…</p>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            placeholder="Np. Jestem specjalistą ds. kampanii Meta Ads dla klientów e-commerce. Odpowiadaj konkretnie, z liczbami, po polsku."
            className="mb-3 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark outline-none focus:border-brand-orange"
          />
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            {savedAt && !saving && <span className="text-sm text-brand-dark/50">Zapisano.</span>}
          </div>
        </>
      )}
    </div>
  );
}

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

        <DefaultSystemPromptSection />
        <MemorySection />

        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5">
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
