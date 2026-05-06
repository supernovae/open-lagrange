import { NextResponse, type NextRequest } from "next/server";

const buckets = new Map<string, { readonly resetAt: number; count: number }>();
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

export function middleware(request: NextRequest): NextResponse {
  const limited = rateLimit(request);
  if (limited) return withSecurityHeaders(limited);

  const auth = authorize(request);
  if (auth) return withSecurityHeaders(auth);

  const proxied = proxyToApi(request);
  if (proxied) return withSecurityHeaders(proxied);

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ["/api/:path*", "/v1/:path*"],
};

function authorize(request: NextRequest): NextResponse | undefined {
  const expected = process.env.OPEN_LAGRANGE_API_TOKEN;
  if (!expected && process.env.NODE_ENV !== "production") return undefined;
  if (!expected) return NextResponse.json({ error: "API_AUTH_NOT_CONFIGURED" }, { status: 503 });
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return tokenMatches(actual, expected) ? undefined : NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
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

function proxyToApi(request: NextRequest): NextResponse | undefined {
  const apiUrl = process.env.OPEN_LAGRANGE_API_URL;
  if (!apiUrl) return undefined;
  const path = request.nextUrl.pathname.startsWith("/v1/")
    ? `/api${request.nextUrl.pathname}`
    : request.nextUrl.pathname;
  if (!path.startsWith("/api/")) return undefined;
  const target = new URL(path, apiUrl);
  target.search = request.nextUrl.search;
  return NextResponse.rewrite(target);
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
