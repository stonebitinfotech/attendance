import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import LogoutButton from "@/app/logout/LogoutButton";
import Image from "next/image";
import { cookies } from "next/headers";

import { getAuthCookieName, verifySessionToken } from "@/lib/auth";
import { getWhatsAppStatus, startWhatsApp } from "@/lib/whatsapp";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Attendance",
  description: "Attendance + WhatsApp integration",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Keep WhatsApp client running even if not logged in (background processing).
  try {
    void startWhatsApp();
  } catch {
    // ignore
  }

  const token = (await cookies()).get(getAuthCookieName())?.value;
  const authed = verifySessionToken(token);
  const wa = authed ? await getWhatsAppStatus() : null;

  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased font-sans`}
      >
        <header className="sticky top-0 z-50 border-b border-black/[.08] bg-white/80 backdrop-blur dark:border-white/[.145] dark:bg-black/60">
          <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Image
                src="/logo black.png"
                alt="Stonebit"
                width={120}
                height={24}
                priority
                className="h-6 w-auto"
              />
            </Link>
            {authed ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/whatsapp"
                  className={`inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-medium transition-colors ${
                    wa?.connected
                      ? "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/15"
                      : "bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                  }`}
                >
                  {wa?.connected ? "WhatsApp Connected" : "Connect WhatsApp"}
                </Link>
                <Link
                  href="/attendance"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-black/[.08] px-5 text-sm font-medium transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  Attendance
                </Link>
                <LogoutButton />
              </div>
            ) : null}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
