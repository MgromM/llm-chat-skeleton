'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '@/lib/LocaleContext';

const SHORTCUTS: { keys: string; labelPl: string; labelEn: string }[] = [
  { keys: 'Cmd/Ctrl + K', labelPl: 'Otwórz listę rozmów i przejdź do wyszukiwania', labelEn: 'Open the conversation list and jump to search' },
  { keys: 'Cmd/Ctrl + Shift + O', labelPl: 'Nowa rozmowa', labelEn: 'New conversation' },
  { keys: 'Cmd/Ctrl + B', labelPl: 'Pokaż/ukryj panel boczny', labelEn: 'Toggle the sidebar' },
  { keys: 'Cmd/Ctrl + /', labelPl: 'Ustaw kursor w polu wiadomości', labelEn: 'Focus the message input' },
  { keys: 'Shift + /', labelPl: 'Pokaż ten panel skrótów', labelEn: 'Show this shortcuts panel' },
  { keys: 'Esc', labelPl: 'Zamknij panel boczny lub odfokusuj pole', labelEn: 'Close the sidebar or blur the focused field' },
  { keys: 'Enter', labelPl: 'Wyślij wiadomość', labelEn: 'Send message' },
  { keys: 'Shift + Enter', labelPl: 'Nowa linia w wiadomości', labelEn: 'New line in message' },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { locale } = useLocale();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-brand-white p-5 shadow-soft dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-dark dark:text-zinc-100">
            {locale === 'pl' ? 'Skróty klawiszowe' : 'Keyboard shortcuts'}
          </h2>
          <button
            onClick={onClose}
            aria-label={locale === 'pl' ? 'Zamknij' : 'Close'}
            className="text-brand-dark/50 hover:text-brand-dark dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <X size={18} />
          </button>
        </div>
        <ul className="space-y-2.5">
          {SHORTCUTS.map((s) => (
            <li key={s.keys} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-brand-dark/80 dark:text-zinc-300">{locale === 'pl' ? s.labelPl : s.labelEn}</span>
              <kbd className="shrink-0 rounded-md border border-brand-border bg-brand-surface/60 px-2 py-1 font-mono text-xs text-brand-dark dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
