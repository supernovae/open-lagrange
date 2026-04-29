import { parseRetryAfter } from "./rate-limit.js";

export interface RetryAttemptReport {
  readonly attempt: number;
  readonly delay_ms: number;
  readonly reason: string;
}

export interface RetryReport {
  readonly attempts: readonly RetryAttemptReport[];
  readonly max_attempts: number;
  readonly completed: boolean;
}

export interface RetryOptions {
  readonly max_attempts: number;
  readonly base_delay_ms: number;
  readonly max_delay_ms: number;
  readonly jitter?: boolean;
  readonly retryable_status_codes?: readonly number[];
  readonly sleep?: (delay_ms: number) => Promise<void>;
}

export interface RetryResult<T> {
  readonly value: T;
  readonly report: RetryReport;
}

export async function withBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<RetryResult<T>> {
  const retryable = new Set(options.retryable_status_codes ?? [408, 409, 425, 429, 500, 502, 503, 504]);
  const attempts: RetryAttemptReport[] = [];
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.max_attempts; attempt += 1) {
    try {
      const value = await operation(attempt);
      const status = responseStatus(value);
      if (status !== undefined && retryable.has(status) && attempt < options.max_attempts) {
        const delay = retryDelay(value, attempt, options);
        attempts.push({ attempt, delay_ms: delay, reason: `status ${status}` });
        await (options.sleep ?? sleep)(delay);
        continue;
      }
      return { value, report: { attempts, max_attempts: options.max_attempts, completed: true } };
    } catch (error) {
      lastError = error;
      if (attempt >= options.max_attempts) break;
      const delay = computeDelay(attempt, options);
      attempts.push({ attempt, delay_ms: delay, reason: error instanceof Error ? error.message : "operation failed" });
      await (options.sleep ?? sleep)(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Retry operation failed");
}

function responseStatus(value: unknown): number | undefined {
  return typeof value === "object" && value !== null && "status" in value && typeof value.status === "number" ? value.status : undefined;
}

function retryDelay(value: unknown, attempt: number, options: RetryOptions): number {
  const retryAfter = responseHeader(value, "retry-after");
  if (retryAfter) return Math.min(options.max_delay_ms, parseRetryAfter(retryAfter));
  return computeDelay(attempt, options);
}

function responseHeader(value: unknown, name: string): string | undefined {
  if (typeof value !== "object" || value === null || !("headers" in value)) return undefined;
  const headers = value.headers;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (headers && typeof headers === "object") {
    const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return typeof entry?.[1] === "string" ? entry[1] : undefined;
  }
  return undefined;
}

function computeDelay(attempt: number, options: RetryOptions): number {
  const base = Math.min(options.max_delay_ms, options.base_delay_ms * 2 ** Math.max(0, attempt - 1));
  if (options.jitter !== true) return base;
  return Math.floor(base * (0.5 + Math.random() * 0.5));
}

async function sleep(delay_ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delay_ms));
}

export const retry = {
  withBackoff,
};
