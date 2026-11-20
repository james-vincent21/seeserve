'use client';

import { useRef, useState, type FormEvent } from 'react';
import { hub } from '@/lib/hub';

interface Turn { role: 'user' | 'assistant'; content: string }
interface Reply { conversationId: string; reply: string; toolCalls: Array<{ name: string; ok: boolean }> }

/** Guest concierge chat: menu questions, bookings and queue status, answered via the hub's tools. */
export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'assistant', content: 'Hi! I can show the menu, book a table, or check your ticket. What would you like?' },
  ]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const conversationId = useRef<string | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    const history = [...turns, { role: 'user' as const, content }];
    setTurns(history);
    setDraft('');
    setBusy(true);
    try {
      // The greeting is UI-only; the conversation sent to the model starts at the guest's first message.
      const result = await hub<Reply>('/chat/guest', {
        method: 'POST',
        json: { conversationId: conversationId.current, messages: history.slice(1) },
      });
      conversationId.current = result.conversationId;
      setTurns([...history, { role: 'assistant', content: result.reply }]);
    } catch (caught) {
      setTurns([...history, { role: 'assistant', content: caught instanceof Error ? caught.message : 'Sorry, something went wrong.' }]);
    } finally {
      setBusy(false);
      window.setTimeout(() => log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }), 30);
    }
  };

  return (
    <>
      {open && (
        <section className="chat-panel" aria-label="Chat with Dhaka Table House">
          <div className="chat-head"><strong>Ask our host</strong><small>Menu · bookings · queue — please don&apos;t share card numbers</small></div>
          <div className="chat-log" ref={log}>
            {turns.map((turn, index) => <div key={index} className={`bubble ${turn.role === 'user' ? 'me' : 'bot'}`}>{turn.content}</div>)}
            {busy && <div className="bubble bot">…</div>}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Table for 2 tonight at 8?" aria-label="Message" />
            <button className="button" disabled={busy || !draft.trim()} type="submit">Send</button>
          </form>
        </section>
      )}
      <button className="chat-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close chat' : '💬 Chat with us'}</button>
    </>
  );
}
