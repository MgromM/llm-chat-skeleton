'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, MessageSquareText, SunMoon, Languages } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import { useLocale, type Locale } from '@/lib/LocaleContext';

function ThemeSection() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useLocale();

  return (
    <div className="rounded-xl border border-brand-border bg-brand-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 font-semibold text-brand-dark dark:text-zinc-100">
        <SunMoon size={18} className="text-brand-red" />
        {t('settings.theme.title')}
      </div>
      <p className="mb-4 text-sm text-brand-muted dark:text-zinc-400">{t('settings.theme.desc')}</p>
      <button
        onClick={toggleTheme}
        className="flex items-center gap-2 rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-surface/60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {theme === 'dark' ? `☀️ ${t('settings.theme.toLight')}` : `🌙 ${t('settings.theme.toDark')}`}
      </button>
    </div>
  );
}

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'pl', label: 'Polski' },
  { value: 'en', label: 'English' },
];

function LanguageSection() {
  const { locale, setLocale, t } = useLocale();

  return (
    <div className="mt-8 rounded-xl border border-brand-border bg-brand-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 font-semibold text-brand-dark dark:text-zinc-100">
        <Languages size={18} className="text-brand-red" />
        {t('settings.language.title')}
      </div>
      <p className="mb-4 text-sm text-brand-muted dark:text-zinc-400">{t('settings.language.desc')}</p>
      <div className="flex gap-2">
        {LOCALE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setLocale(opt.value)}
            className={
              opt.value === locale
                ? 'rounded-lg bg-brand-red px-4 py-2 text-sm font-medium text-brand-white'
                : 'rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-surface/60 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-800'
            }
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const CONFIRM_PHRASE = 'USUŃ KONTO';

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
    <div className="mt-8 rounded-xl border border-brand-border bg-brand-white p-5 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 font-semibold text-brand-dark dark:text-zinc-100">
        <MessageSquareText size={18} className="text-brand-red" />
        Domyślny kontekst dla asystenta
      </div>
      <p className="mb-4 text-sm text-brand-muted dark:text-zinc-400">
        Opisz kim jesteś i jak asystent ma Ci odpowiadać (np. rola, branża, styl odpowiedzi). Ten kontekst będzie
        automatycznie dołączany do każdej Twojej rozmowy — a w danej rozmowie możesz go dodatkowo uzupełnić przez
        &quot;Dodaj prompt systemowy&quot;.
      </p>
      {!loaded ? (
        <p className="text-sm text-brand-muted dark:text-zinc-400">Ładowanie…</p>
      ) : (
        <>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            placeholder="Np. Jestem specjalistą ds. obsługi klienta w dziale sprzedaży. Odpowiadaj konkretnie, z liczbami, po polsku."
            className="mb-3 w-full rounded-lg border border-brand-border bg-white px-3 py-2 text-sm text-brand-dark outline-none focus:border-brand-red dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-brand-red px-4 py-2 text-sm font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Zapisywanie…' : 'Zapisz'}
            </button>
            {savedAt && !saving && <span className="text-sm text-brand-muted dark:text-zinc-400">Zapisano.</span>}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsView() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
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
    <div className="flex h-screen flex-col bg-brand-white dark:bg-zinc-950">
      <BrandHeader />
      <div className="mx-auto w-full max-w-xl px-6 py-10">
        <h1 className="mb-1 text-xl font-bold text-brand-dark dark:text-zinc-100">{t('settings.title')}</h1>
        <p className="mb-8 text-sm text-brand-muted dark:text-zinc-400">
          {t('settings.loggedInAs')} {user?.email}
        </p>

        <ThemeSection />
        <LanguageSection />
        <DefaultSystemPromptSection />

        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="mb-2 flex items-center gap-2 font-semibold text-red-700 dark:text-red-400">
            <AlertTriangle size={18} />
            {t('settings.deleteAccount.title')}
          </div>
          <p className="mb-4 text-sm text-red-700/90 dark:text-red-400/90">
            Ta operacja trwale usunie Twoje konto, wszystkie rozmowy, wiadomości i załączniki. Tej operacji nie
            można cofnąć.
          </p>
          <label className="mb-1 block text-sm text-red-700/90 dark:text-red-400/90">
            Wpisz <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span>, aby potwierdzić:
          </label>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mb-3 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm text-brand-dark outline-none focus:border-red-500 dark:border-red-900/50 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {error && <p className="mb-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
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
