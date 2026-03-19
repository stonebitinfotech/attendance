import { NextResponse } from "next/server";

import { findUserByEmail, setUserPassword, verifyAndConsumePasswordReset } from "@/lib/auth-db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{
    email: unknown;
    token: unknown;
    newPassword: unknown;
  }>;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  if (!email || !token || !newPassword) {
    return NextResponse.json(
      { error: "Email, token, and newPassword are required" },
      { status: 400 }
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Invalid reset request" }, { status: 400 });
  }

  const ok = await verifyAndConsumePasswordReset({ email, token });
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  await setUserPassword(email, newPassword);
  return NextResponse.json({ ok: true });
}

