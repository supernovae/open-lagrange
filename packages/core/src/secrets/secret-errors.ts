import type { SecretRef } from "./secret-types.js";

export type SecretErrorCode =
  | "SECRET_MISSING"
  | "SECRET_PROVIDER_UNAVAILABLE"
  | "SECRET_PROVIDER_READ_ONLY"
  | "SECRET_POLICY_DENIED"
  | "SECRET_PROVIDER_UNKNOWN"
  | "SECRET_VALUE_INVALID";

export class SecretError extends Error {
  constructor(
    readonly code: SecretErrorCode,
    message: string,
    readonly ref?: SecretRef,
  ) {
    super(message);
    this.name = "SecretError";
  }
}

export function missingSecret(ref: SecretRef): SecretError {
  return new SecretError("SECRET_MISSING", `Secret is not configured: ${ref.name}`, ref);
}

export function providerUnavailable(provider: string, detail?: string): SecretError {
  return new SecretError("SECRET_PROVIDER_UNAVAILABLE", detail ? `${provider} is unavailable: ${detail}` : `${provider} is unavailable`);
}

export function readOnlyProvider(provider: string): SecretError {
  return new SecretError("SECRET_PROVIDER_READ_ONLY", `${provider} does not support writes`);
}

export function invalidSecretValue(ref?: SecretRef): SecretError {
  return new SecretError("SECRET_VALUE_INVALID", "Secret value cannot be empty.", ref);
}
