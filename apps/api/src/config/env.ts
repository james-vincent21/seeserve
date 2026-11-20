import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://restaurant:restaurant_dev_only@localhost:5432/restaurant_vision'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
});

export const env = envSchema.parse(process.env);
