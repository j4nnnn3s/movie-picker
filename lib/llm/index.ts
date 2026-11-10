import "server-only";

import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/llm/gemini";
import { OpenAiCompatibleProvider } from "@/lib/llm/openai-compatible";
import type { LlmProvider } from "@/lib/llm/provider";

export { LlmError, isLlmError } from "@/lib/llm/errors";
export type { LlmErrorKind } from "@/lib/llm/errors";
export type { GenerateJsonRequest, LlmProvider } from "@/lib/llm/provider";

let provider: LlmProvider | undefined;

export function llmProvider(): LlmProvider {
  if (provider) return provider;

  const config = env();
  provider = config.LLM_PROVIDER === "gemini"
    ? new GeminiProvider(config.LLM_API_KEY, config.LLM_MODEL)
    : new OpenAiCompatibleProvider(config.LLM_PROVIDER, config.LLM_API_KEY, config.LLM_MODEL);
  return provider;
}
