export type PlanIssueSeverity = "error" | "warning";

export interface PlanValidationIssue {
  readonly code:
    | "INVALID_SCHEMA"
    | "INVALID_PLAN"
    | "INVALID_NODE_ID"
    | "DUPLICATE_NODE_ID"
    | "MISSING_DEPENDENCY"
    | "CYCLE_DETECTED"
    | "UNREACHABLE_NODE"
    | "UNKNOWN_CAPABILITY"
    | "APPROVAL_REQUIRED"
    | "UNKNOWN_VERIFICATION_COMMAND"
    | "PATCH_ACCEPTANCE_MISSING"
    | "DESTRUCTIVE_GOAL_NOT_EXPLICIT";
  readonly message: string;
  readonly severity: PlanIssueSeverity;
  readonly path?: readonly (string | number)[];
}

export interface PlanValidationResult {
  readonly ok: boolean;
  readonly issues: readonly PlanValidationIssue[];
}

export class PlanfileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanfileParseError";
  }
}

export class PlanValidationError extends Error {
  constructor(readonly issues: readonly PlanValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "PlanValidationError";
  }
}
