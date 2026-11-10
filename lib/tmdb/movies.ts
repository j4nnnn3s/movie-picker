import "server-only";

import { tmdbFetch } from "@/lib/tmdb/client";
import type {
  TmdbMovieDetails,
  TmdbMovieSummary,
  TmdbPagedResponse,
} from "@/lib/tmdb/types";

const IMAGE_BASE = "https://image.tmdb.org/t/p";

export type MovieSearchResult = {
  tmdbId: number;
  title: string;
  year?: number;
  posterUrl: string | null;
};

export function tmdbImageUrl(path: string | null | undefined, size = "w500") {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

function releaseYear(date?: string) {
  const year = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year > 1800 ? year : undefined;
}

export async function searchMovies(query: string, limit = 8): Promise<MovieSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const response = await tmdbFetch<TmdbPagedResponse<TmdbMovieSummary>>("/search/movie", {
    query: normalized,
    include_adult: false,
    page: 1,
  });
  return response.results.slice(0, Math.max(1, Math.min(limit, 20))).map((movie) => ({
    tmdbId: movie.id,
    title: movie.title,
    year: releaseYear(movie.release_date),
    posterUrl: tmdbImageUrl(movie.poster_path, "w185"),
  }));
}

export function getMovieDetails(movieId: number) {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${movieId}`);
}

export function getMovieRecommendations(movieId: number, page = 1) {
  return tmdbFetch<TmdbPagedResponse<TmdbMovieSummary>>(
    `/movie/${movieId}/recommendations`,
    { page },
  );
}

export function getSimilarMovies(movieId: number, page = 1) {
  return tmdbFetch<TmdbPagedResponse<TmdbMovieSummary>>(
    `/movie/${movieId}/similar`,
    { page },
  );
}

export function discoverMovies(
  providerId: number,
  monetizationType: "flatrate" | "rent",
  page = 1,
  filters: {
    runtimeMax?: number;
    yearMin?: number;
    yearMax?: number;
    genreIds?: readonly number[];
  } = {},
) {
  return tmdbFetch<TmdbPagedResponse<TmdbMovieSummary>>("/discover/movie", {
    watch_region: "DE",
    with_watch_providers: providerId,
    with_watch_monetization_types: monetizationType,
    include_adult: false,
    include_video: false,
    sort_by: "popularity.desc",
    "vote_count.gte": 25,
    "with_runtime.lte": filters.runtimeMax,
    "primary_release_date.gte": filters.yearMin ? `${filters.yearMin}-01-01` : undefined,
    "primary_release_date.lte": filters.yearMax ? `${filters.yearMax}-12-31` : undefined,
    with_genres: filters.genreIds?.join("|"),
    page,
  });
}
