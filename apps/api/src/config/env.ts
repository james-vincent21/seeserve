import 'dotenv/config';
import { z } from 'zod';

const csv = z.string().default('').transform((value) =>
  value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://restaurant:restaurant_dev_only@localhost:5433/restaurant_vision'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  LANDING_ORIGIN: z.string().default('http://localhost:3001'),
  PUBLIC_DASHBOARD_URL: z.string().default('http://localhost:3000'),
  PUBLIC_LANDING_URL: z.string().default('http://localhost:3001'),

  // CCTV demo
  INFERENCE_MODE: z.enum(['mock', 'ultralytics', 'http']).default('ultralytics'),
  INFERENCE_API_URL: z.string().optional(),
  INFERENCE_API_KEY: z.string().optional(),
  INFERENCE_API_AUTH_HEADER: z.string().default('Authorization'),
  INFERENCE_API_AUTH_SCHEME: z.string().default('Bearer'),
  ULTRALYTICS_API_KEY: z.string().optional(),
  ULTRALYTICS_MODEL_OWNER: z.string().default('ultralytics'),
  ULTRALYTICS_MODEL_PROJECT: z.string().default('yolov8'),
  ULTRALYTICS_MODEL_NAME: z.string().default('yolov8n'),
  DEMO_MODE: z.enum(['standard', 'iftar']).default('standard'),
  DEMO_MAX_FRAMES: z.coerce.number().int().positive().default(100),
  DEMO_UNATTENDED_SECONDS: z.coerce.number().positive().default(90),
  DEMO_DEBOUNCE_SECONDS: z.coerce.number().nonnegative().default(2),

  // Auth
  ADMIN_EMAILS: csv,
  /** Print magic links in the API console when no email webhook is configured (never in production). */
  DEV_LOGIN_LINKS: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-opus-5-5'),
  CHAT_MAX_OUTPUT_TOKENS_PER_CONVERSATION: z.coerce.number().int().positive().default(20000),
  CHAT_MAX_TURNS_PER_CONVERSATION: z.coerce.number().int().positive().default(20),
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  OLLAMA_CHAT_MODEL: z.string().default('llama3.2:3b'),

  // Integrations
  N8N_WEBHOOK_BASE_URL: z.string().optional(),
  N8N_WEBHOOK_SECRET: z.string().optional(),
  MCP_HTTP_TOKEN: z.string().optional(),
  DEFAULT_BRANCH_ID: z.string().default('gulshan'),
});

export const env = envSchema.parse(process.env);
export type Env = typeof env;
