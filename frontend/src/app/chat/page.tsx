'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Plus, MessageSquare, Paperclip, X, FileText, FileOutput, Download, Square, RefreshCw, Pencil, Check, Trash2, Menu } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { api, ApiError, type Attachment, type ChatMessage } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

// Slash commands whose replies are full deliverables, not chat chatter —
// these get a compact card in the flow that opens the real thing in the
// artifact side panel, instead of dumping the whole text into the timeline.
const ARTIFACT_COMMAND_TITLES: Record<string, string> = {
  '/brief-kreatywny': 'Brief kreatywny',
  '/tekst-reklamowy': 'Teksty reklamowe',
  '/pomysly-na-posty': 'Pomysły na posty',
  '/analiza-konkurencji': 'Analiza konkurencji',
};

interface Artifact {
  title: string;
  content: string;
}

function artifactFilename(title: string) {
  return `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.md`;
}

function ArtifactPanel({ artifact, onClose }: { artifact: Artifact; onClose: () => void }) {
  function handleDownload() {
    const blob = new Blob([artifact.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifactFilename(artifact.title);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="fixed inset-0 z-40 flex w-full shrink-0 flex-col border-l border-brand-border bg-brand-white sm:static sm:z-auto sm:w-[420px]">
      <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
        <div className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-dark">
          <FileOutput size={16} className="text-brand-orange" />
          {artifact.title}
        </div>
        <button onClick={onClose} aria-label="Zamknij artefakt" className="text-brand-dark/50 hover:text-brand-dark">
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="prose prose-sm max-w-none text-brand-dark">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{artifact.content}</ReactMarkdown>
        </div>
      </div>
      <div className="border-t border-brand-border px-5 py-3">
        <button
          onClick={handleDownload}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2 text-sm font-bold text-brand-white hover:brightness-95"
        >
          <Download size={16} />
          Pobierz .md
        </button>
      </div>
    </aside>
  );
}

function ArtifactCard({ title, onOpen }: { title: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full max-w-[75%] items-center gap-3 rounded-xl border border-brand-border bg-brand-white px-4 py-3 text-left shadow-sm hover:border-brand-orange/50 hover:bg-brand-surface/30"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
        <FileOutput size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-brand-dark">{title}</div>
        <div className="text-xs text-brand-dark/50">Otwórz artefakt</div>
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
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
  open: boolean;
  onClose: () => void;
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
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-brand-orange transition-transform duration-200 md:static md:z-auto md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
      <div className="p-3">
        <button
          onClick={() => {
            onNew();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg border border-brand-white/40 bg-brand-white/10 px-3 py-2 text-sm font-medium text-brand-white hover:bg-brand-white/20"
        >
          <Plus size={16} />
          Nowa rozmowa
        </button>
      </div>
      <div className="px-3 pb-2">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Szukaj w rozmowach…"
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
                  ? 'border-brand-white bg-brand-white/15 font-medium text-brand-white'
                  : 'border-transparent text-brand-white/75 hover:bg-brand-white/10',
              )}
            >
              <button
                onClick={() => {
                  onSelect(c.id);
                  onClose();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 py-2"
              >
                <MessageSquare size={14} className={clsx('shrink-0', c.id === activeId ? 'text-brand-white' : 'opacity-70')} />
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
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-brand-border">
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
      className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-white px-3 py-2 text-sm text-brand-dark hover:bg-brand-surface/50"
    >
      <FileText size={16} className="shrink-0 opacity-60" />
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-xs text-brand-dark/40">{formatSize(attachment.sizeBytes)}</span>
    </a>
  );
}

function friendlyErrorMessage(raw: string): string {
  if (/429/.test(raw)) return 'Zbyt wiele żądań w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.';
  if (/^Request failed: 5\d\d/.test(raw) || /500/.test(raw)) {
    return 'Wystąpił błąd serwera. Spróbuj ponownie za chwilę.';
  }
  return raw || 'Coś poszło nie tak. Spróbuj ponownie.';
}

function ConversationSettingsBar({
  systemPrompt,
  onChangeSystemPrompt,
  onExport,
  onOpenSidebar,
}: {
  systemPrompt: string;
  onChangeSystemPrompt: (prompt: string) => void;
  onExport: () => void;
  onOpenSidebar: () => void;
}) {
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [draft, setDraft] = useState(systemPrompt);

  useEffect(() => setDraft(systemPrompt), [systemPrompt]);

  return (
    <div className="border-b border-brand-border bg-brand-white px-3 py-2 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 text-sm">
        <button
          onClick={onOpenSidebar}
          aria-label="Otwórz listę rozmów"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-brand-dark/60 hover:bg-brand-surface/60 md:hidden"
        >
          <Menu size={18} />
        </button>
        <div className="flex items-center gap-1.5 text-brand-dark/60">
          Pracujesz na modelu <span className="font-medium text-brand-dark">Claude Sonnet 5</span>
        </div>
        <button
          onClick={() => setShowPromptEditor((v) => !v)}
          className="text-brand-dark/60 underline decoration-dotted hover:text-brand-dark"
        >
          {systemPrompt ? 'Edytuj prompt systemowy' : 'Dodaj prompt systemowy'}
        </button>
        <button
          onClick={onExport}
          className="ml-auto flex items-center gap-1.5 text-brand-dark/60 hover:text-brand-dark"
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
            className="w-full resize-none rounded-lg border border-brand-border px-3 py-2 text-sm text-brand-dark outline-none focus:border-brand-orange"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              onClick={() => setShowPromptEditor(false)}
              className="rounded-md px-3 py-1 text-xs text-brand-dark/60 hover:bg-brand-surface/60"
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
  const [editingDraft, setEditingDraft] = useState('');
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
      setConversationId(list[0].id);
      setMessages(await api.listMessages(list[0].id));
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, streamingText]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

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
  async function runStream(startRequest: (handlers: import('@/lib/api').StreamHandlers, signal: AbortSignal) => Promise<void>) {
    if (conversationId === null) return;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setSending(true);
    setStreamingText('');
    setErrorMessage(null);
    try {
      await startRequest(
        {
          onDelta: (text) => setStreamingText((prev) => prev + text),
          onError: (message) => setErrorMessage(friendlyErrorMessage(message)),
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // user-initiated stop, not an error
      } else if (err instanceof ApiError) {
        setErrorMessage(friendlyErrorMessage(err.message));
      } else {
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
    }
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  async function handleSend() {
    if ((!draft.trim() && pendingFiles.length === 0) || conversationId === null) return;
    const filesToSend = pendingFiles;
    const content = draft;
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
    setDraft('');
    setPendingFiles([]);
    setFileError(null);
    await runStream((handlers, signal) => api.sendMessageStream(conversationId, content, filesToSend, handlers, signal));
  }

  async function handleRegenerate(assistantMessageId: number) {
    if (conversationId === null) return;
    setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
    await runStream((handlers, signal) => api.regenerateMessageStream(conversationId, assistantMessageId, handlers, signal));
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
    <div className="flex h-screen flex-col">
      <BrandHeader />
      {errorMessage && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-700">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            aria-label="Zamknij komunikat błędu"
            className="shrink-0 text-red-700/60 hover:text-red-700"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
          onRename={handleRenameConversation}
          onDelete={handleDeleteConversation}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <ConversationSettingsBar
            systemPrompt={conversations.find((c) => c.id === conversationId)?.systemPrompt || ''}
            onChangeSystemPrompt={handleChangeSystemPrompt}
            onExport={handleExportConversation}
            onOpenSidebar={() => setSidebarOpen(true)}
          />
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-3 py-6 sm:px-6 sm:py-8">
              {messages.length === 0 && !sending && (
                <p className="mt-16 text-center text-brand-dark/50">
                  Napisz wiadomość albo spróbuj <span className="font-mono">/pomoc</span>.
                </p>
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
                      <div className="w-full max-w-[75%] rounded-2xl border border-brand-orange/50 bg-brand-white p-3">
                        <textarea
                          autoFocus
                          rows={3}
                          className="w-full resize-none bg-transparent text-brand-dark focus:outline-none"
                          value={editingDraft}
                          onChange={(e) => setEditingDraft(e.target.value)}
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="rounded-md px-3 py-1.5 text-sm text-brand-dark/60 hover:bg-brand-surface/60"
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
                    ) : m.content && m.role === 'assistant' && m.commandUsed && ARTIFACT_COMMAND_TITLES[m.commandUsed] ? (
                      <ArtifactCard
                        title={ARTIFACT_COMMAND_TITLES[m.commandUsed]}
                        onOpen={() => setOpenArtifact({ title: ARTIFACT_COMMAND_TITLES[m.commandUsed!], content: m.content })}
                      />
                    ) : (
                      m.content && (
                        <div
                          className={clsx(
                            'prose prose-sm max-w-[75%] leading-relaxed',
                            m.role === 'user'
                              ? 'rounded-2xl bg-brand-orange/10 px-4 py-2.5 text-brand-dark'
                              : 'max-w-full text-brand-dark',
                          )}
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{m.content}</ReactMarkdown>
                        </div>
                      )
                    )}
                    {!isEditing && !sending && (
                      <div className="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        {m.role === 'user' && (
                          <button
                            onClick={() => handleStartEdit(m)}
                            aria-label="Edytuj wiadomość"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 hover:bg-brand-surface/60 hover:text-brand-dark"
                          >
                            <Pencil size={12} />
                            Edytuj
                          </button>
                        )}
                        {m.role === 'assistant' && isLast && !m.commandUsed && (
                          <button
                            onClick={() => handleRegenerate(m.id)}
                            aria-label="Regeneruj odpowiedź"
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-brand-dark/50 hover:bg-brand-surface/60 hover:text-brand-dark"
                          >
                            <RefreshCw size={12} />
                            Regeneruj
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {sending && (
                <div className="prose prose-sm max-w-full leading-relaxed text-brand-dark">
                  {streamingText ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{streamingText}</ReactMarkdown>
                  ) : (
                    <div className="flex items-center gap-2 text-brand-dark/50">
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
              {pendingFiles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingFiles.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg border border-brand-border bg-brand-white px-2.5 py-1.5 text-xs text-brand-dark"
                    >
                      <span className="max-w-[160px] truncate">{f.name}</span>
                      <span className="text-brand-dark/40">{formatSize(f.size)}</span>
                      <button onClick={() => removePendingFile(i)} aria-label="Usuń plik" className="text-brand-dark/40 hover:text-brand-orange">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 rounded-3xl border border-brand-border bg-brand-white px-4 py-2.5 shadow-sm focus-within:border-brand-orange/60">
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-dark/60 hover:bg-brand-surface/60 hover:text-brand-dark"
                >
                  <Paperclip size={18} />
                </button>
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="max-h-[200px] flex-1 resize-none bg-transparent py-1.5 text-brand-dark placeholder:text-brand-dark/40 focus:outline-none"
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
                    disabled={!draft.trim() && pendingFiles.length === 0}
                    aria-label="Wyślij"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-orange text-brand-white transition hover:brightness-95 disabled:opacity-30"
                  >
                    <ArrowUp size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {openArtifact && <ArtifactPanel artifact={openArtifact} onClose={() => setOpenArtifact(null)} />}
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
