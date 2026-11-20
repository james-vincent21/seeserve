'use client';

import { useEffect, useState } from 'react';
import ui from '@/features/shell/platform.module.css';
import { PageShell } from '@/features/shell/page-shell';
import { api } from '@/shared/api/hub';

interface Meta {
  mcpServers: Array<{ name: string; auth: string; transports: string[]; httpPath: string; tools: Array<{ name: string; title: string; readOnly: boolean }> }>;
  prompts: Array<{ id: string; version: string }>;
  models: Record<string, string>;
  latestEval: null | { file: string; [key: string]: unknown };
  health: { database: string; localModels: boolean; claudeConfigured: boolean; emailWebhook: boolean };
}

const REPO = 'https://github.com/james-vincent21/seeserve/blob/hasans-expansion';

function Docs() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Meta>('/meta').then(setMeta).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load system info'));
  }, []);

  return (
    <div className={ui.grid}>
      <section className={ui.card}>
        <div className={ui.cardHead}><div><small>WHAT IT IS</small><h2>SeeServe: one hub, many connected apps</h2></div></div>
        <div className={`${ui.cardBody} ${ui.prose}`}>
          <p>
            SeeServe turns a restaurant&apos;s existing CCTV into live table states and service alerts, and connects every other part
            of the business to one hub: the public website (reservations, menu, branch map, chatbot), the walk-in queue, staff
            operations and owner analytics. Other apps reach the hub only through its REST API or its MCP servers.
          </p>
          <pre>{`landing site ─┐            ┌─ PostgreSQL + pgvector (core data, retrieval index)
chat widget ──┤  REST /api/v1 ─┤─ Claude (guest concierge, owner analyst)
MCP clients ──┤  MCP  /mcp/*   ├─ Ollama, local (embeddings, chunk context, safety screen)
CCTV clip ────┘  SSE  stream   └─ n8n (email, Sheets, schedules)`}</pre>
          <h3>Design rules</h3>
          <p>
            Numbers come from SQL, never from the language model: the owner assistant calls analytics tools and only explains
            their results. Documents are retrieved with hybrid search (keyword + vector, fused with reciprocal-rank fusion) over
            semantically chunked text, each chunk prefixed with a short generated context (Contextual Retrieval). Every write a
            model makes is schema-validated, role-scoped and audited; guest writes need an explicit confirmation.
          </p>
        </div>
      </section>

      {error && <p className={ui.error}>{error}</p>}
      {meta && <>
        <section className={ui.kpis}>
          <div className={ui.kpi}><span>Database</span><strong style={{ fontSize: 16 }}>{meta.health.database}</strong><small>PostgreSQL + pgvector</small></div>
          <div className={ui.kpi}><span>Claude</span><strong style={{ fontSize: 16 }}>{meta.health.claudeConfigured ? 'configured' : 'not configured'}</strong><small>{meta.models.cloud}</small></div>
          <div className={ui.kpi}><span>Local models</span><strong style={{ fontSize: 16 }}>{meta.health.localModels ? 'online' : 'offline'}</strong><small>{meta.models.localChat} · {meta.models.localEmbeddings}</small></div>
          <div className={ui.kpi}><span>Email</span><strong style={{ fontSize: 16 }}>{meta.health.emailWebhook ? 'n8n webhook' : 'console (dev)'}</strong><small>tickets and sign-in links</small></div>
        </section>

        <section className={ui.card}>
          <div className={ui.cardHead}><div><small>MODEL CONTEXT PROTOCOL</small><h2>MCP servers exposed by the hub</h2></div><span className={ui.muted}>Same tool registry powers the chatbots</span></div>
          <div className={`${ui.cardBody} ${ui.grid3}`}>
            {meta.mcpServers.map((server) => (
              <div key={server.name} className={ui.kpi}>
                <span>{server.name}</span>
                <small>{server.auth} · {server.transports.join(' + ')} · POST {server.httpPath}</small>
                <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 11, lineHeight: 1.7 }}>
                  {server.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code> {tool.readOnly ? '' : <span className={`${ui.badge} ${ui.badgeWarn}`}>writes</span>}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className={ui.grid2}>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>PROMPT LIBRARY</small><h2>Versioned prompts</h2></div></div>
            <div className={ui.cardBody}>
              <table className={ui.table}>
                <thead><tr><th>Prompt</th><th>Version</th></tr></thead>
                <tbody>{meta.prompts.map((prompt) => (
                  <tr key={prompt.id}><td><a href={`${REPO}/prompts/${prompt.id}.md`} target="_blank" rel="noreferrer">{prompt.id}</a></td><td>{prompt.version}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>
          <section className={ui.card}>
            <div className={ui.cardHead}><div><small>EVALUATION</small><h2>Latest eval run</h2></div></div>
            <div className={`${ui.cardBody} ${ui.prose}`}>
              {meta.latestEval
                ? <pre>{JSON.stringify(meta.latestEval, null, 2)}</pre>
                : <p className={ui.muted}>No eval results recorded yet. Run <code>npm run eval</code>.</p>}
              <p>Eval sets live in <a href={`${REPO}/evals`} target="_blank" rel="noreferrer">evals/</a>; each prompt change is re-scored before release.</p>
            </div>
          </section>
        </div>
      </>}

      <section className={ui.card}>
        <div className={ui.cardHead}><div><small>MORE</small><h2>Documents</h2></div></div>
        <div className={`${ui.cardBody} ${ui.prose}`}>
          <ul>
            <li><a href={`${REPO}/docs/AI-NATIVE-BUILD.md`} target="_blank" rel="noreferrer">AI-native build architecture</a></li>
            <li><a href={`${REPO}/docs/DATA-LIFECYCLE.md`} target="_blank" rel="noreferrer">Data lifecycle and privacy</a></li>
            <li><a href={`${REPO}/Hasan/H_logs`} target="_blank" rel="noreferrer">Dated build log (what changed, how to verify and revert)</a></li>
          </ul>
        </div>
      </section>
    </div>
  );
}

export default function DocsPage() {
  return (
    <PageShell active="docs" title="System docs" kicker="LIVE ARCHITECTURE, MCP, PROMPTS AND EVALS" requireAuth={false}>
      {() => <Docs />}
    </PageShell>
  );
}
