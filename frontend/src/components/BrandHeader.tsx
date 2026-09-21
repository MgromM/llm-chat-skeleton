'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogOut, FileCode2, Settings, AlertTriangle, Keyboard } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useLocale } from '@/lib/LocaleContext';
import { IncidentReportModal } from './IncidentReportModal';
import { ShortcutsModal } from './ShortcutsModal';

export function BrandHeader() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
  const [reportOpen, setReportOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
      if (!typing && e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between rounded-2xl bg-brand-orange px-6 shadow-soft">
      <Link href="/chat" className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-white px-3 py-1.5">
          <Image src="/logo-salesmore.png" alt="Sales&More" width={140} height={23} priority className="h-5 w-auto" />
        </div>
        <span className="hidden text-sm font-medium text-brand-white/90 sm:inline">LLM</span>
      </Link>
      {user && (
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-brand-white/90 sm:inline">
            {user.email} <span className="text-brand-white/60">· {user.role}</span>
          </span>
          <button
            onClick={() => setShortcutsOpen(true)}
            aria-label={t('header.shortcuts')}
            title={t('header.shortcuts')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <Keyboard size={15} />
          </button>
          <button
            onClick={() => setReportOpen(true)}
            aria-label={t('header.incident')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <AlertTriangle size={15} />
          </button>
          <Link
            href="/code"
            aria-label={t('header.code')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <FileCode2 size={15} />
          </Link>
          <Link
            href="/settings"
            aria-label={t('header.settings')}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <Settings size={15} />
          </Link>
          <button
            onClick={logout}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-white/30 px-3 text-sm font-medium text-brand-white transition hover:bg-brand-white/10"
          >
            <LogOut size={15} />
            {t('header.logout')}
          </button>
        </div>
      )}
      {reportOpen && <IncidentReportModal onClose={() => setReportOpen(false)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </header>
  );
}
