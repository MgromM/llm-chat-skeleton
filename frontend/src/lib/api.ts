export interface LoginResponse {
  token: string;
  user: { id: number; email: string; role: string };
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  created_at: string;
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

export interface EnterpriseComparison {
  periodFrom: string;
  periodTo: string;
  ourToolCostUsd: number;
  enterpriseSeatCostUsd: number;
  enterpriseSeats: number;
  enterpriseCostUsd: number;
  cheaperOption: 'our_tool' | 'enterprise' | null;
}

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {}

/** Generic fetcher, also used directly as the SWR fetcher function. */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  listConversations: () => apiFetch<{ id: number; title: string | null; created_at: string }[]>('/chat/conversations'),
  createConversation: (title?: string) =>
    apiFetch<{ id: number; title: string | null }>('/chat/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  listMessages: (conversationId: number) =>
    apiFetch<ChatMessage[]>(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, message: string) =>
    apiFetch<{ reply: string; messageId: number; commandUsed: string | null }>(
      `/chat/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
  costSummary: () => apiFetch<CostRow[]>('/metrics/costs'),
  qualitySummary: () => apiFetch<QualityRow[]>('/metrics/quality'),
  enterpriseComparison: () => apiFetch<EnterpriseComparison>('/metrics/enterprise-comparison'),
};
