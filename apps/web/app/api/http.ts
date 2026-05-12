import { ZodError, type z } from "zod";
import { requestHasValidWebSession, tokenMatches } from "./auth/web-session";

const DEFAULT_MAX_BODY_BYTES = 1_000_000;
const MAX_RATE_LIMIT_BUCKETS = 10_000;
const rateLimitBuckets = new Map<string, { readonly resetAt: number; count: number }>();
const rateLimitedRequests = new WeakSet<Request>();

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  try {
    const text = await request.text();
    const maxBytes = Number.parseInt(process.env.OPEN_LAGRANGE_MAX_REQUEST_BYTES ?? String(DEFAULT_MAX_BODY_BYTES), 10);
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new HttpError(413, { error: "REQUEST_TOO_LARGE" });
    }
    return schema.parse(text ? JSON.parse(text) as unknown : undefined);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, { error: "INVALID_REQUEST", issues: error.issues });
    }
    if (error instanceof SyntaxError) {
      throw new HttpError(400, { error: "INVALID_JSON" });
    }
    throw error;
  }
}

export function requireApiAuth(request: Request): void {
  enforceRateLimit(request);
  const expected = process.env.OPEN_LAGRANGE_API_TOKEN;
  if (!expected && process.env.NODE_ENV !== "production") return;
  if (!expected) throw new HttpError(503, { error: "API_AUTH_NOT_CONFIGURED" });
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!tokenMatches(actual, expected) && !requestHasValidWebSession(request)) throw new HttpError(401, { error: "UNAUTHORIZED" });
}

export function enforceRateLimit(request: Request): void {
  if (rateLimitedRequests.has(request)) return;
  rateLimitedRequests.add(request);
  const windowMs = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_WINDOW_MS ?? "60000", 10);
  const max = Number.parseInt(process.env.OPEN_LAGRANGE_RATE_LIMIT_MAX ?? "120", 10);
  const key = rateLimitKey(request);
  const now = Date.now();
  pruneRateLimitBuckets(now);
  const bucket = rateLimitBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { resetAt: now + windowMs, count: 1 });
    pruneRateLimitBuckets(now);
    return;
  }
  bucket.count += 1;
  if (bucket.count > max) throw new HttpError(429, { error: "RATE_LIMITED" });
}

export function requireMutationSecurity(request: Request): void {
  requireApiAuth(request);
}

export function handleRouteError(error: unknown): Response {
  if (error instanceof HttpError) return json(error.body, { status: error.status });
  if (error instanceof Error && error.message === "INVALID_APPROVAL_TOKEN") {
    return json({ error: "INVALID_APPROVAL_TOKEN" }, { status: 403 });
  }
  const trace_id = `err_${Date.now().toString(36)}`;
  console.error("API route failed", { trace_id, error });
  return json({ error: "REQUEST_FAILED", trace_id }, { status: 500 });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`HTTP ${status}`);
  }
}

function rateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("cf-connecting-ip")?.trim()
    || "anonymous";
}

function pruneRateLimitBuckets(now: number): void {
  for (const [key, bucket] of rateLimitBuckets) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  while (rateLimitBuckets.size > MAX_RATE_LIMIT_BUCKETS) {
    const oldestKey = rateLimitBuckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    rateLimitBuckets.delete(oldestKey);
  }
}
