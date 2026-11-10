import "server-only";

import { env } from "@/lib/env";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const DEFAULT_TIMEOUT_MS = 8_000;
export const TMDB_REVALIDATE_SECONDS = 60 * 60 * 24;

export class TmdbError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export type TmdbRequestOptions = {
  revalidate?: number | false;
  timeoutMs?: number;
};

function credentials(key: string, query: URLSearchParams): Record<string, string> {
  // TMDB v4 read tokens are JWTs; v3 keys are passed as api_key.
  if (key.startsWith("eyJ") || key.split(".").length === 3) {
    return { Authorization: `Bearer ${key}` };
  }
  query.set("api_key", key);
  return {};
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  options: TmdbRequestOptions = {},
): Promise<T> {
  const query = new URLSearchParams({ language: "de-DE", region: "DE" });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const headers = credentials(env().TMDB_API_KEY, query);
  const url = `${TMDB_BASE_URL}${path}?${query}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      next: options.revalidate === false
        ? undefined
        : { revalidate: options.revalidate ?? TMDB_REVALIDATE_SECONDS },
      cache: options.revalidate === false ? "no-store" : undefined,
    });

    if (!response.ok) {
      throw new TmdbError(`TMDB request failed (${response.status})`, response.status);
    }
    return await response.json() as T;
  } catch (error) {
    if (error instanceof TmdbError) throw error;
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "TMDB request timed out"
      : "TMDB request failed";
    throw new TmdbError(message, undefined, error);
  }
}
