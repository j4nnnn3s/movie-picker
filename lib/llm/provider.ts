import type { z } from "zod";

export interface GenerateJsonRequest<T> {
  prompt: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  generateJson<T>(request: GenerateJsonRequest<T>): Promise<T>;
}
