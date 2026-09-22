'use client';

import { Fragment, useRef, useState } from 'react';
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
  type AdminUser,
  type Client,
  type ClientConsentHistoryEntry,
  type ClientTeamAssignment,
  type ClientAccessAuditRow,
  type RetentionStatus,
  type LeakAlert,
  type CostByUserRow,
} from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { useAuth } from '@/lib/AuthContext';

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
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100"><span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />Baza wiedzy</h2>
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
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
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
              <tr key={doc.id} className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                <td className="p-3">{doc.title}</td>
                <td className="p-3 text-brand-muted dark:text-zinc-400">{Math.round(doc.size_bytes / 1024)} KB</td>
                <td className="p-3 text-brand-muted dark:text-zinc-400">{doc.chunk_count}</td>
                <td className="p-3 text-brand-muted dark:text-zinc-400">{doc.uploaded_by_email}</td>
                <td className="p-3 text-brand-muted dark:text-zinc-400">{new Date(doc.created_at).toLocaleDateString('pl-PL')}</td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(doc.id)} aria-label={`Usuń dokument ${doc.title}`} className="text-brand-muted dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400" title="Usuń">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(documents ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted dark:text-zinc-400">Brak dokumentów w bazie wiedzy.</p>}
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
        <h2 className="flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
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
        <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-4 shadow-soft">
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted dark:text-zinc-400">Nazwa</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. google-drive"
              className="w-full rounded-md border border-brand-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-brand-dark dark:text-zinc-100 outline-none focus:border-brand-orange"
            />
          </div>
          <div className="flex-[2] min-w-[240px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted dark:text-zinc-400">URL (https)</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/mcp"
              className="w-full rounded-md border border-brand-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-brand-dark dark:text-zinc-100 outline-none focus:border-brand-orange"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="mb-1 block text-xs font-semibold text-brand-muted dark:text-zinc-400">Token (opcjonalnie)</label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              className="w-full rounded-md border border-brand-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-brand-dark dark:text-zinc-100 outline-none focus:border-brand-orange"
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
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
              <th className="p-3">Nazwa</th>
              <th className="p-3">URL</th>
              <th className="p-3">Token</th>
              <th className="p-3">Aktywny</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(connectors ?? []).map((c) => (
              <tr key={c.id} className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                <td className="p-3 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Plug size={14} className="text-brand-orange" />
                    {c.name}
                  </span>
                </td>
                <td className="max-w-[280px] truncate p-3 text-brand-muted dark:text-zinc-400">{c.url}</td>
                <td className="p-3 text-brand-muted dark:text-zinc-400">{c.has_token ? 'ustawiony' : '—'}</td>
                <td className="p-3">
                  <button
                    onClick={() => handleToggle(c.id, !c.enabled)}
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      c.enabled ? 'bg-brand-positive/15 text-brand-positive' : 'bg-brand-surface dark:bg-zinc-800 text-brand-muted dark:text-zinc-400',
                    )}
                  >
                    {c.enabled ? 'włączony' : 'wyłączony'}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <button onClick={() => handleDelete(c.id)} aria-label={`Usuń konektor ${c.name}`} className="text-brand-muted dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400" title="Usuń">
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(connectors ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted dark:text-zinc-400">Brak skonfigurowanych konektorów MCP.</p>}
      </div>
    </section>
  );
}

/**
 * Lets an admin promote/demote another already-provisioned account (accounts
 * self-create as 'specialist' on first Google login — there's no password
 * signup left to assign a role at). A user can't change their own role here,
 * to avoid an admin accidentally locking themselves out.
 */
const SEVERITY_LABELS: Record<string, string> = { low: 'niska', medium: 'średnia', high: 'wysoka', critical: 'krytyczna' };

