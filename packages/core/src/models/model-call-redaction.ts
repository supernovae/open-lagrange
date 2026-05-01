export interface RedactedModelCallValue {
  readonly value: unknown;
  readonly redaction_status: "redacted" | "no_sensitive_content_detected" | "redaction_failed";
}

const secretPatterns: readonly RegExp[] = [
  /authorization\s*:\s*bearer\s+[a-z0-9._~+/=-]+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /\b(api[_-]?key|secret|token|password|credential)\b\s*[:=]\s*["']?[^"',\s}]+/gi,
  /\b(sk-[a-z0-9_-]{12,})\b/gi,
  /\/Users\/[^/\s"]+/g,
];

export function redactModelCallValue(value: unknown): RedactedModelCallValue {
  try {
    let changed = false;
    const redacted = redactRecursive(value, () => {
      changed = true;
    });
    return {
      value: redacted,
      redaction_status: changed ? "redacted" : "no_sensitive_content_detected",
    };
  } catch {
    return {
      value: "[redaction_failed]",
      redaction_status: "redaction_failed",
    };
  }
}

function redactRecursive(value: unknown, onChange: () => void): unknown {
  if (typeof value === "string") return redactString(value, onChange);
  if (Array.isArray(value)) return value.map((item) => redactRecursive(item, onChange));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = "[redacted]";
        onChange();
      } else {
        result[key] = redactRecursive(item, onChange);
      }
    }
    return result;
  }
  return value;
}

function redactString(input: string, onChange: () => void): string {
  let output = input;
  for (const pattern of secretPatterns) {
    output = output.replace(pattern, (match) => {
      onChange();
      if (match.toLowerCase().startsWith("authorization")) return "Authorization: [redacted]";
      if (match.toLowerCase().startsWith("bearer")) return "Bearer [redacted]";
      if (match.startsWith("/Users/")) return "/Users/[redacted]";
      const separator = match.includes("=") ? "=" : ":";
      return `${match.split(separator)[0]}${separator}[redacted]`;
    });
  }
  return output;
}

function isSensitiveKey(key: string): boolean {
  return /authorization|api[_-]?key|secret|token|password|credential/i.test(key);
}

