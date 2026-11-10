import { describe, expect, it } from "vitest";

import { deriveCandidateFilters } from "@/lib/recommendations/candidates";

describe("deriveCandidateFilters", () => {
  it("combines selected option effects into deterministic constraints", () => {
    const filters = deriveCandidateFilters([
      {
        id: "runtime",
        text: "How long?",
        multi: false,
        options: [
          { id: "short", label: "Short", effect: { runtimeMax: 100 } },
          { id: "long", label: "Long" },
          { id: "any", label: "Any" },
        ],
      },
      {
        id: "genre",
        text: "Which genres?",
        multi: true,
        options: [
          { id: "comedy", label: "Comedy", effect: { genreIds: [35] } },
          { id: "drama", label: "Drama", effect: { genreIds: [18] } },
          { id: "other", label: "Other" },
        ],
      },
    ], { runtime: ["short"], genre: ["comedy", "drama"] });

    expect(filters).toEqual({ runtimeMax: 100, genreIds: [18, 35] });
  });
});
