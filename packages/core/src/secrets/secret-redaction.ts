import type { SecretRef, SecretRefMetadata, SecretValue } from "./secret-types.js";

const DEFAULT_REDACTION = "********";

export function redactSecretValue(value: string | undefined): string {
  if (!value) return DEFAULT_REDACTION;
  if (value.length <= 8) return DEFAULT_REDACTION;
  return `${value.slice(0, 2)}${"*".repeat(Math.min(8, value.length - 4))}${value.slice(-2)}`;
}

export function secretValue(value: string, metadata: Record<string, unknown> = {}): SecretValue {
  return {
    value,
    redacted: redactSecretValue(value),
    metadata,
  };
}

export function redactSecretRef(ref: SecretRef, configured: boolean): SecretRefMetadata {
  return {
    ...ref,
    configured,
    redacted: DEFAULT_REDACTION,
  };
}

export function stripSecretValue(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(stripSecretValue);
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = key.toLowerCase().includes("value") || key.toLowerCase().includes("secret") || key.toLowerCase().includes("token")
      ? DEFAULT_REDACTION
      : stripSecretValue(value);
  }
  return output;
}
