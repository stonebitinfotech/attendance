"use client";

import { useEffect, useMemo, useState } from "react";

type QrResp =
  | { connected: true; connection: string }
  | { connected: false; connection: string; qrDataUrl: string | null };

type GroupResp =
  | { connected: true; group: { id: string; subject: string; participantCount: number } }
  | { connected: true; error: string }
  | { connected: false; error: string };

export default function WhatsAppPage() {
  const [qr, setQr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<string>("close");
  const [group, setGroup] = useState<GroupResp | null>(null);
  const [loadingGroup, setLoadingGroup] = useState(false);

  const statusText = useMemo(() => {
    if (connected) return "Connected successfully.";
    if (connection === "connecting") return "Connecting…";
    if (connection === "qr" && !qr) return "Loading QR from WhatsApp…";
    if (connection === "qr") return "Not connected. Scan the QR code.";
    return "Not connected. Starting WhatsApp client…";
  }, [connected, connection, qr]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/whatsapp/qr", { cache: "no-store" });
        const data = (await res.json()) as QrResp;
        if (!alive) return;

        setConnected(data.connected);
        setConnection(data.connection);
        if (!data.connected) setQr(data.qrDataUrl);
        else {
          setQr(null);
          window.clearInterval(intervalId);
        }
      } catch {
        if (!alive) return;
        setConnected(false);
      }
    };

    const intervalId = window.setInterval(tick, 2000);
    void tick();
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, []);

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
              // Use img for data URLs - Next.js Image doesn't support them well
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

