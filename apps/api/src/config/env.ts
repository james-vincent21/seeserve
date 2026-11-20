import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://restaurant:restaurant_dev_only@localhost:5432/restaurant_vision'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  INFERENCE_MODE: z.enum(['mock', 'ultralytics', 'http']).default('ultralytics'),
  INFERENCE_API_URL: z.string().optional(),
  INFERENCE_API_KEY: z.string().optional(),
  INFERENCE_API_AUTH_HEADER: z.string().default('Authorization'),
  INFERENCE_API_AUTH_SCHEME: z.string().default('Bearer'),
  ULTRALYTICS_API_KEY: z.string().optional(),
  ULTRALYTICS_MODEL_OWNER: z.string().default('ultralytics'),
  ULTRALYTICS_MODEL_PROJECT: z.string().default('yolov8'),
  ULTRALYTICS_MODEL_NAME: z.string().default('yolov8n'),
  DEMO_MAX_FRAMES: z.coerce.number().int().positive().default(100),
  DEMO_UNATTENDED_SECONDS: z.coerce.number().positive().default(90),
  DEMO_DEBOUNCE_SECONDS: z.coerce.number().nonnegative().default(2),
});

export const env = envSchema.parse(process.env);
