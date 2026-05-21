import { z } from 'zod';
import { config } from 'dotenv';

config();

/**
 * Validates process.env against a Zod schema and throws with a descriptive
 * error message if any required variable is missing or malformed.
 * Services call this at startup — fail fast before accepting traffic.
 */
export function parseEnv<T extends z.ZodTypeAny>(schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const message = Object.entries(errors)
      .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(', ')}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${message}`);
  }
  return result.data as z.infer<T>;
}

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  PORT: z.coerce.number().default(3000),
  NATS_URL: z.string().url().default('nats://localhost:4222'),
  CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),
  TRACE_ID_HEADER: z.string().default('x-trace-id'),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
