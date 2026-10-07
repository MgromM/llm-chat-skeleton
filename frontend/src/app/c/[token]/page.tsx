'use client';

import { use, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import clsx from 'clsx';
import { api, ApiError, type PublicConversation } from '@/lib/api';

/**
 * Public, unauthenticated read-only view of a shared conversation
 * (Claude.ai's "Share chat" link) — mirrors /a/[token] for artifacts.
 */
export default function PublicConversationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [conversation, setConversation] = useState<PublicConversation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPublicConversation(token)
      .then(setConversation)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Nie udało się wczytać rozmowy.'));
  }, [token]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-4 sm:p-8">
      <div className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-brand-dark">
        <MessageSquare size={16} className="text-brand-red" />
        {conversation?.title ?? 'Rozmowa'}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!conversation && !error && <p className="text-sm text-brand-muted">Ładowanie…</p>}
      {conversation && (
        <div className="flex flex-1 flex-col gap-6 rounded-2xl border border-brand-border bg-brand-white p-4 shadow-sm sm:p-6">
          {conversation.messages.map((m) => (
            <div key={m.id} className={clsx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={clsx(
                  'prose prose-sm max-w-[85%] leading-relaxed',
                  m.role === 'user' ? 'rounded-2xl bg-brand-red/10 px-4 py-2.5 text-brand-dark' : 'max-w-full text-brand-dark',
                )}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeHighlight, rehypeKatex]}>
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
