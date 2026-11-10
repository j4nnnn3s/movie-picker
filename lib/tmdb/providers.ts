import "server-only";

import type { Service } from "@/lib/contracts";
import { tmdbFetch } from "@/lib/tmdb/client";
import type {
  TmdbProviderListResponse,
  TmdbWatchProvider,
  TmdbWatchProviderRegion,
  TmdbWatchProvidersResponse,
} from "@/lib/tmdb/types";

const SERVICE_PROVIDER_NAMES: Record<Service, string> = {
  netflix: "Netflix",
  prime_included: "Amazon Prime Video",
  prime_rent: "Amazon Video",
  disney_plus: "Disney Plus",
};

export type ProviderMapping = Record<Service, TmdbWatchProvider | null>;
export type CandidateProvider = {
  service: Service;
  providerId: number;
  name: string;
  type: "flatrate" | "rent";
  logoPath: string | null;
  displayPriority: number;
  watchUrl: string;
};

export async function getProviderMapping(): Promise<ProviderMapping> {
  const { results } = await tmdbFetch<TmdbProviderListResponse>("/watch/providers/movie", {
    watch_region: "DE",
  });
  return Object.fromEntries(
    Object.entries(SERVICE_PROVIDER_NAMES).map(([service, name]) => [
      service,
      results.find((provider) => provider.provider_name === name) ?? null,
    ]),
  ) as ProviderMapping;
}

export async function getMovieWatchProviders(movieId: number) {
  const response = await tmdbFetch<TmdbWatchProvidersResponse>(`/movie/${movieId}/watch/providers`);
  return response.results.DE ?? null;
}

function providerForService(
  service: Service,
  mapping: ProviderMapping,
  availability: TmdbWatchProviderRegion,
): CandidateProvider | null {
  const provider = mapping[service];
  if (!provider) return null;
  const type = service === "prime_rent" ? "rent" : "flatrate";
  const match = availability[type]?.find((item) => item.provider_id === provider.provider_id);
  if (!match) return null;
  return {
    service,
    providerId: match.provider_id,
    name: match.provider_name,
    type,
    logoPath: match.logo_path,
    displayPriority: match.display_priority,
    watchUrl: availability.link,
  };
}

export function matchSelectedProviders(
  services: readonly Service[],
  mapping: ProviderMapping,
  availability: TmdbWatchProviderRegion | null,
): CandidateProvider[] {
  if (!availability) return [];
  return services.flatMap((service) => {
    const provider = providerForService(service, mapping, availability);
    return provider ? [provider] : [];
  });
}
