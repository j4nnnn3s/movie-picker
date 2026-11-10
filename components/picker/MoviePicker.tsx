"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import type { ApiError, Feedback, ModeInput, Question, ReferenceMovie, Service, Suggestion } from "@/lib/contracts";
import { pickerReducer, initialState } from "@/lib/picker/reducer";
import { loadPicker, savePicker } from "@/lib/picker/storage";
import { ErrorModal } from "@/components/ui/ErrorModal";

const serviceLabels: Record<Service, { title: string; note: string }> = {
  netflix: { title: "Netflix", note: "Included" },
  prime_included: { title: "Amazon Prime", note: "Included with Prime" },
  prime_rent: { title: "Amazon Video", note: "Extra rentals" },
  disney_plus: { title: "Disney+", note: "Included" },
};

async function readApi<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw body;
  return body as T;
}

export function MoviePicker() {
  const [state, dispatch] = useReducer(pickerReducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastError, setLastError] = useState<string>();
  const fetching = useRef(false);
  const retryRef = useRef<
    | { kind: "questions"; input: ModeInput }
    | { kind: "suggestions"; answers: typeof state.answers; append: boolean; feedback: Feedback[] }
    | null
  >(null);

  useEffect(() => {
    const stored = loadPicker();
    dispatch({ type: "hydrate", ...stored });
    // Hydration is intentionally gated until browser-only storage has been read.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) savePicker({ services: state.services, seenIds: state.seenIds });
  }, [hydrated, state.services, state.seenIds]);

  const fail = useCallback((cause: unknown) => {
    const value = cause && typeof cause === "object" && "error" in cause
      ? cause as ApiError
      : { error: "llm_unavailable" as const, kind: "down" as const };
    setError(value);
    setLastError(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  }, []);

  const requestQuestions = useCallback(async (input: ModeInput) => {
    retryRef.current = { kind: "questions", input };
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/questions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      });
      const data = await readApi<{ questions: Question[] }>(response);
      dispatch({ type: "setInput", input, questions: data.questions });
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }, [fail]);

  const requestSuggestions = useCallback(async (
    answers = state.answers,
    append = false,
    feedback = state.feedback,
  ) => {
    if (!state.input || fetching.current) return;
    retryRef.current = { kind: "suggestions", answers, append, feedback };
    fetching.current = true;
    setBusy(!append);
    setError(null);
    try {
      const response = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          services: state.services, input: state.input, questions: state.questions,
          answers, seenIds: [...state.seenIds, ...state.queue.map((item) => item.tmdbId)], feedback,
        }),
      });
      const data = await readApi<{ suggestions: typeof state.queue }>(response);
      if (!data.suggestions.length) throw { error: "no_matches" };
      dispatch({ type: "suggestions", suggestions: data.suggestions, append });
    } catch (cause) {
      if (
        append
        && cause
        && typeof cause === "object"
        && "error" in cause
        && cause.error === "no_matches"
      ) return;
      fail(cause);
    } finally {
      fetching.current = false;
      setBusy(false);
    }
  }, [fail, state]);

  useEffect(() => {
    const remaining = state.queue.length - state.current - 1;
    if (state.step === "suggestions" && remaining <= 2 && state.queue.length > 0) {
      // Background prefetch synchronizes the local queue with the recommendation API.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void requestSuggestions(state.answers, true);
    }
  }, [requestSuggestions, state]);

  function answer(question: Question, optionIds: string[]) {
    const answers = { ...state.answers, [question.id]: optionIds };
    dispatch({ type: "answer", questionId: question.id, optionIds });
    if (state.questionIndex === state.questions.length - 1) {
      void requestSuggestions(answers);
    }
  }

  function next(feedback?: Feedback) {
    dispatch({ type: "next", feedback });
    if (feedback) void requestSuggestions(state.answers, true, [...state.feedback, feedback]);
  }

  if (!hydrated) return <Loading label="Getting the lights ready…" />;

  return (
    <>
      <main className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <header className="mb-7 flex items-center justify-between">
          <div>
            <p className="eyebrow">Tonight’s feature</p>
            <h1 className="text-2xl font-semibold tracking-tight">Movie Picker</h1>
          </div>
          {state.step !== "services" && (
            <button className="text-sm text-stone-400 underline-offset-4 hover:underline" onClick={() => dispatch({ type: "editServices" })}>
              Services
            </button>
          )}
        </header>

        {state.step === "services" && <Services selected={state.services} onContinue={(services) => dispatch({ type: "setServices", services })} />}
        {state.step === "mode" && <Mode onSubmit={requestQuestions} busy={busy} />}
        {state.step === "questions" && (
          <Questions
            key={state.questions[state.questionIndex]?.id}
            questions={state.questions}
            index={state.questionIndex}
            answers={state.answers}
            busy={busy}
            onAnswer={answer}
            onBack={() => dispatch({ type: "questionBack" })}
          />
        )}
        {state.step === "suggestions" && (
          <Suggestions
            movie={state.queue[state.current]}
            busy={busy}
            canBack={state.current > 0}
            onBack={() => dispatch({ type: "back" })}
            onNext={next}
            onRestart={() => dispatch({ type: "restart" })}
          />
        )}
      </main>
      <footer className="mx-auto max-w-lg px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-[11px] leading-relaxed text-stone-500">
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p>Streaming availability data provided by JustWatch. {lastError && `Last error: ${lastError}`}</p>
      </footer>
      <ErrorModal error={error} onClose={() => setError(null)} onRetry={() => {
        setError(null);
        const retry = retryRef.current;
        if (retry?.kind === "questions") void requestQuestions(retry.input);
        else if (retry?.kind === "suggestions") void requestSuggestions(retry.answers, retry.append, retry.feedback);
      }} />
    </>
  );
}

