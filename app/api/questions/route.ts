import { NextRequest, NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { questionsRequestSchema, questionsResponseSchema } from "@/lib/contracts";
import { llmErrorResponse, readJsonBody } from "@/lib/llm/http";
import { generateQuestions } from "@/lib/llm/tasks";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 16_384;

export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await checkRateLimit(request, "api"))) {
    return NextResponse.json(
      { error: "rate_limited", kind: "rate_limit" },
      { status: 429 },
    );
  }

  const parsed = questionsRequestSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const response = questionsResponseSchema.parse({
      questions: await generateQuestions(parsed.data),
    });
    return NextResponse.json(response);
  } catch (error) {
    return llmErrorResponse(error);
  }
}
