export interface LocalCheckFileResult {
  filename: string;
  level: 'zielona' | 'żółta' | 'czerwona';
  rationale: string;
  hits: { category: string; count: number }[];
}

export interface LocalCheckResponse {
  overallLevel: 'zielona' | 'żółta' | 'czerwona';
  results: LocalCheckFileResult[];
}

export interface MeResponse {
  id: number;
  email: string;
  role: string;
  defaultSystemPrompt: string | null;
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
  branchedFromConversationId?: number | null;
  branchedFromMessageId?: number | null;
  projectId?: number | null;
  style?: string | null;
  isTemporary?: boolean;
  extendedThinking?: boolean;
}

export interface PublicConversation {
  title: string | null;
  createdAt: string;
  messages: { id: number; role: 'user' | 'assistant'; content: string; createdAt: string }[];
}

export interface UsageInfo {
  periodStart: string;
  orgBudget: { limitUsd: number; spentUsd: number } | null;
  userBudget: { limitUsd: number; spentUsd: number } | null;
  mine: { messages: number; costUsd: number };
}

export interface Citation {
  url: string;
  title: string;
}

export interface GeneratedFile {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
  attachments?: Attachment[];
  commandUsed?: string | null;
  citations?: Citation[] | null;
  generatedFiles?: GeneratedFile[] | null;
  thinkingContent?: string | null;
  artifactId?: number | null;
}

export type ArtifactType = 'markdown' | 'html';

