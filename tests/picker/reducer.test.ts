import { describe, expect, it } from "vitest";

import { initialState, pickerReducer } from "@/lib/picker/reducer";

describe("picker reducer", () => {
  it("moves through service selection", () => {
    const state = pickerReducer(initialState, { type: "setServices", services: ["netflix"] });
    expect(state.step).toBe("mode");
    expect(state.services).toEqual(["netflix"]);
  });

  it("deduplicates appended suggestions and records seen movies", () => {
    const movie = {
      tmdbId: 12, title: "A Film", year: 2020, runtime: 100, genres: ["Drama"],
      posterUrl: "", reason: "A match.", providers: [{ name: "Netflix", type: "flatrate" as const }],
      watchUrl: "https://www.themoviedb.org/movie/12",
    };
    const withMovie = pickerReducer(initialState, { type: "suggestions", suggestions: [movie] });
    const appended = pickerReducer(withMovie, { type: "suggestions", suggestions: [movie], append: true });
    expect(appended.queue).toHaveLength(1);
    expect(pickerReducer(appended, { type: "next" }).seenIds).toContain(12);
  });
});
