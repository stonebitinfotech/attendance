export function getAuthCookieName(): string {
  return "att_auth";
}

function normalizeText(v: string): string {
  return String(v || "").trim();
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmacSha256Base64Url(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function verifySessionTokenEdge(
  token: string | undefined | null
): Promise<boolean> {
  const t = normalizeText(token || "");
  if (!t) return false;

  const [body, sig] = t.split(".");
  if (!body || !sig) return false;

  const secret = normalizeText(process.env.APP_AUTH_SECRET || "");
  if (!secret) return false;

  const expected = await hmacSha256Base64Url(secret, body);
  if (expected !== sig) return false;

  try {
    const payloadJson = new TextDecoder().decode(base64UrlToBytes(body));
    const payload = JSON.parse(payloadJson) as { exp?: unknown };
    if (!payload || typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

