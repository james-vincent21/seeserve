import { env } from './config/env.js';
import { pool } from './infrastructure/database/pool.js';
import { DemoSession } from './application/demo/demo-session.js';
import { HubService } from './application/hub/hub-service.js';
import { AuthService } from './application/auth/auth-service.js';
import { AnalyticsService } from './application/analytics/analytics-service.js';
import { RagService } from './application/rag/rag-service.js';
import { HubRepository } from './infrastructure/repositories/hub.repository.js';
import { AnalyticsRepository } from './infrastructure/repositories/analytics.repository.js';
import { RagRepository } from './infrastructure/repositories/rag.repository.js';
import { PostgresDemoEventRepository } from './infrastructure/repositories/postgres-demo-event.repository.js';
import { ConsoleNotifier, N8nNotifier } from './infrastructure/notify/n8n-notifier.js';
import { OllamaClient } from './infrastructure/ai/ollama.js';
import { MockInferenceProvider } from './infrastructure/inference/mock.provider.js';
import { UltralyticsApiProvider } from './infrastructure/inference/ultralytics-api.provider.js';
import { YoloV8HttpProvider } from './infrastructure/inference/yolov8-http.provider.js';
import type { Notifier } from './application/ports.js';
import { ChatAgents } from './application/chat/agent.js';

function createInferenceProvider() {
  switch (env.INFERENCE_MODE) {
    case 'ultralytics':
      return new UltralyticsApiProvider();
    case 'http':
      return new YoloV8HttpProvider();
    default:
      return new MockInferenceProvider();
  }
}

const notifier: Notifier = env.N8N_WEBHOOK_BASE_URL
  ? new N8nNotifier(env.N8N_WEBHOOK_BASE_URL, env.N8N_WEBHOOK_SECRET)
  : new ConsoleNotifier(env.DEV_LOGIN_LINKS && env.NODE_ENV !== 'production');

const ollama = new OllamaClient(env.OLLAMA_URL, env.OLLAMA_EMBED_MODEL, env.OLLAMA_CHAT_MODEL);
const analyticsRepository = new AnalyticsRepository(pool);

const services = {
  demo: new DemoSession(createInferenceProvider(), new PostgresDemoEventRepository(pool)),
  hub: new HubService(new HubRepository(pool), notifier, { landingUrl: env.PUBLIC_LANDING_URL }),
  analytics: new AnalyticsService(analyticsRepository),
  rag: new RagService(new RagRepository(pool), ollama),
};

/** Single composition root shared by the REST API, the chat agents and the MCP servers. */
export const container = {
  pool,
  notifier,
  ollama,
  analyticsRepository,
  ...services,
  auth: new AuthService(pool, notifier, { allowList: env.ADMIN_EMAILS, dashboardUrl: env.PUBLIC_DASHBOARD_URL }),
  agents: new ChatAgents({ services, ollama, db: pool }),
};

export type Container = typeof container;
