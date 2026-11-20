'use client';

import { useRef, useState, type FormEvent } from 'react';
import ui from '@/features/shell/platform.module.css';
import { PageShell } from '@/features/shell/page-shell';
import { api, type AgentReply } from '@/shared/api/hub';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  meta?: Pick<AgentReply, 'toolCalls' | 'usage' | 'model' | 'promptVersion' | 'blocked'>;
}

const suggestions = [
  'Is the business growing? Compare the last 30 days with the 30 before.',
  'Which branch is losing money, and why?',
  'What are our best and worst selling dishes this month?',
  'Which days of the week are slow?',
  'Does rain affect how many guests we get?',
  'Which dishes take too long in the kitchen?',
  'Who is waiting in the Gulshan queue right now?',
  'What do the supplier notes say about lobster?',
];

function Assistant() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const conversationId = useRef<string | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    setError('');
    try {
      const result = await api<AgentReply>('/chat/owner', {
        method: 'POST',
        json: { conversationId: conversationId.current, messages: next.map(({ role, content: text }) => ({ role, content: text })) },
      });
      conversationId.current = result.conversationId;
      setTurns([...next, { role: 'assistant', content: result.reply, meta: result }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The assistant could not answer');
      setTurns(turns);
      setDraft(content);
    } finally {
      setBusy(false);
      window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  return (
    <section className={`${ui.card} ${ui.chat}`}>
      <div>
        <div className={ui.cardHead}>
          <div><small>CLAUDE · TOOL CALLING OVER YOUR DATA</small><h2>Ask about your business</h2></div>
          <button className={ui.button} onClick={() => { setTurns([]); conversationId.current = undefined; }}>New chat</button>
        </div>
        <div className={ui.messages}>
          {turns.length === 0 && <p className={ui.notice}>
            Answers come from SQL-backed tools (sales, menu, P&amp;L, prep and turn times, weather) and a document search over
            policies, supplier notes and weekly logs. Each answer lists the tools it used. Demo history is synthetic.
          </p>}
          {turns.map((turn, index) => (
            <div key={index} className={`${ui.bubble} ${turn.role === 'user' ? ui.user : ui.assistant}`}>
              {turn.content}
              {turn.meta && (
                <div className={ui.meta}>
                  {turn.meta.toolCalls.map((call, i) => <span key={i} className={`${ui.chip} ${call.ok ? '' : ui.chipError}`}>{call.name}</span>)}
                  <span className={ui.chip}>{turn.meta.usage.outputTokens} out · {turn.meta.usage.cacheReadTokens} cached</span>
                  <span className={ui.chip}>{turn.meta.promptVersion}</span>
                </div>
              )}
            </div>
          ))}
          {busy && <div className={`${ui.bubble} ${ui.assistant}`}>Checking the numbers…</div>}
          <div ref={bottom} />
        </div>
      </div>
      <div>
        {turns.length === 0 && <div className={ui.suggestions}>{suggestions.map((text) => <button key={text} className={ui.button} onClick={() => void send(text)}>{text}</button>)}</div>}
        {error && <p className={ui.error} style={{ margin: '0 14px 10px' }}>{error}</p>}
        <form className={ui.composer} onSubmit={submit}>
          <textarea value={draft} maxLength={2000} placeholder="Ask about sales, menu, costs, the queue…" onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(draft); } }} />
          <button className={`${ui.button} ${ui.primary}`} disabled={busy || !draft.trim()} type="submit">Send</button>
        </form>
      </div>
    </section>
  );
}

export default function AssistantPage() {
  return (
    <PageShell active="assistant" title="Owner assistant" kicker="ASK YOUR RESTAURANT">
      {() => <Assistant />}
    </PageShell>
  );
}
