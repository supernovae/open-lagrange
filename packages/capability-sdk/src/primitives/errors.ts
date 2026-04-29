import { CapabilitySdkError } from "../errors.js";

export type PrimitiveErrorCode =
  | "PRIMITIVE_POLICY_DENIED"
  | "PRIMITIVE_TIMEOUT"
  | "PRIMITIVE_RESPONSE_TOO_LARGE"
  | "PRIMITIVE_SECRET_UNAVAILABLE"
  | "PRIMITIVE_ARTIFACT_FAILED"
  | "PRIMITIVE_APPROVAL_UNAVAILABLE"
  | "PRIMITIVE_INVALID_INPUT";

export class PrimitiveError extends CapabilitySdkError {
  constructor(
    message: string,
    readonly primitive_code: PrimitiveErrorCode,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, primitive_code, metadata);
    this.name = "PrimitiveError";
  }
}

export function primitiveError(
  message: string,
  code: PrimitiveErrorCode,
  metadata: Record<string, unknown> = {},
): PrimitiveError {
  return new PrimitiveError(message, code, metadata);
}
