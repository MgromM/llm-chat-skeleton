'use client';

import Link from 'next/link';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useLocale } from '@/lib/LocaleContext';
import { BrandLogo } from './BrandLogo';
import { ReviewQueueBell } from './ReviewQueueBell';

export function BrandHeader() {
  const { user, logout } = useAuth();
  const { t } = useLocale();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between rounded-2xl bg-brand-dark px-6 shadow-soft">
      <Link href="/chat" className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-white px-3 py-1.5">
          <BrandLogo size="sm" />
        </div>
      </Link>
      {user && (
        <div className="flex items-center gap-2 overflow-x-auto sm:gap-3">
          <span className="hidden rounded-lg bg-brand-white/95 px-2.5 py-1 text-sm text-brand-dark sm:inline">
            {user.email} <span className="text-brand-muted">· {user.role}</span>
          </span>
          <ReviewQueueBell />
          {user.role === 'admin' && (
            <Link
              href="/admin"
              aria-label={t('header.admin')}
              title={t('header.admin')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
            >
              <ShieldCheck size={15} />
            </Link>
          )}
          <button
            onClick={logout}
            aria-label={t('header.logout')}
            title={t('header.logout')}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg border border-brand-white/30 px-3 text-sm font-medium text-brand-white transition hover:bg-brand-white/10"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">{t('header.logout')}</span>
          </button>
        </div>
      )}
    </header>
  );
}
