"use client";

import { useEffect, useMemo, useState } from "react";

type QrResp =
  | { connected: true; connection: string }
  | { connected: false; connection: string; qrDataUrl: string | null };

type StatusResp = { connected: boolean; connection: string };

type GroupResp =
  | { connected: true; group: { id: string; subject: string; participantCount: number } }
  | { connected: true; error: string }
  | { connected: false; error: string };

type LinkMode = "qr" | "phone";

export default function WhatsAppPage() {
  const [linkMode, setLinkMode] = useState<LinkMode>("qr");
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<string>("close");
  const [group, setGroup] = useState<GroupResp | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  const statusText = useMemo(() => {
    if (connected) return "Connected successfully.";
    if (connection === "connecting") return "Connecting…";
    if (linkMode === "phone" && pairingCode) return "Enter the pairing code on your phone. Checking for connection…";
    if (linkMode === "phone") return "Enter your phone number to get a pairing code.";
    if (connection === "qr" && !qr) return "Loading QR from WhatsApp…";
    if (connection === "qr") return "Not connected. Scan the QR code.";
    return "Not connected. Starting WhatsApp client…";
  }, [connected, connection, qr, linkMode, pairingCode]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        // In phone mode: poll status only (no QR logic). In QR mode: poll qr endpoint.
        const url = linkMode === "phone"
          ? "/api/whatsapp/status"
          : "/api/whatsapp/qr";
        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json()) as QrResp | StatusResp;
        if (!alive) return;

        setConnected(data.connected);
        setConnection(data.connection);
        if (linkMode === "qr" && !data.connected) {
          setQr("qrDataUrl" in data ? data.qrDataUrl : null);
        } else if (data.connected) {
          setQr(null);
          window.clearInterval(intervalId);
        }
      } catch {
        if (!alive) return;
        setConnected(false);
      }
    };

    const pollMs = linkMode === "phone" && pairingCode ? 1000 : 2000;
    const intervalId = window.setInterval(tick, pollMs);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [linkMode, pairingCode]);

  useEffect(() => {
    if (!connected) return;
    let alive = true;

    const load = async () => {
      setLoadingGroup(true);
      try {
        const res = await fetch("/api/whatsapp/group", { cache: "no-store" });
        const data = (await res.json()) as GroupResp;
        if (!alive) return;
        setGroup(data);
      } finally {
        if (!alive) return;
        setLoadingGroup(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [connected]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-4xl flex-col gap-6 p-6">
      <div className="rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-black">
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp Connection</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{statusText}</p>
      </div>

      {!connected ? (
        <div className="space-y-6">
          <div className="flex gap-2 border-b border-black/[.08] dark:border-white/[.145]">
            <button
              type="button"
              onClick={() => {
                setLinkMode("qr");
                setPairingCode(null);
                setPairingError(null);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                linkMode === "qr"
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Scan QR
            </button>
            <button
              type="button"
              onClick={() => {
                setLinkMode("phone");
                setPairingCode(null);
                setPairingError(null);
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                linkMode === "phone"
                  ? "border-b-2 border-zinc-900 text-zinc-900 dark:border-white dark:text-white"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
              }`}
            >
              Link with phone number
            </button>
          </div>

          {linkMode === "qr" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-black">
                <h2 className="text-lg font-semibold">Scan QR</h2>
                <ol className="mt-3 list-decimal pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>Open WhatsApp on your phone.</li>
                  <li>Go to Linked devices.</li>
                  <li>Scan this QR.</li>
                </ol>
              </div>

              <div className="flex items-center justify-center rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-black">
                {qr ? (
                  <img
                    src={qr}
                    alt="WhatsApp QR Code"
                    width={320}
                    height={320}
                    className="h-auto w-[320px] rounded-lg bg-white p-2"
                  />
                ) : (
                  <div className="text-sm text-zinc-600 dark:text-zinc-400">
                    {connection === "qr" ? "Rendering QR…" : "Starting WhatsApp (first load can take 30–60 seconds)…"}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-black">
              <h2 className="text-lg font-semibold">Link with phone number</h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Enter your WhatsApp number with country code (no + or spaces). Example: 919876543210
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="phone" className="block text-xs font-medium text-zinc-500">
                    Phone number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="919876543210"
                    className="mt-1 w-full rounded-lg border border-black/[.12] bg-white px-3 py-2 text-sm dark:border-white/[.2] dark:bg-zinc-900"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    setPairingError(null);
                    setPairingCode(null);
                    setPairingLoading(true);
                    try {
                      const res = await fetch("/api/whatsapp/pair", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setPairingError(data?.error ?? "Request failed");
                        return;
                      }
                      if (data.pairingCode) {
                        setPairingCode(data.pairingCode);
                      } else {
                        setPairingError(data?.error ?? "No pairing code received");
                      }
                    } catch {
                      setPairingError("Request failed");
                    } finally {
                      setPairingLoading(false);
                    }
                  }}
                  disabled={pairingLoading || !phoneNumber.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
                >
                  {pairingLoading ? "Getting code…" : "Get pairing code"}
                </button>
              </div>
              {pairingError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">{pairingError}</p>
              )}
              {pairingCode && (
                <div className="mt-4 rounded-lg border border-black/[.08] bg-zinc-50 p-4 dark:border-white/[.145] dark:bg-zinc-900/50">
                  <p className="text-xs font-medium text-zinc-500">Your pairing code</p>
                  <p className="mt-1 font-mono text-2xl tracking-[0.25em]">{pairingCode}</p>
                  <ol className="mt-3 list-decimal pl-5 text-sm text-zinc-600 dark:text-zinc-400">
                    <li>Open WhatsApp on your phone.</li>
                    <li>Go to Linked devices → Link a device.</li>
                    <li>Tap &quot;Link with phone number instead&quot;.</li>
                    <li>Enter this code.</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-black">
          <h2 className="text-lg font-semibold">Stonewall Infotech Group</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {loadingGroup ? "Loading group data…" : "Group data loaded."}
          </p>

          {group && "group" in group ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Group name
                </div>
                <div className="mt-1 font-medium">{group.group.subject}</div>
              </div>
              <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Total members
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {group.group.participantCount}
                </div>
              </div>
            </div>
          ) : group && "error" in group ? (
            <div className="mt-4 rounded-lg border border-black/[.08] p-4 text-sm text-red-600 dark:border-white/[.145] dark:text-red-400">
              {group.error}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

