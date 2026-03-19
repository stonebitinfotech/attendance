import "server-only";

import { sendEmail } from "@/lib/mailer";

function appName(): string {
  return process.env.APP_NAME?.trim() || "Attendance";
}

export async function sendLoginOtpEmail(params: {
  toEmail: string;
  otp: string;
  expiresAt: Date;
}): Promise<void> {
  const subject = `${appName()} login code: ${params.otp}`;
  const mins = Math.max(
    1,
    Math.round((params.expiresAt.getTime() - Date.now()) / 60000)
  );

  const text = [
    `Your ${appName()} login code is: ${params.otp}`,
    ``,
    `This code expires in ~${mins} minutes.`,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].join("\n");

  await sendEmail({
    to: params.toEmail,
    subject,
    text,
  });
}

export async function sendPasswordResetEmail(params: {
  toEmail: string;
  token: string;
  expiresAt: Date;
  resetUrl: string;
}): Promise<void> {
  const subject = `${appName()} password reset`;
  const mins = Math.max(
    1,
    Math.round((params.expiresAt.getTime() - Date.now()) / 60000)
  );

  const text = [
    `Password reset requested for ${appName()}.`,
    ``,
    `Open this link to reset your password (expires in ~${mins} minutes):`,
    params.resetUrl,
    ``,
    `Or use this reset token: ${params.token}`,
    ``,
    `If you did not request this, you can ignore this email.`,
  ].join("\n");

  await sendEmail({
    to: params.toEmail,
    subject,
    text,
  });
}

