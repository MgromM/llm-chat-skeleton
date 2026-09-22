'use client';

import { useState } from 'react';
import { Share2, Check, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/LocaleContext';

/**
 * Whole-conversation public share link (Claude.ai's "Share chat"), self-
 * contained so it doesn't need to plug into ChatView's own state — it just
 * asks the backend for a token on click and shows the resulting link.
 * Doesn't reflect a conversation's already-shared state on load (the list/
 * detail endpoints don't return `share_token` yet), so a freshly reopened
 * conversation always starts this control from "Udostępnij" even if a link
 * was issued earlier; the existing link keeps working either way.
 */
export function ShareConversationButton({
  conversationId,
  isTemporary,
}: {
  conversationId: number | null;
  isTemporary?: boolean;
}) {
  const { t, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  async function handleOpen() {
    if (!conversationId) return;
    setOpen(true);
    if (shareToken) return;
    setBlockedReason(null);
    setLoading(true);
    try {
      const { shareToken: token } = await api.shareConversation(conversationId);
      setShareToken(token);
    } catch (err) {
      if (err instanceof ApiError && err.message === 'flagged_conversation_not_shareable') {
        setBlockedReason(
          locale === 'pl'
            ? 'Tej rozmowy nie można udostępnić — została oznaczona przez system wykrywania wycieków danych jako zawierająca treści wrażliwe.'
            : 'This conversation cannot be shared — it was flagged by the leak-detection system as containing sensitive content.',
        );
      } else if (err instanceof ApiError && err.message === 'temporary_conversation_not_shareable') {
        setBlockedReason(
          locale === 'pl'
            ? 'Rozmów incognito/tymczasowych nie można udostępniać publicznym linkiem.'
            : 'Temporary/incognito conversations cannot be shared via a public link.',
        );
      } else {
        setBlockedReason(locale === 'pl' ? 'Nie udało się utworzyć linku.' : 'Failed to create the share link.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    if (!conversationId) return;
    setLoading(true);
    try {
      await api.unshareConversation(conversationId);
      setShareToken(null);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard permission can be denied — the link is still shown/selectable
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!conversationId) return null;
  const shareUrl = shareToken ? `${window.location.origin}/c/${shareToken}` : '';

  if (isTemporary) {
    return (
      <span
        className="flex items-center gap-1.5 text-brand-dark/30 dark:text-zinc-600"
        title={
          locale === 'pl'
            ? 'Rozmów incognito/tymczasowych nie można udostępniać publicznym linkiem.'
            : 'Temporary/incognito conversations cannot be shared via a public link.'
        }
      >
        <Share2 size={14} />
        {t('chat.share')}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-brand-dark/60 dark:text-zinc-400 hover:text-brand-dark dark:hover:text-zinc-100"
      >
        <Share2 size={14} />
        {t('chat.share')}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-brand-border bg-brand-white p-3 shadow-soft dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-dark/70 dark:text-zinc-300">
              {t('chat.share')}
            </span>
            <button onClick={() => setOpen(false)} className="text-brand-muted hover:text-brand-dark dark:text-zinc-400 dark:hover:text-zinc-100">
              <X size={14} />
            </button>
          </div>
          {loading && !shareToken ? (
            <div className="text-sm text-brand-muted dark:text-zinc-400">{locale === 'pl' ? 'Generowanie linku…' : 'Generating link…'}</div>
          ) : blockedReason && !shareToken ? (
            <div className="text-sm text-red-600 dark:text-red-400">{blockedReason}</div>
          ) : (
            <>
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="mb-2 w-full rounded-md border border-brand-border bg-brand-surface/30 px-2 py-1.5 text-xs text-brand-dark dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(shareUrl)}
                  className="flex-1 rounded-md bg-brand-orange px-2 py-1.5 text-xs font-medium text-brand-white hover:brightness-95"
                >
                  {copied ? <Check size={12} className="mx-auto" /> : t('chat.shareCopy')}
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={loading}
                  className="flex-1 rounded-md border border-red-300 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  {t('chat.shareRevoke')}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
