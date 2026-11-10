# Movie Picker

A private, mobile-first movie recommender. TMDB supplies real movies and German streaming availability; an LLM only asks preference questions, ranks TMDB candidates, and explains each match.

## Setup

Requires Node.js 22+ and free API credentials for [TMDB](https://www.themoviedb.org/settings/api), [Google AI Studio](https://aistudio.google.com/), and optionally [Upstash Redis](https://upstash.com/) for deployment-safe rate limits.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set:

- `TMDB_API_KEY`: TMDB v4 read access token (preferred) or v3 API key
- `LLM_PROVIDER`: `gemini`, `groq`, `mistral`, or `openrouter`
- `LLM_MODEL`: defaults to `gemini-3.1-flash-lite`
- `LLM_API_KEY`: provider API key
- `SITE_PASSWORD`: shared site password, at least 8 characters
- `AUTH_SECRET`: random string of at least 32 characters (`openssl rand -base64 32`)
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: recommended in production; local development falls back to an in-process limiter

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Deployment

1. Import the Git repository into Vercel and select the Hobby plan.
2. Create a free Upstash Redis database.
3. Add every variable from `.env.example` to the Vercel project.
4. Deploy, sign in through `/login`, and confirm provider badges match the linked TMDB/JustWatch availability page.

No secrets are sent to the browser. The app uses a signed 30-day HTTP-only cookie, protects pages and APIs at the proxy and route-handler boundaries, and limits requests by session/IP. TMDB data is requested in `de-DE` with German (`DE`) watch availability.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB. Watch-provider data is supplied by JustWatch through TMDB.
