import { NextResponse, type NextRequest } from "next/server";

const buckets = new Map<string, { readonly resetAt: number; count: number }>();

export function middleware(request: NextRequest): NextResponse {
  const auth = authorize(request);
  if (auth) return withSecurityHeaders(auth);

  if (request.method !== "GET" && request.method !== "HEAD") {
    const limited = rateLimit(request);
    if (limited) return withSecurityHeaders(limited);
  }

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
  return actual === expected ? undefined : NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
}

function rateLimit(request: NextRequest): NextResponse | undefined {
  const windowMs = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  const max = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_MAX ?? "120", 10);
  const key = request.headers.get("authorization") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { resetAt: now + windowMs, count: 1 });
    return undefined;
  }
  bucket.count += 1;
  return bucket.count > max ? NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 }) : undefined;
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}
