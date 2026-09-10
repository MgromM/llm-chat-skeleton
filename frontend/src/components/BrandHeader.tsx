'use client';

import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/AuthContext';

export function BrandHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between bg-brand-dark px-6 py-4 font-extrabold tracking-wide text-brand-white">
      <span>
        SALES<span className="text-brand-orange">&amp;</span>MORE — LLM
      </span>
      {user && (
        <span className="flex items-center gap-3 text-sm font-normal">
          {user.email} ({user.role})
          <button
            onClick={logout}
            className={clsx(
              'flex items-center gap-1 rounded-md bg-brand-orange px-3 py-1.5 font-bold text-brand-white',
              'hover:brightness-95',
            )}
          >
            <LogOut size={16} />
            Wyloguj
          </button>
        </span>
      )}
    </header>
  );
}
