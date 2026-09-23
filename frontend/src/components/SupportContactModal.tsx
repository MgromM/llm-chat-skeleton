'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '@/lib/LocaleContext';
import { api, ApiError } from '@/lib/api';

const MAX_LENGTH = 4000;

export function SupportContactModal({ conversationId, onClose }: { conversationId?: string | null; onClose: () => void }) {
  const { locale } = useLocale();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    textareaRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  async function handleSubmit() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendSupportMessage(message.trim(), conversationId);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (locale === 'pl' ? 'Nie udało się wysłać wiadomości.' : 'Failed to send the message.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-brand-white p-5 shadow-soft dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="support-modal-title" className="text-sm font-semibold uppercase tracking-wide text-brand-dark dark:text-zinc-100">
            {locale === 'pl' ? 'Kontakt z supportem' : 'Contact support'}
          </h2>
          <button
            onClick={onClose}
            aria-label={locale === 'pl' ? 'Zamknij' : 'Close'}
            className="text-brand-muted hover:text-brand-dark dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <p className="text-sm text-brand-dark/80 dark:text-zinc-300">
            {locale === 'pl'
              ? 'Dziękujemy, wiadomość została wysłana do supportu. Odpowiemy najszybciej jak to możliwe.'
              : 'Thanks, your message has been sent to support. We will get back to you as soon as possible.'}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm text-brand-dark/70 dark:text-zinc-300">
              {locale === 'pl'
                ? 'Opisz problem lub pytanie — wiadomość trafi bezpośrednio do zespołu supportu.'
                : 'Describe your issue or question — your message will go straight to the support team.'}
            </p>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_LENGTH}
              rows={5}
              placeholder={locale === 'pl' ? 'Twoja wiadomość...' : 'Your message...'}
              className="w-full resize-none rounded-lg border border-brand-border bg-brand-surface/30 p-3 text-sm text-brand-dark outline-none focus:border-brand-orange dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
            />
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                disabled={sending}
                className="rounded-full border border-brand-dark/20 px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-surface/60 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {locale === 'pl' ? 'Anuluj' : 'Cancel'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={sending || !message.trim()}
                className="rounded-full bg-brand-orange px-4 py-2 text-sm font-medium text-brand-white hover:brightness-95 disabled:opacity-50"
              >
                {sending ? (locale === 'pl' ? 'Wysyłanie…' : 'Sending…') : (locale === 'pl' ? 'Wyślij' : 'Send')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
