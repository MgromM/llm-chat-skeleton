'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Download, Trash2, Upload, Plug, Plus } from 'lucide-react';
import clsx from 'clsx';
import {
  api,
  apiFetch,
  type CostRow,
  type QualityRow,
  type EnterpriseComparison,
  type KnowledgeDocument,
  type McpConnector,
} from '@/lib/api';
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
      <div className="overflow-hidden rounded-xl border border-brand-border bg-brand-white shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-surface text-left text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <th className="p-3">Tytuł</th>
              <th className="p-3">Rozmiar</th>
              <th className="p-3">Fragmenty</th>
              <th className="p-3">Wgrał</th>
              <th className="p-3">Data</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(documents ?? []).map((doc) => (
              <tr key={doc.id} className="border-b border-brand-border/60 text-brand-dark last:border-0 hover:bg-brand-surface/50">
                <td className="p-3">{doc.title}</td>
                <td className="p-3 text-brand-muted">{Math.round(doc.size_bytes / 1024)} KB</td>
                <td className="p-3 text-brand-muted">{doc.chunk_count}</td>
                <td className="p-3 text-brand-muted">{doc.uploaded_by_email}</td>
                <td className="p-3 text-brand-muted">{new Date(doc.created_at).toLocaleDateString('pl-PL')}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(doc.id)} aria-label={`Usuń dokument ${doc.title}`} className="text-brand-dark/50 hover:text-red-600" title="Usuń">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(documents ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted">Brak dokumentów w bazie wiedzy.</p>}
      </div>
    </section>
  );
}

/**
 * Manages remote MCP servers wired into every chat turn via Anthropic's
 * native MCP connector — Claude calls these directly, server-side, the same
 * way it calls web_search. A bearer token is optional and, once saved, is
 * never sent back to the browser (the list only shows whether one is set).
 */
