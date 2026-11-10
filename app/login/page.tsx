"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError(response?.status === 429 ? "Too many attempts. Please wait a moment." : "That password is not right.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <form onSubmit={submit} className="cinema-panel w-full max-w-sm space-y-6 p-7">
        <div>
          <p className="eyebrow">Private screening room</p>
          <h1 className="mt-2 text-3xl font-semibold">Movie Picker</h1>
          <p className="mt-2 text-sm text-stone-400">Enter the shared password to come inside.</p>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Password</span>
          <input
            autoFocus
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field"
            autoComplete="current-password"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="primary-button w-full">
          {busy ? "Opening…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
