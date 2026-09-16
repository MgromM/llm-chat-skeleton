export interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

export interface Attachment {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConversationSettings {
  id: number;
  title: string | null;
  created_at: string;
  model: string | null;
  systemPrompt: string | null;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
  attachments?: Attachment[];
  commandUsed?: string | null;
}

export interface CostRow {
  model: string;
  command_used: string | null;
  requests: string;
  cost_usd: string;
  avg_latency_ms: string;
}

export interface QualityRow {
  judge_model: string;
  avg_score: string;
  scored_messages: string;
}

export interface KnowledgeDocument {
  id: number;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  uploaded_by_email: string;
  chunk_count: number;
}

export interface EnterpriseComparison {
  periodFrom: string;
  periodTo: string;
  ourToolCostUsd: number;
  enterpriseSeatCostUsd: number;
  enterpriseSeats: number;
  enterpriseCostUsd: number;
  cheaperOption: 'our_tool' | 'enterprise' | null;
}

// Streaming chat calls go straight to the backend, bypassing Next's
// rewrite proxy — that proxy drops long-lived SSE connections mid-stream.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? '';

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {}

/** On a 401, the stored token is stale (expired or signed with a rotated secret) — clear it and send the user back to login. */
function handleUnauthorized() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('token');
  if (window.location.pathname !== '/login') window.location.href = '/login';
}

export interface StreamResult {
  reply: string;
  messageId: number;
  commandUsed: string | null;
  blocked?: boolean;
}

export interface StreamHandlers {
  onDelta?: (text: string) => void;
  onDone?: (result: StreamResult) => void;
  onError?: (message: string) => void;
}

/**
 * Reads a `text/event-stream` response body (our chat SSE format: `delta`
 * chunks, one final `done`, or an `error`) and dispatches to the handlers as
 * events arrive — used by send/edit/regenerate, which all stream a reply.
 */
async function consumeSseResponse(res: Response, handlers: StreamHandlers) {
  if (!res.ok || !res.body) {
    if (res.status === 401) handleUnauthorized();
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const payload = JSON.parse(line.slice(5).trim());
      if (payload.type === 'delta') handlers.onDelta?.(payload.text);
      else if (payload.type === 'done') handlers.onDone?.(payload);
      else if (payload.type === 'error') handlers.onError?.(payload.error);
    }
  }
}

/** Generic fetcher, also used directly as the SWR fetcher function. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized();
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  googleLoginUrl: () => apiFetch<{ url: string }>('/auth/google/login-url'),
  me: () => apiFetch<LoginResponse['user']>('/auth/me'),
  deleteAccount: () => apiFetch<{ ok: true }>('/auth/me', { method: 'DELETE' }),
  listConversations: () => apiFetch<ConversationSettings[]>('/chat/conversations'),
  createConversation: (title?: string) =>
    apiFetch<ConversationSettings>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  listMessages: (conversationId: number) =>
    apiFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
  renameConversation: (conversationId: number, title: string) =>
    apiFetch<ConversationSettings>(`/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  updateConversationSettings: (conversationId: number, updates: { model?: string; systemPrompt?: string | null }) =>
    apiFetch<ConversationSettings>(`/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteConversation: (conversationId: number) =>
    apiFetch<{ ok: true }>(`/chat/conversations/${conversationId}`, { method: 'DELETE' }),
  availableModels: () => apiFetch<{ models: string[] }>('/chat/conversations/models'),
  searchConversations: (q: string) =>
    apiFetch<(ConversationSettings & { matchedSnippet: string })[]>(`/chat/conversations/search?q=${encodeURIComponent(q)}`),
  exportConversation: async (conversationId: number): Promise<{ blob: Blob; filename: string }> => {
    const res = await fetch(`/api/chat/conversations/${conversationId}/export`, { headers: authHeaders() });
    if (!res.ok) {
      if (res.status === 401) handleUnauthorized();
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? `Request failed: ${res.status}`);
    }
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match ? decodeURIComponent(match[1]) : `rozmowa-${conversationId}.md`;
    return { blob: await res.blob(), filename };
  },
  sendMessageStream: async (
    conversationId: number,
    message: string,
    files: File[] = [],
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append('message', message);
    for (const file of files) form.append('files', file);
    const res = await fetch(`${BACKEND_URL}/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal,
    });
    return consumeSseResponse(res, handlers);
  },
  editMessageStream: async (
    conversationId: number,
    messageId: number,
    content: string,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${BACKEND_URL}/chat/conversations/${conversationId}/messages/${messageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content }),
      signal,
    });
    return consumeSseResponse(res, handlers);
  },
  regenerateMessageStream: async (
    conversationId: number,
    messageId: number,
    handlers: StreamHandlers,
    signal?: AbortSignal,
  ) => {
    const res = await fetch(`${BACKEND_URL}/chat/conversations/${conversationId}/messages/${messageId}/regenerate`, {
      method: 'POST',
      headers: authHeaders(),
      signal,
    });
    return consumeSseResponse(res, handlers);
  },
  attachmentUrl: (attachmentId: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return `/api/chat/attachments/${attachmentId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
  listKnowledgeDocuments: () => apiFetch<KnowledgeDocument[]>('/knowledge/documents'),
  uploadKnowledgeDocument: async (file: File, title?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    const res = await fetch('/api/knowledge/documents', { method: 'POST', headers: authHeaders(), body: form });
    if (!res.ok) {
      if (res.status === 401) handleUnauthorized();
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<{ id: number; chunkCount: number }>;
  },
  deleteKnowledgeDocument: (id: number) => apiFetch<{ ok: true }>(`/knowledge/documents/${id}`, { method: 'DELETE' }),
  costSummary: () => apiFetch<CostRow[]>('/metrics/costs'),
  qualitySummary: () => apiFetch<QualityRow[]>('/metrics/quality'),
  enterpriseComparison: () => apiFetch<EnterpriseComparison>('/metrics/enterprise-comparison'),
};
