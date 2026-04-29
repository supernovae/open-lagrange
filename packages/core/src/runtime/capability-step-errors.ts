export type CapabilityStepErrorCode =
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_DIGEST_MISMATCH"
  | "SCHEMA_VALIDATION_FAILED"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "MCP_EXECUTION_FAILED"
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
