import type { z } from "zod";

import { LlmError, type LlmErrorKind } from "@/lib/llm/errors";

const TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 250;

function dailyLimit(text: string) {
  return /\b(daily|per day|24[\s-]?hour|credits?|billing|insufficient_quota)\b/i.test(text)
    || /\bquota\b.{0,40}\b(day|24h)\b/i.test(text);
}

function kindFor(status: number | undefined, body = ""): LlmErrorKind {
  if (status === 429) return dailyLimit(body) ? "daily_limit" : "rate_limit";
  return "down";
}

function logFailure(provider: string, status?: number) {
  // Never log response bodies, prompts, API keys, or user input.
  console.error("LLM request failed", { provider, status: status ?? "network" });
}

function shouldRetry(error: LlmError) {
  return error.kind !== "daily_limit"
    && (error.status === undefined || error.status === 408 || error.status === 429 || error.status >= 500);
}

async function pause(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestJson<T>(
  provider: string,
  makeRequest: (signal: AbortSignal) => Promise<Response>,
  extractJson: (payload: unknown) => unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: LlmError | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);

    try {
      const response = await makeRequest(controller.signal);
      const text = await response.text();

      if (!response.ok) {
        throw new LlmError(kindFor(response.status, text), provider, response.status);
      }

      let envelope: unknown;
      try {
        envelope = JSON.parse(text);
      } catch {
        throw new LlmError("down", provider, response.status);
      }

      let json: unknown;
      try {
        json = extractJson(envelope);
      } catch {
        throw new LlmError("down", provider, response.status);
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) throw new LlmError("down", provider, response.status);
      return parsed.data;
    } catch (error) {
      const llmError = error instanceof LlmError
        ? error
        : new LlmError("down", provider);
      lastError = llmError;
      logFailure(provider, llmError.status);

      if (attempt === 1 || !shouldRetry(llmError)) throw llmError;
    } finally {
      clearTimeout(timeout);
    }

    if (deadline - Date.now() <= RETRY_DELAY_MS) break;
    await pause(RETRY_DELAY_MS);
  }

  throw lastError ?? new LlmError("down", provider);
}

export function parseJsonContent(content: unknown): unknown {
  if (typeof content !== "string") throw new Error("Missing model content");
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(unfenced);
}
