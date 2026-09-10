'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api, type ChatMessage } from '@/lib/api';
import { RequireAuth } from '@/components/RequireAuth';
import { BrandHeader } from '@/components/BrandHeader';

function ChatView() {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const conversations = await api.listConversations();
      const conversation = conversations[0] ?? (await api.createConversation('Nowa rozmowa'));
      setConversationId(conversation.id);
      if (conversations[0]) setMessages(await api.listMessages(conversation.id));
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend() {
    if (!draft.trim() || conversationId === null) return;
    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: draft,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setSending(true);
    try {
      const result = await api.sendMessage(conversationId, userMessage.content);
      setMessages((prev) => [
        ...prev,
        { id: result.messageId, role: 'assistant', content: result.reply, created_at: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <BrandHeader />
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={clsx(
              'max-w-[70%] rounded-xl px-4 py-2 prose prose-sm',
              m.role === 'user' ? 'ml-auto bg-brand-orange text-brand-white prose-invert' : 'bg-brand-white text-brand-dark',
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
          </div>
        ))}
        {sending && <div className="text-brand-purple">Asystent pisze…</div>}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 border-t border-brand-dark p-4">
        <input
          className="flex-1 rounded-md border border-brand-dark px-3 py-2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Napisz wiadomość lub /pomoc…"
        />
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-1 rounded-md bg-brand-orange px-4 py-2 font-bold text-brand-white hover:brightness-95 disabled:opacity-60"
        >
          <Send size={16} />
          Wyślij
        </button>
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
