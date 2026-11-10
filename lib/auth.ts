import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { env } from "@/lib/env";

export const AUTH_COOKIE = "movie-picker-session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function encode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signature(payload: string) {
  return createHmac("sha256", env().AUTH_SECRET).update(payload).digest("base64url");
}

export function createSession(now = Date.now()) {
  const payload = encode(JSON.stringify({ v: 1, iat: now, exp: now + SESSION_SECONDS * 1000 }));
  return `${payload}.${signature(payload)}`;
}

export function verifySession(value?: string, now = Date.now()) {
  if (!value) return false;
  const [payload, supplied] = value.split(".");
  if (!payload || !supplied) return false;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { v: number; exp: number };
    return data.v === 1 && Number.isFinite(data.exp) && data.exp > now;
  } catch {
    return false;
  }
}

export function passwordMatches(candidate: string) {
  const expected = Buffer.from(env().SITE_PASSWORD);
  const actual = Buffer.from(candidate);
  if (actual.length !== expected.length) {
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export async function isAuthenticated() {
  return verifySession((await cookies()).get(AUTH_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: SESSION_SECONDS,
  path: "/",
};
