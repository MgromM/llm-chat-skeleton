'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user } = await api.login(email, password);
      login(token, user);
      router.push('/chat');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Błąd logowania');
    } finally {
      setSubmitting(false);
    }
  }

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
        <Image src="/logo-salesmore.png" alt="Sales&More" width={168} height={27} priority className="mb-8 h-6 w-auto" />
        <h1 className="mb-1 text-xl font-bold text-brand-dark">Zaloguj się</h1>
        <p className="mb-6 text-sm text-brand-muted">Wewnętrzny asystent AI dla zespołu Sales&amp;More.</p>

        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-brand-dark">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-lg border border-brand-border px-3 text-brand-dark outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-brand-dark">
              Hasło
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-lg border border-brand-border px-3 text-brand-dark outline-none transition focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 flex h-11 items-center justify-center rounded-lg bg-brand-orange text-sm font-bold text-brand-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Logowanie…' : 'Zaloguj'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-brand-muted">
          <div className="h-px flex-1 bg-brand-border" />
          lub
          <div className="h-px flex-1 bg-brand-border" />
        </div>

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
