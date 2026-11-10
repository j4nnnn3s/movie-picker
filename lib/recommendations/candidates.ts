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

function devLog(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[recommendations] ${message}`, details);
  }
}

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
  const settled = await Promise.allSettled(requests);
  const movies = settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []);
  devLog("reference lookup", {
    references: references.length,
    requests: requests.length,
    failedRequests: settled.filter((result) => result.status === "rejected").length,
    results: movies.length,
  });
  return movies;
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
  const fromDiscover = discoverSettled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : []);
  const raw = [
    ...fromReferences,
    ...fromDiscover,
  ];
  devLog("source results", {
    services: options.services.length,
    discoverRequests: discoverRequests.length,
    failedDiscoverRequests: discoverSettled.filter((result) => result.status === "rejected").length,
    discoverResults: fromDiscover.length,
    referenceResults: fromReferences.length,
    filters,
  });

  const unique = new Map<number, { movie: TmdbMovieSummary; source: CandidateMovie["source"] }>();
  for (const item of raw) {
    if (!seen.has(item.movie.id) && !unique.has(item.movie.id)) {
      unique.set(item.movie.id, item);
    }
  }

  // Keep reference relevance without allowing unavailable reference results to
  // crowd service-compatible discovery results out of the detail shortlist.
  const shortlistLimit = Math.max(maxCandidates * 3, 60);
  const uniqueCandidates = [...unique.values()];
  const referenceCandidates = uniqueCandidates.filter((item) => item.source !== "discover");
  const discoverCandidates = uniqueCandidates.filter((item) => item.source === "discover");
  const discoverTarget = discoverCandidates.length ? Math.floor(shortlistLimit / 3) : 0;
  const shortlist = [
    ...referenceCandidates.slice(0, shortlistLimit - discoverTarget),
    ...discoverCandidates.slice(0, discoverTarget),
  ];
  if (shortlist.length < shortlistLimit) {
    const selected = new Set(shortlist.map((item) => item.movie.id));
    shortlist.push(...uniqueCandidates
      .filter((item) => !selected.has(item.movie.id))
      .slice(0, shortlistLimit - shortlist.length));
  }
  const rejected = {
    unavailableDetails: 0,
    noSelectedProvider: 0,
    filterMismatch: 0,
  };
  const enriched = await Promise.all(shortlist.map(
    async ({ movie, source }): Promise<CandidateMovie | null> => {
    try {
      const [details, availability] = await Promise.all([
        getMovieDetails(movie.id),
        getMovieWatchProviders(movie.id),
      ]);
      const providers = matchSelectedProviders(options.services, mapping, availability);
      if (!providers.length) {
        rejected.noSelectedProvider += 1;
        return null;
      }
      if (!matchesFilters(details, filters)) {
        rejected.filterMismatch += 1;
        return null;
      }
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
      rejected.unavailableDetails += 1;
      return null;
    }
  }));

  const candidates = enriched.filter((candidate): candidate is CandidateMovie => candidate !== null)
    .slice(0, maxCandidates);
  devLog("candidate pool", {
    raw: raw.length,
    unique: unique.size,
    shortlist: shortlist.length,
    shortlistBySource: {
      reference: shortlist.filter((item) => item.source !== "discover").length,
      discover: shortlist.filter((item) => item.source === "discover").length,
    },
    rejected,
    accepted: candidates.length,
    acceptedBySource: {
      recommendation: candidates.filter((candidate) => candidate.source === "recommendation").length,
      similar: candidates.filter((candidate) => candidate.source === "similar").length,
      discover: candidates.filter((candidate) => candidate.source === "discover").length,
    },
  });
  return candidates;
}
