import { NextRequest, NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import { questionsRequestSchema, questionsResponseSchema, type ModeInput } from "@/lib/contracts";
import { llmErrorResponse, readJsonBody } from "@/lib/llm/http";
import { generateQuestions } from "@/lib/llm/tasks";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMovieDetails } from "@/lib/tmdb";

const MAX_BODY_BYTES = 16_384;

async function loadReferenceContext(input: ModeInput) {
  if (input.mode !== "reference") return [];
  const results = await Promise.allSettled(
    input.references.map((reference) => getMovieDetails(reference.tmdbId)),
  );
  return results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    const movie = result.value;
    const year = Number(movie.release_date?.slice(0, 4));
    return [{
      tmdbId: movie.id,
      title: movie.title,
      ...(Number.isInteger(year) ? { year } : {}),
      runtime: movie.runtime,
      genres: movie.genres.map((genre) => genre.name),
      overview: (movie.overview ?? "").slice(0, 600),
    }];
  });
}

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
    const referenceContext = await loadReferenceContext(parsed.data);
    const response = questionsResponseSchema.parse({
      questions: await generateQuestions(parsed.data, referenceContext),
    });
    return NextResponse.json(response);
  } catch (error) {
    return llmErrorResponse(error);
  }
}
