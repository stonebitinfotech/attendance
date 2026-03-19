import { NextResponse } from "next/server";

import { createLoginOtp, findUserByEmail, verifyUserPassword } from "@/lib/auth-db";
import { sendLoginOtpEmail } from "@/lib/auth-emails";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{ email: unknown; password: unknown }>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const ok = await verifyUserPassword(user, password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { otp, expiresAt } = await createLoginOtp(email);
  await sendLoginOtpEmail({ toEmail: email, otp, expiresAt });

  return NextResponse.json({ ok: true });
}

