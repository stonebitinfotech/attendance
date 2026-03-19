import { NextResponse } from "next/server";

import { verifyAndConsumeLoginOtp } from "@/lib/auth-db";
import { createSessionToken, getAuthCookieName, getAuthMaxAgeSeconds } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{ email: unknown; otp: unknown }>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body.otp === "string" ? body.otp.trim() : "";

  if (!email || !otp) {
    return NextResponse.json({ error: "Email and OTP required" }, { status: 400 });
  }

  const ok = await verifyAndConsumeLoginOtp({ email, otp });
  if (!ok) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
  }

  const token = createSessionToken(email);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getAuthCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getAuthMaxAgeSeconds(),
    path: "/",
  });
  return res;
}

