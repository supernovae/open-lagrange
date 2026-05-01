export type CapabilityStepErrorCode =
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_DIGEST_MISMATCH"
  | "SCHEMA_VALIDATION_FAILED"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "YIELDED"
  | "MCP_EXECUTION_FAILED"
  | "CAPABILITY_EXECUTION_FAILED"
  | "PRIMITIVE_POLICY_DENIED"
  | "PRIMITIVE_INVALID_INPUT"
  | "PRIMITIVE_RESPONSE_TOO_LARGE"
  | "PRIMITIVE_TIMEOUT"
  | "PRIMITIVE_ARTIFACT_FAILED"
  | "RESULT_VALIDATION_FAILED";

export class CapabilityStepError extends Error {
  constructor(
    message: string,
    readonly code: CapabilityStepErrorCode,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CapabilityStepError";
  }
}
