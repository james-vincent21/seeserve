import type { OllamaClient } from '../../infrastructure/ai/ollama.js';
import { renderPrompt } from './prompts.js';

/**
 * Guardrails around the chat agents (defence in depth):
 *  1. input limits and message-shape validation (done by the HTTP schema)
 *  2. deterministic pre-screen: injection phrases, card numbers
 *  3. optional on-device LLM screen (Ollama) for guest messages — nothing leaves the machine
 *  4. tool-level controls: strict schemas, explicit guest confirmation for writes, role-scoped tool sets
 *  5. spend/turn caps per conversation, and PII redaction before anything is logged
 */
export const MAX_MESSAGE_CHARS = 2000;

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)/i,
  /disregard (your|the|all) (instructions|rules|system prompt)/i,
  /(reveal|show|print|repeat|output) (me )?(your|the) (system prompt|hidden (rules|instructions)|instructions)/i,
  /you are now (?!ready)/i,
  /\b(developer|god|dan|jailbreak) mode\b/i,
  /act as (an? )?(unrestricted|different|new) (ai|assistant|model)/i,
  /<\/?(system|instructions?)>/i,
  /(list|show|give) (me )?(all|other|every) (guests?|customers?|bookings|reservations|emails)/i,
  /pretend (that )?(the |your )?(restaurant )?(rules|instructions|policies) (don'?t|do not|no longer) apply/i,
  /(every|all|each) (reservation|booking|ticket) (codes?|numbers?)/i,
  /(owner|admin|manager)'?s? (email|password|phone|login)/i,
];

// 13–19 digits, optionally separated by spaces or dashes, that pass the Luhn check.
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function containsCardNumber(text: string): boolean {
  return (text.match(CARD_CANDIDATE) ?? []).some((candidate) => {
    const digits = candidate.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
}

/** Removes emails, phone numbers and card-like numbers before text is logged or stored. */
export function redactPII(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(CARD_CANDIDATE, (match) => (containsCardNumber(match) ? '[card]' : match))
    .replace(/(\+?880[ -]?|\b0)1[3-9]\d{2}[ -]?\d{6}\b/g, '[phone]');
}

export interface ScreenResult {
  allowed: boolean;
  reason?: 'too_long' | 'card_number' | 'prompt_injection';
  screenedBy: Array<'rules' | 'local-llm'>;
  /** Safe text to show the guest when a message is blocked. */
  reply?: string;
}

const BLOCK_REPLIES: Record<NonNullable<ScreenResult['reason']>, string> = {
  too_long: `That message is too long. Please keep it under ${MAX_MESSAGE_CHARS} characters.`,
  card_number: 'Please don\'t share card numbers here — payments are taken at the restaurant. Your message was not sent.',
  prompt_injection: 'I can only help with menu questions, bookings and the queue at Dhaka Table House. How can I help with your visit?',
};

export async function screenGuestMessage(text: string, ollama?: OllamaClient): Promise<ScreenResult> {
  const screenedBy: ScreenResult['screenedBy'] = ['rules'];
  const block = (reason: NonNullable<ScreenResult['reason']>): ScreenResult => ({ allowed: false, reason, screenedBy, reply: BLOCK_REPLIES[reason] });
  if (text.length > MAX_MESSAGE_CHARS) return block('too_long');
  if (containsCardNumber(text)) return block('card_number');
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) return block('prompt_injection');

  if (ollama && (await ollama.available())) {
    try {
      const verdict = await ollama.generate(renderPrompt('guardrail-screen', { message: text }), { maxTokens: 4 });
      screenedBy.push('local-llm');
      if (/\bUNSAFE\b/i.test(verdict)) return block('prompt_injection');
    } catch {
      // Fail open to the rules-only result: the rules above and tool-level controls still apply.
    }
  }
  return { allowed: true, screenedBy };
}