function LeakAlertsSection() {
  const { data: alerts, mutate } = useSWR<LeakAlert[]>('/metrics/leak-alerts?reviewed=false', () => api.listLeakAlerts(true));
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  async function handleReview(id: number) {
    setReviewingId(id);
    try {
      await api.reviewLeakAlert(id);
      await mutate();
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
        Sygnały do przeglądu (auto + zgłoszenia)
      </h2>
      <div className="space-y-2">
        {(alerts ?? []).map((a) => (
          <div key={a.id} className="rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-4 shadow-soft">
            <div className="mb-1 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-brand-dark dark:text-zinc-100">
                <span
                  className={clsx(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    a.source === 'manual' ? 'bg-brand-orange/15 text-brand-orange' : 'bg-brand-surface dark:bg-zinc-800 text-brand-muted dark:text-zinc-400',
                  )}
                >
                  {a.source === 'manual' ? 'zgłoszenie' : 'auto'}
                </span>
                {a.severity && <span className="text-xs text-brand-muted dark:text-zinc-400">waga: {SEVERITY_LABELS[a.severity] ?? a.severity}</span>}
                <span className="text-xs text-brand-muted dark:text-zinc-400">{a.email}</span>
              </span>
              <button
                onClick={() => handleReview(a.id)}
                disabled={reviewingId === a.id}
                className="rounded-md border border-brand-border dark:border-zinc-700 px-3 py-1 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {reviewingId === a.id ? 'Zapisywanie…' : 'Oznacz jako przeglądnięte'}
              </button>
            </div>
            <p className="text-sm text-brand-dark dark:text-zinc-100">{a.description ?? a.rationale}</p>
            {a.has_screenshot && (
              <a
                href={api.incidentScreenshotUrl(a.id)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs font-semibold text-brand-orange hover:underline"
              >
                Zobacz zrzut ekranu
              </a>
            )}
            <p className="mt-1 text-xs text-brand-muted dark:text-zinc-400">{new Date(a.created_at).toLocaleString('pl-PL')}</p>
          </div>
        ))}
        {(alerts ?? []).length === 0 && <p className="text-sm text-brand-muted dark:text-zinc-400">Brak nieprzeglądniętych sygnałów.</p>}
      </div>
    </section>
  );
}

function ClientConsentHistory({ clientId }: { clientId: number }) {
  const { data: history } = useSWR<ClientConsentHistoryEntry[]>(`/clients/${clientId}/consent-history`, apiFetch);

  if (!history || history.length === 0) {
    return <p className="p-3 text-xs text-brand-muted dark:text-zinc-400">Brak historii zmian.</p>;
  }

  return (
    <ul className="list-none space-y-1 p-3 pt-0 text-xs text-brand-muted dark:text-zinc-400">
      {history.map((h) => (
        <li key={h.id}>
          {new Date(h.changed_at).toLocaleString('pl-PL')} — {h.changed_by ?? 'nieznany'}:{' '}
          {h.old_value === null ? '—' : h.old_value ? 'zgoda' : 'brak zgody'} → {h.new_value ? 'zgoda' : 'brak zgody'}
        </li>
      ))}
    </ul>
  );
}

function ClientTeam({ clientId }: { clientId: number }) {
  const { data: team, mutate } = useSWR<ClientTeamAssignment[]>(`/clients/${clientId}/team`, () => api.clientTeam(clientId));
  const { data: users } = useSWR<AdminUser[]>('/auth/users', apiFetch);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignedIds = new Set((team ?? []).map((t) => t.user_id));
  const availableUsers = (users ?? []).filter((u) => !assignedIds.has(u.id));

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      await api.assignClientTeamMember(clientId, Number(selectedUserId));
      setSelectedUserId('');
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się przypisać');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnassign(userId: number) {
    setSaving(true);
    setError(null);
    try {
      await api.unassignClientTeamMember(clientId, userId);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się odpisać');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 pt-0 text-xs text-brand-muted dark:text-zinc-400">
      {error && <p className="mb-1 text-red-600 dark:text-red-400">{error}</p>}
      <ul className="list-none space-y-1 pl-0">
        {(team ?? []).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2">
            <span>
              {t.email} — przypisany {new Date(t.assigned_at).toLocaleString('pl-PL')}
              {t.assigned_by ? ` przez ${t.assigned_by}` : ''}
            </span>
            <button
              onClick={() => handleUnassign(t.user_id)}
              disabled={saving}
              className="shrink-0 rounded-md border border-brand-border dark:border-zinc-700 px-2 py-0.5 font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 disabled:opacity-40"
            >
              Odpisz
            </button>
          </li>
        ))}
        {(team ?? []).length === 0 && <li>Brak przypisanych specjalistów.</li>}
      </ul>
      <form onSubmit={handleAssign} className="mt-2 flex gap-2">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 rounded-md border border-brand-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 py-1 text-brand-dark dark:text-zinc-100"
        >
          <option value="">Wybierz specjalistę…</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={saving || !selectedUserId}
          className="rounded-md bg-brand-orange px-3 py-1 font-bold text-brand-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Przypisz
        </button>
      </form>
    </div>
  );
}

