/**
 * Minimal client for a local Ollama server (https://ollama.com). Used for embeddings,
 * chunk-context generation and the guardrail pre-screen, so these steps stay on-device.
 */
export class OllamaClient {
  private availableUntil = 0;
  private lastCheck: boolean | null = null;

  constructor(private readonly baseUrl: string, readonly embedModel: string, readonly chatModel: string) {}

  /** Cached reachability check (30 s) so a missing Ollama never slows requests down. */
  async available(): Promise<boolean> {
    if (this.lastCheck !== null && Date.now() < this.availableUntil) return this.lastCheck;
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(800) });
      this.lastCheck = response.ok;
    } catch {
      this.lastCheck = false;
    }
    this.availableUntil = Date.now() + 30_000;
    return this.lastCheck;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, input: texts }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Ollama embed returned HTTP ${response.status}`);
    const body = (await response.json()) as { embeddings?: number[][] };
    if (!body.embeddings || body.embeddings.length !== texts.length) throw new Error('Ollama returned no embeddings');
    return body.embeddings;
  }

  async generate(prompt: string, options: { system?: string; model?: string; maxTokens?: number } = {}): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.model ?? this.chatModel,
        prompt,
        system: options.system,
        stream: false,
        options: { temperature: 0, num_predict: options.maxTokens ?? 200 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`Ollama generate returned HTTP ${response.status}`);
    const body = (await response.json()) as { response?: string };
    return (body.response ?? '').trim();
  }
}
