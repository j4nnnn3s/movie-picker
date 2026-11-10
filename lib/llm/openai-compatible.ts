import type { GenerateJsonRequest, LlmProvider } from "@/lib/llm/provider";
import { parseJsonContent, requestJson } from "@/lib/llm/transport";

type OpenAiEnvelope = {
  choices?: Array<{ message?: { content?: string } }>;
};

const endpoints = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
} as const;

export type OpenAiCompatibleName = keyof typeof endpoints;

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(
    readonly name: OpenAiCompatibleName,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  generateJson<T>(request: GenerateJsonRequest<T>): Promise<T> {
    return requestJson(
      this.name,
      (signal) => fetch(endpoints[this.name], {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: 0.2,
          max_tokens: request.maxOutputTokens ?? 2_048,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.schemaName,
              strict: true,
              schema: request.jsonSchema,
            },
          },
        }),
      }),
      (payload) => {
        const content = (payload as OpenAiEnvelope).choices?.[0]?.message?.content;
        return parseJsonContent(content);
      },
      request.schema,
    );
  }
}
