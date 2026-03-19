import "server-only";

import bcrypt from "bcryptjs";
import crypto from "crypto";

import { getDb } from "@/lib/mongodb";

export type UserRole = "admin";

export type UserDoc = {
  email: string; // lowercase
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

export type LoginOtpDoc = {
  email: string; // lowercase
  otpHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
};

export type PasswordResetDoc = {
  email: string; // lowercase
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
};

const SALT_ROUNDS = 12;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 8;
const RESET_TTL_MINUTES = 30;

type GlobalAuthDbState = {
  __attandanceAuthIndexesReady?: boolean;
};

const globalAuthDb = globalThis as unknown as GlobalAuthDbState;

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function ensureAuthIndexes(): Promise<void> {
  if (globalAuthDb.__attandanceAuthIndexesReady) return;
  const db = await getDb();

  await db
    .collection<UserDoc>("users")
    .createIndex({ email: 1 }, { unique: true });

  await db.collection<LoginOtpDoc>("loginOtps").createIndex({ email: 1 });
  await db
    .collection<LoginOtpDoc>("loginOtps")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  await db
    .collection<PasswordResetDoc>("passwordResets")
    .createIndex({ email: 1 });
  await db
    .collection<PasswordResetDoc>("passwordResets")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  globalAuthDb.__attandanceAuthIndexesReady = true;
}

export async function findUserByEmail(email: string): Promise<UserDoc | null> {
  await ensureAuthIndexes();
  const db = await getDb();
  return await db.collection<UserDoc>("users").findOne({ email: normEmail(email) });
}

export async function verifyUserPassword(
  user: UserDoc,
  password: string
): Promise<boolean> {
  return await bcrypt.compare(password, user.passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

export function generateOtpCode(): string {
  const num = crypto.randomInt(0, 1_000_000);
  return String(num).padStart(6, "0");
}

export async function createLoginOtp(email: string): Promise<{ otp: string; expiresAt: Date }> {
  await ensureAuthIndexes();
  const db = await getDb();
  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await db.collection<LoginOtpDoc>("loginOtps").insertOne({
    email: normEmail(email),
    otpHash,
    expiresAt,
    attempts: 0,
    createdAt: new Date(),
  });

  return { otp, expiresAt };
}

export async function verifyAndConsumeLoginOtp(params: {
  email: string;
  otp: string;
}): Promise<boolean> {
  await ensureAuthIndexes();
  const db = await getDb();
  const email = normEmail(params.email);

  // take latest OTP for this email
  const doc = await db
    .collection<LoginOtpDoc>("loginOtps")
    .find({ email })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (!doc) return false;
  if (doc.expiresAt.getTime() < Date.now()) return false;
  if (doc.attempts >= OTP_MAX_ATTEMPTS) return false;

  const ok = await bcrypt.compare(params.otp, doc.otpHash);
  if (!ok) {
    await db.collection<LoginOtpDoc>("loginOtps").updateOne(
      { email, createdAt: doc.createdAt },
      { $inc: { attempts: 1 } }
    );
    return false;
  }

  // consume all OTPs for this email to prevent reuse
  await db.collection<LoginOtpDoc>("loginOtps").deleteMany({ email });
  return true;
}

function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function createPasswordReset(email: string): Promise<{ token: string; expiresAt: Date }> {
  await ensureAuthIndexes();
  const db = await getDb();
  const token = generateResetToken();
  const tokenHash = await bcrypt.hash(token, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

  await db.collection<PasswordResetDoc>("passwordResets").insertOne({
    email: normEmail(email),
    tokenHash,
    expiresAt,
    createdAt: new Date(),
  });

  return { token, expiresAt };
}

export async function verifyAndConsumePasswordReset(params: {
  email: string;
  token: string;
}): Promise<boolean> {
  await ensureAuthIndexes();
  const db = await getDb();
  const email = normEmail(params.email);

  const doc = await db
    .collection<PasswordResetDoc>("passwordResets")
    .find({ email, usedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (!doc) return false;
  if (doc.expiresAt.getTime() < Date.now()) return false;

  const ok = await bcrypt.compare(params.token, doc.tokenHash);
  if (!ok) return false;

  await db.collection<PasswordResetDoc>("passwordResets").updateOne(
    { email, createdAt: doc.createdAt },
    { $set: { usedAt: new Date() } }
  );
  return true;
}

export async function setUserPassword(email: string, newPassword: string): Promise<void> {
  await ensureAuthIndexes();
  const db = await getDb();
  const passwordHash = await hashPassword(newPassword);
  await db.collection<UserDoc>("users").updateOne(
    { email: normEmail(email) },
    { $set: { passwordHash, updatedAt: new Date() } }
  );
}

