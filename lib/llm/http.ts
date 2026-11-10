import { NextResponse } from "next/server";

import { isLlmError } from "@/lib/llm";

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxBytes) {
    return null;
  }

  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function llmErrorResponse(error: unknown) {
  if (isLlmError(error)) {
    return NextResponse.json(
      { error: "llm_unavailable" as const, kind: error.kind },
      { status: error.kind === "down" ? 503 : 429 },
    );
  }
  return NextResponse.json(
    { error: "llm_unavailable" as const, kind: "down" as const },
    { status: 503 },
  );
}
