import "server-only";

import type {
  Answers,
  Question,
  ReferenceMovie,
  Service,
} from "@/lib/contracts";
import {
  discoverMovies,
  getMovieDetails,
  getMovieRecommendations,
  getMovieWatchProviders,
  getProviderMapping,
  getSimilarMovies,
  matchSelectedProviders,
  tmdbImageUrl,
  type CandidateProvider,
  type TmdbMovieSummary,
} from "@/lib/tmdb";

export type CandidateFilters = {
  runtimeMax?: number;
  yearMin?: number;
  yearMax?: number;
  genreIds?: number[];
};

export type CandidateMovie = {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year: number;
  runtime: number;
  genreIds: number[];
  genres: string[];
  overview: string;
  posterUrl: string | null;
  popularity: number;
  voteAverage: number;
  voteCount: number;
  providers: CandidateProvider[];
  watchUrl: string;
  source: "discover" | "recommendation" | "similar";
};

export type CandidatePoolOptions = {
  services: readonly Service[];
  questions: readonly Question[];
  answers: Answers;
  references?: readonly ReferenceMovie[];
  seenIds?: readonly number[];
  pages?: number;
  maxCandidates?: number;
};

export function deriveCandidateFilters(
  questions: readonly Question[],
  answers: Answers,
): CandidateFilters {
  const effects = questions.flatMap((question) => {
    const selected = new Set(answers[question.id] ?? []);
    return question.options
      .filter((option) => selected.has(option.id))
      .flatMap((option) => option.effect ? [option.effect] : []);
  });

  const runtimeMaxes = effects.flatMap((effect) =>
    effect.runtimeMax === undefined ? [] : [effect.runtimeMax]);
  const yearMins = effects.flatMap((effect) =>
    effect.yearMin === undefined ? [] : [effect.yearMin]);
  const yearMaxes = effects.flatMap((effect) =>
    effect.yearMax === undefined ? [] : [effect.yearMax]);
  const genreIds = [...new Set(effects.flatMap((effect) => effect.genreIds ?? []))]
    .sort((a, b) => a - b);

  return {
    runtimeMax: runtimeMaxes.length ? Math.min(...runtimeMaxes) : undefined,
    yearMin: yearMins.length ? Math.max(...yearMins) : undefined,
    yearMax: yearMaxes.length ? Math.min(...yearMaxes) : undefined,
    genreIds: genreIds.length ? genreIds : undefined,
  };
}

function yearOf(releaseDate?: string) {
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : NaN;
  return Number.isInteger(year) && year > 1800 ? year : 0;
}

function matchesFilters(
  movie: { runtime: number | null; release_date?: string; genres: Array<{ id: number }> },
  filters: CandidateFilters,
) {
  const year = yearOf(movie.release_date);
  if (!movie.runtime || !year) return false;
  if (filters.runtimeMax !== undefined && movie.runtime > filters.runtimeMax) return false;
  if (filters.yearMin !== undefined && year < filters.yearMin) return false;
  if (filters.yearMax !== undefined && year > filters.yearMax) return false;
  if (filters.genreIds?.length && !filters.genreIds.some(
    (genreId) => movie.genres.some((genre) => genre.id === genreId),
  )) return false;
  return true;
}

async function referenceMovies(references: readonly ReferenceMovie[], pages: number) {
  type ReferenceCandidate = {
    movie: TmdbMovieSummary;
    source: "recommendation" | "similar";
  };
  const requests: Array<Promise<ReferenceCandidate[]>> = [];
  for (const reference of references) {
    for (let page = 1; page <= Math.min(pages, 2); page += 1) {
      requests.push(getMovieRecommendations(reference.tmdbId, page).then((response) =>
        response.results.map((movie) => ({ movie, source: "recommendation" }))));
      requests.push(getSimilarMovies(reference.tmdbId, page).then((response) =>
        response.results.map((movie) => ({ movie, source: "similar" }))));
    }
  }
  return (await Promise.allSettled(requests)).flatMap((result) =>
    result.status === "fulfilled" ? result.value : []);
}

export async function buildCandidatePool(
  options: CandidatePoolOptions,
): Promise<CandidateMovie[]> {
  const filters = deriveCandidateFilters(options.questions, options.answers);
  const pages = Math.max(2, Math.min(options.pages ?? 3, 5));
  const maxCandidates = Math.max(1, Math.min(options.maxCandidates ?? 40, 100));
  const seen = new Set(options.seenIds ?? []);
  const mapping = await getProviderMapping();

  const discoverRequests = options.services.flatMap((service) => {
    const provider = mapping[service];
    if (!provider) return [];
    const type = service === "prime_rent" ? "rent" as const : "flatrate" as const;
    return Array.from({ length: pages }, (_, index) =>
      discoverMovies(provider.provider_id, type, index + 1, filters).then((response) =>
        response.results.map((movie) => ({ movie, source: "discover" as const }))));
  });
  const [discoverSettled, fromReferences] = await Promise.all([
    Promise.allSettled(discoverRequests),
    referenceMovies(options.references ?? [], pages),
  ]);
  const raw = [
    ...fromReferences,
    ...discoverSettled.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []),
  ];

  const unique = new Map<number, { movie: TmdbMovieSummary; source: CandidateMovie["source"] }>();
  for (const item of raw) {
    if (!seen.has(item.movie.id) && !unique.has(item.movie.id)) {
      unique.set(item.movie.id, item);
    }
  }

  // Bound detail/provider fan-out while keeping reference-derived items first.
  const shortlist = [...unique.values()].slice(0, Math.max(maxCandidates * 3, 60));
  const enriched = await Promise.all(shortlist.map(
    async ({ movie, source }): Promise<CandidateMovie | null> => {
    try {
      const [details, availability] = await Promise.all([
        getMovieDetails(movie.id),
        getMovieWatchProviders(movie.id),
      ]);
      const providers = matchSelectedProviders(options.services, mapping, availability);
      if (!providers.length || !matchesFilters(details, filters)) return null;
      const candidate: CandidateMovie = {
        tmdbId: details.id,
        title: details.title,
        year: yearOf(details.release_date),
        runtime: details.runtime!,
        genreIds: details.genres.map((genre) => genre.id),
        genres: details.genres.map((genre) => genre.name),
        overview: details.overview ?? "",
        posterUrl: tmdbImageUrl(details.poster_path),
        popularity: details.popularity ?? 0,
        voteAverage: details.vote_average ?? 0,
        voteCount: details.vote_count ?? 0,
        providers,
        watchUrl: providers[0].watchUrl,
        source,
      };
      if (details.original_title) candidate.originalTitle = details.original_title;
      return candidate;
    } catch {
      return null;
    }
  }));

  return enriched.filter((candidate): candidate is CandidateMovie => candidate !== null)
    .slice(0, maxCandidates);
}
