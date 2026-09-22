'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogOut, FileCode2, Settings, AlertTriangle, Keyboard } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useLocale } from '@/lib/LocaleContext';
import { ShortcutsModal } from './ShortcutsModal';

// External incident-reporting tool (AI Policy Gate) — replaced the in-app
// modal so incidents land in the org's shared triage queue instead of this
// app's own (unmonitored) database table.
const INCIDENT_REPORT_URL = 'https://ai-policy-gate.vercel.app/incidents/new';

export function BrandHeader() {
  const { user, logout } = useAuth();
  const { t } = useLocale();
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
        <span className="hidden rounded-lg bg-brand-white/95 px-2 py-1 text-sm font-medium text-brand-dark sm:inline">LLM</span>
      </Link>
      {user && (
        <div className="flex items-center gap-3">
          <span className="hidden rounded-lg bg-brand-white/95 px-2.5 py-1 text-sm text-brand-dark sm:inline">
            {user.email} <span className="text-brand-muted">· {user.role}</span>
          </span>
          <button
            onClick={() => setShortcutsOpen(true)}
            aria-label={t('header.shortcuts')}
            title={t('header.shortcuts')}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <Keyboard size={15} />
          </button>
          <a
            href={INCIDENT_REPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('header.incident')}
            title={t('header.incident')}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <AlertTriangle size={15} />
          </a>
          <Link
            href="/code"
            aria-label={t('header.code')}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <FileCode2 size={15} />
          </Link>
          <Link
            href="/settings"
            aria-label={t('header.settings')}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <Settings size={15} />
          </Link>
          <button
            onClick={logout}
            className="flex h-11 items-center gap-1.5 rounded-lg border border-brand-white/30 px-3 text-sm font-medium text-brand-white transition hover:bg-brand-white/10"
          >
            <LogOut size={15} />
            {t('header.logout')}
          </button>
        </div>
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </header>
  );
}
