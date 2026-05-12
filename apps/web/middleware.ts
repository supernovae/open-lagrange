import { NextResponse, type NextRequest } from "next/server";

const buckets = new Map<string, { readonly resetAt: number; count: number }>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";
const WEB_SESSION_COOKIE = "open_lagrange_web_session";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const limited = rateLimit(request);
  if (limited) return withSecurityHeaders(limited);

  const auth = await authorize(request);
  if (auth) return withSecurityHeaders(auth);

  const proxied = await proxyToApi(request);
  if (proxied) return withSecurityHeaders(proxied);

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*", "/v1/:path*"],
};

async function authorize(request: NextRequest): Promise<NextResponse | undefined> {
  if (request.nextUrl.pathname === "/api/auth/session") return undefined;
  const expected = process.env.OPEN_LAGRANGE_API_TOKEN;
  if (!expected && process.env.NODE_ENV !== "production") return undefined;
  if (!expected) return NextResponse.json({ error: "API_AUTH_NOT_CONFIGURED" }, { status: 503 });
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return tokenMatches(actual, expected) || await requestHasValidWebSession(request, expected)
    ? undefined
    : NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function rateLimit(request: NextRequest): NextResponse | undefined {
  const windowMs = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  const max = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_MAX ?? "120", 10);
  const key = rateLimitKey(request);
  const now = Date.now();
  pruneRateLimitBuckets(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    pruneRateLimitBuckets(now);
    return undefined;
  }
  bucket.count += 1;
  return bucket.count > max ? NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 }) : undefined;
}

function rateLimitKey(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("cf-connecting-ip")?.trim()
    || "anonymous";
}

function pruneRateLimitBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size > MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  let diff = actual.length ^ expected.length;
  const maxLength = Math.max(actual.length, expected.length);
  for (let index = 0; index < maxLength; index += 1) {
    diff |= (actual.charCodeAt(index) || 0) ^ (expected.charCodeAt(index) || 0);
  }
  return diff === 0;
}

async function proxyToApi(request: NextRequest): Promise<NextResponse | undefined> {
  const apiUrl = process.env.OPEN_LAGRANGE_API_URL;
  if (!apiUrl) return undefined;
  const path = request.nextUrl.pathname.startsWith("/v1/")
    ? `/api${request.nextUrl.pathname}`
    : request.nextUrl.pathname;
  if (!path.startsWith("/api/")) return undefined;
  const target = new URL(path, apiUrl);
  target.search = request.nextUrl.search;
  const headers = new Headers(request.headers);
  if (!headers.has("authorization") && process.env.OPEN_LAGRANGE_API_TOKEN && await requestHasValidWebSession(request, process.env.OPEN_LAGRANGE_API_TOKEN)) {
    headers.set("authorization", `Bearer ${process.env.OPEN_LAGRANGE_API_TOKEN}`);
  }
  headers.delete("cookie");
  return NextResponse.rewrite(target, { request: { headers } });
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Content-Security-Policy", csp);
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

async function requestHasValidWebSession(request: NextRequest, expectedToken: string): Promise<boolean> {
  const value = request.cookies.get(WEB_SESSION_COOKIE)?.value;
  if (!value) return false;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature || !tokenMatches(signature, await hmac(encoded))) return false;
  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as { readonly v?: unknown; readonly exp?: unknown; readonly token_sha256?: unknown };
    return parsed.v === 1
      && typeof parsed.exp === "number"
      && parsed.exp > Date.now()
      && typeof parsed.token_sha256 === "string"
      && tokenMatches(parsed.token_sha256, await sha256(expectedToken));
  } catch {
    return false;
  }
}

async function hmac(value: string): Promise<string> {
  const key = new TextEncoder().encode(process.env.OPEN_LAGRANGE_WEB_SESSION_SECRET ?? process.env.OPEN_LAGRANGE_API_TOKEN ?? "");
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}