function McpConnectorsSection() {
  const { data: connectors, mutate } = useSWR<McpConnector[]>('/metrics/mcp-connectors', apiFetch);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setSaving(true);
    setError(null);
    try {
      await api.addMcpConnector({ name: name.trim(), url: url.trim(), authToken: authToken.trim() || undefined });
      setName('');
      setUrl('');
      setAuthToken('');
      setShowForm(false);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać konektora');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, enabled: boolean) {
    await api.setMcpConnectorEnabled(id, enabled);
    await mutate();
  }

  async function handleDelete(id: number) {
    await api.deleteMcpConnector(id);
    await mutate();
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand-dark">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
          Konektory MCP
        </h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95"
        >
          <Plus size={16} />
          Dodaj konektor
        </button>
      </div>
      {showForm && (
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-brand-border bg-brand-white p-4 shadow-soft">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Nazwa</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. google-drive"
              className="w-full rounded-md border border-brand-border px-3 py-1.5 text-sm outline-none focus:border-brand-orange"
            />
          </div>
          <div className="flex-[2] min-w-[240px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">URL (https)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/mcp"
              className="w-full rounded-md border border-brand-border px-3 py-1.5 text-sm outline-none focus:border-brand-orange"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted">Token (opcjonalnie)</label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              className="w-full rounded-md border border-brand-border px-3 py-1.5 text-sm outline-none focus:border-brand-orange"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={saving || !name.trim() || !url.trim()}
            className="rounded-md bg-brand-dark px-4 py-1.5 text-sm font-bold text-brand-white disabled:opacity-40"
          >
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      )}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-xl border border-brand-border bg-brand-white shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border bg-brand-surface text-left text-xs font-semibold uppercase tracking-wide text-brand-muted">
              <th className="p-3">Nazwa</th>
              <th className="p-3">URL</th>
              <th className="p-3">Token</th>
              <th className="p-3">Aktywny</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(connectors ?? []).map((c) => (
              <tr key={c.id} className="border-b border-brand-border/60 text-brand-dark last:border-0 hover:bg-brand-surface/50">
                <td className="p-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Plug size={14} className="text-brand-orange" />
                    {c.name}
                  </span>
                </td>
                <td className="max-w-[280px] truncate p-3 text-brand-muted">{c.url}</td>
                <td className="p-3 text-brand-muted">{c.has_token ? 'ustawiony' : '—'}</td>
                <td className="p-3">
                  <button
                    onClick={() => handleToggle(c.id, !c.enabled)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      c.enabled ? 'bg-brand-positive/15 text-brand-positive' : 'bg-brand-surface text-brand-muted',
                    )}
                  >
                    {c.enabled ? 'włączony' : 'wyłączony'}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(c.id)} aria-label={`Usuń konektor ${c.name}`} className="text-brand-dark/50 hover:text-red-600" title="Usuń">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(connectors ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted">Brak skonfigurowanych konektorów MCP.</p>}
      </div>
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
      <div className="mx-auto grid max-w-5xl gap-8 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-dark">Panel administracyjny</h1>
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
            Nasze narzędzie vs. plan enterprise
          </h2>
          {comparison ? (
            comparison.enterpriseSeats === 0 ? (
              <p className="text-sm text-brand-muted">
                Ustaw <code>ENTERPRISE_SEAT_COST_USD</code> i <code>ENTERPRISE_SEATS</code> w konfiguracji backendu,
                żeby zobaczyć porównanie.
              </p>
            ) : (
              <div className="flex flex-wrap gap-4">
                <div
                  className={clsx(
                    'min-w-[220px] flex-1 rounded-xl border p-4',
                    comparison.cheaperOption === 'our_tool'
                      ? 'border-brand-orange bg-brand-orange/5'
                      : 'border-brand-border bg-brand-white',
                  )}
                >
                  <div className="text-sm text-brand-muted">Nasze narzędzie (30 dni)</div>
                  <div className="text-2xl font-bold text-brand-dark">${comparison.ourToolCostUsd.toFixed(2)}</div>
                </div>
                <div
                  className={clsx(
                    'min-w-[220px] flex-1 rounded-xl border p-4',
                    comparison.cheaperOption === 'our_tool'
                      ? 'border-brand-border bg-brand-white'
                      : 'border-brand-orange bg-brand-orange/5',
                  )}
                >
                  <div className="text-sm text-brand-muted">
                    Enterprise ({comparison.enterpriseSeats} seatów × ${comparison.enterpriseSeatCostUsd})
                  </div>
                  <div className="text-2xl font-bold text-brand-dark">${comparison.enterpriseCostUsd.toFixed(2)}</div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-brand-border bg-brand-white px-4 py-2 font-bold text-brand-dark">
                  <span className="h-2 w-2 rounded-full bg-brand-positive" />
                  Taniej: {comparison.cheaperOption === 'our_tool' ? 'nasze narzędzie' : 'enterprise'}
                </div>
              </div>
            )
          ) : (
            <p className="text-sm text-brand-muted">Ładowanie…</p>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
            Koszt łączny (30 dni): ${totalCost.toFixed(4)}
          </h2>
          <div className="overflow-hidden rounded-xl border border-brand-border bg-brand-white shadow-soft">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-border bg-brand-surface text-left text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  <th className="p-3">Model</th>
                  <th className="p-3">Komenda</th>
                  <th className="p-3">Zapytania</th>
                  <th className="p-3">Koszt (USD)</th>
                  <th className="p-3">Śr. czas (ms)</th>
                </tr>
              </thead>
              <tbody>
                {(costs ?? []).map((row, i) => (
                  <tr key={i} className="border-b border-brand-border/60 text-brand-dark last:border-0 hover:bg-brand-surface/50">
                    <td className="p-3">{row.model}</td>
                    <td className="p-3 text-brand-muted">{row.command_used ?? '—'}</td>
                    <td className="p-3 text-brand-muted">{row.requests}</td>
                    <td className="p-3 text-brand-muted">{Number(row.cost_usd).toFixed(4)}</td>
                    <td className="p-3 text-brand-muted">{Math.round(Number(row.avg_latency_ms))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
            Jakość odpowiedzi (LLM-judge)
          </h2>
          <div className="rounded-xl border border-brand-border bg-brand-white p-4 shadow-soft">
            <ul className="list-none space-y-1.5 pl-0">
              {(quality ?? []).map((row, i) => (
                <li key={i} className="flex items-baseline gap-2 text-brand-dark">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                  <span>{row.judge_model}: średnia {row.avg_score}/5 ({row.scored_messages} ocenionych odpowiedzi)</span>
                </li>
              ))}
              {(quality ?? []).length === 0 && <p className="text-sm text-brand-muted">Brak danych.</p>}
            </ul>
          </div>
        </section>

        <KnowledgeBaseSection />

        <McpConnectorsSection />

        <div className="flex gap-3">
          <a
            href="/api/export/xlsx"
            className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-surface"
          >
            <Download size={16} />
            Eksport XLSX
          </a>
          <a
            href="/api/export/pptx"
            className="flex items-center gap-1.5 rounded-lg border border-brand-border bg-brand-white px-4 py-2 text-sm font-semibold text-brand-dark hover:bg-brand-surface"
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
