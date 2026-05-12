import { createHash, createHmac } from "node:crypto";

export const WEB_SESSION_COOKIE = "open_lagrange_web_session";

const sessionMaxAgeSeconds = 60 * 60 * 12;
const payloadVersion = 1;

interface WebSessionPayload {
  readonly v: number;
  readonly exp: number;
  readonly token_sha256: string;
}

export function createWebSessionCookie(token: string, now = Date.now()): string {
  const expected = expectedApiToken();
  if (!expected) throw new Error("API_AUTH_NOT_CONFIGURED");
  if (!tokenMatches(token, expected)) throw new Error("UNAUTHORIZED");
  const payload: WebSessionPayload = {
    v: payloadVersion,
    exp: now + sessionMaxAgeSeconds * 1000,
    token_sha256: sha256(expected),
  };
  return `${WEB_SESSION_COOKIE}=${signPayload(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAgeSeconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearWebSessionCookie(): string {
  return `${WEB_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function requestHasValidWebSession(request: Request): boolean {
  const expected = expectedApiToken();
  if (!expected) return false;
  const value = cookieValue(request.headers.get("cookie") ?? "", WEB_SESSION_COOKIE);
  if (!value) return false;
  return validateSignedPayload(value, expected);
}

export function authTokenForRequest(request: Request): string | undefined {
  const expected = expectedApiToken();
  if (!expected) return undefined;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (tokenMatches(bearer, expected)) return expected;
  return requestHasValidWebSession(request) ? expected : undefined;
}

export function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  let diff = actual.length ^ expected.length;
  const maxLength = Math.max(actual.length, expected.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return diff === 0;
}

function expectedApiToken(): string | undefined {
  return process.env.OPEN_LAGRANGE_API_TOKEN;
}

function signPayload(payload: WebSessionPayload): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${hmac(encoded)}`;
}

function validateSignedPayload(value: string, expectedToken: string): boolean {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !tokenMatches(signature, hmac(encoded))) return false;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as Partial<WebSessionPayload>;
    return parsed.v === payloadVersion
      && typeof parsed.exp === "number"
      && parsed.exp > Date.now()
      && typeof parsed.token_sha256 === "string"
      && tokenMatches(parsed.token_sha256, sha256(expectedToken));
  } catch {
    return false;
  }
}

function hmac(value: string): string {
  const key = process.env.OPEN_LAGRANGE_WEB_SESSION_SECRET ?? process.env.OPEN_LAGRANGE_API_TOKEN ?? "";
  return createHmac("sha256", key).update(value).digest("base64url");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieValue(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}
