export type TmdbPagedResponse<T> = {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
};

export type TmdbMovieSummary = {
  id: number;
  title: string;
  original_title?: string;
  overview?: string;
  poster_path: string | null;
  release_date?: string;
  genre_ids?: number[];
  popularity?: number;
  vote_average?: number;
  vote_count?: number;
};

export type TmdbMovieDetails = TmdbMovieSummary & {
  runtime: number | null;
  genres: Array<{ id: number; name: string }>;
  imdb_id?: string | null;
};

export type TmdbWatchProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
};

export type TmdbWatchProviderRegion = {
  link: string;
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
};

export type TmdbWatchProvidersResponse = {
  id: number;
  results: Record<string, TmdbWatchProviderRegion>;
};

export type TmdbProviderListResponse = {
  results: TmdbWatchProvider[];
};
