import type { GenerateJsonRequest, LlmProvider } from "@/lib/llm/provider";
import { parseJsonContent, requestJson } from "@/lib/llm/transport";

type GeminiEnvelope = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export class GeminiProvider implements LlmProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  generateJson<T>(request: GenerateJsonRequest<T>): Promise<T> {
    const model = this.model.replace(/^models\//, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    return requestJson(
      this.name,
      (signal) => fetch(endpoint, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: request.maxOutputTokens ?? 2_048,
            responseMimeType: "application/json",
            responseJsonSchema: request.jsonSchema,
          },
        }),
      }),
      (payload) => {
        const envelope = payload as GeminiEnvelope;
        const content = envelope.candidates?.[0]?.content?.parts
          ?.map((part) => part.text ?? "")
          .join("");
        return parseJsonContent(content);
      },
      request.schema,
    );
  }
}