function RetentionSection() {
  const { data: status, mutate } = useSWR<RetentionStatus>('/metrics/retention', () => api.retentionStatus());
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun(dryRun: boolean) {
    if (!dryRun && !window.confirm('Trwale usunąć wygasłe konwersacje? Tej operacji nie można odwrócić.')) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await api.runRetentionCleanup(dryRun);
      setLastResult(
        result.dryRun
          ? `Do usunięcia: ${result.wouldDeleteCount} konwersacji (retencja wyłączona lub podgląd).`
          : `Usunięto ${result.deletedCount} konwersacji.`,
      );
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się uruchomić czyszczenia');
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
        Retencja danych
      </h2>
      <div className="rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-4 shadow-soft">
        <p className="text-sm text-brand-dark dark:text-zinc-100">
          Konwersacje bez aktywności dłużej niż okres retencji: <strong>{status?.expiredConversationCount ?? '—'}</strong>
        </p>
        {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {lastResult && <p className="mt-2 text-sm text-brand-muted dark:text-zinc-400">{lastResult}</p>}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => handleRun(true)}
            disabled={running}
            className="rounded-md border border-brand-border dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Odśwież podgląd
          </button>
          <button
            onClick={() => handleRun(false)}
            disabled={running}
            className="rounded-md border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? 'Usuwanie…' : 'Usuń teraz'}
          </button>
        </div>
      </div>
    </section>
  );
}

function ClientAccessAuditSection() {
  const { data: audit } = useSWR<ClientAccessAuditRow[]>('/clients/access-audit', () => api.clientAccessAudit());

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
        Audyt dostępu — rozmowy bez przypisania do zespołu
      </h2>
      <div className="rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-4 shadow-soft">
        <ul className="list-none space-y-1.5 pl-0">
          {(audit ?? []).map((row, i) => (
            <li key={i} className="flex items-baseline gap-2 text-sm text-brand-dark dark:text-zinc-100">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span>
                <strong>{row.user_email}</strong> rozmawiał z danymi klienta <strong>{row.client_name}</strong>, do
                którego nie jest przypisany
              </span>
            </li>
          ))}
          {(audit ?? []).length === 0 && <p className="text-sm text-brand-muted dark:text-zinc-400">Brak sygnałów — dostęp zgodny z przypisaniami.</p>}
        </ul>
      </div>
    </section>
  );
}

