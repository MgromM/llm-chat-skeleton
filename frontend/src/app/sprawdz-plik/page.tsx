'use client';

import { useCallback, useRef, useState } from 'react';
import { ShieldCheck, Upload, Loader2, AlertTriangle, XCircle, CheckCircle2 } from 'lucide-react';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { api, ApiError, type LocalCheckResponse } from '@/lib/api';

const LEVEL_STYLES: Record<string, { border: string; bg: string; text: string; icon: typeof CheckCircle2 }> = {
  zielona: { border: 'border-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300', icon: CheckCircle2 },
  żółta: { border: 'border-amber-300', bg: 'bg-amber-50 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300', icon: AlertTriangle },
  czerwona: { border: 'border-red-300', bg: 'bg-red-50 dark:bg-red-950/40', text: 'text-red-800 dark:text-red-300', icon: XCircle },
};

const LEVEL_LABELS: Record<string, string> = {
  zielona: 'Zielony — wygląda bezpiecznie',
  żółta: 'Żółty — uważaj',
  czerwona: 'Czerwony — nie wklejaj',
};

function LevelBadge({ level }: { level: string }) {
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.zielona;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium ${style.border} ${style.bg} ${style.text}`}>
      <Icon size={15} />
      {LEVEL_LABELS[level] ?? level}
    </span>
  );
}

export default function LocalFileCheckPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LocalCheckResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    setFiles((prev) => [...prev, ...Array.from(incoming)]);
    setResult(null);
    setError(null);
  }, []);

  async function runScan() {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.localCheckScan(files);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nie udało się przeprowadzić sprawdzenia.');
    } finally {
      setLoading(false);
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setResult(null);
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setError(null);
  }

  return (
    <RequireAuth>
      <div className="mx-auto flex h-screen max-w-3xl flex-col gap-4 p-4">
        <BrandHeader />

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-soft dark:bg-zinc-900">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-brand-orange" size={28} />
            <div>
              <h1 className="text-xl font-semibold text-brand-dark dark:text-white">Sprawdź plik przed wklejeniem do Claude</h1>
              <p className="mt-1 text-sm text-brand-muted dark:text-zinc-400">
                Wgraj plik(i), które chcesz wkleić do Claude, a sprawdzimy je pod kątem danych poufnych i osobowych —
                <strong> w całości lokalnie, na tym serwerze</strong>. Treść plików nie jest wysyłana do żadnego
                zewnętrznego API ani zapisywana — po sprawdzeniu jest od razu odrzucana.
              </p>
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
              dragOver ? 'border-brand-orange bg-orange-50 dark:bg-orange-950/20' : 'border-zinc-300 dark:border-zinc-700'
            }`}
          >
            <Upload size={28} className="text-brand-muted" />
            <p className="text-sm text-brand-dark dark:text-white">Przeciągnij pliki tutaj albo kliknij, aby wybrać</p>
            <p className="text-xs text-brand-muted">Obrazy (OCR), PDF, Word, Excel, PowerPoint, TXT/CSV/MD/JSON</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800"
                >
                  <span className="truncate text-brand-dark dark:text-zinc-200">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="ml-2 shrink-0 text-brand-muted hover:text-red-600">
                    <XCircle size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {files.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={runScan}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? 'Sprawdzam lokalnie…' : 'Sprawdź pliki'}
              </button>
              <button
                onClick={reset}
                disabled={loading}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-brand-dark transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Wyczyść
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-xl border p-4">
                <span className="text-sm font-medium text-brand-dark dark:text-white">Wynik ogólny</span>
                <LevelBadge level={result.overallLevel} />
              </div>

              {(result.overallLevel === 'żółta' || result.overallLevel === 'czerwona') && (
                <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${LEVEL_STYLES[result.overallLevel].border} ${LEVEL_STYLES[result.overallLevel].bg} ${LEVEL_STYLES[result.overallLevel].text}`}>
                  Odradzamy wklejanie tych plików do Claude bez wcześniejszej anonimizacji danych, które zostały niżej wskazane.
                </div>
              )}

              <div className="flex flex-col gap-3">
                {result.results.map((r, i) => (
                  <div key={`${r.filename}-${i}`} className={`rounded-xl border p-4 ${LEVEL_STYLES[r.level].border}`}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="truncate font-medium text-brand-dark dark:text-white">{r.filename}</span>
                      <LevelBadge level={r.level} />
                    </div>
                    <p className="text-sm text-brand-muted dark:text-zinc-400">{r.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
