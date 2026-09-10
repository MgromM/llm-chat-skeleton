'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
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

  return (
    <div className="mx-auto mt-24 grid max-w-sm gap-4 px-4">
      <h1 className="text-2xl font-extrabold text-brand-dark">
        SALES<span className="text-brand-orange">&amp;</span>MORE
      </h1>
      <form onSubmit={handleSubmit} className="grid gap-3">
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md border border-brand-dark px-3 py-2"
        />
        <input
          type="password"
          placeholder="Hasło"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-md border border-brand-dark px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95 disabled:opacity-60"
        >
          {submitting ? 'Logowanie…' : 'Zaloguj'}
        </button>
      </form>
    </div>
  );
}
