export type LlmErrorKind = "rate_limit" | "daily_limit" | "down";

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly provider: string;
  readonly status?: number;

  constructor(kind: LlmErrorKind, provider: string, status?: number) {
    super(`LLM provider ${provider} is unavailable`);
    this.name = "LlmError";
    this.kind = kind;
    this.provider = provider;
    this.status = status;
  }
}

export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}
