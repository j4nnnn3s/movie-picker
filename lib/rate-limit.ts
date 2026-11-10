import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

import { hasRedisEnv } from "@/lib/env";

const memory = new Map<string, { count: number; reset: number }>();
const redis = hasRedisEnv() ? Redis.fromEnv() : null;
const apiLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "1 h"), prefix: "mp:api" })
  : null;
const loginLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "15 m"), prefix: "mp:login" })
  : null;

function ipFor(request: NextRequest) {
  return request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function localLimit(key: string, max: number, duration: number) {
  const now = Date.now();
  const current = memory.get(key);
  if (!current || current.reset <= now) {
    memory.set(key, { count: 1, reset: now + duration });
    return true;
  }
  current.count += 1;
  return current.count <= max;
}

export async function checkRateLimit(request: NextRequest, kind: "api" | "login") {
  const session = request.cookies.get("movie-picker-session")?.value;
  const identifier = session ? `session:${session.slice(-20)}` : `ip:${ipFor(request)}`;
  const limiter = kind === "login" ? loginLimiter : apiLimiter;
  if (limiter) return (await limiter.limit(identifier)).success;
  return localLimit(`${kind}:${identifier}`, kind === "login" ? 10 : 60, kind === "login" ? 900_000 : 3_600_000);
}
