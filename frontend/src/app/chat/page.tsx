'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowUp, Plus, MessageSquare, Paperclip, X, FileText, FileOutput, Download, Square, RefreshCw, Pencil, Check, Trash2, Menu, Link2, GitBranch, Share2, Eye, Code2, Loader2, Copy } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { api, ApiError, type Attachment, type ChatMessage, type Citation, type GeneratedFile, type Artifact, type ArtifactVersionSummary } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';
import { ArtifactViewer } from '@/components/ArtifactViewer';

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

// Slash commands whose replies are full deliverables, not chat chatter —
// these get a compact card in the flow that opens the real thing in the
// artifact side panel, instead of dumping the whole text into the timeline.
const EXAMPLE_PROMPTS: string[] = [
  'Napisz brief kreatywny dla nowej kampanii produktowej',
  'Przeanalizuj konkurencję w naszej branży',
  'Zaproponuj 5 pomysłów na posty w social mediach',
  'Napisz teksty reklamowe do kampanii Google Ads',
];

const ARTIFACT_COMMAND_TITLES: Record<string, string> = {
  '/brief-kreatywny': 'Brief kreatywny',
  '/tekst-reklamowy': 'Teksty reklamowe',
  '/pomysly-na-posty': 'Pomysły na posty',
  '/analiza-konkurencji': 'Analiza konkurencji',
};

