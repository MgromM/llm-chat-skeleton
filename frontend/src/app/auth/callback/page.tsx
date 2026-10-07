'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

const ERROR_MESSAGES: Record<string, string> = {
  no_access: 'Nie masz konta w tym systemie. Poproś administratora o dostęp.',
};

function GoogleCallback() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get('token');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(ERROR_MESSAGES[errorParam] ?? 'Błąd logowania przez Google.');
      return;
    }
    if (!token) {
      setError('Brak tokenu logowania.');
      return;
    }

    localStorage.setItem('token', token);
    api
      .me()
      .then((user) => {
        login(token, user);
        router.replace('/chat');
      })
      .catch(() => {
        localStorage.removeItem('token');
        setError('Błąd logowania przez Google.');
      });
  }, [searchParams, router, login]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-brand-white p-8 text-center shadow-soft">
        {error ? (
          <>
            <p className="mb-4 text-sm text-red-700">{error}</p>
            <a href="/login" className="text-sm font-medium text-brand-red hover:underline">
              Wróć do logowania
            </a>
          </>
        ) : (
          <p className="text-sm text-brand-muted">Logowanie…</p>
        )}
      </div>
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense>
      <GoogleCallback />
    </Suspense>
  );
}