function ClientsSection() {
  const { data: clients, mutate } = useSWR<Client[]>('/clients', apiFetch);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createClient(newName.trim());
      setNewName('');
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się dodać zleceniodawcy');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleConsent(c: Client) {
    setSavingId(c.id);
    setError(null);
    try {
      await api.setClientConsent(c.id, !c.ai_consent);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić zgody');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
        Zgody zleceniodawców na przetwarzanie AI
      </h2>
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <form onSubmit={handleCreate} className="mb-3 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nazwa zleceniodawcy"
          className="flex-1 rounded-md border border-brand-border dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-sm text-brand-dark dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-1.5 text-sm font-bold text-brand-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} />
          {creating ? 'Dodawanie…' : 'Dodaj'}
        </button>
      </form>
      <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
              <th className="p-3">Zleceniodawca</th>
              <th className="p-3">Zgoda na AI</th>
              <th className="p-3">Ostatnia zmiana</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(clients ?? []).map((c) => (
              <Fragment key={c.id}>
                <tr className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                  <td className="p-3">{c.name}</td>
                  <td className="p-3">
                    <span
                      className={clsx(
                        'rounded-full px-3 py-1 text-xs font-semibold',
                        c.ai_consent ? 'bg-brand-positive/15 text-brand-positive' : 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400',
                      )}
                    >
                      {c.ai_consent ? 'zgoda' : 'brak zgody'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-brand-muted dark:text-zinc-400">
                    {c.ai_consent_updated_at
                      ? `${new Date(c.ai_consent_updated_at).toLocaleString('pl-PL')} (${c.ai_consent_updated_by ?? '—'})`
                      : '—'}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                      className="mr-2 rounded-md border border-brand-border dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 dark:bg-zinc-800"
                    >
                      {expandedId === c.id ? 'Skryj historię' : 'Historia'}
                    </button>
                    <button
                      onClick={() => handleToggleConsent(c)}
                      disabled={savingId === c.id}
                      className="rounded-md border border-brand-border dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingId === c.id ? 'Zapisywanie…' : c.ai_consent ? 'Odbierz zgodę' : 'Nadaj zgodę'}
                    </button>
                  </td>
                </tr>
                {expandedId === c.id && (
                  <tr className="border-b border-brand-border/60 dark:border-zinc-700/60">
                    <td colSpan={4} className="bg-brand-surface/40 dark:bg-zinc-800/40">
                      <ClientConsentHistory clientId={c.id} />
                      <p className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">Zespół</p>
                      <ClientTeam clientId={c.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {(clients ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted dark:text-zinc-400">Brak zleceniodawców.</p>}
      </div>
    </section>
  );
}

function UsersSection() {
  const { user: currentUser } = useAuth();
  const { data: users, mutate } = useSWR<AdminUser[]>('/auth/users', apiFetch);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function handleToggleRole(u: AdminUser) {
    const nextRole = u.role === 'admin' ? 'specialist' : 'admin';
    setSavingId(u.id);
    setError(null);
    try {
      await api.setUserRole(u.id, nextRole);
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nie udało się zmienić roli');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
        <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
        Użytkownicy
      </h2>
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
              <th className="p-3">E-mail</th>
              <th className="p-3">Rola</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                <td className="p-3">{u.email}</td>
                <td className="p-3">
                  <span
                    className={clsx(
                      'rounded-full px-3 py-1 text-xs font-semibold',
                      u.role === 'admin' ? 'bg-brand-positive/15 text-brand-positive' : 'bg-brand-surface dark:bg-zinc-800 text-brand-muted dark:text-zinc-400',
                    )}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={() => handleToggleRole(u)}
                    disabled={savingId === u.id || u.id === currentUser?.id}
                    title={u.id === currentUser?.id ? 'Nie można zmienić własnej roli' : undefined}
                    className="rounded-md border border-brand-border dark:border-zinc-700 px-3 py-1.5 text-xs font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {savingId === u.id ? 'Zapisywanie…' : u.role === 'admin' ? 'Odbierz admina' : 'Nadaj admina'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(users ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted dark:text-zinc-400">Brak użytkowników.</p>}
      </div>
    </section>
  );
}

function UsageMetricsTab() {
  const { data: costs } = useSWR<CostRow[]>('/metrics/costs', apiFetch);
  const { data: costsByUser } = useSWR<CostByUserRow[]>('/metrics/costs-by-user', apiFetch);
  const { data: quality } = useSWR<QualityRow[]>('/metrics/quality', apiFetch);
  const { data: comparison } = useSWR<EnterpriseComparison>('/metrics/enterprise-comparison', apiFetch);

  const totalCost = (costs ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);

  return (
    <>
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
          Nasze narzędzie vs. plan enterprise
        </h2>
        {comparison ? (
          comparison.enterpriseSeats === 0 ? (
            <p className="text-sm text-brand-muted dark:text-zinc-400">
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
                    : 'border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900',
                )}
              >
                <div className="text-sm text-brand-muted dark:text-zinc-400">Nasze narzędzie (30 dni)</div>
                <div className="text-2xl font-bold text-brand-dark dark:text-zinc-100">${comparison.ourToolCostUsd.toFixed(2)}</div>
              </div>
              <div
                className={clsx(
                  'min-w-[220px] flex-1 rounded-xl border p-4',
                  comparison.cheaperOption === 'our_tool'
                    ? 'border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900'
                    : 'border-brand-orange bg-brand-orange/5',
                )}
              >
                <div className="text-sm text-brand-muted dark:text-zinc-400">
                  Enterprise ({comparison.enterpriseSeats} seatów × ${comparison.enterpriseSeatCostUsd})
                </div>
                <div className="text-2xl font-bold text-brand-dark dark:text-zinc-100">${comparison.enterpriseCostUsd.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-4 py-2 font-bold text-brand-dark dark:text-zinc-100">
                <span className="h-2 w-2 rounded-full bg-brand-positive" />
                Taniej: {comparison.cheaperOption === 'our_tool' ? 'nasze narzędzie' : 'enterprise'}
              </div>
            </div>
          )
        ) : (
          <p className="text-sm text-brand-muted dark:text-zinc-400">Ładowanie…</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
          Koszt łączny (30 dni): ${totalCost.toFixed(4)}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
                <th className="p-3">Model</th>
                <th className="p-3">Komenda</th>
                <th className="p-3">Zapytania</th>
                <th className="p-3">Koszt (USD)</th>
                <th className="p-3">Śr. czas (ms)</th>
              </tr>
            </thead>
            <tbody>
              {(costs ?? []).map((row, i) => (
                <tr key={i} className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                  <td className="p-3">{row.model}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{row.command_used ?? '—'}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{row.requests}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{Number(row.cost_usd).toFixed(4)}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{Math.round(Number(row.avg_latency_ms))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
          Koszt per użytkownik (30 dni)
        </h2>
        <div className="overflow-x-auto rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-border dark:border-zinc-700 bg-brand-surface dark:bg-zinc-800 text-left text-xs font-semibold uppercase tracking-wide text-brand-muted dark:text-zinc-400">
                <th className="p-3">Użytkownik</th>
                <th className="p-3">Zapytania</th>
                <th className="p-3">Tokeny (in/out)</th>
                <th className="p-3">Koszt (USD)</th>
              </tr>
            </thead>
            <tbody>
              {(costsByUser ?? []).map((row) => (
                <tr key={row.user_id} className="border-b border-brand-border/60 dark:border-zinc-700/60 text-brand-dark dark:text-zinc-100 last:border-0 hover:bg-brand-surface/50 dark:bg-zinc-800/50">
                  <td className="p-3">{row.email}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{row.requests}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{row.input_tokens} / {row.output_tokens}</td>
                  <td className="p-3 text-brand-muted dark:text-zinc-400">{Number(row.cost_usd).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(costsByUser ?? []).length === 0 && <p className="p-4 text-sm text-brand-muted dark:text-zinc-400">Brak danych.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-xl font-bold text-brand-dark dark:text-zinc-100">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
          Jakość odpowiedzi (LLM-judge)
        </h2>
        <div className="rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 p-4 shadow-soft">
          <ul className="list-none space-y-1.5 pl-0">
            {(quality ?? []).map((row, i) => (
              <li key={i} className="flex items-baseline gap-2 text-brand-dark dark:text-zinc-100">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" />
                <span>{row.judge_model}: średnia {row.avg_score}/5 ({row.scored_messages} ocenionych odpowiedzi)</span>
              </li>
            ))}
            {(quality ?? []).length === 0 && <p className="text-sm text-brand-muted dark:text-zinc-400">Brak danych.</p>}
          </ul>
        </div>
      </section>

      <div className="flex gap-3">
        <a
          href="/api/export/xlsx"
          className="flex items-center gap-1.5 rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-4 py-2 text-sm font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 dark:bg-zinc-800"
        >
          <Download size={16} />
          Eksport XLSX
        </a>
        <a
          href="/api/export/pptx"
          className="flex items-center gap-1.5 rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-4 py-2 text-sm font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:bg-zinc-800 dark:bg-zinc-800"
        >
          <Download size={16} />
          Eksport PPTX
        </a>
      </div>
    </>
  );
}

function ComplianceTab() {
  return (
    <>
      <LeakAlertsSection />
      <ClientsSection />
      <ClientAccessAuditSection />
      <RetentionSection />
    </>
  );
}

const ADMIN_TABS = [
  { key: 'usage', label: 'Usage/Metryki' },
  { key: 'compliance', label: 'Zgodność' },
  { key: 'users', label: 'Użytkownicy' },
  { key: 'integrations', label: 'Baza wiedzy i integracje' },
] as const;

type AdminTabKey = (typeof ADMIN_TABS)[number]['key'];

function AdminView() {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('usage');

  return (
    <div className="min-h-screen bg-brand-white dark:bg-zinc-950">
      <BrandHeader />
      <div className="mx-auto grid max-w-5xl gap-8 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-brand-dark dark:text-zinc-100">Panel administracyjny</h1>

        <div className="flex flex-wrap gap-2 border-b border-brand-border dark:border-zinc-700 pb-2">
          {ADMIN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'rounded-md px-4 py-2 text-sm font-semibold transition',
                activeTab === tab.key
                  ? 'bg-brand-orange text-brand-white'
                  : 'text-brand-dark dark:text-zinc-100 hover:bg-brand-surface dark:hover:bg-zinc-800',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'usage' && <UsageMetricsTab />}
        {activeTab === 'compliance' && <ComplianceTab />}
        {activeTab === 'users' && <UsersSection />}
        {activeTab === 'integrations' && (
          <>
            <KnowledgeBaseSection />
            <McpConnectorsSection />
          </>
        )}
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
