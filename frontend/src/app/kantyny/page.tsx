'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UtensilsCrossed, Upload, Loader2, Plus, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { useAuth } from '@/lib/AuthContext';
import {
  api,
  ApiError,
  type CanteenFacility,
  type CanteenProduct,
  type CanteenCatalogChange,
  type CanteenIngestResult,
} from '@/lib/api';

const STATUS_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof CheckCircle2; label: string }> = {
  ok: { border: 'border-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300', icon: CheckCircle2, label: 'Zaimportowano bez zastrzeżeń' },
  partial: { border: 'border-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', icon: AlertTriangle, label: 'Wymaga przeglądu' },
  failed: { border: 'border-red-300', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-800 dark:text-red-300', icon: XCircle, label: 'Import nieudany' },
};

const CHANGE_TYPE_LABELS: Record<string, string> = {
  added: 'Nowa pozycja',
  removed: 'Usunięto',
  price_changed: 'Zmiana ceny',
  reappeared: 'Pozycja wróciła',
};

function FacilityForm({ onCreated }: { onCreated: (f: CanteenFacility) => void }) {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const facility = await api.createCanteenFacility({ name: name.trim(), city: city.trim() || undefined });
      onCreated(facility);
      setName('');
      setCity('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się dodać placówki.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-border bg-brand-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nazwa placówki (np. AŚ Warszawa-Mokotów)"
        className="rounded-lg border border-brand-border bg-transparent px-3 py-1.5 text-sm text-brand-dark dark:border-zinc-700 dark:text-zinc-100"
      />
      <input
        value={city}
        onChange={(e) => setCity(e.target.value)}
        placeholder="Miasto (opcjonalnie)"
        className="rounded-lg border border-brand-border bg-transparent px-3 py-1.5 text-sm text-brand-dark dark:border-zinc-700 dark:text-zinc-100"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={saving || !name.trim()}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-red px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Dodaj placówkę
      </button>
    </div>
  );
}

function IngestResultCard({ result }: { result: CanteenIngestResult }) {
  const style = STATUS_STYLES[result.status] ?? STATUS_STYLES.failed;
  const Icon = style.icon;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border p-4 ${style.border} ${style.bg}`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${style.text}`}>
        <Icon size={16} />
        {style.label}
      </div>
      {typeof result.confidence === 'number' && (
        <p className="text-xs text-brand-muted dark:text-zinc-400">
          Pewność: {result.confidence.toFixed(2)} · {result.linesParsed}/{result.linesTotal} linii rozpoznanych
        </p>
      )}
      {result.error && <p className="text-sm text-red-700 dark:text-red-300">{result.error}</p>}
      {result.changes && result.changes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {result.changes.map((c) => (
            <li key={c.id} className="text-xs text-brand-dark dark:text-zinc-200">
              <span className="font-medium">{CHANGE_TYPE_LABELS[c.type] ?? c.type}</span>: {c.normalizedName}
              {c.flagged && <span className="ml-1 text-amber-700 dark:text-amber-400">— wstrzymano: {c.flagReason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingChangeRow({
  change,
  applying,
  onApply,
}: {
  change: CanteenCatalogChange;
  applying: boolean;
  onApply: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-brand-dark dark:text-zinc-100">
          {CHANGE_TYPE_LABELS[change.change_type] ?? change.change_type}: {change.display_name ?? change.normalized_name}
        </span>
        <button
          onClick={onApply}
          disabled={applying}
          className="shrink-0 rounded-md border border-brand-border bg-brand-white px-2 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand-surface disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {applying ? 'Zapisywanie…' : 'Zastosuj'}
        </button>
      </div>
      <p className="text-xs text-amber-800 dark:text-amber-300">{change.flag_reason}</p>
      {(change.old_price || change.new_price) && (
        <p className="mt-1 text-xs text-brand-muted dark:text-zinc-400">
          {change.old_price ? `${change.old_price} zł` : '—'} → {change.new_price ? `${change.new_price} zł` : '—'}
        </p>
      )}
    </div>
  );
}

export default function CanteenPage() {
  const { user } = useAuth();
  const canManage = user?.role === 'manager' || user?.role === 'admin';
  const inputRef = useRef<HTMLInputElement>(null);

  const [facilities, setFacilities] = useState<CanteenFacility[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [products, setProducts] = useState<CanteenProduct[]>([]);
  const [pendingChanges, setPendingChanges] = useState<CanteenCatalogChange[]>([]);
  const [ingestResult, setIngestResult] = useState<CanteenIngestResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCanteenFacilities()
      .then((rows) => {
        setFacilities(rows);
        if (rows.length > 0) setSelectedId((prev) => prev ?? rows[0].id);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Nie udało się wczytać placówek.'));
  }, []);

  const loadFacilityDetail = useCallback((facilityId: number) => {
    api.listCanteenProducts(facilityId).then(setProducts).catch(() => setProducts([]));
    api.listCanteenChanges(facilityId, true).then(setPendingChanges).catch(() => setPendingChanges([]));
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      setIngestResult(null);
      loadFacilityDetail(selectedId);
    }
  }, [selectedId, loadFacilityDetail]);

  async function handleUpload(file: File) {
    if (selectedId == null) return;
    setUploading(true);
    setIngestResult(null);
    try {
      const result = await api.uploadCanteenDocument(selectedId, file);
      setIngestResult(result);
      loadFacilityDetail(selectedId);
    } catch (err) {
      setIngestResult({ status: 'failed', runId: -1, error: err instanceof ApiError ? err.message : 'Import nie powiódł się.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleApply(changeId: number) {
    setApplyingId(changeId);
    try {
      await api.applyCanteenChange(changeId);
      if (selectedId != null) loadFacilityDetail(selectedId);
    } finally {
      setApplyingId(null);
    }
  }

  const selectedFacility = facilities.find((f) => f.id === selectedId) ?? null;

  return (
    <RequireAuth>
      <div className="mx-auto flex h-screen max-w-5xl flex-col gap-4 p-4">
        <BrandHeader />

        <div className="flex flex-1 gap-4 overflow-hidden">
          <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-soft dark:bg-zinc-900">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="text-brand-red" size={20} />
              <h1 className="text-sm font-semibold text-brand-dark dark:text-white">Placówki</h1>
            </div>
            {loadError && <p className="text-xs text-red-600 dark:text-red-400">{loadError}</p>}
            <ul className="flex flex-col gap-1">
              {facilities.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                      f.id === selectedId
                        ? 'bg-brand-red text-white'
                        : 'text-brand-dark hover:bg-brand-surface dark:text-zinc-200 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {f.name}
                    {f.city && <span className="block text-xs opacity-75">{f.city}</span>}
                  </button>
                </li>
              ))}
              {facilities.length === 0 && !loadError && (
                <p className="px-3 py-2 text-sm text-brand-muted dark:text-zinc-400">Brak placówek.</p>
              )}
            </ul>
            {canManage && <FacilityForm onCreated={(f) => { setFacilities((prev) => [...prev, f]); setSelectedId(f.id); }} />}
          </aside>

          <section className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-soft dark:bg-zinc-900">
            {!selectedFacility ? (
              <p className="text-sm text-brand-muted dark:text-zinc-400">Wybierz placówkę z listy po lewej.</p>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-brand-dark dark:text-white">{selectedFacility.name}</h2>
                  {selectedFacility.address && (
                    <p className="text-sm text-brand-muted dark:text-zinc-400">{selectedFacility.address}</p>
                  )}
                </div>

                {canManage && (
                  <div
                    onClick={() => inputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 p-6 text-center transition hover:border-brand-red dark:border-zinc-700"
                  >
                    {uploading ? <Loader2 size={24} className="animate-spin text-brand-muted" /> : <Upload size={24} className="text-brand-muted" />}
                    <p className="text-sm text-brand-dark dark:text-white">
                      {uploading ? 'Importowanie…' : 'Wgraj plik cennika kantyny'}
                    </p>
                    <p className="text-xs text-brand-muted">PDF, Word, Excel, TXT/CSV — zdjęcia/skany trafiają tu automatycznie z systemu OCR</p>
                    <input
                      ref={inputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                )}

                {ingestResult && <IngestResultCard result={ingestResult} />}

                {pendingChanges.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold uppercase text-brand-muted dark:text-zinc-400">
                      Zmiany oczekujące na potwierdzenie
                    </h3>
                    {pendingChanges.map((c) => (
                      <PendingChangeRow key={c.id} change={c} applying={applyingId === c.id} onApply={() => handleApply(c.id)} />
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold uppercase text-brand-muted dark:text-zinc-400">
                    Aktualny katalog ({products.length})
                  </h3>
                  {products.length === 0 ? (
                    <p className="text-sm text-brand-muted dark:text-zinc-400">Brak pozycji — wgraj pierwszy cennik powyżej.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-brand-border dark:border-zinc-700">
                      <table className="w-full text-sm">
                        <thead className="bg-brand-surface text-left text-xs uppercase text-brand-muted dark:bg-zinc-800 dark:text-zinc-400">
                          <tr>
                            <th className="px-3 py-2">Nazwa</th>
                            <th className="px-3 py-2">Cena</th>
                            <th className="px-3 py-2">Jednostka</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p) => (
                            <tr key={p.id} className="border-t border-brand-border dark:border-zinc-700">
                              <td className="px-3 py-2 text-brand-dark dark:text-zinc-100">{p.display_name}</td>
                              <td className="px-3 py-2 text-brand-dark dark:text-zinc-100">{p.price} zł</td>
                              <td className="px-3 py-2 text-brand-muted dark:text-zinc-400">{p.unit ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </RequireAuth>
  );
}
