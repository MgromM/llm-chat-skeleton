'use client';

import { useEffect, useRef } from 'react';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Anuluj',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  // Focus management: move focus into the dialog on open, and return it to
  // whatever triggered the dialog (e.g. the "Usuń" icon button) when it
  // closes — otherwise keyboard focus is silently dropped back to <body>.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-brand-white p-5 shadow-soft dark:bg-zinc-900"
      >
        <h2 id="confirm-dialog-title" className="text-base font-semibold text-brand-dark dark:text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 text-sm text-brand-dark/70 dark:text-zinc-300">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            disabled={loading}
            className="rounded-full border border-brand-dark/20 px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand-surface/60 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={
              danger
                ? 'rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50'
                : 'rounded-full bg-brand-orange px-4 py-2 text-sm font-medium text-brand-white hover:brightness-95 disabled:opacity-50'
            }
          >
            {loading ? 'Trwa…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