function Services({ selected, onContinue }: { selected: Service[]; onContinue: (services: Service[]) => void }) {
  const [value, setValue] = useState(selected);
  function toggle(service: Service) {
    setValue((current) => current.includes(service) ? current.filter((item) => item !== service) : [...current, service]);
  }
  return (
    <section className="flex flex-1 flex-col">
      <div>
        <p className="step-label">Step 1 of 3</p>
        <h2 className="screen-title">Where can we look?</h2>
        <p className="screen-copy">Choose every service that works tonight.</p>
      </div>
      <div className="mt-7 grid gap-3">
        {(Object.keys(serviceLabels) as Service[]).map((service) => {
          const active = value.includes(service);
          return (
            <button key={service} aria-pressed={active} onClick={() => toggle(service)} className={`choice-card ${active ? "choice-card-active" : ""}`}>
              <span className="text-left"><strong className="block">{serviceLabels[service].title}</strong><span className="text-sm text-stone-400">{serviceLabels[service].note}</span></span>
              <span aria-hidden className={`check ${active ? "check-active" : ""}`}>{active ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
      <button disabled={!value.length} className="primary-button mt-auto" onClick={() => onContinue(value)}>Continue</button>
    </section>
  );
}

function Mode({ onSubmit, busy }: { onSubmit: (input: ModeInput) => void; busy: boolean }) {
  const [mode, setMode] = useState<"mood" | "reference">("mood");
  const [mood, setMood] = useState("");
  const [references, setReferences] = useState<ReferenceMovie[]>([]);
  return (
    <section className="flex flex-1 flex-col">
      <p className="step-label">Step 2 of 3</p>
      <h2 className="screen-title">What feels right?</h2>
      <div className="mt-6 grid grid-cols-2 rounded-xl bg-white/5 p-1">
        {(["mood", "reference"] as const).map((item) => (
          <button key={item} className={`min-h-12 rounded-lg text-sm font-medium ${mode === item ? "bg-amber-300 text-stone-950" : "text-stone-300"}`} onClick={() => setMode(item)}>
            {item === "mood" ? "Mood" : "Reference movies"}
          </button>
        ))}
      </div>
      {mode === "mood" ? (
        <label className="mt-6 block">
          <span className="mb-2 block text-sm font-medium">Describe tonight’s mood</span>
          <textarea className="field min-h-36 resize-none" value={mood} maxLength={500} onChange={(event) => setMood(event.target.value)} placeholder="Cozy, a bit funny, not too long…" />
        </label>
      ) : <ReferenceSearch selected={references} onChange={setReferences} />}
      <button
        disabled={busy || (mode === "mood" ? mood.trim().length < 2 : references.length === 0)}
        className="primary-button mt-auto"
        onClick={() => onSubmit(mode === "mood" ? { mode, mood: mood.trim() } : { mode, references })}
      >
        {busy ? "Preparing a few questions…" : "Continue"}
      </button>
    </section>
  );
}

function ReferenceSearch({ selected, onChange }: { selected: ReferenceMovie[]; onChange: (value: ReferenceMovie[]) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReferenceMovie[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) return setResults([]);
      const response = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).catch(() => null);
      if (response?.ok) setResults((await response.json()).results ?? []);
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return (
    <div className="mt-6">
      <label className="block text-sm font-medium">Find 1–5 movies</label>
      <input className="field mt-2" value={query} disabled={selected.length >= 5} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing a title…" />
      {results.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-stone-900">
          {results.filter((movie) => !selected.some((item) => item.tmdbId === movie.tmdbId)).slice(0, 5).map((movie) => (
            <button key={movie.tmdbId} className="flex min-h-14 w-full items-center gap-3 border-b border-white/5 px-3 py-2 text-left last:border-0" onClick={() => { onChange([...selected, movie]); setQuery(""); setResults([]); }}>
              {/* The TMDB image host is dynamic; direct images avoid deployment-specific loader config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {movie.posterUrl ? <img src={movie.posterUrl} alt="" className="h-12 w-8 rounded object-cover" /> : <span className="h-12 w-8 rounded bg-white/10" />}
              <span>{movie.title} <span className="text-stone-500">{movie.year ?? ""}</span></span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {selected.map((movie) => (
          <button key={movie.tmdbId} className="rounded-full bg-white/10 px-3 py-2 text-sm" onClick={() => onChange(selected.filter((item) => item.tmdbId !== movie.tmdbId))}>
            {movie.title} <span aria-hidden>×</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Questions({ questions, index, answers, busy, onAnswer, onBack }: {
  questions: Question[]; index: number; answers: Record<string, string[]>; busy: boolean;
  onAnswer: (question: Question, values: string[]) => void; onBack: () => void;
}) {
  const question = questions[index];
  const [selected, setSelected] = useState<string[]>(answers[question?.id] ?? []);
  if (busy) return <Loading label="Looking through the shelves…" />;
  if (!question) return <Loading label="Preparing your questions…" />;
  const choose = (id: string) => {
    if (!question.multi) return onAnswer(question, [id]);
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  return (
    <section className="flex flex-1 flex-col">
      <div className="mb-5 flex gap-2" aria-label={`Question ${index + 1} of ${questions.length}`}>
        {questions.map((item, itemIndex) => <span key={item.id} className={`h-1 flex-1 rounded-full ${itemIndex <= index ? "bg-amber-300" : "bg-white/10"}`} />)}
      </div>
      <p className="step-label">Question {index + 1} of {questions.length}</p>
      <h2 className="screen-title">{question.text}</h2>
      <div className="mt-7 grid gap-3">
        {question.options.map((option) => {
          const active = selected.includes(option.id);
          return <button key={option.id} className={`choice-card ${active ? "choice-card-active" : ""}`} onClick={() => choose(option.id)}>{option.label}<span className={`check ${active ? "check-active" : ""}`}>{active ? "✓" : ""}</span></button>;
        })}
      </div>
      <div className="mt-auto grid grid-cols-[auto_1fr] gap-3">
        <button className="secondary-button" onClick={onBack}>Back</button>
        {question.multi && <button disabled={!selected.length || busy} className="primary-button" onClick={() => onAnswer(question, selected)}>{busy ? "Looking through the shelves…" : "Continue"}</button>}
      </div>
    </section>
  );
}

function Suggestions({ movie, busy, canBack, onBack, onNext, onRestart }: {
  movie: Suggestion | undefined; busy: boolean; canBack: boolean; onBack: () => void;
  onNext: (feedback?: Feedback) => void; onRestart: () => void;
}) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  if (!movie) return <Loading label={busy ? "Looking through the shelves…" : "Finding another good one…"} />;
  return (
    <section className="flex flex-1 flex-col">
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-stone-900 shadow-2xl shadow-black/40">
        <div className="relative aspect-[2/3] max-h-[52dvh] bg-stone-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {movie.posterUrl ? <img src={movie.posterUrl} alt={`${movie.title} poster`} className="h-full w-full object-cover" /> : null}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-950 via-stone-950/80 to-transparent px-5 pb-5 pt-20">
            <p className="text-sm text-amber-200">{movie.providers.map((provider) => `${provider.name}${provider.type === "rent" ? " · rent" : ""}`).join("  ·  ")}</p>
            <h2 className="mt-1 text-3xl font-semibold leading-tight">{movie.title}</h2>
            <p className="mt-2 text-sm text-stone-300">{movie.year} · {movie.runtime} min · {movie.genres.slice(0, 3).join(", ")}</p>
          </div>
        </div>
        <div className="p-5">
          <p className="leading-relaxed text-stone-200">{movie.reason}</p>
          <a href={movie.watchUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-amber-200 underline underline-offset-4">See availability on TMDB</a>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-[auto_1fr] gap-3">
        <button disabled={!canBack} className="secondary-button" onClick={onBack}>Back</button>
        <button className="primary-button" onClick={() => onNext()}>Next movie</button>
      </div>
      <div className="relative mt-3 flex justify-between text-sm text-stone-400">
        <button onClick={() => setFeedbackOpen((value) => !value)}>Not like this?</button>
        <button onClick={onRestart}>Start over</button>
        {feedbackOpen && (
          <div className="absolute bottom-8 left-0 z-10 grid min-w-40 overflow-hidden rounded-xl border border-white/10 bg-stone-900 shadow-xl">
            {([["too_long", "Too long"], ["too_dark", "Too dark"], ["seen_it", "Seen it"]] as [Feedback, string][]).map(([value, label]) => (
              <button key={value} className="min-h-11 px-4 text-left hover:bg-white/5" onClick={() => { setFeedbackOpen(false); onNext(value); }}>{label}</button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Loading({ label }: { label: string }) {
  return <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center"><span className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-300" /><p className="text-stone-300">{label}</p></div>;
}
