import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { Actor } from '../../domain/hub/types.js';
import { env } from '../../config/env.js';
import { executeTool, toolsFor, type ToolContext } from '../tools/registry.js';
import type { OllamaClient } from '../../infrastructure/ai/ollama.js';
import { screenGuestMessage } from './guardrails.js';
import { loadPrompt } from './prompts.js';

export type AgentKind = 'guest' | 'owner';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentReply {
  reply: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
  blocked: boolean;
  screenedBy: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  model: string;
  promptVersion: string;
}

export class AgentUnavailableError extends Error {}

const AGENTS: Record<AgentKind, { prompt: 'guest-concierge' | 'owner-analyst'; audiences: Array<'guest' | 'ops' | 'analytics'>; effort: 'low' | 'medium'; maxIterations: number }> = {
  guest: { prompt: 'guest-concierge', audiences: ['guest'], effort: 'low', maxIterations: 6 },
  owner: { prompt: 'owner-analyst', audiences: ['ops', 'analytics'], effort: 'medium', maxIterations: 10 },
};

/** Per-conversation counters for the spend and turn caps (also persisted to ai_usage for reporting). */
const conversations = new Map<string, { turns: number; outputTokens: number; lastSeen: number }>();

function dhakaNow(): string {
  const local = new Date(Date.now() + 6 * 3_600_000);
  const weekday = local.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return `${weekday} ${local.toISOString().slice(0, 16).replace('T', ' ')}`;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new AgentUnavailableError('The AI assistant is not configured (set ANTHROPIC_API_KEY).');
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

export class ChatAgents {
  constructor(private readonly deps: { services: ToolContext['services']; ollama: OllamaClient; db: Pool }) {}

  async run(kind: AgentKind, input: { conversationId: string; messages: ChatTurn[]; actor: Actor }): Promise<AgentReply> {
    const config = AGENTS[kind];
    const prompt = loadPrompt(config.prompt);
    const latest = input.messages[input.messages.length - 1];
    const empty = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
    const base = { toolCalls: [], usage: empty, model: env.CLAUDE_MODEL, promptVersion: `${config.prompt}@${prompt.version}` };

    // Guardrail 1: guest input pre-screen (rules + on-device model). Blocked messages never reach the cloud model.
    let screenedBy: string[] = [];
    if (kind === 'guest') {
      const screen = await screenGuestMessage(latest.content, this.deps.ollama);
      screenedBy = screen.screenedBy;
      if (!screen.allowed) return { ...base, reply: screen.reply ?? 'Sorry, I can\'t help with that.', blocked: true, screenedBy };
    }

    // Guardrail 2: per-conversation turn and spend caps.
    const state = conversations.get(input.conversationId) ?? { turns: 0, outputTokens: 0, lastSeen: Date.now() };
    if (state.turns >= env.CHAT_MAX_TURNS_PER_CONVERSATION || state.outputTokens >= env.CHAT_MAX_OUTPUT_TOKENS_PER_CONVERSATION) {
      return { ...base, reply: 'This chat has reached its length limit. Please start a new chat or call the branch.', blocked: true, screenedBy };
    }

    const toolCalls: AgentReply['toolCalls'] = [];
    const ctx: ToolContext = { actor: input.actor, services: this.deps.services };
    const runnableTools = toolsFor(config.audiences).map((tool) => betaZodTool({
      name: tool.name,
      description: tool.description,
      inputSchema: z.object(tool.input).strict(),
      run: async (args) => {
        const outcome = await executeTool(tool, args, ctx);
        toolCalls.push({ name: tool.name, ok: outcome.ok });
        if (!outcome.ok) throw new ToolError(outcome.error);
        return JSON.stringify(outcome.result);
      },
    }));

    const runner = anthropic().beta.messages.toolRunner({
      model: env.CLAUDE_MODEL,
      max_tokens: 4096,
      max_iterations: config.maxIterations,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: config.effort },
      // Stable prefix (tools + system prompt) is cached; the time goes in a trailing system message instead.
      system: [{ type: 'text', text: prompt.body, cache_control: { type: 'ephemeral' } }],
      tools: runnableTools,
      messages: [
        ...input.messages.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: 'system' as const, content: `Current time in Dhaka: ${dhakaNow()}.` },
      ],
    });

    const usage = { ...empty };
    let final: Anthropic.Beta.BetaMessage | null = null;
    for await (const message of runner) {
      final = message;
      usage.inputTokens += message.usage.input_tokens;
      usage.outputTokens += message.usage.output_tokens;
      usage.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
    }

    state.turns += 1;
    state.outputTokens += usage.outputTokens;
    state.lastSeen = Date.now();
    conversations.set(input.conversationId, state);
    void this.deps.db.query(
      'INSERT INTO ai_usage (conversation_id, agent, model, input_tokens, output_tokens, cache_read_tokens) VALUES ($1,$2,$3,$4,$5,$6)',
      [input.conversationId, kind, final?.model ?? env.CLAUDE_MODEL, usage.inputTokens, usage.outputTokens, usage.cacheReadTokens],
    ).catch(() => undefined);

    if (!final || final.stop_reason === 'refusal') {
      return { ...base, toolCalls, usage, screenedBy, blocked: true, reply: 'Sorry, I can\'t help with that request. Is there anything about your visit I can help with?' };
    }
    const reply = final.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n').trim();
    return {
      reply: reply || 'Done.',
      toolCalls,
      blocked: false,
      screenedBy,
      usage,
      model: final.model,
      promptVersion: `${config.prompt}@${prompt.version}`,
    };
  }
}

// Drop idle conversation counters after two hours.
setInterval(() => {
  const cutoff = Date.now() - 2 * 3_600_000;
  for (const [id, state] of conversations) if (state.lastSeen < cutoff) conversations.delete(id);
}, 600_000).unref();
