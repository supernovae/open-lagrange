export interface RateLimitInfo {
  readonly retry_after_ms?: number;
  readonly remaining?: number;
  readonly reset_at?: string;
}

type HeaderLike = Headers | Record<string, string | undefined>;

export function fromHeaders(headers: HeaderLike): RateLimitInfo {
  const retryAfter = getHeader(headers, "retry-after");
  const remaining = parseInteger(getHeader(headers, "x-ratelimit-remaining") ?? getHeader(headers, "ratelimit-remaining"));
  const reset = getHeader(headers, "x-ratelimit-reset") ?? getHeader(headers, "ratelimit-reset");
  return {
    ...(retryAfter ? { retry_after_ms: parseRetryAfter(retryAfter) } : {}),
    ...(remaining !== undefined ? { remaining } : {}),
    ...(reset ? { reset_at: parseReset(reset) } : {}),
  };
}

export function shouldWait(info: RateLimitInfo, nowMs = Date.now()): boolean {
  if ((info.retry_after_ms ?? 0) > 0) return true;
  if (info.remaining === 0 && info.reset_at) return new Date(info.reset_at).getTime() > nowMs;
  return false;
}

export function toRetryDelay(info: RateLimitInfo, nowMs = Date.now()): number {
  if (info.retry_after_ms !== undefined) return Math.max(0, info.retry_after_ms);
  if (info.remaining === 0 && info.reset_at) return Math.max(0, new Date(info.reset_at).getTime() - nowMs);
  return 0;
}

export function parseRetryAfter(value: string, nowMs = Date.now()): number {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  return 0;
}

function parseReset(value: string): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString();
  const date = Date.parse(value);
  return Number.isFinite(date) ? new Date(date).toISOString() : new Date().toISOString();
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getHeader(headers: HeaderLike, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export const rateLimit = {
  fromHeaders,
  shouldWait,
  toRetryDelay,
};
