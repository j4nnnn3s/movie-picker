import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { AUTH_COOKIE, createSession, passwordMatches, sessionCookieOptions } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({ password: z.string().max(500) });

export async function POST(request: NextRequest) {
  if (!(await checkRateLimit(request, "login"))) {
    return NextResponse.json({ error: "rate_limited", kind: "rate_limit" }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !passwordMatches(parsed.data.password)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, createSession(), sessionCookieOptions);
  return response;
}
