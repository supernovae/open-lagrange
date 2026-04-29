const secretLikePatterns: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\b(sk|pk|rk|ghp|gho|ghu|ghs|xox[baprs])-[-A-Za-z0-9_]{8,}\b/gi,
  /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
];

const sensitiveHeaderNames = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "proxy-authorization",
]);

export interface RedactionOptions {
  readonly hints?: readonly string[];
  readonly replacement?: string;
}

export interface PrimitiveRedactor {
  readonly redactHeaders: (headers: Record<string, string>) => Record<string, string>;
  readonly redactText: (text: string, options?: RedactionOptions) => string;
  readonly redactObject: <T>(value: T, options?: RedactionOptions) => T;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = sensitiveHeaderNames.has(key.toLowerCase()) ? "[REDACTED]" : redactText(value);
  }
  return redacted;
}

export function redactText(text: string, options: RedactionOptions = {}): string {
  const replacement = options.replacement ?? "[REDACTED]";
  let output = text;
  for (const hint of options.hints ?? []) {
    if (hint.length > 0) output = output.split(hint).join(replacement);
  }
  for (const pattern of secretLikePatterns) {
    output = output.replace(pattern, (match) => {
      const separator = match.includes("=") ? "=" : match.includes(":") ? ":" : "";
      if (separator.length === 0 || /^Bearer\s/i.test(match)) return replacement;
      return `${match.slice(0, match.indexOf(separator) + 1)}${replacement}`;
    });
  }
  return output;
}

export function redactObject<T>(value: T, options: RedactionOptions = {}): T {
  if (typeof value === "string") return redactText(value, options) as T;
  if (Array.isArray(value)) return value.map((item) => redactObject(item, options)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/authorization|api[_-]?key|token|secret|password/i.test(key)) {
        next[key] = "[REDACTED]";
      } else {
        next[key] = redactObject(item, options);
      }
    }
    return next as T;
  }
  return value;
}

export const redaction: PrimitiveRedactor = {
  redactHeaders,
  redactText,
  redactObject,
};
