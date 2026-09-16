'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Download, Trash2, Upload } from 'lucide-react';
import clsx from 'clsx';
import { api, apiFetch, type CostRow, type QualityRow, type EnterpriseComparison, type KnowledgeDocument } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';

function KnowledgeBaseSection() {
  const { data: documents, mutate } = useSWR<KnowledgeDocument[]>('/knowledge/documents', apiFetch);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadKnowledgeDocument(file);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload nie powiódł się');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDelete(id: number) {
    await api.deleteKnowledgeDocument(id);
    await mutate();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand-dark"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />Baza wiedzy</h2>
        <label className="flex cursor-pointer items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95">
          <Upload size={16} />
          {uploading ? 'Wgrywanie…' : 'Wgraj dokument'}
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv,.json,.pdf,.docx"
            className="hidden"
            disabled={uploading}
            onChange={handleUpload}
          />
        </label>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-brand-orange text-brand-white">
            <th className="p-2 text-left">Tytuł</th>
            <th className="p-2 text-left">Rozmiar</th>
            <th className="p-2 text-left">Fragmenty</th>
            <th className="p-2 text-left">Wgrał</th>
            <th className="p-2 text-left">Data</th>
            <th className="p-2 text-left"></th>
          </tr>
        </thead>
        <tbody>
          {(documents ?? []).map((doc, i) => (
            <tr key={doc.id} className={i % 2 === 0 ? 'bg-brand-white' : 'bg-brand-surface'}>
              <td className="p-2">{doc.title}</td>
              <td className="p-2">{Math.round(doc.size_bytes / 1024)} KB</td>
              <td className="p-2">{doc.chunk_count}</td>
              <td className="p-2">{doc.uploaded_by_email}</td>
              <td className="p-2">{new Date(doc.created_at).toLocaleDateString('pl-PL')}</td>
              <td className="p-2">
                <button onClick={() => handleDelete(doc.id)} className="text-brand-dark/60 hover:text-red-600" title="Usuń">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(documents ?? []).length === 0 && <p className="mt-2 text-sm text-brand-dark/70">Brak dokumentów w bazie wiedzy.</p>}
    </section>
  );
}

function AdminView() {
  const { data: costs } = useSWR<CostRow[]>('/metrics/costs', apiFetch);
  const { data: quality } = useSWR<QualityRow[]>('/metrics/quality', apiFetch);
  const { data: comparison } = useSWR<EnterpriseComparison>('/metrics/enterprise-comparison', apiFetch);

  const totalCost = (costs ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);

  return (
    <div>
      <BrandHeader />
      <div className="grid gap-6 p-6">
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
            Nasze narzędzie vs. plan enterprise
          </h2>
          {comparison ? (
            comparison.enterpriseSeats === 0 ? (
              <p className="text-sm text-brand-dark/70">
                Ustaw <code>ENTERPRISE_SEAT_COST_USD</code> i <code>ENTERPRISE_SEATS</code> w konfiguracji backendu,
                żeby zobaczyć porównanie.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div
                  className={clsx(
                    'min-w-[220px] flex-1 rounded-xl p-4',
                    comparison.cheaperOption === 'our_tool' ? 'bg-brand-orange text-brand-white' : 'bg-brand-surface text-brand-dark',
                  )}
                >
                  <div className={clsx('text-sm', comparison.cheaperOption === 'our_tool' ? 'text-brand-white/80' : 'text-brand-muted')}>
                    Nasze narzędzie (30 dni)
                  </div>
                  <div className="text-2xl font-bold">${comparison.ourToolCostUsd.toFixed(2)}</div>
                </div>
                <div
                  className={clsx(
                    'min-w-[220px] flex-1 rounded-xl p-4',
                    comparison.cheaperOption === 'our_tool' ? 'bg-brand-surface text-brand-dark' : 'bg-brand-orange text-brand-white',
                  )}
                >
                  <div className={clsx('text-sm', comparison.cheaperOption === 'our_tool' ? 'text-brand-muted' : 'text-brand-white/80')}>
                    Enterprise ({comparison.enterpriseSeats} seatów × ${comparison.enterpriseSeatCostUsd})
                  </div>
                  <div className="text-2xl font-bold">${comparison.enterpriseCostUsd.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-brand-border px-4 py-2 font-bold text-brand-dark">
                  <span className="h-2 w-2 rounded-full bg-brand-positive" />
                  Taniej: {comparison.cheaperOption === 'our_tool' ? 'nasze narzędzie' : 'enterprise'}
                </div>
              </div>
            )
          ) : (
            <p>Ładowanie…</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />Koszt łączny (30 dni): ${totalCost.toFixed(4)}</h2>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-brand-orange text-brand-white">
                <th className="p-2 text-left">Model</th>
                <th className="p-2 text-left">Komenda</th>
                <th className="p-2 text-left">Zapytania</th>
                <th className="p-2 text-left">Koszt (USD)</th>
                <th className="p-2 text-left">Śr. czas (ms)</th>
              </tr>
            </thead>
            <tbody>
              {(costs ?? []).map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-brand-white' : 'bg-brand-surface'}>
                  <td className="p-2">{row.model}</td>
                  <td className="p-2">{row.command_used ?? '—'}</td>
                  <td className="p-2">{row.requests}</td>
                  <td className="p-2">{Number(row.cost_usd).toFixed(4)}</td>
                  <td className="p-2">{Math.round(Number(row.avg_latency_ms))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />Jakość odpowiedzi (LLM-judge)</h2>
          <ul className="list-none space-y-1.5 pl-0">
            {(quality ?? []).map((row, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                <span>{row.judge_model}: średnia {row.avg_score}/5 ({row.scored_messages} ocenionych odpowiedzi)</span>
              </li>
            ))}
          </ul>
        </section>

        <KnowledgeBaseSection />

        <div className="flex gap-3">
          <a
            href="/api/export/xlsx"
            className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95"
          >
            <Download size={16} />
            Eksport XLSX
          </a>
          <a
            href="/api/export/pptx"
            className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95"
          >
            <Download size={16} />
            Eksport PPTX
          </a>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminView />
    </RequireAuth>
  );
}
