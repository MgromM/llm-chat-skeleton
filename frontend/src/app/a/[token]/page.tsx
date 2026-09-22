'use client';

import { use, useEffect, useState } from 'react';
import { FileOutput } from 'lucide-react';
import { api, ApiError, type Artifact } from '@/lib/api';
import { ArtifactViewer } from '@/components/ArtifactViewer';

/**
 * Public, unauthenticated view of a shared artifact — reachable by anyone
 * with the link, no login required. Read-only: no edit tab, no share button.
 */
export default function PublicArtifactPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicArtifact(token)
      .then(setArtifact)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nie udało się wczytać artefaktu.'));
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <div className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-dark">
        <FileOutput size={16} className="text-brand-orange" />
        {artifact?.title ?? 'Artefakt'}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!artifact && !error && <p className="text-sm text-brand-muted">Ładowanie…</p>}
      {artifact && (
        <div className="flex flex-1 flex-col rounded-2xl border border-brand-border bg-brand-white p-4 shadow-sm">
          <ArtifactViewer artifact={artifact} />
        </div>
      )}
    </div>
  );
}
