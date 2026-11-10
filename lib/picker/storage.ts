import type { Service } from "@/lib/contracts";
import { serviceSchema } from "@/lib/contracts";

const KEY = "movie-picker:v1";
const MAX_SEEN = 1000;

export type StoredPicker = { services: Service[]; seenIds: number[] };

export function loadPicker(): StoredPicker {
  if (typeof window === "undefined") return { services: [], seenIds: [] };
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "");
    return {
      services: Array.isArray(value.services)
        ? value.services.flatMap((item: unknown) => {
            const parsed = serviceSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          })
        : [],
      seenIds: Array.isArray(value.seenIds)
        ? value.seenIds.filter((id: unknown) => Number.isInteger(id) && Number(id) > 0).slice(-MAX_SEEN)
        : [],
    };
  } catch {
    return { services: [], seenIds: [] };
  }
}

export function savePicker(value: StoredPicker) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify({
    services: value.services,
    seenIds: [...new Set(value.seenIds)].slice(-MAX_SEEN),
  }));
}
