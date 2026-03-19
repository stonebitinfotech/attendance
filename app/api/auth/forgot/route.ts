import { NextResponse } from "next/server";

import { createPasswordReset, findUserByEmail } from "@/lib/auth-db";
import { sendPasswordResetEmail } from "@/lib/auth-emails";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{ email: unknown }>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  // Always return ok to avoid user enumeration
  if (!email) return NextResponse.json({ ok: true });

  const user = await findUserByEmail(email);
  if (!user) return NextResponse.json({ ok: true });

  const { token, expiresAt } = await createPasswordReset(email);

  const origin = new URL(req.url).origin;
  const resetUrl = `${origin}/reset-password?email=${encodeURIComponent(
    email
  )}&token=${encodeURIComponent(token)}`;

  await sendPasswordResetEmail({ toEmail: email, token, expiresAt, resetUrl });

  return NextResponse.json({ ok: true });
}

