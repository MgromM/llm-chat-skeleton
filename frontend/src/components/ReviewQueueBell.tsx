'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { api, type ReviewItem } from '@/lib/api';
import { useLocale, type TranslationKey } from '@/lib/LocaleContext';

/**
 * Bell icon + unread badge for the shared review queue (migration 034
 * review_items / backend/src/routes/reviewItems.routes.js). Visible to
 * every logged-in employee regardless of role -- unlike LeakAlertsSection
 * on the admin page, this isn't a compliance tool restricted to
 * managers/admins, so it's mounted directly in BrandHeader instead of
 * behind the `user.role === 'admin'` gate.
 */
export function ReviewQueueBell() {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const { data: countData, mutate: mutateCount } = useSWR(
    '/review-items/unread-count',
    () => api.reviewItemsUnreadCount(),
    { refreshInterval: 60_000 },
  );
  // Only fetches while the dropdown is actually open -- `null` as the SWR
  // key skips the request entirely.
  const { data: listData, mutate: mutateList } = useSWR(
    open ? '/review-items?reviewed=false' : null,
    () => api.listReviewItems(true),
  );

  const count = countData?.count ?? 0;
  const items = listData?.items ?? [];

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onClickOutside);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  async function handleReview(id: number) {
    setReviewingId(id);
    try {
      await api.reviewReviewItem(id);
      await Promise.all([mutateList(), mutateCount()]);
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('header.reviewQueue')}
        title={t('header.reviewQueue')}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
      >
        <Bell size={15} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-semibold leading-none text-brand-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-96 max-h-[70vh] overflow-y-auto rounded-xl border border-brand-border bg-brand-white p-1 shadow-soft dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase text-brand-muted dark:text-zinc-400">
            {t('reviewQueue.title')}
          </div>
          <div className="space-y-2 p-1">
            {items.map((item) => (
              <ReviewItemRow
                key={item.id}
                item={item}
                reviewing={reviewingId === item.id}
                onReview={() => handleReview(item.id)}
                t={t}
              />
            ))}
            {items.length === 0 && (
              <p className="p-3 text-sm text-brand-muted dark:text-zinc-400">{t('reviewQueue.empty')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewItemRow({
  item,
  reviewing,
  onReview,
  t,
}: {
  item: ReviewItem;
  reviewing: boolean;
  onReview: () => void;
  t: (key: TranslationKey) => string;
}) {
  const typeLabel = item.item_type === 'canteen_catalog' ? t('reviewQueue.typeCanteen') : t('reviewQueue.typeEmailComplaint');

  return (
    <div className="rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-full bg-brand-surface px-2.5 py-0.5 text-xs font-semibold text-brand-muted dark:bg-zinc-800 dark:text-zinc-400">
          {typeLabel}
        </span>
        <button
          onClick={onReview}
          disabled={reviewing}
          className="shrink-0 rounded-md border border-brand-border dark:border-zinc-700 px-2 py-1 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {reviewing ? t('reviewQueue.saving') : t('reviewQueue.markReviewed')}
        </button>
      </div>
      <p className="text-sm font-bold text-brand-dark dark:text-zinc-100">{item.title}</p>
      <p className="text-sm text-brand-muted dark:text-zinc-400">{item.rationale}</p>
      <p className="mt-1 text-xs">
        {item.source_url ? (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-red hover:underline"
          >
            {item.source_label}
          </a>
        ) : (
          <span className="text-brand-muted dark:text-zinc-400">{item.source_label}</span>
        )}
      </p>
      {item.confidence !== null && (
        <p className="mt-1 text-xs text-brand-muted dark:text-zinc-400">
          {t('reviewQueue.confidence')}: {item.confidence}
        </p>
      )}
      <p className="mt-1 text-xs text-brand-muted dark:text-zinc-400">{new Date(item.created_at).toLocaleString('pl-PL')}</p>
    </div>
  );
}
