'use client';

import { useState } from 'react';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleLogin() {
    setError(null);
    try {
      const { url } = await api.googleLoginUrl();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd logowania przez Google');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-brand-border bg-brand-white shadow-soft">
        <div className="h-1.5 bg-brand-orange" />
        <div className="p-8">
        <Image src="/logo.png" alt="Logo" width={168} height={27} priority className="mb-8 h-6 w-auto" />
        <h1 className="mb-1 text-xl font-bold text-brand-dark">Zaloguj się</h1>
        <p className="mb-6 text-sm text-brand-muted">Wewnętrzny asystent AI dla zespołu Sales&amp;More.</p>

        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand-border text-sm font-medium text-brand-dark transition hover:bg-brand-surface"
        >
          Zaloguj się przez Google
        </button>
        </div>
      </div>
    </div>
  );
}
