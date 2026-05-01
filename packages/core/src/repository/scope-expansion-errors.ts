export type ScopeExpansionErrorCode =
  | "SCOPE_REQUEST_NOT_FOUND"
  | "SCOPE_APPROVAL_MISSING"
  | "SCOPE_APPROVAL_REJECTED"
  | "SCOPE_APPROVAL_STALE"
  | "SCOPE_RESUME_NOT_READY"
  | "SCOPE_REQUEST_INVALID";

export class ScopeExpansionError extends Error {
  constructor(
    readonly code: ScopeExpansionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScopeExpansionError";
  }
}
