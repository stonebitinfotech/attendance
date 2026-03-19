"use client";

import { useMemo, useState } from "react";

export default function LoginPage() {
  const nextPath = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const url = new URL(window.location.href);
    return url.searchParams.get("next") || "/";
  }, []);

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === 1) {
        const res = await fetch("/api/auth/start-login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "Login failed");
        setStep(2);
      } else {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error || "OTP failed");
        window.location.href = nextPath;
      }
    } catch (e2: unknown) {
      setError(e2 instanceof Error ? e2.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-5xl items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-black/[.08] bg-white p-6 shadow-sm dark:border-white/[.145] dark:bg-black">
        <div className="text-xl font-semibold">Login</div>
        <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Step {step} of 2: Email + Password, then OTP.
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Email</label>
            <input
              className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="username"
              required
              disabled={step === 2}
            />
          </div>
          {step === 1 ? (
            <div>
              <label className="mb-1 block text-sm font-medium">Password</label>
              <input
                className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
              <div className="mt-2 text-right text-sm">
                <a
                  href="/forgot-password"
                  className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  Forgot password?
                </a>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium">OTP Code</label>
              <input
                className="w-full rounded-md border border-black/[.08] bg-white px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/[.145] dark:bg-black dark:focus:border-white/30"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="6-digit code"
                required
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                  onClick={() => {
                    setStep(1);
                    setOtp("");
                    setError(null);
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/auth/start-login", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ email, password }),
                      });
                      const data = (await res.json()) as { ok?: boolean; error?: string };
                      if (!res.ok || !data.ok)
                        throw new Error(data.error || "Failed to resend OTP");
                    } catch (e3: unknown) {
                      setError(e3 instanceof Error ? e3.message : "Failed to resend OTP");
                    } finally {
                      setLoading(false);
                    }
                  }}
                >
                  Resend OTP
                </button>
              </div>
            </div>
          )}

          <button
            className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc] disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={loading}
          >
            {loading
              ? step === 1
                ? "Sending OTP..."
                : "Verifying..."
              : step === 1
                ? "Send OTP"
                : "Verify & Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

