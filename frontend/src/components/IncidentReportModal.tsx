'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';

const SEVERITIES = [
  { value: 'low', label: 'Niska' },
  { value: 'medium', label: 'Średnia' },
  { value: 'high', label: 'Wysoka' },
  { value: 'critical', label: 'Krytyczna' },
];

export function IncidentReportModal({ onClose }: { onClose: () => void }) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.reportIncident({ description: description.trim(), severity, screenshot });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zgłosić incydentu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-brand-white p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-dark">Zgłoś incydent</h2>
          <button onClick={onClose} aria-label="Zamknij" className="text-brand-muted hover:text-brand-dark">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div>
            <p className="mb-4 text-sm text-brand-dark">
              Dziękujemy — zgłoszenie zostało zapisane i trafi do przeglądu compliance.
            </p>
            <button
              onClick={onClose}
              className="rounded-md bg-brand-orange px-4 py-2 text-sm font-bold text-brand-white hover:brightness-95"
            >
              Zamknij
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Opis sytuacji</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className="w-full rounded-md border border-brand-border px-3 py-2 text-sm text-brand-dark"
                placeholder="Co się stało?"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Przewidywana waga</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-md border border-brand-border px-3 py-2 text-sm text-brand-dark"
              >
                {SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-brand-muted">Zrzut ekranu (opcjonalnie)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-brand-dark"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !description.trim()}
              className="w-full rounded-md bg-brand-orange px-4 py-2 text-sm font-bold text-brand-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Wysyłanie…' : 'Zgłoś'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
