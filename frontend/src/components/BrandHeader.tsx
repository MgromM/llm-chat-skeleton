'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { LogOut, FileCode2, Settings, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { IncidentReportModal } from './IncidentReportModal';

export function BrandHeader() {
  const { user, logout } = useAuth();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between rounded-2xl bg-brand-orange px-6 shadow-soft">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-white px-3 py-1.5">
          <Image src="/logo-salesmore.png" alt="Sales&More" width={140} height={23} priority className="h-5 w-auto" />
        </div>
        <span className="hidden text-sm font-medium text-brand-white/90 sm:inline">LLM</span>
      </div>
      {user && (
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-brand-white/90 sm:inline">
            {user.email} <span className="text-brand-white/60">· {user.role}</span>
          </span>
          <button
            onClick={() => setReportOpen(true)}
            aria-label="Zgłoś incydent"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <AlertTriangle size={15} />
          </button>
          <Link
            href="/code"
            aria-label="Kod i wygenerowane pliki"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <FileCode2 size={15} />
          </Link>
          <Link
            href="/settings"
            aria-label="Ustawienia konta"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-brand-white/30 text-brand-white transition hover:bg-brand-white/10"
          >
            <Settings size={15} />
          </Link>
          <button
            onClick={logout}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-brand-white/30 px-3 text-sm font-medium text-brand-white transition hover:bg-brand-white/10"
          >
            <LogOut size={15} />
            Wyloguj
          </button>
        </div>
      )}
      {reportOpen && <IncidentReportModal onClose={() => setReportOpen(false)} />}
    </header>
  );
}
