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
    const generationConfig = {
      maxOutputTokens: request.maxOutputTokens ?? 2_048,
      responseMimeType: "application/json",
      responseJsonSchema: request.jsonSchema,
    };

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
          generationConfig,
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
      {
        model,
        schemaName: request.schemaName,
        promptCharacters: request.prompt.length,
        generationConfig,
      },
    );
  }
}
