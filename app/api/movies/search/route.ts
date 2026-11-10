import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAuthenticated } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { searchMovies, TmdbError } from "@/lib/tmdb";

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export async function GET(request: NextRequest) {
  if (!(await checkRateLimit(request, "api"))) {
    return NextResponse.json(
      { error: "rate_limited", kind: "rate_limit" },
      { status: 429 },
    );
  }
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q"),
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const results = await searchMovies(parsed.data.q, parsed.data.limit);
    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof TmdbError) {
      return NextResponse.json({ error: "tmdb_unavailable" }, { status: 503 });
    }
    throw error;
  }
}
