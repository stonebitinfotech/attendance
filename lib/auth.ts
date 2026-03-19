import "server-only";

import crypto from "crypto";

const COOKIE_NAME = "att_auth";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in environment`);
  return v;
}

export function getAuthCookieName(): string {
  return COOKIE_NAME;
}

export function getAuthMaxAgeSeconds(): number {
  return MAX_AGE_SECONDS;
}

type TokenPayload = {
  u: string;
  exp: number; // ms since epoch
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(data: string): string {
  const secret = getRequiredEnv("APP_AUTH_SECRET");
  return base64UrlEncode(
    crypto.createHmac("sha256", secret).update(data).digest()
  );
}

export function createSessionToken(username: string): string {
  const payload: TokenPayload = {
    u: username,
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [body, sig] = parts;
  if (!body || !sig) return false;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(base64UrlDecode(body).toString("utf8")) as Partial<TokenPayload>;
    if (!payload || typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

