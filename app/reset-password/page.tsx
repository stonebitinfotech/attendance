"use client";

import { useEffect, useState } from "react";

function getQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  return url.searchParams.get(name) || "";
}

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEmail(getQueryParam("email"));
    setToken(getQueryParam("token"));
  }, []);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-5xl items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-6 shadow-sm dark:border-white/[.145] dark:bg-black">
        <div className="text-xl font-semibold">Reset password</div>
        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Set a new password for your account.
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        {done ? (
          <div className="mt-4 rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
            Password updated. You can login now.
          </div>
        ) : null}

        <form
          className="mt-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const res = await fetch("/api/auth/reset", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email, token, newPassword }),
              });
              const data = (await res.json()) as { ok?: boolean; error?: string };
              if (!res.ok || !data.ok) throw new Error(data.error || "Reset failed");
              setDone(true);
            } catch (e2: unknown) {
              setError(e2 instanceof Error ? e2.message : "Reset failed");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Reset token</label>
            <input
              className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input
              className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>

          <button
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={loading || done}
          >
            {loading ? "Saving..." : "Reset password"}
          </button>

          <div className="text-center text-sm">
            <a
              href="/login"
              className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
            >
              Back to login
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

