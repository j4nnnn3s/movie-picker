"use client";

import { useEffect, useRef } from "react";

import type { ApiError } from "@/lib/contracts";

const messages: Record<ApiError["error"], string> = {
  llm_unavailable: "The suggestion engine isn’t available right now. Please try again later.",
  tmdb_unavailable: "The movie database isn’t reachable right now. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",
  rate_limited: "The suggestion engine needs a short break. Please try again in a minute.",
  invalid_request: "Something in that request didn’t look right. Please try again.",
  no_matches: "No matching movies turned up. Try loosening an answer or adding another service.",
};

export function ErrorModal({ error, onClose, onRetry }: {
  error: ApiError | null;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) closeRef.current?.focus();
  }, [error]);
  if (!error) return null;

  const message = error.kind === "daily_limit"
    ? "The daily limit has been reached. Please try again tomorrow."
    : error.error === "llm_unavailable" && error.kind === "rate_limit"
      ? "The suggestion engine needs a short break. Please try again in a minute."
      : messages[error.error];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5" role="presentation">
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-title"
        className="cinema-panel max-w-sm p-6"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key !== "Tab") return;
          const controls = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <p className="eyebrow">A short intermission</p>
        <h2 id="error-title" className="mt-2 text-2xl font-semibold">Not available just now</h2>
        <p className="mt-3 text-stone-300">{message}</p>
        <div className="mt-6 flex gap-3">
          {onRetry && <button className="primary-button flex-1" onClick={onRetry}>Try again</button>}
          <button ref={closeRef} className="secondary-button flex-1" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
