'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, FileCode2 } from 'lucide-react';
import { api, ApiError, type GeneratedFileEntry } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * Cross-conversation history of every file Claude generated via
 * `code_execution` (charts, .xlsx reports, etc.) — without this, finding a
 * report made a few conversations ago means scrolling back through chat
 * history looking for the download chip.
 */
export default function CodePage() {
  const [files, setFiles] = useState<GeneratedFileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listGeneratedFiles()
      .then(setFiles)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nie udało się wczytać listy plików.'));
  }, []);

  return (
    <RequireAuth>
      <div className="mx-auto flex h-screen max-w-4xl flex-col gap-4 p-4">
        <BrandHeader />
        <div className="flex-1 overflow-y-auto rounded-2xl bg-brand-white p-6 shadow-soft">
          <div className="mb-5 flex items-center gap-2 font-display text-lg font-semibold text-brand-dark">
            <FileCode2 size={20} className="text-brand-orange" />
            Kod i wygenerowane pliki
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {files === null && !error && (
            <div className="flex flex-col items-center gap-3 py-16 text-brand-muted">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-border border-t-brand-orange" />
              <p className="text-sm">Wczytywanie…</p>
            </div>
          )}

          {files !== null && files.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-orange/10">
                <FileCode2 size={26} className="text-brand-orange" />
              </div>
              <p className="max-w-sm text-sm text-brand-muted">
                Tu pojawią się pliki, które asystent wygeneruje dla Ciebie w czacie (np. przez uruchomienie kodu i
                eksport raportu do .csv/.xlsx).
              </p>
            </div>
          )}

          {files !== null && files.length > 0 && (
            <ul className="flex flex-col divide-y divide-brand-border">
              {files.map((f) => (
                <li key={f.fileId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <a
                      href={api.generatedFileUrl(f.fileId)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 truncate text-sm font-medium text-brand-dark hover:text-brand-orange"
                    >
                      <Download size={15} className="shrink-0 text-brand-orange" />
                      <span className="truncate">{f.filename}</span>
                    </a>
                    <div className="mt-0.5 truncate text-xs text-brand-muted">
                      <Link href={`/chat?conversation=${f.conversationId}`} className="hover:text-brand-orange hover:underline">
                        {f.conversationTitle?.trim() || `Rozmowa #${f.conversationId}`}
                      </Link>
                      {' · '}
                      {formatDate(f.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-brand-muted">{formatSize(f.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