export interface Artifact {
  id: number;
  conversationId?: number;
  title: string;
  type: ArtifactType;
  currentVersion: number;
  shareToken?: string | null;
  content: string;
  previewContent: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ArtifactVersionSummary {
  version: number;
  createdAt: string;
}

export interface CostRow {
  model: string;
  command_used: string | null;
  requests: string;
  cost_usd: string;
  avg_latency_ms: string;
}

export interface CostByUserRow {
  user_id: number;
  email: string;
  requests: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}


export interface LeakAlert {
  id: number;
  conversation_id: number | null;
  user_id: number;
  email: string;
  category: string | null;
  confidence: string | null;
  rationale: string | null;
  judge_model: string | null;
  reviewed: boolean;
  created_at: string;
  source: 'auto' | 'manual';
  severity: 'low' | 'medium' | 'high' | 'critical' | null;
  description: string | null;
  has_screenshot: boolean;
}

export interface ReviewItem {
  id: number;
  item_type: 'canteen_catalog' | 'email_complaint';
  title: string;
  rationale: string;
  source_label: string;
  source_url: string | null;
  source_ref: unknown;
  confidence: string | null; // Postgres NUMERIC comes back as a string through `pg`, same as LeakAlert.confidence above.
  reviewed: boolean;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ReviewItemsResponse {
  items: ReviewItem[];
  total: number;
}

export interface CanteenFacility {
  id: number;
  name: string;
  external_code: string | null;
  city: string | null;
  address: string | null;
  active: boolean;
  created_at: string;
}

export interface CanteenProduct {
  id: number;
  normalized_name: string;
  display_name: string;
  price: string; // Postgres NUMERIC comes back as a string through `pg`, same as LeakAlert.confidence above.
  unit: string | null;
  category: string | null;
  updated_at: string;
}

export interface CanteenCatalogChange {
  id: number;
  extraction_run_id: number;
  normalized_name: string;
  display_name: string | null;
  change_type: 'added' | 'removed' | 'price_changed' | 'reappeared';
  old_price: string | null;
  new_price: string | null;
  unit: string | null;
  flagged_implausible: boolean;
  flag_reason: string | null;
  applied: boolean;
  created_at: string;
}

export interface CanteenIngestChange {
  id: number;
  type: 'added' | 'removed' | 'price_changed' | 'reappeared';
  normalizedName: string;
  flagged: boolean;
  flagReason: string | null;
  applied: boolean;
}

export interface CanteenIngestResult {
  status: 'ok' | 'partial' | 'failed';
  runId: number;
  confidence?: number | null;
  linesTotal?: number;
  linesParsed?: number;
  changes?: CanteenIngestChange[];
  error?: string;
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

export interface AdminUser {
  id: number;
  email: string;
  role: string;
}

export interface Client {
  id: number;
  name: string;
  ai_consent: boolean;
  ai_consent_updated_at: string | null;
  ai_consent_updated_by: string | null;
}

export interface ClientConsentHistoryEntry {
  id: number;
  old_value: boolean | null;
  new_value: boolean;
  changed_at: string;
  changed_by: string | null;
}

export interface AiAuditLogEntry {
  id: number;
  conversation_id: number;
  user_id: number;
  email: string;
  data_categories_sent: string[];
  redaction_applied: boolean;
  precheck_level: string | null;
  model: string;
  purpose: string | null;
  created_at: string;
}

export interface RetentionStatus {
  expiredConversationCount: number;
}

export interface RetentionRunResult {
  deletedCount: number;
  wouldDeleteCount: number;
  dryRun: boolean;
}

export interface ClientTeamAssignment {
  id: number;
  user_id: number;
  email: string;
  assigned_at: string;
  assigned_by: string | null;
}

export interface ClientAccessAuditRow {
  client_id: number;
  client_name: string;
  user_id: number;
  user_email: string;
}

export interface GeneratedFileEntry {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  messageId: number;
  createdAt: string;
  conversationId: number;
  conversationTitle: string | null;
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
  citations?: Citation[] | null;
  generatedFiles?: GeneratedFile[] | null;
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
  let receivedTerminalEvent = false;
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
      else if (payload.type === 'done') {
        receivedTerminalEvent = true;
        handlers.onDone?.(payload);
      } else if (payload.type === 'error') {
        receivedTerminalEvent = true;
        handlers.onError?.(payload.error);
      }
    }
  }
  // The connection closed (network drop, proxy timeout, server crash) before
  // a `done`/`error` event arrived — the reply is incomplete with no signal
  // other than the silently-ended stream, so surface it as its own error.
  if (!receivedTerminalEvent) {
    throw new ApiError('stream_interrupted');
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
  googleLoginUrl: () => apiFetch<{ url: string }>('/auth/google/login-url'),
  me: () => apiFetch<MeResponse>('/auth/me'),
  deleteAccount: () => apiFetch<{ ok: true }>('/auth/me', { method: 'DELETE' }),
  updateDefaultSystemPrompt: (defaultSystemPrompt: string | null) =>
    apiFetch<{ defaultSystemPrompt: string | null }>('/auth/me/default-system-prompt', {
      method: 'PATCH',
      body: JSON.stringify({ defaultSystemPrompt }),
    }),
  sendSupportMessage: (message: string, conversationId?: string | null) =>
    apiFetch<{ id: number; created_at: string }>('/support', {
      method: 'POST',
      body: JSON.stringify({ message, conversationId: conversationId ?? null }),
    }),
  // Item 17: temporary/incognito conversations are excluded from the
  // default list; pass includeTemporary=true only when one is currently
  // active in the UI, so it doesn't vanish from the sidebar mid-session.
  listConversations: (includeTemporary?: boolean) =>
    apiFetch<ConversationSettings[]>(
      `/chat/conversations${includeTemporary ? '?includeTemporary=true' : ''}`,
    ),
  listGeneratedFiles: () => apiFetch<GeneratedFileEntry[]>('/chat/generated-files'),
  getArtifact: (artifactId: number) => apiFetch<Artifact>(`/artifacts/${artifactId}`),
  listArtifactVersions: (artifactId: number) =>
    apiFetch<ArtifactVersionSummary[]>(`/artifacts/${artifactId}/versions`),
  getArtifactVersion: (artifactId: number, version: number) =>
    apiFetch<Artifact>(`/artifacts/${artifactId}/versions/${version}`),
  updateArtifact: (artifactId: number, content: string) =>
    apiFetch<Artifact>(`/artifacts/${artifactId}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  shareArtifact: (artifactId: number) =>
    apiFetch<{ shareToken: string }>(`/artifacts/${artifactId}/share`, { method: 'POST' }),
  unshareArtifact: (artifactId: number) =>
    apiFetch<{ ok: true }>(`/artifacts/${artifactId}/share`, { method: 'DELETE' }),
  getPublicArtifact: (token: string) => apiFetch<Artifact>(`/public/artifacts/${token}`),
  getPublicConversation: (token: string) =>
    apiFetch<PublicConversation>(`/public/conversations/${token}`),
  createConversation: (title?: string, isTemporary?: boolean) =>
    apiFetch<ConversationSettings>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, isTemporary }),
    }),
  listMessages: (conversationId: number) =>
    apiFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
  renameConversation: (conversationId: number, title: string) =>
    apiFetch<ConversationSettings>(`/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (conversationId: number) =>
    apiFetch<{ ok: true }>(`/chat/conversations/${conversationId}`, { method: 'DELETE' }),
  branchConversation: (conversationId: number, messageId: number) =>
    apiFetch<ConversationSettings>(`/chat/conversations/${conversationId}/messages/${messageId}/branch`, {
      method: 'POST',
    }),
  getMyUsage: () => apiFetch<UsageInfo>('/chat/me/usage'),
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
  localCheckScan: async (files: File[]): Promise<LocalCheckResponse> => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    const res = await fetch(`${BACKEND_URL}/local-check/scan`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) handleUnauthorized();
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? `Request failed: ${res.status}`);
    }
    return res.json();
  },
  classifyMessage: (conversationId: number, message: string) =>
    apiFetch<{ blocked: boolean; level: 'zielona' | 'żółta' | 'czerwona'; category: string | null; reply: string | null }>(
      `/chat/conversations/${conversationId}/classify`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  estimateCost: (conversationId: number, message: string) =>
    apiFetch<{ inputTokens: number; model: string }>(
      `/chat/conversations/${conversationId}/estimate`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  sendMessageStream: async (
    conversationId: number,
    message: string,
    files: File[] = [],
    handlers: StreamHandlers,
    signal?: AbortSignal,
    override = false,
  ) => {
    const form = new FormData();
    form.append('message', message);
    if (override) form.append('override', 'true');
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
  generatedFileUrl: (fileId: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return `/api/chat/generated-files/${fileId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
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
  listUsers: () => apiFetch<AdminUser[]>('/auth/users'),
  setUserRole: (id: number, role: string) =>
    apiFetch<AdminUser>(`/auth/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  listClients: () => apiFetch<Client[]>('/clients'),
  createClient: (name: string) => apiFetch<Client>('/clients', { method: 'POST', body: JSON.stringify({ name }) }),
  setClientConsent: (id: number, aiConsent: boolean) =>
    apiFetch<Client>(`/clients/${id}/consent`, { method: 'PATCH', body: JSON.stringify({ aiConsent }) }),
  clientConsentHistory: (id: number) =>
    apiFetch<ClientConsentHistoryEntry[]>(`/clients/${id}/consent-history`),
  clientTeam: (id: number) => apiFetch<ClientTeamAssignment[]>(`/clients/${id}/team`),
  assignClientTeamMember: (id: number, userId: number) =>
    apiFetch<ClientTeamAssignment>(`/clients/${id}/team`, { method: 'POST', body: JSON.stringify({ userId }) }),
  unassignClientTeamMember: (id: number, userId: number) =>
    apiFetch<{ ok: true }>(`/clients/${id}/team/${userId}`, { method: 'DELETE' }),
  clientAccessAudit: () => apiFetch<ClientAccessAuditRow[]>('/clients/access-audit'),
  aiAuditLog: (params: { from?: string; to?: string; userId?: number; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.userId) qs.set('userId', String(params.userId));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    const query = qs.toString();
    return apiFetch<AiAuditLogEntry[]>(`/metrics/ai-audit-log${query ? `?${query}` : ''}`);
  },
  retentionStatus: () => apiFetch<RetentionStatus>('/metrics/retention'),
  runRetentionCleanup: (dryRun: boolean) =>
    apiFetch<RetentionRunResult>('/metrics/retention/run', { method: 'POST', body: JSON.stringify({ dryRun }) }),
  listLeakAlerts: (onlyUnreviewed = true) =>
    apiFetch<LeakAlert[]>(`/metrics/leak-alerts${onlyUnreviewed ? '?reviewed=false' : ''}`),
  reviewLeakAlert: (id: number) => apiFetch<{ ok: true }>(`/metrics/leak-alerts/${id}/review`, { method: 'POST' }),
  listReviewItems: (reviewedFalseOnly = true) =>
    apiFetch<ReviewItemsResponse>(`/review-items${reviewedFalseOnly ? '?reviewed=false' : ''}`),
  reviewItemsUnreadCount: () => apiFetch<{ count: number }>('/review-items/unread-count'),
  reviewReviewItem: (id: number) => apiFetch<{ ok: true }>(`/review-items/${id}/review`, { method: 'POST' }),
  listCanteenFacilities: () => apiFetch<CanteenFacility[]>('/canteen/facilities'),
  createCanteenFacility: (data: { name: string; externalCode?: string; city?: string; address?: string }) =>
    apiFetch<CanteenFacility>('/canteen/facilities', { method: 'POST', body: JSON.stringify(data) }),
  listCanteenProducts: (facilityId: number) => apiFetch<CanteenProduct[]>(`/canteen/facilities/${facilityId}/products`),
  listCanteenChanges: (facilityId: number, unappliedOnly = false) =>
    apiFetch<CanteenCatalogChange[]>(`/canteen/facilities/${facilityId}/changes${unappliedOnly ? '?applied=false' : ''}`),
  uploadCanteenDocument: async (facilityId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/canteen/facilities/${facilityId}/documents`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      if (res.status === 401) handleUnauthorized();
      const body = await res.json().catch(() => ({}));
      throw new ApiError(body.error ?? `Request failed: ${res.status}`);
    }
    return res.json() as Promise<CanteenIngestResult>;
  },
  applyCanteenChange: (changeId: number) => apiFetch<{ ok: true }>(`/canteen/changes/${changeId}/apply`, { method: 'POST' }),
  incidentScreenshotUrl: (id: number) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return `/api/incidents/${id}/screenshot${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
  costSummary: () => apiFetch<CostRow[]>('/metrics/costs'),
  costByUser: () => apiFetch<CostByUserRow[]>('/metrics/costs-by-user'),
  enterpriseComparison: () => apiFetch<EnterpriseComparison>('/metrics/enterprise-comparison'),
};
