import { z } from "zod";

const schema = z.object({
  TMDB_API_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(["gemini", "groq", "mistral", "openrouter"]).default("gemini"),
  LLM_MODEL: z.string().default("gemini-3.1-flash-lite"),
  LLM_API_KEY: z.string().min(1),
  SITE_PASSWORD: z.string().min(8),
  AUTH_SECRET: z.string().min(32),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function hasRedisEnv() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
