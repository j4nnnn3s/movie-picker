import { NextRequest, NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth";
import {
  suggestRequestSchema,
  suggestResponseSchema,
  type Answers,
  type Question,
} from "@/lib/contracts";
import { llmErrorResponse, readJsonBody } from "@/lib/llm/http";
import { APPROVED_GENRE_IDS, rankCandidates } from "@/lib/llm/tasks";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  buildCandidatePool,
  type CandidateMovie,
} from "@/lib/recommendations/candidates";

const MAX_BODY_BYTES = 131_072;

function answersMatchQuestions(questions: Question[], answers: Answers) {
  const questionIds = new Set<string>();
  for (const question of questions) {
    if (questionIds.has(question.id)) return false;
    questionIds.add(question.id);

    const optionIds = new Set(question.options.map((option) => option.id));
    if (optionIds.size !== question.options.length) return false;
    if (question.options.some((option) =>
      option.effect?.genreIds?.some((id) => !APPROVED_GENRE_IDS.has(id)))) return false;
    const selected = answers[question.id];
    if (!selected || (!question.multi && selected.length !== 1)) return false;
    if (new Set(selected).size !== selected.length) return false;
    if (selected.some((id) => !optionIds.has(id))) return false;
  }
  return Object.keys(answers).every((id) => questionIds.has(id));
}

function hasPoster(candidate: CandidateMovie): candidate is CandidateMovie & { posterUrl: string } {
  return typeof candidate.posterUrl === "string" && candidate.posterUrl.length > 0;
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

  const parsed = suggestRequestSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success || !answersMatchQuestions(parsed.data.questions, parsed.data.answers)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const body = parsed.data;
  let candidates: Array<CandidateMovie & { posterUrl: string }>;
  try {
    const pool = await buildCandidatePool({
      services: body.services,
      questions: body.questions,
      answers: body.answers,
      references: body.input.mode === "reference" ? body.input.references : undefined,
      seenIds: body.seenIds,
      maxCandidates: 30,
    });
    candidates = pool.filter(hasPoster);
  } catch {
    return NextResponse.json({ error: "tmdb_unavailable" }, { status: 503 });
  }

  if (!candidates.length) {
    return NextResponse.json({ error: "no_matches" }, { status: 404 });
  }

  const selectedAnswers = body.questions.map((question) => ({
    question: question.text,
    answers: question.options
      .filter((option) => body.answers[question.id]?.includes(option.id))
      .map((option) => option.label),
  }));

  try {
    const rankings = await rankCandidates({
      input: body.input,
      answers: selectedAnswers,
      feedback: body.feedback,
    }, candidates);
    const byId = new Map(candidates.map((candidate) => [candidate.tmdbId, candidate]));
    const suggestions = rankings.map(({ tmdbId, reason }) => {
      const candidate = byId.get(tmdbId)!;
      return {
        tmdbId: candidate.tmdbId,
        title: candidate.title,
        year: candidate.year,
        runtime: candidate.runtime,
        genres: candidate.genres,
        posterUrl: candidate.posterUrl,
        reason,
        providers: candidate.providers.map(({ name, type }) => ({ name, type })),
        watchUrl: candidate.watchUrl,
        overview: candidate.overview || undefined,
      };
    });
    return NextResponse.json(suggestResponseSchema.parse({ suggestions }));
  } catch (error) {
    return llmErrorResponse(error);
  }
}
