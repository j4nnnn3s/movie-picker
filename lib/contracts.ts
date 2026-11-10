import { z } from "zod";

export const services = ["netflix", "prime_included", "prime_rent", "disney_plus"] as const;
export const serviceSchema = z.enum(services);
export type Service = z.infer<typeof serviceSchema>;

export const referenceMovieSchema = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string().min(1),
  year: z.number().int().optional(),
  posterUrl: z.string().nullable(),
});
export type ReferenceMovie = z.infer<typeof referenceMovieSchema>;

export const filterEffectSchema = z.object({
  runtimeMax: z.number().int().min(40).max(400).optional(),
  yearMin: z.number().int().min(1900).max(2100).optional(),
  yearMax: z.number().int().min(1900).max(2100).optional(),
  genreIds: z.array(z.number().int().positive()).max(4).optional(),
});

export const questionSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(160),
  multi: z.boolean(),
  options: z.array(z.object({
    id: z.string().min(1).max(40),
    label: z.string().min(1).max(80),
    effect: filterEffectSchema.optional(),
  })).min(3).max(5),
});
export type Question = z.infer<typeof questionSchema>;

export const modeInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("mood"), mood: z.string().trim().min(2).max(500) }),
  z.object({ mode: z.literal("reference"), references: z.array(referenceMovieSchema).min(1).max(5) }),
]);
export type ModeInput = z.infer<typeof modeInputSchema>;

export const answersSchema = z.record(z.string(), z.array(z.string()).min(1).max(5));
export type Answers = z.infer<typeof answersSchema>;

export const feedbackSchema = z.enum(["too_long", "too_dark", "seen_it"]);
export type Feedback = z.infer<typeof feedbackSchema>;

export const providerSchema = z.object({
  name: z.string(),
  type: z.enum(["flatrate", "rent"]),
});

export const suggestionSchema = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string(),
  year: z.number().int(),
  runtime: z.number().int().nonnegative(),
  genres: z.array(z.string()),
  posterUrl: z.string(),
  reason: z.string(),
  providers: z.array(providerSchema),
  watchUrl: z.string().url(),
  overview: z.string().optional(),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const apiErrorSchema = z.object({
  error: z.enum(["llm_unavailable", "tmdb_unavailable", "unauthorized", "rate_limited", "invalid_request", "no_matches"]),
  kind: z.enum(["rate_limit", "daily_limit", "down"]).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const questionsRequestSchema = modeInputSchema;
export const questionsResponseSchema = z.object({ questions: z.array(questionSchema).min(3).max(4) });

export const suggestRequestSchema = z.object({
  services: z.array(serviceSchema).min(1),
  input: modeInputSchema,
  questions: z.array(questionSchema).min(3).max(4),
  answers: answersSchema,
  seenIds: z.array(z.number().int().positive()).max(1000).default([]),
  feedback: z.array(feedbackSchema).max(20).default([]),
});

export const suggestResponseSchema = z.object({ suggestions: z.array(suggestionSchema) });

export const searchResultSchema = z.object({
  tmdbId: z.number().int().positive(),
  title: z.string(),
  year: z.number().int().optional(),
  posterUrl: z.string().nullable(),
});