function artifactFilename(title: string, type: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}.${type === 'html' ? 'html' : 'md'}`;
}

type ArtifactTab = 'preview' | 'source' | 'edit';

function ArtifactPanel({ artifactId, onClose }: { artifactId: number; onClose: () => void }) {
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [versions, setVersions] = useState<ArtifactVersionSummary[]>([]);
  const [tab, setTab] = useState<ArtifactTab>('preview');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getArtifact(artifactId).then((a) => {
      if (cancelled) return;
      setArtifact(a);
      setDraft(a.content);
      setTab(a.type === 'html' ? 'preview' : 'source');
    });
    api.listArtifactVersions(artifactId).then((v) => {
      if (!cancelled) setVersions(v);
    });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  async function loadVersion(version: number) {
    const a = await api.getArtifactVersion(artifactId, version);
    setArtifact(a);
    setDraft(a.content);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateArtifact(artifactId, draft);
      setArtifact(updated);
      setVersions(await api.listArtifactVersions(artifactId));
      setTab(updated.type === 'html' ? 'preview' : 'source');
    } finally {
      setSaving(false);
    }
  }

  async function handleShare() {
    if (!artifact) return;
    const { shareToken } = await api.shareArtifact(artifact.id);
    const url = `${window.location.origin}/a/${shareToken}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setArtifact({ ...artifact, shareToken });
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  function handleDownload() {
    if (!artifact) return;
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifactFilename(artifact.title, artifact.type);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="fixed inset-0 z-50 flex w-full shrink-0 flex-col rounded-2xl bg-brand-white dark:bg-zinc-900 shadow-soft sm:static sm:z-auto sm:w-[480px]">
      <div className="flex items-center justify-between rounded-t-2xl border-b border-brand-border dark:border-zinc-700 px-5 py-4">
        <div className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-dark dark:text-zinc-100">
          <FileOutput size={16} className="text-brand-orange" />
          {artifact?.title ?? '…'}
        </div>
        <button onClick={onClose} aria-label="Zamknij artefakt" className="text-brand-dark/50 dark:text-zinc-400 hover:text-brand-dark dark:hover:text-zinc-100">
          <X size={18} />
        </button>
      </div>

      {artifact && (
        <div className="flex items-center gap-1 border-b border-brand-border dark:border-zinc-700 px-3 py-2">
          {artifact.type === 'html' && (
            <button
              onClick={() => setTab('preview')}
              className={clsx(
                'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                tab === 'preview' ? 'bg-brand-orange/10 text-brand-orange' : 'text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800',
              )}
            >
              <Eye size={13} /> Podgląd
            </button>
          )}
          <button
            onClick={() => setTab('source')}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
              tab === 'source' ? 'bg-brand-orange/10 text-brand-orange' : 'text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800',
            )}
          >
            <Code2 size={13} /> {artifact.type === 'html' ? 'Markdown' : 'Treść'}
          </button>
          <button
            onClick={() => setTab('edit')}
            className={clsx(
              'flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
              tab === 'edit' ? 'bg-brand-orange/10 text-brand-orange' : 'text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800',
            )}
          >
            <Pencil size={13} /> Edytuj
          </button>
          {versions.length > 1 && (
            <select
              aria-label="Wersja"
              value={artifact.currentVersion}
              onChange={(e) => loadVersion(Number(e.target.value))}
              className="ml-auto rounded-md border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-2 py-1 text-xs text-brand-dark dark:text-zinc-100"
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  Wersja {v.version}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
        {!artifact ? (
          <div className="text-sm text-brand-dark/50 dark:text-zinc-400">Ładowanie…</div>
        ) : tab === 'edit' ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[300px] flex-1 resize-none rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-surface/30 dark:bg-zinc-800/60 p-3 font-mono text-xs text-brand-dark dark:text-zinc-100 focus:outline-none"
          />
        ) : (
          <ArtifactViewer artifact={artifact} mode={tab === 'preview' ? 'preview' : 'source'} />
        )}
      </div>

      <div className="flex gap-2 rounded-b-2xl border-t border-brand-border dark:border-zinc-700 px-5 py-3">
        {tab === 'edit' ? (
          <button
            onClick={handleSave}
            disabled={saving || draft === artifact?.content}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-brand-white hover:brightness-95 disabled:opacity-40"
          >
            <Check size={16} />
            {saving ? 'Zapisywanie…' : 'Zapisz nową wersję'}
          </button>
        ) : (
          <>
            <button
              onClick={handleDownload}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-border dark:border-zinc-700 px-4 py-2 text-sm font-semibold text-brand-dark dark:text-zinc-100 hover:bg-brand-surface/60 dark:hover:bg-zinc-800"
            >
              <Download size={16} />
              Pobierz
            </button>
            <button
              onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-brand-white hover:brightness-95"
            >
              <Share2 size={16} />
              {shareCopied ? 'Link skopiowany!' : artifact?.shareToken ? 'Kopiuj link' : 'Udostępnij'}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function ArtifactCard({ title, onOpen }: { title: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full max-w-[75%] items-center gap-3 rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-4 py-3 text-left shadow-sm hover:border-brand-orange/50 hover:bg-brand-surface/30 dark:hover:bg-zinc-800/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
        <FileOutput size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-brand-dark dark:text-zinc-100">{title}</div>
        <div className="text-xs text-brand-dark/50 dark:text-zinc-400">Otwórz artefakt</div>
      </div>
    </button>
  );
}

interface Conversation {
  id: number;
  title: string | null;
  created_at: string;
  model?: string | null;
  systemPrompt?: string | null;
  branchedFromConversationId?: number | null;
}


function conversationLabel(c: Conversation) {
  return c.title?.trim() || `Rozmowa z ${new Date(c.created_at).toLocaleDateString('pl-PL')}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  open,
  onClose,
  searchInputRef,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  open: boolean;
  onClose: () => void;
  searchInputRef?: RefObject<HTMLInputElement>;
}) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    const handle = setTimeout(() => {
      api.searchConversations(q).then(setSearchResults).catch(() => setSearchResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const visibleConversations = searchResults ?? conversations;

  function startRename(c: Conversation) {
    setRenamingId(c.id);
    setRenameDraft(conversationLabel(c));
  }

  function commitRename() {
    if (renamingId !== null && renameDraft.trim()) onRename(renamingId, renameDraft.trim());
    setRenamingId(null);
  }

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
        />
      )}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 m-3 flex w-64 shrink-0 flex-col rounded-2xl bg-brand-dark shadow-soft transition-transform duration-200 md:static md:m-0 md:z-auto md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <div className="p-3">
        <button
          onClick={() => {
            onNew();
            onClose();
          }}
          title="Nowa rozmowa (Cmd+Shift+O)"
          className="flex w-full items-center gap-2 rounded-lg bg-brand-orange px-3 py-2 text-sm font-medium text-brand-white hover:brightness-95"
        >
          <Plus size={16} />
          Nowa rozmowa
        </button>
      </div>
      <div className="px-3 pb-2">
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj w rozmowach… (Cmd+K)"
          className="w-full rounded-lg border border-brand-white/30 bg-brand-white/10 px-3 py-1.5 text-sm text-brand-white placeholder:text-brand-white/50 outline-none focus:border-brand-white/60"
        />
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {visibleConversations.length === 0 && (
          <p className="px-3 py-2 text-sm text-brand-white/60">Brak wyników.</p>
        )}
        {visibleConversations.map((c) =>
          renamingId === c.id ? (
            <input
              key={c.id}
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="w-full rounded-lg border-l-2 border-brand-white bg-brand-white/15 px-3 py-2 text-sm text-brand-white outline-none"
            />
          ) : (
            <div
              key={c.id}
              className={clsx(
                'group flex w-full items-center gap-2 truncate rounded-lg border-l-2 pl-3 pr-1 text-left text-sm',
                c.id === activeId
                  ? 'border-brand-orange bg-brand-white/10 font-medium text-brand-white'
                  : 'border-transparent text-brand-white/70 hover:bg-brand-white/5',
              )}
            >
              <button
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-2"
              >
                {c.branchedFromConversationId ? (
                  <GitBranch size={14} className={clsx('shrink-0', c.id === activeId ? 'text-brand-orange' : 'opacity-70')} />
                ) : (
                  <MessageSquare size={14} className={clsx('shrink-0', c.id === activeId ? 'text-brand-orange' : 'opacity-70')} />
                )}
                <span className="truncate">{conversationLabel(c)}</span>
              </button>
              <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => startRename(c)}
                  aria-label="Zmień nazwę rozmowy"
                  className="rounded p-1 text-brand-white/70 hover:bg-brand-white/20 hover:text-brand-white"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('Usunąć tę rozmowę? Tej operacji nie można cofnąć.')) onDelete(c.id);
                  }}
                  aria-label="Usuń rozmowę"
                  className="rounded p-1 text-brand-white/70 hover:bg-brand-white/20 hover:text-brand-white"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>
      </aside>
    </>
  );
}

function AttachmentChip({ attachment }: { attachment: Attachment }) {
  const url = api.attachmentUrl(attachment.id);
  if (attachment.mimeType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-brand-border dark:border-zinc-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={attachment.filename} className="max-h-48 w-auto object-cover" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-3 py-2 text-sm text-brand-dark dark:text-zinc-100 hover:bg-brand-surface/50 dark:hover:bg-zinc-800/60"
    >
      <FileText size={16} className="shrink-0 opacity-60" />
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-xs text-brand-dark/40 dark:text-zinc-500">{formatSize(attachment.sizeBytes)}</span>
    </a>
  );
}

/** Small source-link row shown under an assistant reply that used web search. */
function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-1 flex max-w-full flex-wrap gap-1.5">
      {citations.map((c) => (
        <a
          key={c.url}
          href={c.url}
          target="_blank"
          rel="noreferrer"
          title={c.url}
          className="flex max-w-[220px] items-center gap-1 rounded-full border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-2.5 py-1 text-xs text-brand-dark/70 dark:text-zinc-300 hover:bg-brand-surface/50 dark:hover:bg-zinc-800/60 hover:text-brand-dark dark:hover:text-zinc-100"
        >
          <Link2 size={11} className="shrink-0 opacity-60" />
          <span className="truncate">{c.title}</span>
        </a>
      ))}
    </div>
  );
}

/** Download chips for files the model generated via code execution (e.g. a .csv report). */
function GeneratedFileList({ files }: { files: GeneratedFile[] }) {
  return (
    <div className="mt-1 flex max-w-full flex-wrap gap-2">
      {files.map((f) => (
        <a
          key={f.fileId}
          href={api.generatedFileUrl(f.fileId)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-3 py-2 text-sm text-brand-dark dark:text-zinc-100 hover:bg-brand-surface/50 dark:hover:bg-zinc-800/60"
        >
          <Download size={16} className="shrink-0 text-brand-orange" />
          <span className="truncate">{f.filename}</span>
          <span className="shrink-0 text-xs text-brand-dark/40 dark:text-zinc-500">{formatSize(f.sizeBytes)}</span>
        </a>
      ))}
    </div>
  );
}

function friendlyErrorMessage(raw: string): string {
  if (raw === 'stream_interrupted') {
    return 'Połączenie zostało przerwane w trakcie generowania odpowiedzi. Ponawiam próbę…';
  }
  if (/429/.test(raw)) return 'Zbyt wiele żądań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.';
  if (/^Request failed: 5\d\d/.test(raw) || /500/.test(raw)) {
    return 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.';
  }
  return raw || 'Coś poszło nie tak. Spróbuj ponownie.';
}

/** 429/5xx/dropped-stream are transient — worth an auto-retry with backoff; other errors (4xx, network) are not. */
function isRetryableError(raw: string): boolean {
  return raw === 'stream_interrupted' || /429/.test(raw) || /^Request failed: 5\d\d/.test(raw) || /500/.test(raw);
}

const RETRY_BACKOFF_MS = [1000, 3000, 8000];

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-5': 'Claude Sonnet 5',
  'claude-opus-5': 'Claude Opus 5',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
};

function modelLabel(model: string) {
  return MODEL_LABELS[model] || model;
}

function ConversationSettingsBar({
  systemPrompt,
  onChangeSystemPrompt,
  onExport,
  onOpenSidebar,
  availableModels,
  selectedModel,
  onChangeModel,
  hasGlobalPrompt,
}: {
  systemPrompt: string;
  onChangeSystemPrompt: (prompt: string) => void;
  onExport: () => void;
  onOpenSidebar: () => void;
  availableModels: string[];
  selectedModel: string;
  onChangeModel: (model: string) => void;
  hasGlobalPrompt: boolean;
}) {
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [draft, setDraft] = useState(systemPrompt);

  useEffect(() => setDraft(systemPrompt), [systemPrompt]);

  return (
    <div className="rounded-t-2xl border-b border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-3 py-2 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 text-sm">
        <button
          onClick={onOpenSidebar}
          aria-label="Otwórz listę rozmów"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-brand-dark/60 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 md:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-1.5 text-brand-dark/60 dark:text-zinc-400">
          Model:
          <select
            value={selectedModel}
            onChange={(e) => onChangeModel(e.target.value)}
            className="rounded-md border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-2 py-1 text-sm font-medium text-brand-dark dark:text-zinc-100 outline-none focus:border-brand-orange"
          >
            {availableModels.length === 0 && <option value={selectedModel}>{modelLabel(selectedModel)}</option>}
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {modelLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowPromptEditor((v) => !v)}
          className="text-brand-dark/60 dark:text-zinc-400 underline decoration-dotted hover:text-brand-dark dark:hover:text-zinc-100"
        >
          {systemPrompt ? 'Edytuj prompt systemowy (tej rozmowy)' : 'Dodaj prompt systemowy (tej rozmowy)'}
        </button>
        <a
          href="/settings"
          title="Globalny kontekst z Ustawień obowiązuje we wszystkich rozmowach, a prompt tej rozmowy jest do niego dodawany."
          className={clsx(
            'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
            hasGlobalPrompt
              ? 'bg-brand-orange/10 text-brand-orange dark:bg-brand-orange/20'
              : 'text-brand-dark/40 dark:text-zinc-500 hover:text-brand-dark dark:hover:text-zinc-200'
          )}
        >
          {hasGlobalPrompt ? 'Globalny kontekst: aktywny' : 'Globalny kontekst: brak'}
        </a>
        <button
          onClick={onExport}
          className="ml-auto flex items-center gap-1.5 text-brand-dark/60 dark:text-zinc-400 hover:text-brand-dark dark:hover:text-zinc-100"
        >
          <Download size={14} />
          Eksportuj
        </button>
      </div>
      {showPromptEditor && (
        <div className="mx-auto mt-2 max-w-3xl">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Opcjonalne instrukcje systemowe dla tej rozmowy…"
            className="w-full resize-none rounded-lg border border-brand-border dark:border-zinc-700 px-3 py-2 text-sm text-brand-dark dark:text-zinc-100 outline-none focus:border-brand-orange"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => setShowPromptEditor(false)}
              className="rounded-md px-3 py-1 text-xs text-brand-dark/60 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800"
            >
              Anuluj
            </button>
            <button
              onClick={() => {
                onChangeSystemPrompt(draft);
                setShowPromptEditor(false);
              }}
              className="rounded-md bg-brand-orange px-3 py-1 text-xs font-bold text-brand-white hover:brightness-95"
            >
              Zapisz
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [openArtifactId, setOpenArtifactId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const lastRequestRef = useRef<((handlers: import('@/lib/api').StreamHandlers, signal: AbortSignal) => Promise<void>) | null>(null);
  const [blockedNotice, setBlockedNotice] = useState<{
    level: 'żółta' | 'czerwona';
    reply: string;
    content: string;
    files: File[];
  } | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [draftEstimate, setDraftEstimate] = useState<{ inputTokens: number; estimatedCostUsd: number } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [hasGlobalPrompt, setHasGlobalPrompt] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const list = await api.listConversations();
      if (list.length === 0) {
        const conversation = await api.createConversation('Nowa rozmowa');
        setConversations([{ ...conversation, created_at: new Date().toISOString() } as Conversation]);
        setConversationId(conversation.id);
        return;
      }
      setConversations(list);

      // Deep-link from outside the chat view (e.g. the "Kod" tab linking to
      // the conversation a generated file came from) — falls back to the
      // most recent conversation if the id is missing or not the user's own.
      const requestedId = Number(new URLSearchParams(window.location.search).get('conversation'));
      const initial = list.find((c) => c.id === requestedId) ?? list[0];
      setConversationId(initial.id);
      setMessages(await api.listMessages(initial.id));
    })();
    api.availableModels().then(({ models }) => setAvailableModels(models));
    api.me().then((me) => setHasGlobalPrompt(!!me.defaultSystemPrompt)).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, streamingText]);

  // Keyboard shortcuts: Cmd/Ctrl+K focuses conversation search, Cmd/Ctrl+Shift+O
  // starts a new conversation — both open the sidebar on mobile first.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSidebarOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleNewConversation();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  // Debounced input-token/cost preview: waits for a pause in typing so it
  // doesn't fire a countTokens call on every keystroke.
  useEffect(() => {
    if (!conversationId || !draft.trim()) {
      setDraftEstimate(null);
      return;
    }
    const handle = setTimeout(() => {
      api
        .estimateCost(conversationId, draft)
        .then((res) => setDraftEstimate({ inputTokens: res.inputTokens, estimatedCostUsd: res.estimatedCostUsd }))
        .catch(() => setDraftEstimate(null));
    }, 500);
    return () => clearTimeout(handle);
  }, [conversationId, draft]);

  async function handleSelectConversation(id: number) {
    if (id === conversationId) return;
    setConversationId(id);
    setMessages(await api.listMessages(id));
  }

  async function handleNewConversation() {
    const conversation = await api.createConversation();
    setConversations((prev) => [{ ...conversation, created_at: new Date().toISOString() } as Conversation, ...prev]);
    setConversationId(conversation.id);
    setMessages([]);
  }

  async function handleRenameConversation(id: number, title: string) {
    try {
      const updated = await api.renameConversation(id, title);
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: updated.title } : c)));
    } catch {
      setErrorMessage('Nie udało się zmienić nazwy rozmowy.');
    }
  }

  async function handleDeleteConversation(id: number) {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === conversationId) {
        const remaining = conversations.filter((c) => c.id !== id);
        if (remaining.length > 0) {
          setConversationId(remaining[0].id);
          setMessages(await api.listMessages(remaining[0].id));
        } else {
          const conversation = await api.createConversation();
          setConversations([{ ...conversation, created_at: new Date().toISOString() } as Conversation]);
          setConversationId(conversation.id);
          setMessages([]);
        }
      }
    } catch {
      setErrorMessage('Nie udało się usunąć rozmowy.');
    }
  }

  async function handleChangeSystemPrompt(systemPrompt: string) {
    if (conversationId === null) return;
    const trimmed = systemPrompt.trim() || null;
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, systemPrompt: trimmed } : c)));
    try {
      await api.updateConversationSettings(conversationId, { systemPrompt: trimmed });
    } catch {
      setErrorMessage('Nie udało się zapisać promptu systemowego.');
    }
  }

  async function handleChangeModel(model: string) {
    if (conversationId === null) return;
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, model } : c)));
    try {
      await api.updateConversationSettings(conversationId, { model });
    } catch {
      setErrorMessage('Nie udało się zmienić modelu.');
    }
  }

  async function handleExportConversation() {
    if (conversationId === null) return;
    try {
      const { blob, filename } = await api.exportConversation(conversationId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMessage('Nie udało się wyeksportować rozmowy.');
    }
  }

  function handleFilesPicked(fileList: FileList | null) {
    if (!fileList) return;
    setFileError(null);
    const incoming = Array.from(fileList);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (tooBig) {
      setFileError(`Plik "${tooBig.name}" przekracza limit 8 MB.`);
      return;
    }
    setPendingFiles((prev) => {
      const combined = [...prev, ...incoming];
      if (combined.length > MAX_FILES) {
        setFileError(`Można dołączyć maks. ${MAX_FILES} plików naraz.`);
        return prev;
      }
      return combined;
    });
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Shared driver for send/edit/regenerate: all three stream a reply over
   * SSE, so they all need the same dance — wire up an abortable request,
   * grow `streamingText` as chunks arrive, then refetch the authoritative
   * message list once the stream ends (normally or via Stop).
   */
  async function runStream(
    startRequest: (handlers: import('@/lib/api').StreamHandlers, signal: AbortSignal) => Promise<void>,
    retryCount = 0,
  ) {
    if (conversationId === null) return;
    lastRequestRef.current = startRequest;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSending(true);
    setStreamingText('');
    setErrorMessage(null);
    let rawError: string | null = null;
    try {
      await startRequest(
        {
          onDelta: (text) => setStreamingText((prev) => prev + text),
          onError: (message) => {
            rawError = message;
            setErrorMessage(friendlyErrorMessage(message));
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // user-initiated stop, not an error
      } else if (err instanceof ApiError) {
        rawError = err.message;
        setErrorMessage(friendlyErrorMessage(err.message));
      } else {
        rawError = 'network';
        setErrorMessage('Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.');
      }
    } finally {
      if (controller.signal.aborted) {
        // Give the backend a beat to finish writing the partial reply it
        // saves when a stream is stopped mid-flight.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      try {
        setMessages(await api.listMessages(conversationId));
        const wasFirstTurn = conversations.find((c) => c.id === conversationId)?.title === 'Nowa rozmowa';
        if (wasFirstTurn) setConversations(await api.listConversations());
      } catch {
        setErrorMessage((prev) => prev ?? 'Nie udało się odświeżyć rozmowy. Odśwież stronę.');
      }
      setSending(false);
      setStreamingText('');
      abortControllerRef.current = null;

      // Transient errors (429/5xx/network) get a couple of automatic
      // backoff retries before we hand it to the user as a manual retry.
      const shouldAutoRetry =
        !controller.signal.aborted &&
        rawError &&
        (rawError === 'network' || isRetryableError(rawError)) &&
        retryCount < RETRY_BACKOFF_MS.length;
      if (shouldAutoRetry) {
        setRetrying(true);
        await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS[retryCount]));
        setRetrying(false);
        await runStream(startRequest, retryCount + 1);
      }
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  function handleRetry() {
    if (lastRequestRef.current) runStream(lastRequestRef.current);
  }

  /** Actually submits the turn — called once the message has cleared classification (or the user confirmed anyway). */
  async function submitMessage(content: string, filesToSend: File[], override = false) {
    if (conversationId === null) return;
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
      attachments: filesToSend.map((f, i) => ({
        id: -(i + 1),
        filename: f.name,
        mimeType: f.type || 'application/octet-stream',
        sizeBytes: f.size,
      })),
    };
    setMessages((prev) => [...prev, userMessage]);
    await runStream((handlers, signal) => api.sendMessageStream(conversationId, content, filesToSend, handlers, signal, override));
  }

  /**
   * Every draft goes through the data-sensitivity classifier first: żółta/
   * czerwona block with the reason shown, and a "wyślij mimo to" option that
   * deliberately overrides the block for this one message; zielona sends
   * immediately with no extra confirmation step.
   */
  async function handleSend() {
    if ((!draft.trim() && pendingFiles.length === 0) || conversationId === null) return;
    const filesToSend = pendingFiles;
    const content = draft;
    setDraft('');
    setPendingFiles([]);
    setFileError(null);
    setDraftEstimate(null);

    if (!content.trim()) {
      await submitMessage(content, filesToSend);
      return;
    }

    setClassifying(true);
    try {
      const classification = await api.classifyMessage(conversationId, content);
      if (classification.blocked) {
        setBlockedNotice({
          level: classification.level === 'czerwona' ? 'czerwona' : 'żółta',
          reply: classification.reply ?? 'Ta wiadomość narusza politykę bezpieczeństwa danych i nie została wysłana.',
          content,
          files: filesToSend,
        });
        return;
      }
      await submitMessage(content, filesToSend);
    } catch {
      // Classifier outage shouldn't block the chat — fail open, same as the backend precheck.
      await submitMessage(content, filesToSend);
    } finally {
      setClassifying(false);
    }
  }

  async function handleRegenerate(assistantMessageId: number) {
    if (conversationId === null) return;
    setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    await runStream((handlers, signal) => api.regenerateMessageStream(conversationId, assistantMessageId, handlers, signal));
  }

  async function handleCopy(message: ChatMessage) {
    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId((prev) => (prev === message.id ? null : prev)), 1500);
  }

  /** Exports a single message as a standalone Markdown file (client-side, no backend round-trip). */
  function handleExportMessage(message: ChatMessage) {
    const blob = new Blob([message.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wiadomosc-${message.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Branches the conversation from a given message into a new, independent conversation. */
  async function handleBranch(messageId: number) {
    if (conversationId === null) return;
    const branch = await api.branchConversation(conversationId, messageId);
    setConversations((prev) => [{ ...branch, created_at: branch.created_at ?? new Date().toISOString() } as Conversation, ...prev]);
    setConversationId(branch.id);
    setMessages(await api.listMessages(branch.id));
  }

  function handleStartEdit(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditingDraft(message.content);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingDraft('');
  }

  async function handleSaveEdit(messageId: number) {
    if (conversationId === null || !editingDraft.trim()) return;
    const newContent = editingDraft;
    setMessages((prev) => {
      const cutoff = prev.findIndex((m) => m.id === messageId);
      if (cutoff === -1) return prev;
      return [...prev.slice(0, cutoff), { ...prev[cutoff], content: newContent }];
    });
    setEditingMessageId(null);
    setEditingDraft('');
    await runStream((handlers, signal) => api.editMessageStream(conversationId, messageId, newContent, handlers, signal));
  }

  return (
    <div className="flex h-screen flex-col gap-3 bg-brand-surface dark:bg-zinc-950 p-3">
      <BrandHeader />
      {errorMessage && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <span>{errorMessage}</span>
          <div className="flex shrink-0 items-center gap-3">
            {lastRequestRef.current && !sending && (
              <button
                onClick={handleRetry}
                className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                Spróbuj ponownie
              </button>
            )}
            <button
              onClick={() => setErrorMessage(null)}
              aria-label="Zamknij komunikat błędu"
              className="text-red-700/60 hover:text-red-700 dark:text-red-400/70 dark:hover:text-red-300"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {retrying && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          Ponawiam próbę…
        </div>
      )}
      <div className="flex flex-1 gap-3 overflow-hidden">
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          searchInputRef={searchInputRef}
        />
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 shadow-soft">
          <ConversationSettingsBar
            systemPrompt={conversations.find((c) => c.id === conversationId)?.systemPrompt || ''}
            onChangeSystemPrompt={handleChangeSystemPrompt}
            onExport={handleExportConversation}
            onOpenSidebar={() => setSidebarOpen(true)}
            availableModels={availableModels}
            selectedModel={conversations.find((c) => c.id === conversationId)?.model || 'claude-sonnet-5'}
            onChangeModel={handleChangeModel}
            hasGlobalPrompt={hasGlobalPrompt}
          />
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-3 py-6 sm:px-6 sm:py-8">
              {messages.length === 0 && !sending && (
                <div className="mt-12 flex flex-col items-center gap-6 text-center">
                  <div>
                    <p className="text-brand-dark/70 dark:text-zinc-300">
                      Nowa rozmowa. Napisz wiadomość, wybierz przykładowy prompt
                      albo spróbuj <span className="font-mono">/pomoc</span>.
                    </p>
                    <p className="mt-1 text-sm text-brand-dark/45 dark:text-zinc-500">
                      Możesz też załączyć plik (📎), poprosić o gotowy dokument
                      (artefakt otworzy się w panelu obok) albo użyć gotowej
                      slash-komendy, np. <span className="font-mono">/brief-kreatywny</span>.
                    </p>
                  </div>
                  <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                    {EXAMPLE_PROMPTS.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => {
                          setDraft(example);
                          textareaRef.current?.focus();
                        }}
                        className="rounded-xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-800 px-4 py-3 text-left text-sm text-brand-dark/80 dark:text-zinc-200 shadow-soft transition hover:border-brand-primary/60 hover:bg-brand-primary/5 dark:hover:bg-zinc-700"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1;
                const isEditing = editingMessageId === m.id;
                return (
                  <div key={m.id} className={clsx('group flex flex-col gap-2', m.role === 'user' && 'items-end')}>
                    {m.attachments && m.attachments.length > 0 && (
                      <div className={clsx('flex max-w-[75%] flex-wrap gap-2', m.role === 'user' && 'justify-end')}>
                        {m.attachments.map((a) => (
                          <AttachmentChip key={a.id} attachment={a} />
                        ))}
                      </div>
                    )}
                    {isEditing ? (
                      <div className="w-full max-w-[75%] rounded-2xl border border-brand-orange/50 bg-brand-white dark:bg-zinc-900 p-3">
                        <textarea
                          autoFocus
                          rows={3}
                          className="w-full resize-none bg-transparent text-brand-dark dark:text-zinc-100 focus:outline-none"
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="rounded-md px-3 py-1.5 text-sm text-brand-dark/60 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800"
                          >
                            Anuluj
                          </button>
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            className="flex items-center gap-1 rounded-md bg-brand-orange px-3 py-1.5 text-sm font-bold text-brand-white hover:brightness-95"
                          >
                            <Check size={14} />
                            Zapisz i wyślij ponownie
                          </button>
                        </div>
                      </div>
                    ) : m.content && m.role === 'assistant' && m.commandUsed && m.artifactId && ARTIFACT_COMMAND_TITLES[m.commandUsed] ? (
                      <ArtifactCard
                        title={ARTIFACT_COMMAND_TITLES[m.commandUsed]}
                        onOpen={() => setOpenArtifactId(m.artifactId!)}
                      />
                    ) : (
                      m.content && (
                        <div
                          className={clsx(
                            'prose prose-sm dark:prose-invert max-w-[75%] leading-relaxed',
                            m.role === 'user'
                              ? 'rounded-2xl bg-brand-orange/10 px-4 py-2.5 text-brand-dark dark:text-zinc-100'
                              : 'max-w-full text-brand-dark dark:text-zinc-100',
                          )}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content}</ReactMarkdown>
                        </div>
                      )
                    )}
                    {m.role === 'assistant' && m.citations && m.citations.length > 0 && (
                      <CitationList citations={m.citations} />
                    )}
                    {m.role === 'assistant' && m.generatedFiles && m.generatedFiles.length > 0 && (
                      <GeneratedFileList files={m.generatedFiles} />
                    )}
                    {!isEditing && !sending && (
                      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        {m.role === 'user' && (
                          <button
                            onClick={() => handleStartEdit(m)}
                            aria-label="Edytuj wiadomość"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                          >
                            <Pencil size={12} />
                            Edytuj
                          </button>
                        )}
                        {m.role === 'assistant' && m.content && !m.commandUsed && (
                          <button
                            onClick={() => handleCopy(m)}
                            aria-label="Kopiuj odpowiedź"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                          >
                            {copiedMessageId === m.id ? <Check size={12} /> : <Copy size={12} />}
                            {copiedMessageId === m.id ? 'Skopiowano' : 'Kopiuj'}
                          </button>
                        )}
                        {m.role === 'assistant' && m.content && !m.commandUsed && (
                          <button
                            onClick={() => handleExportMessage(m)}
                            aria-label="Eksportuj wiadomość"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                          >
                            <Download size={12} />
                            Eksportuj
                          </button>
                        )}
                        {m.role === 'assistant' && isLast && !m.commandUsed && (
                          <button
                            onClick={() => handleRegenerate(m.id)}
                            aria-label="Regeneruj odpowiedź"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                          >
                            <RefreshCw size={12} />
                            Regeneruj
                          </button>
                        )}
                        <button
                          onClick={() => handleBranch(m.id)}
                          aria-label="Rozgałęź rozmowę od tego miejsca"
                          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                        >
                          <GitBranch size={12} />
                          Rozgałęź
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {sending && (
                <div className="prose prose-sm dark:prose-invert max-w-full leading-relaxed text-brand-dark dark:text-zinc-100">
                  {streamingText ? (
                    <span className="relative">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingText}</ReactMarkdown>
                      <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-brand-dark/70 dark:bg-zinc-100/70"
                      />
                    </span>
                  ) : (
                    <div className="flex items-center gap-2 text-brand-dark/50 dark:text-zinc-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-orange" />
                      Asystent pisze…
                    </div>
                  )}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>
          <div className="border-t border-brand-orange/20 bg-brand-orange/10 px-3 py-3 sm:px-6 sm:py-4">
            <div className="mx-auto max-w-3xl">
              {fileError && <p className="mb-2 text-sm text-brand-orange">{fileError}</p>}
              {classifying && (
                <div className="mb-2 flex items-center gap-2 text-xs text-brand-dark/50 dark:text-zinc-400">
                  <Loader2 size={12} className="animate-spin" />
                  Sprawdzam wiadomość pod kątem danych wrażliwych…
                </div>
              )}
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-brand-dark dark:text-zinc-100"
                    >
                      <span className="max-w-[160px] truncate">{f.name}</span>
                      <span className="text-brand-dark/40 dark:text-zinc-500">{formatSize(f.size)}</span>
                      <button onClick={() => removePendingFile(i)} aria-label="Usuń plik" className="text-brand-dark/40 dark:text-zinc-500 hover:text-brand-orange">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-3xl border border-brand-border dark:border-zinc-700 bg-brand-white dark:bg-zinc-900 px-4 py-2.5 shadow-sm focus-within:border-brand-orange/60">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleFilesPicked(e.target.files);
                    e.target.value = '';
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Załącz plik"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-dark/60 dark:text-zinc-400 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 hover:text-brand-dark dark:hover:text-zinc-100"
                >
                  <Paperclip size={18} />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-brand-dark dark:text-zinc-100 placeholder:text-brand-dark/40 dark:placeholder:text-zinc-500 focus:outline-none"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Napisz wiadomość lub /pomoc…"
                />
                {sending ? (
                  <button
                    onClick={handleStop}
                    aria-label="Zatrzymaj generowanie"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark text-brand-white transition hover:brightness-125"
                  >
                    <Square size={14} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!draft.trim() && pendingFiles.length === 0) || classifying}
                    aria-label="Wyślij"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-brand-white transition hover:brightness-95 disabled:opacity-30"
                  >
                    {classifying ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={18} />}
                  </button>
                )}
              </div>
              {draftEstimate && draftEstimate.inputTokens > 0 && (
                <p className="mt-1.5 text-right text-xs text-brand-dark/40 dark:text-zinc-500">
                  ~{draftEstimate.inputTokens.toLocaleString('pl-PL')} tok. wejściowych · ~$
                  {draftEstimate.estimatedCostUsd.toFixed(4)} (bez odpowiedzi)
                </p>
              )}
            </div>
          </div>
        </div>
        {openArtifactId !== null && <ArtifactPanel artifactId={openArtifactId} onClose={() => setOpenArtifactId(null)} />}
        {blockedNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-brand-white dark:bg-zinc-900 p-6 shadow-xl">
              <h2 className="text-base font-semibold text-brand-dark dark:text-zinc-100">
                Wiadomość zablokowana — poziom {blockedNotice.level === 'czerwona' ? 'czerwony' : 'żółty'}
              </h2>
              <p className="mt-2 text-sm text-brand-dark/70 dark:text-zinc-300">{blockedNotice.reply}</p>
              <p className="mt-3 text-xs text-brand-dark/50 dark:text-zinc-400">
                Wysłanie mimo blokady jest świadomym wyjątkiem od polityki bezpieczeństwa danych — zostanie odnotowane w dzienniku audytowym.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => setBlockedNotice(null)}
                  disabled={overriding}
                  className="rounded-full border border-brand-dark/20 dark:border-zinc-600 px-4 py-2 text-sm font-medium text-brand-dark dark:text-zinc-100 hover:bg-brand-surface/60 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Anuluj / edytuj
                </button>
                <button
                  onClick={async () => {
                    if (!blockedNotice) return;
                    const { content, files } = blockedNotice;
                    setOverriding(true);
                    try {
                      await submitMessage(content, files, true);
                      setBlockedNotice(null);
                    } finally {
                      setOverriding(false);
                    }
                  }}
                  disabled={overriding}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50"
                >
                  {overriding ? 'Wysyłanie…' : 'Wyślij mimo to'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <RequireAuth>
      <ChatView />
    </RequireAuth>
  );
}
