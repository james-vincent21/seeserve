import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Loads prompts from the versioned library in /prompts (same depth from src/ and dist/). */
const PROMPTS_DIR = fileURLToPath(new URL('../../../../../prompts/', import.meta.url));
const cache = new Map<string, { version: string; body: string }>();

export type PromptId = 'guest-concierge' | 'owner-analyst' | 'guardrail-screen' | 'chunk-context';

export function loadPrompt(id: PromptId): { version: string; body: string } {
  const cached = cache.get(id);
  if (cached) return cached;
  const file = `${PROMPTS_DIR}${id}.md`;
  if (!existsSync(file)) throw new Error(`Prompt file missing: prompts/${id}.md`);
  const raw = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front = match?.[1] ?? '';
  const prompt = { version: front.match(/^version:\s*(.+)$/m)?.[1]?.trim() ?? 'unversioned', body: (match?.[2] ?? raw).trim() };
  cache.set(id, prompt);
  return prompt;
}

/** Replaces {{name}} or {{name (any note)}} placeholders. */
export function renderPrompt(id: PromptId, vars: Record<string, string>): string {
  return loadPrompt(id).body.replace(/\{\{(\w+)[^}]*\}\}/g, (_all, key: string) => vars[key] ?? '');
}
